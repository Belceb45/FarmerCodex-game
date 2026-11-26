import { DEFAULT_BALANCE, type BalanceConfig } from '../config/balance';
import { achievementForHat, ACHIEVEMENT_DEFS, createStats, isAchieved, restoreStats, type WorldStats } from './achievements';
import { advanceGrowth, applyAutoSpawn, clearEntity, entityBalance, Grid, spawnEntity } from './grid';
import { cleanAmount, Inventory } from './inventory';
import { DeterministicRandom, deriveSeed } from './prng';
import { cactusChain, cactusYield, rollCactusSize } from './subsystems/cactus';
import { dinoAfterMove, dinoCanMove, endDino as finishDino, isTrapped, startDino as beginDino, type DinoState } from './subsystems/dino';
import { generateMaze, hasWall, placeTreasure, substanceNeeded, treasureGold, type MazeState } from './subsystems/maze';
import { assignCompanion, COMPANION_PLANTS, companionBonus } from './subsystems/polyculture';
import { breakMega, megaPumpkinYield, onPumpkinMature, pumpkinTiles } from './subsystems/pumpkin';
import { consumePower, rollPetals, sunflowerMultiplier } from './subsystems/sunflower';
import {
  checkUnlock,
  DEFAULT_TECH_TREE,
  farmSize,
  initialUnlocks,
  isGranted,
  levelValue,
  techGranting,
  techLevel,
  type TechGrants,
  type TechTree,
  type UnlockCheck,
  type Unlocks,
} from './tech';
import {
  DEFAULT_HAT,
  DIRECTION_DELTAS,
  GroundType,
  isHatKind,
  type Direction,
  type DroneBody,
  type EntityKind,
  type SimEvent,
  type TileState,
} from './types';

export interface WorldOptions {
  seed: number;
  /** Granja cuadrada de size × size (atajo de width/height). Sin tamaño se usa el del nivel de Expand. */
  size?: number;
  width?: number;
  height?: number;
  balance?: BalanceConfig;
  techTree?: TechTree;
  /** Niveles de partida (se combinan con los iniciales del árbol). */
  unlocks?: Unlocks;
}

interface SerializedCommon {
  seed: number;
  rngState: number;
  scriptRngState: number;
  totalTicks: number;
  tiles: TileState[];
  inventory: Record<string, number>;
  drones: { id: number; x: number; y: number; hat?: string }[];
}

export interface SerializedWorldState extends SerializedCommon {
  version: 4;
  width: number;
  height: number;
  /** Tamaño sin set_world_size() (si el guardado ocurrió con la granja reducida a mitad de ejecución). */
  baseWidth?: number;
  baseHeight?: number;
  unlocks: Unlocks;
  achievements: string[];
  maze: MazeState | null;
  dino: DinoState | null;
  sunflowerPenalty: boolean;
  /** Estadísticas de por vida (logros). */
  stats: WorldStats;
}

/** Formato de la Fase 3 (sin estadísticas). */
export interface SerializedWorldStateV3 extends SerializedCommon {
  version: 3;
  width: number;
  height: number;
  unlocks: Unlocks;
  achievements: string[];
  maze: MazeState | null;
  dino: DinoState | null;
  sunflowerPenalty: boolean;
}

/** Formato de la Fase 2 (sin laberinto, dinosaurio ni penalización de girasoles). */
export interface SerializedWorldStateV2 extends SerializedCommon {
  version: 2;
  width: number;
  height: number;
  unlocks: Unlocks;
  achievements: string[];
}

/** Formato de la Fase 1 (cuadrícula cuadrada, sin desbloqueos ni logros). */
export interface SerializedWorldStateV1 extends SerializedCommon {
  version: 1;
  size: number;
}

export type AnySerializedWorldState = SerializedWorldState | SerializedWorldStateV3 | SerializedWorldStateV2 | SerializedWorldStateV1;

/** Qué bloquea un sombrero: una tecnología o un logro (sombreros cosméticos de recompensa). */
export type HatLock = { kind: 'tech'; id: string; name: string } | { kind: 'achievement'; id: string; name: string } | null;

export interface HarvestResult {
  removed: boolean;
  mature: boolean;
  items: Record<string, number>;
}

export type PlantResult = { ok: true } | { ok: false; reason: 'occupied' | 'ground' | 'cost' };
export type UseResult = { ok: true } | { ok: false; reason: 'empty' | 'items' };
export type UnlockResult = { ok: true; level: number } | { ok: false; message: string };
/** Lo que devuelve measure(): un número, unas coordenadas o nada. */
export type MeasureValue = number | [number, number] | null;

export const MAX_PENDING_EVENTS = 256;
const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Entidades que no se cosechan (muros, manzana, cola). */
const NOT_HARVESTABLE: ReadonlySet<EntityKind> = new Set(['Hedge', 'Apple', 'Dinosaur', 'Dead_Pumpkin']);
/** Entidades que till() no toca (pertenecen al laberinto o al modo Dinosaurio). */
const UNTILLABLE: ReadonlySet<EntityKind> = new Set(['Hedge', 'Treasure', 'Apple', 'Dinosaur']);

function cloneTile(t: TileState): TileState {
  const out: TileState = { ...t };
  if (t.companion) out.companion = { ...t.companion };
  if (t.mega) out.mega = { ...t.mega };
  for (const key of Object.keys(out) as (keyof TileState)[]) if (out[key] === undefined) delete out[key];
  return out;
}

/**
 * Estado completo de la granja. Todo cambio pasa por aquí y depende solo de
 * ticks y del PRNG con semilla: misma semilla + mismos scripts => mismo mundo.
 */
export class World {
  readonly balance: BalanceConfig;
  readonly techTree: TechTree;
  readonly seed: number;
  /** Aleatoriedad del entorno (crecimiento, evaporación, subsistemas…). */
  readonly rng: DeterministicRandom;
  /** Aleatoriedad del `random()` del jugador: flujo separado para no alterar el entorno. */
  readonly scriptRng: DeterministicRandom;
  grid: Grid;
  inventory: Inventory;
  totalTicks = 0;
  readonly drones: DroneBody[] = [];
  /** Nivel de cada tecnología. Se reemplaza (no se muta) al desbloquear. */
  unlocks: Unlocks;
  readonly achievements = new Set<string>();
  /** Laberinto activo (Fase 3). */
  maze: MazeState | null = null;
  /** Modo Dinosaurio activo (Fase 3). */
  dino: DinoState | null = null;
  /** La siguiente cosecha de girasol va a potencia normal (se cosechó uno que no era el máximo). */
  sunflowerPenalty = false;
  /** Ticks de trabajo de los drones por tick del mundo en el tick actual (2 con Items.Power). No se guarda. */
  droneSpeed = 1;
  /** Estadísticas de por vida para los logros. */
  stats: WorldStats = createStats();
  /** Hay estadísticas nuevas sin evaluar contra los logros. */
  private statsDirty = false;
  /** Los intentos de marcador corren en mundos aislados que no conceden logros. */
  achievementsEnabled = true;
  /** set_world_size(): lado máximo temporal de la ejecución en curso (null = granja completa). */
  sizeLimit: number | null = null;
  /** Tamaño de la granja sin set_world_size(): el de Expand o el fijo de un marcador. */
  private baseWidth: number;
  private baseHeight: number;
  private events: SimEvent[] = [];

  constructor(options: WorldOptions) {
    this.balance = options.balance ?? DEFAULT_BALANCE;
    this.techTree = options.techTree ?? DEFAULT_TECH_TREE;
    this.seed = options.seed >>> 0;
    this.rng = new DeterministicRandom(this.seed);
    this.scriptRng = new DeterministicRandom(deriveSeed(this.seed, 1));
    this.unlocks = { ...initialUnlocks(this.techTree), ...(options.unlocks ?? {}) };
    const [fw, fh] = farmSize(this.techTree, this.unlocks);
    const width = this.clampSize(options.width ?? options.size ?? fw);
    const height = this.clampSize(options.height ?? options.size ?? fh);
    this.baseWidth = width;
    this.baseHeight = height;
    this.grid = new Grid(width, height);
    for (const tile of this.grid.tiles) this.autoSpawn(tile, this.balance.world.startWithMatureGrass);
    this.inventory = new Inventory();
    this.drones.push({ id: 0, x: 0, y: 0, action: null, hat: DEFAULT_HAT });
  }

  /** Lado mayor de la granja (get_world_size()). */
  get size(): number {
    return this.grid.size;
  }

  get width(): number {
    return this.grid.width;
  }

  get height(): number {
    return this.grid.height;
  }

  get secondsPerTick(): number {
    return 1 / this.balance.ticks.baseTicksPerSecond;
  }

  /** Tiempo simulado en segundos: solo avanza cuando avanzan los ticks. */
  get simTime(): number {
    return this.totalTicks / this.balance.ticks.baseTicksPerSecond;
  }

  /** Ticks entre tiradas de evaporación (evaporationIntervalSec de tiempo simulado). */
  get evaporationIntervalTicks(): number {
    return Math.max(1, Math.round(this.balance.water.evaporationIntervalSec * this.balance.ticks.baseTicksPerSecond));
  }

  clampSize(size: number): number {
    const { minSize, maxSize } = this.balance.world;
    return Math.max(minSize, Math.min(maxSize, Math.floor(size)));
  }

  // ---------------------------------------------------------------- aparición de entidades

  /** Vacía la casilla y borra los datos de los subsistemas (rompe la megacalabaza si la había). */
  clearTile(tile: TileState): void {
    breakMega(this, tile);
    clearEntity(tile);
    delete tile.petals;
    delete tile.cactusSize;
    delete tile.companion;
    delete tile.mazeWalls;
    delete tile.mega;
  }

  /** Hace nacer `kind` en la casilla con los datos de su subsistema (pétalos, tamaño, compañero). */
  spawn(tile: TileState, kind: EntityKind, mature = false): void {
    this.clearTile(tile);
    spawnEntity(tile, kind, this.balance, this.rng, mature);
    this.initEntity(tile);
  }

  /** Pasto espontáneo en Grassland vacío (no durante el laberinto ni el modo Dinosaurio). */
  autoSpawn(tile: TileState, mature = false): void {
    if (tile.entity !== null || this.maze || this.dino) return;
    applyAutoSpawn(tile, this.balance, this.rng, mature);
    if (tile.entity !== null) this.initEntity(tile);
  }

  private initEntity(tile: TileState): void {
    if (tile.entity === 'Sunflower') tile.petals = rollPetals(this);
    if (tile.entity === 'Cactus') {
      tile.cactusSize = rollCactusSize(this);
      tile.growthDuration = this.balance.cactus.growthDurationSec;
    }
    if (tile.entity !== null && COMPANION_PLANTS.includes(tile.entity)) assignCompanion(this, tile);
  }

  // ---------------------------------------------------------------- reloj

  /** Avanza el entorno exactamente un tick. El host solo lo llama si hay drones activos (regla No-Idle). */
  advanceTick(): void {
    const dt = this.secondsPerTick;
    const bonus = this.balance.water.growthBonusAtFull;
    const tiles = this.grid.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.entity === null || t.growthProgress >= 1) continue;
      let rate = 1 + t.waterLevel * bonus;
      const slowdown = this.balance.entities[t.entity]?.adjacentSlowdown;
      if (slowdown) rate /= 1 + slowdown * this.countNeighbors(t.x, t.y, t.entity);
      advanceGrowth(t, dt, rate);
      if (t.growthProgress >= 1 && t.entity === 'Pumpkin') onPumpkinMature(this, t);
    }
    this.refillSupplies(dt);
    this.totalTicks++;
    if (this.maze?.relocateAt != null && this.totalTicks >= this.maze.relocateAt) {
      this.maze.relocateAt = null;
      const body = this.drones[0];
      placeTreasure(this, body?.x ?? -1, body?.y ?? -1);
      const t = this.maze.treasure;
      this.emit({ kind: 'maze', tick: this.totalTicks, x: t?.x ?? 0, y: t?.y ?? 0, phase: 'relocated' });
    }
    if (this.totalTicks % this.evaporationIntervalTicks === 0) {
      this.evaporate();
      this.checkMudFarm();
    }
    if (this.statsDirty) this.checkAchievements();
  }

  /** Vecinos ortogonales (sin envoltura) que tienen la entidad `kind`. */
  countNeighbors(x: number, y: number, kind: EntityKind): number {
    let n = 0;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.grid.inBounds(nx, ny) && this.grid.get(nx, ny).entity === kind) n++;
    }
    return n;
  }

  /** Los depósitos de agua y la producción de fertilizante se rellenan solos mientras corre la simulación. */
  private refillSupplies(dt: number): void {
    const water = techLevel(this.unlocks, 'Watering');
    if (water > 0) {
      const w = this.balance.water;
      this.refill('Water', water * w.tankCapacityPerLevel, water * w.refillPerSecPerLevel * dt);
    }
    const fert = techLevel(this.unlocks, 'Fertilizer');
    if (fert > 0) {
      const f = this.balance.fertilizer;
      this.refill('Fertilizer', fert * f.capacityPerLevel, fert * f.refillPerSecPerLevel * dt);
    }
  }

  private refill(item: string, capacity: number, amount: number): void {
    const have = this.inventory.get(item);
    if (have < capacity) this.inventory.add(item, Math.min(amount, capacity - have));
  }

  /** En cada intervalo, cada casilla húmeda tiene `evaporationChance` de perder `evaporationAmount` (PRNG con semilla). */
  private evaporate(): void {
    const { evaporationChance, evaporationAmount } = this.balance.water;
    for (const t of this.grid.tiles) {
      if (t.waterLevel <= 0) continue;
      if (this.rng.chance(evaporationChance)) t.waterLevel = Math.max(0, cleanAmount(t.waterLevel - evaporationAmount));
    }
  }

  private checkMudFarm(): void {
    if (this.achievements.has('Mud Farm')) return;
    const threshold = this.balance.water.mudFarmThreshold;
    if (this.grid.tiles.every((t) => t.waterLevel > threshold)) this.unlockAchievement('Mud Farm');
  }

  unlockAchievement(id: string): void {
    if (!this.achievementsEnabled || this.achievements.has(id)) return;
    this.achievements.add(id);
    this.emit({ kind: 'achievement', tick: this.totalTicks, x: 0, y: 0, id });
  }

  // ---------------------------------------------------------------- estadísticas y logros

  /** Suma un recurso obtenido (cosecha, tesoro, huesos): cuenta para los logros de recursos. */
  gain(item: string, amount: number): void {
    if (amount <= 0) return;
    this.inventory.add(item, amount);
    this.stats.items[item] = cleanAmount((this.stats.items[item] ?? 0) + amount);
    this.statsDirty = true;
  }

  /** Incrementa (o lleva al máximo) una estadística numérica. */
  record(stat: Exclude<keyof WorldStats, 'items' | 'hats'>, value = 1, mode: 'add' | 'max' = 'add'): void {
    const before = this.stats[stat];
    this.stats[stat] = mode === 'add' ? before + value : Math.max(before, value);
    if (this.stats[stat] !== before) this.statsDirty = true;
  }

  recordHat(hat: string): void {
    if (this.stats.hats.includes(hat)) return;
    this.stats.hats.push(hat);
    this.statsDirty = true;
  }

  /** Bus de logros: evalúa las condiciones de los que faltan contra las estadísticas. */
  checkAchievements(): void {
    this.statsDirty = false;
    if (!this.achievementsEnabled) return;
    for (const def of ACHIEVEMENT_DEFS) {
      if (this.achievements.has(def.id)) continue;
      if (isAchieved(def, this.stats, this.techTree, this.unlocks)) this.unlockAchievement(def.id);
    }
  }

  /** Qué impide ponerse un sombrero: su tecnología o el logro que lo regala. */
  hatLock(hat: string): HatLock {
    const node = techGranting(this.techTree, 'hats', hat);
    if (node && techLevel(this.unlocks, node.id) < 1) return { kind: 'tech', id: node.id, name: node.name };
    const achievement = achievementForHat(hat);
    if (achievement && !this.achievements.has(achievement.id)) return { kind: 'achievement', id: achievement.id, name: achievement.name };
    return null;
  }

  // ---------------------------------------------------------------- drones (Megafarm)

  /** Drones permitidos a la vez según el nivel de Megafarm (1 sin desbloquear). */
  maxDrones(): number {
    return levelValue(this.techTree, this.unlocks, 'Megafarm', 1);
  }

  /** Cuerpo de un dron hijo nuevo (spawn_drone) en la casilla indicada. */
  addDrone(id: number, x: number, y: number): void {
    if (this.drones.some((d) => d.id === id)) return;
    this.drones.push({ id, x, y, action: null, hat: DEFAULT_HAT });
  }

  /** Quita el cuerpo de un dron hijo que terminó (si llevaba el dinosaurio, la cola se cosecha). */
  removeDrone(id: number): void {
    if (id === 0) return;
    if (this.dino?.droneId === id) this.endDino();
    const i = this.drones.findIndex((d) => d.id === id);
    if (i >= 0) this.drones.splice(i, 1);
  }

  recordActiveDrones(count: number): void {
    this.record('maxActiveDrones', count, 'max');
  }

  recordSpawn(): void {
    this.record('spawns');
  }

  /**
   * clear(): restablece la granja a Grassland con pasto, sin agua ni infecciones, y devuelve al
   * dron que lo llamó a (0, 0). Cierra el laberinto y el modo Dinosaurio.
   */
  clearFarm(droneId: number): void {
    this.resetTiles();
    const body = this.getDrone(droneId);
    body.x = 0;
    body.y = 0;
    body.action = null;
    this.emit({ kind: 'clear', tick: this.totalTicks, x: 0, y: 0 });
  }

  /** Todas las casillas a Grassland con pasto, sin agua ni infecciones; cierra laberinto y Dinosaurio. */
  private resetTiles(): void {
    if (this.maze) this.endMaze();
    if (this.dino) this.endDino();
    for (const t of this.grid.tiles) {
      this.clearTile(t);
      t.ground = GroundType.Grassland;
      t.waterLevel = 0;
      this.autoSpawn(t, this.balance.world.startWithMatureGrass);
    }
  }

  /**
   * Cada ejecución empieza con el dron principal en (0, 0). Si lleva el dinosaurio se queda donde
   * está: su cola ocupa casillas de la granja y no puede saltar.
   */
  resetMainDrone(): void {
    const body = this.drones.find((d) => d.id === 0);
    if (!body || this.dino?.droneId === 0) return;
    body.x = 0;
    body.y = 0;
    body.action = null;
  }

  // ---------------------------------------------------------------- set_world_size (doc 02)

  /** Ancho y alto de la granja completa (sin el límite temporal de set_world_size()). */
  get fullWidth(): number {
    return this.baseWidth;
  }

  get fullHeight(): number {
    return this.baseHeight;
  }

  /**
   * set_world_size(size): reduce la granja a size × size (lado mínimo `minSizeLimit`, nunca más que
   * el tamaño desbloqueado), la limpia y devuelve todos los drones a (0, 0). `size <= 0`, o un lado
   * igual o mayor que el de la granja completa, quita el límite. Dura hasta que termina la ejecución.
   */
  setSizeLimit(size: number): void {
    const side = Math.floor(size);
    const full = Math.max(this.baseWidth, this.baseHeight);
    const limit = side <= 0 ? null : Math.max(this.balance.world.minSizeLimit, side);
    this.sizeLimit = limit !== null && limit < full ? limit : null;
    this.regrid(...this.effectiveSize());
    this.resetTiles();
    for (const body of this.drones) {
      body.x = 0;
      body.y = 0;
      body.action = null;
    }
    this.emit({ kind: 'clear', tick: this.totalTicks, x: 0, y: 0 });
  }

  /** Fin de la ejecución: la granja recupera su tamaño (lo que reaparece vuelve con pasto). */
  clearSizeLimit(): boolean {
    if (this.sizeLimit === null) return false;
    this.sizeLimit = null;
    this.regrid(this.baseWidth, this.baseHeight);
    return true;
  }

  private effectiveSize(): [number, number] {
    const limit = this.sizeLimit;
    if (limit === null) return [this.baseWidth, this.baseHeight];
    return [Math.min(limit, this.baseWidth), Math.min(limit, this.baseHeight)];
  }

  // ---------------------------------------------------------------- consultas

  tileAt(x: number, y: number): TileState {
    return this.grid.get(x, y);
  }

  getDrone(id: number): DroneBody {
    const body = this.drones.find((d) => d.id === id);
    if (!body) throw new Error(`Dron inexistente: ${id}`);
    return body;
  }

  hasEntityAt(x: number, y: number): boolean {
    return this.tileAt(x, y).entity !== null;
  }

  /** ¿Se puede intentar harvest() aquí? (Los setos, la manzana y la cola no se cosechan.) */
  isHarvestable(x: number, y: number): boolean {
    const e = this.tileAt(x, y).entity;
    return e !== null && (e === 'Dead_Pumpkin' || !NOT_HARVESTABLE.has(e));
  }

  canHarvestAt(x: number, y: number): boolean {
    const tile = this.tileAt(x, y);
    if (tile.entity === null || NOT_HARVESTABLE.has(tile.entity)) return false;
    return tile.entity === 'Treasure' || tile.growthProgress >= 1;
  }

  /** ¿Habilitan los desbloqueos actuales esta entidad, función, ítem o sombrero? */
  isGranted(kind: keyof TechGrants, name: string): boolean {
    return isGranted(this.techTree, this.unlocks, kind, name);
  }

  /** measure(): pétalos, tamaño de cactus o, en el laberinto / modo Dinosaurio, la posición del tesoro / la manzana. */
  measureAt(x: number, y: number, direction?: Direction): MeasureValue {
    if (this.maze) {
      const t = this.maze.treasure;
      return this.maze.relocateAt === null && t ? [t.x, t.y] : null;
    }
    if (this.dino) {
      const a = this.dino.apple;
      return a ? [a.x, a.y] : null;
    }
    let tx = x;
    let ty = y;
    if (direction) {
      const d = DIRECTION_DELTAS[direction];
      ({ x: tx, y: ty } = this.grid.wrap(x + d.dx, y + d.dy));
    }
    const tile = this.tileAt(tx, ty);
    if (tile.entity === 'Sunflower') return tile.petals ?? null;
    if (tile.entity === 'Cactus') return tile.cactusSize ?? null;
    return null;
  }

  // ---------------------------------------------------------------- movimiento

  /** En la granja normal los bordes son toroidales; en el laberinto mandan los muros y en el modo Dinosaurio, la cola. */
  canMove(body: DroneBody, direction: Direction): boolean {
    if (this.maze) {
      const d = DIRECTION_DELTAS[direction];
      return this.grid.inBounds(body.x + d.dx, body.y + d.dy) && !hasWall(this, body.x, body.y, direction);
    }
    if (this.dino && this.dino.droneId === body.id) return dinoCanMove(this, body, direction);
    return true;
  }

  /** Mueve el dron (devuelve false si al terminar la espera el paso ya está bloqueado). */
  moveDrone(id: number, direction: Direction): boolean {
    const body = this.getDrone(id);
    if (!this.canMove(body, direction)) return false;
    const delta = DIRECTION_DELTAS[direction];
    const prevX = body.x;
    const prevY = body.y;
    // Sin envoltura en el laberinto (todos los drones) y para el dron que lleva el dinosaurio.
    const bounded = this.maze !== null || this.dino?.droneId === id;
    if (bounded) {
      body.x += delta.dx;
      body.y += delta.dy;
    } else {
      const wrapped = this.grid.wrap(body.x + delta.dx, body.y + delta.dy);
      body.x = wrapped.x;
      body.y = wrapped.y;
    }
    this.record('moves');
    if (this.dino && this.dino.droneId === id) {
      dinoAfterMove(this, prevX, prevY, body.x, body.y);
      if (isTrapped(this, body)) {
        this.record('dinoTrapped');
        this.endDino();
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- acciones

  /**
   * Cosecha si está madura; si no, la destruye. Calabazas fusionadas, girasoles, cactus en cadena,
   * tesoro y policultivo siguen sus reglas; si la planta estaba infectada, la parte
   * `infectedWeirdSubstanceRatio` de cada producto se convierte en Weird_Substance.
   */
  harvestAt(x: number, y: number): HarvestResult {
    const tile = this.tileAt(x, y);
    const kind = tile.entity;
    if (kind === null || (kind !== 'Dead_Pumpkin' && NOT_HARVESTABLE.has(kind))) {
      return { removed: false, mature: false, items: {} };
    }
    if (kind === 'Treasure') return this.harvestTreasure(x, y);
    const cfg = entityBalance(this.balance, kind);
    const mature = kind !== 'Dead_Pumpkin' && tile.growthProgress >= 1;
    const infected = tile.isInfected;
    let removedTiles: TileState[] = [tile];
    let items: Record<string, number> = {};
    if (mature) {
      let factor = 1;
      if (kind === 'Pumpkin') {
        removedTiles = pumpkinTiles(this, tile);
        factor = megaPumpkinYield(this, tile.mega?.size ?? 1);
      } else if (kind === 'Cactus') {
        removedTiles = cactusChain(this, x, y);
        factor = cactusYield(this, removedTiles.length);
        this.record('maxCactusChain', removedTiles.length, 'max');
      } else if (kind === 'Sunflower') {
        factor = sunflowerMultiplier(this, tile);
        if (factor > 1) this.record('sunflowerBonuses');
      }
      const companion = companionBonus(this, tile);
      if (companion > 1) this.record('companionHarvests');
      factor *= companion;
      for (const [item, amount] of Object.entries(cfg.yield)) items[item] = cleanAmount(amount * factor);
      if (infected) {
        items = this.splitInfected(items);
        this.record('infectedHarvests');
      }
      this.record('harvests');
    }
    for (const [item, amount] of Object.entries(items)) this.gain(item, amount);
    for (const t of removedTiles) this.clearTile(t);
    if (mature && cfg.regrowsAfterHarvest && cfg.validGrounds.includes(tile.ground)) this.spawn(tile, kind);
    for (const t of removedTiles) this.autoSpawn(t);
    this.emit({ kind: 'harvest', tick: this.totalTicks, x, y, mature, items });
    return { removed: true, mature, items };
  }

  private splitInfected(items: Record<string, number>): Record<string, number> {
    const ratio = this.balance.fertilizer.infectedWeirdSubstanceRatio;
    const split: Record<string, number> = {};
    let weird = 0;
    for (const [item, amount] of Object.entries(items)) {
      weird += amount * ratio;
      split[item] = cleanAmount(amount * (1 - ratio));
    }
    split.Weird_Substance = cleanAmount((split.Weird_Substance ?? 0) + weird);
    return split;
  }

  private harvestTreasure(x: number, y: number): HarvestResult {
    const gold = treasureGold(this);
    this.gain('Gold', gold);
    this.record('treasures');
    this.record('harvests');
    this.endMaze();
    const items: Record<string, number> = gold > 0 ? { Gold: gold } : {};
    this.emit({ kind: 'harvest', tick: this.totalTicks, x, y, mature: true, items });
    return { removed: true, mature: true, items };
  }

  /** ¿Se puede plantar `kind` aquí? El pasto y la calabaza muerta cuentan como casilla libre. */
  checkPlant(x: number, y: number, kind: EntityKind): PlantResult {
    if (this.maze || this.dino) return { ok: false, reason: 'occupied' };
    const tile = this.tileAt(x, y);
    const free = tile.entity === null || tile.entity === 'Dead_Pumpkin' || (tile.entity === 'Grass' && kind !== 'Grass');
    if (!free) return { ok: false, reason: 'occupied' };
    const cfg = entityBalance(this.balance, kind);
    if (!cfg.validGrounds.includes(tile.ground)) return { ok: false, reason: 'ground' };
    if (!this.inventory.has(cfg.plantCost)) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /** Siembra: descuenta el costo y deja un brote (crecimiento 0) al instante. */
  plantAt(x: number, y: number, kind: EntityKind): PlantResult {
    const check = this.checkPlant(x, y, kind);
    if (!check.ok) return check;
    this.inventory.consume(entityBalance(this.balance, kind).plantCost);
    this.spawn(this.tileAt(x, y), kind);
    this.record('plants');
    this.emit({ kind: 'plant', tick: this.totalTicks, x, y, entity: kind });
    return { ok: true };
  }

  /** use_item(Items.Water, n): cada unidad sube la humedad `amountPerUse` (máximo 1). */
  waterAt(x: number, y: number, n: number): UseResult {
    if (this.inventory.get('Water') < n) return { ok: false, reason: 'items' };
    this.inventory.add('Water', -n);
    const tile = this.tileAt(x, y);
    tile.waterLevel = Math.min(1, cleanAmount(tile.waterLevel + n * this.balance.water.amountPerUse));
    this.record('waters');
    this.emit({ kind: 'water', tick: this.totalTicks, x, y });
    this.checkMudFarm();
    return { ok: true };
  }

  /** use_item(Items.Fertilizer, n): quita `growthReductionSec`·n segundos al crecimiento e infecta la planta. */
  fertilizeAt(x: number, y: number, n: number): UseResult {
    const tile = this.tileAt(x, y);
    if (tile.entity === null || UNTILLABLE.has(tile.entity)) return { ok: false, reason: 'empty' };
    if (this.inventory.get('Fertilizer') < n) return { ok: false, reason: 'items' };
    this.inventory.add('Fertilizer', -n);
    if (tile.growthProgress < 1 && tile.growthDuration > 0) {
      const seconds = this.balance.fertilizer.growthReductionSec * n;
      const before = tile.growthProgress;
      tile.growthProgress = Math.min(1, tile.growthProgress + seconds / tile.growthDuration);
      if (before < 1 && tile.growthProgress >= 1 && tile.entity === 'Pumpkin') onPumpkinMature(this, tile);
    }
    tile.isInfected = tile.entity !== null && tile.entity !== 'Dead_Pumpkin';
    this.record('fertilizes');
    this.emit({ kind: 'fertilize', tick: this.totalTicks, x, y });
    return { ok: true };
  }

  /** Alterna Grassland <-> Soil y destruye la entidad sin devolver recursos (no toca laberinto ni cola). */
  tillAt(x: number, y: number): void {
    const tile = this.tileAt(x, y);
    if (tile.entity !== null && UNTILLABLE.has(tile.entity)) return;
    this.clearTile(tile);
    tile.ground = tile.ground === GroundType.Grassland ? GroundType.Soil : GroundType.Grassland;
    this.autoSpawn(tile);
    this.record('tills');
    this.emit({ kind: 'till', tick: this.totalTicks, x, y, ground: tile.ground });
  }

  /** ¿Puede swap() intercambiar con la vecina? (Sin envoltura y fuera del laberinto y del modo Dinosaurio.) */
  canSwap(x: number, y: number, direction: Direction): boolean {
    if (this.maze || this.dino) return false;
    const d = DIRECTION_DELTAS[direction];
    return this.grid.inBounds(x + d.dx, y + d.dy);
  }

  /** swap(dir): intercambia la entidad (y su estado) con la casilla vecina, aunque alguna esté vacía. */
  swapAt(x: number, y: number, direction: Direction): boolean {
    if (!this.canSwap(x, y, direction)) return false;
    const d = DIRECTION_DELTAS[direction];
    const a = this.tileAt(x, y);
    const b = this.tileAt(x + d.dx, y + d.dy);
    breakMega(this, a);
    breakMega(this, b);
    const keys = ['entity', 'growthProgress', 'growthDuration', 'isInfected', 'petals', 'cactusSize', 'companion'] as const;
    const pa: Record<string, unknown> = {};
    const pb: Record<string, unknown> = {};
    for (const k of keys) {
      pa[k] = a[k];
      pb[k] = b[k];
    }
    for (const k of keys) {
      (a as unknown as Record<string, unknown>)[k] = pb[k];
      (b as unknown as Record<string, unknown>)[k] = pa[k];
      if (a[k] === undefined) delete a[k];
      if (b[k] === undefined) delete b[k];
    }
    this.record('swaps');
    this.emit({ kind: 'swap', tick: this.totalTicks, x, y, toX: b.x, toY: b.y });
    return true;
  }

  // ---------------------------------------------------------------- laberinto y dinosaurio

  /** ¿Qué haría use_item(Items.Weird_Substance, n) aquí? */
  weirdSubstanceTarget(x: number, y: number, n: number): 'maze' | 'recycle' | null {
    if (n < substanceNeeded(this) || this.inventory.get('Weird_Substance') < n || this.dino) return null;
    const tile = this.tileAt(x, y);
    if (!this.maze && tile.entity === 'Bush') return 'maze';
    if (this.maze && tile.entity === 'Treasure' && this.maze.recycles < this.balance.maze.maxRecycleCount) return 'recycle';
    return null;
  }

  /** use_item(Items.Weird_Substance, n): crea el laberinto (sobre un arbusto) o lo recicla (sobre el tesoro). */
  useWeirdSubstance(x: number, y: number, n: number): boolean {
    const target = this.weirdSubstanceTarget(x, y, n);
    if (target === null) return false;
    this.inventory.add('Weird_Substance', -n);
    if (target === 'maze') {
      this.maze = { side: this.size, treasure: null, relocateAt: null, recycles: 0 };
      generateMaze(this, x, y);
      placeTreasure(this, x, y);
      this.record('mazes');
      this.emit({ kind: 'maze', tick: this.totalTicks, x, y, phase: 'start' });
      return true;
    }
    const maze = this.maze as MazeState;
    maze.recycles++;
    this.tileAt(x, y).entity = 'Hedge';
    maze.treasure = null;
    maze.relocateAt = this.totalTicks + this.balance.maze.relocateTicks;
    this.emit({ kind: 'maze', tick: this.totalTicks, x, y, phase: 'recycle' });
    if (maze.recycles >= this.balance.maze.maxRecycleCount) this.unlockAchievement('Recycling');
    return true;
  }

  /** Quita el laberinto: las casillas quedan libres y vuelve a crecer el pasto en Grassland. */
  endMaze(): void {
    if (!this.maze) return;
    const first = this.grid.tiles[0];
    this.maze = null;
    for (const t of this.grid.tiles) {
      this.clearTile(t);
      this.autoSpawn(t);
    }
    this.emit({ kind: 'maze', tick: this.totalTicks, x: first.x, y: first.y, phase: 'end' });
  }

  /** Equipar Hats.Dinosaur_Hat: vacía la granja y aparece la primera manzana. */
  startDino(body: DroneBody): void {
    if (this.dino) return;
    beginDino(this, body);
    this.record('dinoRuns');
  }

  /**
   * Termina el modo Dinosaurio cosechando la cola (Bone = largo² · bonePerSquare). Si el dron aún
   * lleva el sombrero (quedó atrapado o cambió el tamaño de la granja), vuelve al sombrero inicial.
   */
  endDino(): number {
    const dino = this.dino;
    if (!dino) return 0;
    const bones = finishDino(this);
    const body = this.drones.find((d) => d.id === dino.droneId);
    if (body && body.hat === 'Dinosaur_Hat') {
      body.hat = DEFAULT_HAT;
      this.emit({ kind: 'hat', tick: this.totalTicks, droneId: body.id, x: body.x, y: body.y, hat: DEFAULT_HAT });
    }
    return bones;
  }

  /** Items.Power: gasta la energía de este tick y devuelve el multiplicador de velocidad de los drones. */
  consumePower(activeDrones: number): number {
    this.droneSpeed = consumePower(this, activeDrones);
    if (this.droneSpeed > 1) this.record('poweredTicks');
    return this.droneSpeed;
  }

  // ---------------------------------------------------------------- árbol tecnológico

  checkUnlock(id: string): UnlockCheck {
    return checkUnlock(this.techTree, this.unlocks, (cost) => this.inventory.has(cost), id);
  }

  /** Compra el siguiente nivel de una tecnología (descuenta el costo y aplica su efecto). */
  unlock(id: string): UnlockResult {
    const check = this.checkUnlock(id);
    if (!check.ok) return { ok: false, message: check.message };
    this.inventory.consume(check.level.cost);
    const level = techLevel(this.unlocks, id) + 1;
    this.unlocks = { ...this.unlocks, [id]: level };
    this.record('unlocks');
    if (id === 'Expand') {
      const [w, h] = farmSize(this.techTree, this.unlocks);
      this.resizeTo(w, h);
    }
    this.emit({ kind: 'unlock', tick: this.totalTicks, x: 0, y: 0, tech: id, level });
    // Los desbloqueos desde el árbol ocurren sin ticks: los logros se evalúan aquí mismo.
    this.checkAchievements();
    return { ok: true, level };
  }

  /** Cambia el tamaño a size × size conservando las casillas que siguen dentro. */
  resize(newSize: number): void {
    this.resizeTo(newSize, newSize);
  }

  /** Nuevo tamaño completo de la granja (Expand); si hay un límite de set_world_size(), se respeta. */
  resizeTo(newWidth: number, newHeight: number): void {
    this.baseWidth = this.clampSize(newWidth);
    this.baseHeight = this.clampSize(newHeight);
    this.regrid(...this.effectiveSize());
  }

  /** Cambia la cuadrícula conservando las casillas que siguen dentro; las nuevas nacen con pasto. */
  private regrid(newWidth: number, newHeight: number): void {
    const width = this.clampSize(newWidth);
    const height = this.clampSize(newHeight);
    if (width === this.width && height === this.height) return;
    // El laberinto y el modo Dinosaurio dependen del tamaño: se cierran antes de cambiarlo.
    if (this.maze) this.endMaze();
    if (this.dino) this.endDino();
    const old = this.grid;
    const grid = new Grid(width, height);
    for (let i = 0; i < grid.tiles.length; i++) {
      const tile = grid.tiles[i];
      if (old.inBounds(tile.x, tile.y)) grid.tiles[i] = cloneTile(old.get(tile.x, tile.y));
    }
    this.grid = grid;
    for (const tile of grid.tiles) {
      // Las megacalabazas que quedaban fuera se deshacen.
      if (tile.mega && (tile.mega.x + tile.mega.size > width || tile.mega.y + tile.mega.size > height)) delete tile.mega;
      if (!old.inBounds(tile.x, tile.y)) this.autoSpawn(tile, this.balance.world.startWithMatureGrass);
    }
    for (const body of this.drones) {
      const wrapped = grid.wrap(body.x, body.y);
      body.x = wrapped.x;
      body.y = wrapped.y;
      body.action = null;
    }
  }

  // ---------------------------------------------------------------- eventos y guardado

  emit(event: SimEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_PENDING_EVENTS) {
      this.events.splice(0, this.events.length - MAX_PENDING_EVENTS);
    }
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  serialize(): SerializedWorldState {
    return {
      version: 4,
      seed: this.seed,
      rngState: this.rng.getState(),
      scriptRngState: this.scriptRng.getState(),
      width: this.width,
      height: this.height,
      ...(this.width !== this.baseWidth || this.height !== this.baseHeight ? { baseWidth: this.baseWidth, baseHeight: this.baseHeight } : {}),
      totalTicks: this.totalTicks,
      tiles: this.grid.tiles.map(cloneTile),
      inventory: this.inventory.toRecord(),
      drones: this.drones.map((d) => ({ id: d.id, x: d.x, y: d.y, hat: d.hat })),
      unlocks: { ...this.unlocks },
      achievements: [...this.achievements],
      maze: this.maze ? { ...this.maze, treasure: this.maze.treasure ? { ...this.maze.treasure } : null } : null,
      dino: this.dino
        ? { ...this.dino, tail: this.dino.tail.map((s) => ({ ...s })), apple: this.dino.apple ? { ...this.dino.apple } : null }
        : null,
      sunflowerPenalty: this.sunflowerPenalty,
      stats: { ...this.stats, items: { ...this.stats.items }, hats: [...this.stats.hats] },
    };
  }

  static deserialize(
    state: AnySerializedWorldState,
    balance: BalanceConfig = DEFAULT_BALANCE,
    techTree: TechTree = DEFAULT_TECH_TREE,
  ): World {
    const width = state.version === 1 ? state.size : state.width;
    const height = state.version === 1 ? state.size : state.height;
    const world = new World({
      seed: state.seed,
      width,
      height,
      balance,
      techTree,
      unlocks: state.version === 1 ? undefined : state.unlocks,
    });
    world.grid = new Grid(width, height);
    state.tiles.forEach((tile, i) => {
      world.grid.tiles[i] = cloneTile(tile);
    });
    world.rng.setState(state.rngState);
    world.scriptRng.setState(state.scriptRngState);
    world.totalTicks = state.totalTicks;
    world.inventory = Inventory.fromRecord(state.inventory);
    world.drones.length = 0;
    // Los drones hijos no sobreviven a una recarga (su script ya no existe): solo vuelve el principal.
    for (const d of state.drones) {
      if (d.id !== 0) continue;
      world.drones.push({ id: d.id, x: d.x, y: d.y, action: null, hat: isHatKind(d.hat) ? d.hat : DEFAULT_HAT });
    }
    if (world.drones.length === 0) world.drones.push({ id: 0, x: 0, y: 0, action: null, hat: DEFAULT_HAT });
    if (state.version !== 1) for (const id of state.achievements) world.achievements.add(id);
    if (state.version === 3 || state.version === 4) {
      world.maze = state.maze ? { ...state.maze, treasure: state.maze.treasure ? { ...state.maze.treasure } : null } : null;
      world.dino = state.dino
        ? { ...state.dino, tail: state.dino.tail.map((s) => ({ ...s })), apple: state.dino.apple ? { ...state.dino.apple } : null }
        : null;
      world.sunflowerPenalty = state.sunflowerPenalty;
      // Un modo Dinosaurio de un dron hijo que ya no existe se cierra.
      if (world.dino && world.dino.droneId !== 0) {
        world.dino.droneId = 0;
        world.endDino();
      }
    }
    if (state.version === 4) {
      world.stats = restoreStats(state.stats);
      // Un set_world_size() guardado a mitad de ejecución no sobrevive a la recarga: vuelve la granja completa.
      if (state.baseWidth !== undefined && state.baseHeight !== undefined) world.resizeTo(state.baseWidth, state.baseHeight);
    }
    return world;
  }
}
