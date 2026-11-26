import { findTech, nextLevel, techGranting, techLevel } from '../engine/tech';
import {
  DIRECTION_DELTAS,
  DIRECTIONS,
  ENTITY_KINDS,
  GROUND_KINDS,
  HAT_KINDS,
  ITEM_KINDS,
  LEADERBOARD_KINDS,
  UNLOCK_KINDS,
  type Direction,
  type DroneBody,
  type EntityKind,
  type HatKind,
} from '../engine/types';
import type { World } from '../engine/world';
import type { DroneVM } from './droneVm';
import { PyError } from './errors';
import type { DroneFleet } from './fleet';
import {
  BuiltinFunction,
  DroneHandleObject,
  EnumNamespace,
  FunctionObject,
  EnumValue,
  isTruthy,
  Isolator,
  iterateAll,
  pyLen,
  pyOrder,
  pyRepr,
  pyStr,
  PyDict,
  PyRange,
  PySet,
  PyTuple,
  toInteger,
  toNumberOrNull,
  typeName,
  type BuiltinImpl,
  type RuntimeValue,
} from './values';

/** Marca devuelta por un builtin que inicia una acción física (el valor llega al terminar la espera). */
export const PENDING: unique symbol = Symbol('PENDING');

export interface PendingAction {
  readonly kind: string;
  /** Aplica el efecto físico cuando termina la espera y devuelve el valor para el script. */
  complete(): RuntimeValue;
  cancel?(): void;
  /**
   * Espera bloqueante (wait_for, do_a_flip): además de agotar sus ticks, la acción no termina
   * hasta que `ready()` devuelve true; mientras tanto el dron queda en estado WAITING.
   */
  ready?(): boolean;
}

/** simulate() (doc 02): petición validada que el host ejecuta en una granja aislada. */
export interface SimulationRequest {
  file: string;
  /** Nivel de cada tecnología en la granja simulada. */
  unlocks: Record<string, number>;
  /** Inventario inicial. */
  items: Record<string, number>;
  /** Variables globales con las que arranca el script simulado (copias aisladas). */
  globals: Map<string, RuntimeValue>;
  seed: number;
  /** Ritmo de tiempo real (no cambia la duración simulada que se mide). */
  speedup: number;
}

/** Simulación pedida por un dron: el host la pone en cola, la ejecuta y deja aquí el resultado. */
export interface SimulationTicket {
  readonly request: SimulationRequest;
  state: 'queued' | 'running' | 'done' | 'cancelled';
  /** Segundos simulados que tardó el script. */
  result: number | null;
  error: string | null;
}

/** Puente entre la VM y la simulación. */
export interface ExecEnv {
  readonly world: World;
  /** Dónde corre el script: la granja del jugador, un intento de marcador o una simulación. */
  readonly mode?: 'home' | 'leaderboard' | 'simulation';
  log(droneId: number, message: string): void;
  /** Megafarm (Fase 4): drones hijos, num_drones() y wait_for(). Sin flota hay un solo dron. */
  readonly fleet?: DroneFleet;
  /** set_execution_speed(): tope de velocidad (≤ 0 restaura el máximo). */
  setSpeedCap?(speed: number): void;
  /** leaderboard_run(): programa un intento cronometrado; devuelve un mensaje de error o null. */
  startLeaderboard?(boardId: string, file: string, speedup: number): string | null;
  /** simulate(): valida la petición y devuelve su ticket, o un mensaje de error. */
  requestSimulation?(request: SimulationRequest): SimulationTicket | string;
  /** Al agotarse la espera: arranca la simulación si es su turno y dice si ya terminó. */
  pollSimulation?(ticket: SimulationTicket): boolean;
  /** El dron que esperaba se detuvo: su simulación se descarta. */
  cancelSimulation?(ticket: SimulationTicket): void;
}

export interface BuiltinContext {
  readonly drone: DroneVM;
  env: ExecEnv;
  /** Ticks que costará esta llamada. Llega con el costo base de balance.json; el builtin puede cambiarlo. */
  cost: number;
  beginAction(action: PendingAction): typeof PENDING;
}

export interface GameEnums {
  Items: EnumNamespace;
  Entities: EnumNamespace;
  Grounds: EnumNamespace;
  Directions: EnumNamespace;
  Hats: EnumNamespace;
  Unlocks: EnumNamespace;
  Leaderboards: EnumNamespace;
}

function makeEnum(name: string, members: readonly string[], bare = false): EnumNamespace {
  const map = new Map<string, EnumValue>();
  for (const m of members) map.set(m, new EnumValue(name, m, bare ? m : `${name}.${m}`));
  return new EnumNamespace(name, map);
}

export function createEnums(): GameEnums {
  return {
    Items: makeEnum('Items', ITEM_KINDS),
    Entities: makeEnum('Entities', ENTITY_KINDS),
    Grounds: makeEnum('Grounds', GROUND_KINDS),
    Directions: makeEnum('Directions', DIRECTIONS, true),
    Hats: makeEnum('Hats', HAT_KINDS),
    Unlocks: makeEnum('Unlocks', UNLOCK_KINDS),
    Leaderboards: makeEnum('Leaderboards', LEADERBOARD_KINDS),
  };
}

function member(ns: EnumNamespace, name: string): EnumValue {
  const value = ns.members.get(name);
  if (!value) throw new PyError('InternalError', `${ns.name}.${name} no existe`);
  return value;
}

function expectCount(name: string, args: RuntimeValue[], min: number, max: number = min): void {
  if (args.length >= min && args.length <= max) return;
  const expected =
    min === max ? `${min} argumento${min === 1 ? '' : 's'}` : max === Infinity ? `al menos ${min}` : `entre ${min} y ${max} argumentos`;
  throw new PyError('TypeError', `${name}() espera ${expected}, pero recibió ${args.length}`);
}

function expectEnum(fn: string, value: RuntimeValue, ns: EnumNamespace, what: string): EnumValue {
  if (value instanceof EnumValue && value.enumName === ns.name) return value;
  throw new PyError('TypeError', `${fn}() espera ${what}, no '${pyRepr(value)}' (${typeName(value)})`);
}

/** Tick en que termina (para la animación) una acción de `cost` ticks: antes si Items.Power acelera al dron. */
function actionEnd(world: World, cost: number): number {
  return world.totalTicks + cost / Math.max(1, world.droneSpeed);
}

function bodyOf(ctx: BuiltinContext): DroneBody {
  return ctx.env.world.getDrone(ctx.drone.id);
}

/** Detiene el script si la tecnología que habilita `name` aún no está desbloqueada (doc 02: gating). */
function requireGrant(ctx: BuiltinContext, kind: 'entities' | 'functions' | 'items' | 'hats', name: string, what: string): void {
  const world = ctx.env.world;
  if (world.isGranted(kind, name)) return;
  const node = techGranting(world.techTree, kind, name);
  throw new PyError('UnlockError', `${what} requiere desbloquear «${node?.name ?? '?'}» (Unlocks.${node?.id ?? '?'}) en el árbol tecnológico`);
}

/** Acción física de espera sin efecto al terminar (el efecto ya se aplicó o se aplica en `complete`). */
function waitAction(
  ctx: BuiltinContext,
  body: DroneBody,
  kind: 'plant' | 'use' | 'unlock' | 'swap' | 'spawn' | 'clear',
  complete: () => RuntimeValue,
): typeof PENDING {
  const world = ctx.env.world;
  body.action = {
    kind,
    startTick: world.totalTicks,
    endTick: actionEnd(world, ctx.cost),
    fromX: body.x,
    fromY: body.y,
    toX: body.x,
    toY: body.y,
  };
  return ctx.beginAction({
    kind,
    complete: () => {
      body.action = null;
      return complete();
    },
    cancel: () => {
      body.action = null;
    },
  });
}

/** Nivel máximo de una tecnología del árbol. */
function maxLevel(world: World, id: string): number {
  return findTech(world.techTree, id)?.levels.length ?? 0;
}

/**
 * sim_unlocks de simulate(): None copia los niveles actuales; el enum Unlocks entero o una secuencia
 * de desbloqueos los pone al máximo; un diccionario {Unlocks.X: nivel} fija cada nivel.
 */
function simUnlocks(value: RuntimeValue, world: World, enums: GameEnums): Record<string, number> {
  if (value === null) return { ...world.unlocks };
  const out: Record<string, number> = {};
  const what = 'desbloqueos (Unlocks.X) en sim_unlocks';
  if (value instanceof EnumNamespace) {
    if (value.name !== 'Unlocks') throw new PyError('TypeError', `simulate() espera ${what}, no el enum ${value.name}`);
    for (const node of world.techTree.nodes) out[node.id] = maxLevel(world, node.id);
    return out;
  }
  if (value instanceof PyDict) {
    for (const [key, level] of value.entries()) {
      const id = expectEnum('simulate', key, enums.Unlocks, what).name;
      out[id] = Math.max(0, Math.min(maxLevel(world, id), toInteger(level, `el nivel de Unlocks.${id}`)));
    }
    return out;
  }
  for (const key of iterateAll(value)) {
    const id = expectEnum('simulate', key, enums.Unlocks, what).name;
    out[id] = maxLevel(world, id);
  }
  return out;
}

/** sim_items de simulate(): {Items.X: cantidad} (None = inventario vacío). */
function simItems(value: RuntimeValue, enums: GameEnums): Record<string, number> {
  const out: Record<string, number> = {};
  if (value === null) return out;
  if (!(value instanceof PyDict)) throw new PyError('TypeError', `simulate() espera un diccionario {Items.X: cantidad} en sim_items, no '${typeName(value)}'`);
  for (const [key, amount] of value.entries()) {
    const item = expectEnum('simulate', key, enums.Items, 'recursos (Items.X) como claves de sim_items').name;
    const n = toNumberOrNull(amount);
    if (n === null || !Number.isFinite(n) || n < 0) throw new PyError('ValueError', `simulate(): la cantidad de Items.${item} debe ser un número ≥ 0`);
    out[item] = n;
  }
  return out;
}

/** sim_globals de simulate(): {"nombre": valor}, copiado en profundidad (la simulación no toca tus datos). */
function simGlobals(value: RuntimeValue): Map<string, RuntimeValue> {
  const out = new Map<string, RuntimeValue>();
  if (value === null) return out;
  if (!(value instanceof PyDict)) throw new PyError('TypeError', `simulate() espera un diccionario {"nombre": valor} en sim_globals, no '${typeName(value)}'`);
  const iso = new Isolator();
  for (const [key, val] of value.entries()) {
    if (typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new PyError('ValueError', `simulate(): ${pyRepr(key)} no es un nombre de variable válido en sim_globals`);
    }
    out.set(key, iso.clone(val));
  }
  return out;
}

function expectDirection(fn: string, value: RuntimeValue, enums: GameEnums): Direction {
  return expectEnum(fn, value, enums.Directions, 'una dirección (North, South, East o West)').name as Direction;
}

/** Cómo se obtienen las entidades que plant() no acepta. */
const NOT_PLANTABLE_HINT: Partial<Record<EntityKind, string>> = {
  Dead_Pumpkin: 'aparece cuando una calabaza muere al madurar',
  Hedge: 'el laberinto se crea con use_item(Items.Weird_Substance) sobre un arbusto',
  Treasure: 'el laberinto se crea con use_item(Items.Weird_Substance) sobre un arbusto',
  Apple: 'aparece sola en el modo Dinosaurio (change_hat(Hats.Dinosaur_Hat))',
  Dinosaur: 'la cola crece al comer manzanas en el modo Dinosaurio',
};

function costDict(enums: GameEnums, cost: Readonly<Record<string, number>>): PyDict {
  const out = new PyDict();
  for (const [item, amount] of Object.entries(cost)) {
    const key = enums.Items.members.get(item);
    if (key) out.set(key, amount);
  }
  return out;
}

function joinArgs(args: RuntimeValue[]): string {
  return args.map((a) => pyStr(a)).join(' ');
}

function minMax(name: 'min' | 'max', ctx: BuiltinContext, args: RuntimeValue[]): RuntimeValue {
  if (args.length === 0) throw new PyError('TypeError', `${name}() espera al menos 1 argumento`);
  const items = args.length === 1 ? iterateAll(args[0]) : args;
  if (items.length === 0) throw new PyError('ValueError', `${name}() recibió una secuencia vacía`);
  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    if (pyOrder(name === 'min' ? '<' : '>', items[i], best)) best = items[i];
  }
  ctx.cost = Math.max(1, items.length - 1) * ctx.env.world.balance.operations.comparison;
  return best;
}

function parseIntLiteral(text: string): number {
  const s = text.trim().replace(/_/g, '');
  if (!/^[+-]?\d+$/.test(s)) throw new PyError('ValueError', `literal no válido para int(): ${pyRepr(text)}`);
  return parseInt(s, 10);
}

function parseFloatLiteral(text: string): number {
  const s = text.trim().toLowerCase();
  if (s === 'inf' || s === '+inf' || s === 'infinity') return Infinity;
  if (s === '-inf' || s === '-infinity') return -Infinity;
  if (s === 'nan') return NaN;
  if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s.replace(/_/g, ''))) {
    throw new PyError('ValueError', `no se pudo convertir la cadena a float: ${pyRepr(text)}`);
  }
  return Number(s.replace(/_/g, ''));
}

/**
 * Crea el espacio global integrado del DSL: funciones de la API del juego, utilidades y enumeraciones.
 * Las enumeraciones son instancias únicas compartidas, de modo que `==` e `is` funcionan entre drones.
 */
export function createBuiltins(enums: GameEnums = createEnums()): Map<string, RuntimeValue> {
  const fns: Record<string, BuiltinImpl> = {
    // ---------------------------------------------------------- acciones físicas
    move(ctx, args) {
      expectCount('move', args, 1);
      const dir = expectDirection('move', args[0], enums);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      const ticks = world.balance.ticks;
      if (!world.canMove(body, dir)) {
        ctx.cost = ticks.physicalActionFail;
        return false;
      }
      ctx.cost = ticks.physicalActionSuccess;
      const delta = DIRECTION_DELTAS[dir];
      body.action = {
        kind: 'move',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x + delta.dx,
        toY: body.y + delta.dy,
      };
      return ctx.beginAction({
        kind: 'move',
        complete: () => {
          body.action = null;
          // Al terminar la espera el paso puede haberse cerrado (laberinto o cola del dinosaurio).
          return world.moveDrone(body.id, dir);
        },
        cancel: () => {
          body.action = null;
        },
      });
    },

    harvest(ctx, args) {
      expectCount('harvest', args, 0);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      const ticks = world.balance.ticks;
      // Casilla vacía, setos, manzana o cola: no hay nada que cosechar.
      if (!world.isHarvestable(body.x, body.y)) {
        ctx.cost = ticks.physicalActionFail;
        return false;
      }
      ctx.cost = ticks.physicalActionSuccess;
      body.action = {
        kind: 'harvest',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
      };
      return ctx.beginAction({
        kind: 'harvest',
        complete: () => {
          body.action = null;
          return world.harvestAt(body.x, body.y).removed;
        },
        cancel: () => {
          body.action = null;
        },
      });
    },

    till(ctx, args) {
      expectCount('till', args, 0);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      ctx.cost = world.balance.ticks.physicalActionSuccess;
      body.action = {
        kind: 'till',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
      };
      return ctx.beginAction({
        kind: 'till',
        complete: () => {
          body.action = null;
          world.tillAt(body.x, body.y);
          return null;
        },
        cancel: () => {
          body.action = null;
        },
      });
    },

    plant(ctx, args) {
      expectCount('plant', args, 1);
      const entity = expectEnum('plant', args[0], enums.Entities, 'una entidad (por ejemplo Entities.Bush)').name as EntityKind;
      if (ctx.env.world.balance.entities[entity]?.plantable === false) {
        const hint = NOT_PLANTABLE_HINT[entity];
        throw new PyError('ValueError', `plant() no puede sembrar Entities.${entity}${hint ? `: ${hint}` : ''}`);
      }
      requireGrant(ctx, 'functions', 'plant', 'plant()');
      requireGrant(ctx, 'entities', entity, `plant(Entities.${entity})`);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      const ticks = world.balance.ticks;
      // Doc 06: el brote aparece al instante; el dron espera después los ticks de la acción.
      if (!world.plantAt(body.x, body.y, entity).ok) {
        ctx.cost = ticks.physicalActionFail;
        return false;
      }
      ctx.cost = ticks.physicalActionSuccess;
      return waitAction(ctx, body, 'plant', () => true);
    },

    use_item(ctx, args) {
      expectCount('use_item', args, 1, 2);
      const item = expectEnum('use_item', args[0], enums.Items, 'un ítem (Items.Water, Items.Fertilizer o Items.Weird_Substance)').name;
      const n = args.length > 1 ? toInteger(args[1], 'la cantidad de use_item()') : 1;
      if (n < 1) throw new PyError('ValueError', 'use_item() necesita una cantidad de 1 o más');
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      const ticks = world.balance.ticks;
      const fail = (): boolean => {
        ctx.cost = ticks.physicalActionFail;
        return false;
      };
      if (item === 'Water' || item === 'Fertilizer') {
        requireGrant(ctx, 'items', item, `use_item(Items.${item})`);
        if (world.inventory.get(item) < n) return fail();
        if (item === 'Fertilizer' && !world.hasEntityAt(body.x, body.y)) return fail();
        ctx.cost = ticks.physicalActionSuccess;
        return waitAction(ctx, body, 'use', () =>
          item === 'Water' ? world.waterAt(body.x, body.y, n).ok : world.fertilizeAt(body.x, body.y, n).ok,
        );
      }
      if (item === 'Weird_Substance') {
        // Sobre un arbusto crea el laberinto; sobre el tesoro lo recicla (doc 03 §3.5).
        requireGrant(ctx, 'items', item, 'use_item(Items.Weird_Substance)');
        if (world.weirdSubstanceTarget(body.x, body.y, n) === null) return fail();
        ctx.cost = ticks.physicalActionSuccess;
        return waitAction(ctx, body, 'use', () => world.useWeirdSubstance(body.x, body.y, n));
      }
      throw new PyError('TypeError', `use_item() solo acepta Items.Water, Items.Fertilizer o Items.Weird_Substance, no Items.${item}`);
    },

    unlock(ctx, args) {
      expectCount('unlock', args, 1);
      const tech = expectEnum('unlock', args[0], enums.Unlocks, 'una tecnología (por ejemplo Unlocks.Speed)').name;
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      const ticks = world.balance.ticks;
      if (!world.checkUnlock(tech).ok) {
        ctx.cost = ticks.physicalActionFail;
        return false;
      }
      ctx.cost = ticks.physicalActionSuccess;
      return waitAction(ctx, body, 'unlock', () => world.unlock(tech).ok);
    },

    swap(ctx, args) {
      expectCount('swap', args, 1);
      const dir = expectDirection('swap', args[0], enums);
      requireGrant(ctx, 'functions', 'swap', 'swap()');
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      const ticks = world.balance.ticks;
      if (!world.canSwap(body.x, body.y, dir)) {
        ctx.cost = ticks.physicalActionFail;
        return false;
      }
      ctx.cost = ticks.physicalActionSuccess;
      return waitAction(ctx, body, 'swap', () => world.swapAt(body.x, body.y, dir));
    },

    // ---------------------------------------------------------- cosméticos
    change_hat(ctx, args) {
      expectCount('change_hat', args, 1);
      const hat = expectEnum('change_hat', args[0], enums.Hats, 'un sombrero (por ejemplo Hats.Beanie)').name as HatKind;
      const { world } = ctx.env;
      const lock = world.hatLock(hat);
      if (lock?.kind === 'tech') requireGrant(ctx, 'hats', hat, `change_hat(Hats.${hat})`);
      if (lock?.kind === 'achievement') {
        throw new PyError('UnlockError', `change_hat(Hats.${hat}) requiere el logro «${lock.name}»`);
      }
      const body = bodyOf(ctx);
      body.action = {
        kind: 'hat',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
      };
      return ctx.beginAction({
        kind: 'hat',
        complete: () => {
          body.action = null;
          body.hat = hat;
          world.recordHat(hat);
          world.emit({ kind: 'hat', tick: world.totalTicks, droneId: body.id, x: body.x, y: body.y, hat });
          // Hats.Dinosaur_Hat inicia el modo Dinosaurio; quitárselo cosecha la cola (doc 03 §3.6).
          if (hat === 'Dinosaur_Hat') world.startDino(body);
          else if (world.dino?.droneId === body.id) world.endDino();
          return null;
        },
        cancel: () => {
          body.action = null;
        },
      });
    },

    pet_the_dog(ctx, args) {
      expectCount('pet_the_dog', args, 0);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      world.record('pets');
      world.emit({ kind: 'pet', tick: world.totalTicks, droneId: body.id, x: body.x, y: body.y });
      body.action = {
        kind: 'pet',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
      };
      return ctx.beginAction({
        kind: 'pet',
        complete: () => {
          body.action = null;
          return null;
        },
        cancel: () => {
          body.action = null;
        },
      });
    },

    // ---------------------------------------------------------- Megafarm (doc 02 §3)
    spawn_drone(ctx, args) {
      if (args.length < 1) throw new PyError('TypeError', 'spawn_drone() necesita una función (y sus argumentos)');
      requireGrant(ctx, 'functions', 'spawn_drone', 'spawn_drone()');
      const fn = args[0];
      if (!(fn instanceof FunctionObject)) {
        throw new PyError('TypeError', `spawn_drone() necesita una función definida con def, no '${typeName(fn)}'`);
      }
      const rest = args.slice(1);
      const { world, fleet } = ctx.env;
      fleet?.checkArgs(fn, rest);
      const ticks = world.balance.ticks;
      // En el límite de max_drones() no hay error: devuelve None y cuesta 1 tick.
      if (!fleet || !fleet.reserve()) {
        ctx.cost = ticks.physicalActionFail;
        return null;
      }
      ctx.cost = ticks.physicalActionSuccess;
      const body = bodyOf(ctx);
      body.action = {
        kind: 'spawn',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
      };
      return ctx.beginAction({
        kind: 'spawn',
        complete: () => {
          body.action = null;
          const id = fleet.spawn(ctx.drone, fn, rest);
          world.emit({ kind: 'spawn', tick: world.totalTicks, droneId: id, x: body.x, y: body.y });
          return new DroneHandleObject(id);
        },
        cancel: () => {
          body.action = null;
          fleet.release();
        },
      });
    },
    wait_for(ctx, args) {
      expectCount('wait_for', args, 1);
      requireGrant(ctx, 'functions', 'wait_for', 'wait_for()');
      const handle = args[0];
      if (!(handle instanceof DroneHandleObject)) {
        throw new PyError('TypeError', `wait_for() espera un dron devuelto por spawn_drone(), no '${typeName(handle)}'`);
      }
      const { world, fleet } = ctx.env;
      if (!fleet) return null;
      const deliver = (): RuntimeValue => {
        const value = fleet.resultOf(handle.droneId);
        if (value !== null) world.record('waitedValues');
        return value;
      };
      if (fleet.isFinished(handle.droneId)) return deliver();
      // Bloquea al dron hasta que el hijo termine (estado WAITING) y recibe su valor de retorno.
      ctx.drone.waitingForDroneId = handle.droneId;
      return ctx.beginAction({ kind: 'wait', ready: () => fleet.isFinished(handle.droneId), complete: deliver });
    },
    has_finished(ctx, args) {
      expectCount('has_finished', args, 1);
      requireGrant(ctx, 'functions', 'has_finished', 'has_finished()');
      const handle = args[0];
      if (!(handle instanceof DroneHandleObject)) {
        throw new PyError('TypeError', `has_finished() espera un dron devuelto por spawn_drone(), no '${typeName(handle)}'`);
      }
      return ctx.env.fleet ? ctx.env.fleet.isFinished(handle.droneId) : true;
    },
    num_drones(ctx, args) {
      expectCount('num_drones', args, 0);
      return ctx.env.fleet ? ctx.env.fleet.activeCount() : 1;
    },
    max_drones(ctx, args) {
      expectCount('max_drones', args, 0);
      return ctx.env.world.maxDrones();
    },

    // ---------------------------------------------------------- escena y simulación
    do_a_flip(ctx, args) {
      expectCount('do_a_flip', args, 0);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      // 1 segundo fijo: espera bloqueante que el planificador descuenta sin Items.Power (doc 02 §2).
      const vm = ctx.drone;
      vm.fixedWaitMs = 1000;
      const ticks = world.balance.ticks.baseTicksPerSecond;
      body.action = {
        kind: 'flip',
        startTick: world.totalTicks,
        endTick: world.totalTicks + ticks,
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
      };
      world.emit({ kind: 'flip', tick: world.totalTicks, droneId: body.id, x: body.x, y: body.y });
      return ctx.beginAction({
        kind: 'flip',
        ready: () => vm.fixedWaitMs <= 0,
        complete: () => {
          body.action = null;
          world.record('flips');
          return null;
        },
        cancel: () => {
          body.action = null;
        },
      });
    },
    set_execution_speed(ctx, args) {
      expectCount('set_execution_speed', args, 1);
      const speed = toNumberOrNull(args[0]);
      if (speed === null) throw new PyError('TypeError', 'set_execution_speed() necesita un número');
      ctx.env.setSpeedCap?.(speed);
      return null;
    },
    clear(ctx, args) {
      expectCount('clear', args, 0);
      const { world } = ctx.env;
      ctx.cost = world.balance.ticks.physicalActionSuccess;
      const body = bodyOf(ctx);
      return waitAction(ctx, body, 'clear', () => {
        world.clearFarm(body.id);
        return null;
      });
    },
    set_world_size(ctx, args) {
      expectCount('set_world_size', args, 1);
      const size = toNumberOrNull(args[0]);
      if (size === null || !Number.isFinite(size)) {
        throw new PyError('TypeError', `set_world_size() necesita un número, no '${typeName(args[0])}'`);
      }
      if (ctx.env.mode === 'leaderboard') {
        throw new PyError('ValueError', 'set_world_size() no está disponible en un intento de marcador: el tamaño lo fija el marcador');
      }
      const { world } = ctx.env;
      // La granja se reduce, se limpia y los drones vuelven a (0, 0) al terminar la espera.
      return waitAction(ctx, bodyOf(ctx), 'clear', () => {
        world.setSizeLimit(size);
        return null;
      });
    },
    simulate(ctx, args) {
      expectCount('simulate', args, 1, 6);
      const { env } = ctx;
      const file = args[0];
      if (typeof file !== 'string') throw new PyError('TypeError', 'simulate() necesita el nombre del archivo (por ejemplo "prueba.py")');
      if (env.mode === 'simulation') throw new PyError('ValueError', 'simulate() no se puede usar dentro de otra simulación');
      if (env.mode === 'leaderboard') throw new PyError('ValueError', 'simulate() no está disponible en un intento de marcador');
      if (!env.requestSimulation || !env.pollSimulation) throw new PyError('ValueError', 'simulate() no está disponible aquí');
      const seedArg = args[4] ?? null;
      const speedArg = args[5] ?? null;
      const speedup = speedArg === null ? 1 : toNumberOrNull(speedArg);
      if (speedup === null) throw new PyError('TypeError', `simulate() espera un número en speedup, no '${typeName(speedArg)}'`);
      const ticket = env.requestSimulation({
        file,
        unlocks: simUnlocks(args[1] ?? null, env.world, enums),
        items: simItems(args[2] ?? null, enums),
        globals: simGlobals(args[3] ?? null),
        seed: seedArg === null ? 0 : toInteger(seedArg, 'seed'),
        speedup: speedup > 0 ? speedup : 1,
      });
      if (typeof ticket === 'string') throw new PyError('ValueError', `simulate(): ${ticket}`);
      const poll = env.pollSimulation;
      // Tras la espera de 200 ticks el dron queda en WAITING mientras corre la granja aislada.
      return ctx.beginAction({
        kind: 'simulate',
        ready: () => poll(ticket),
        complete: () => {
          if (ticket.error) throw new PyError('RuntimeError', `simulate(): ${ticket.error}`);
          return ticket.result ?? 0;
        },
        cancel: () => env.cancelSimulation?.(ticket),
      });
    },
    leaderboard_run(ctx, args) {
      expectCount('leaderboard_run', args, 2, 3);
      requireGrant(ctx, 'functions', 'leaderboard_run', 'leaderboard_run()');
      const board = expectEnum('leaderboard_run', args[0], enums.Leaderboards, 'un marcador (por ejemplo Leaderboards.Hay)').name;
      const file = args[1];
      if (typeof file !== 'string') throw new PyError('TypeError', 'leaderboard_run() necesita el nombre del archivo (por ejemplo "main.py")');
      const speedup = args.length > 2 ? (toNumberOrNull(args[2]) ?? 1) : 1;
      if (ctx.env.mode === 'simulation') throw new PyError('ValueError', 'leaderboard_run() no está disponible dentro de una simulación');
      const error = ctx.env.startLeaderboard ? ctx.env.startLeaderboard(board, file, speedup) : 'los marcadores no están disponibles aquí';
      if (error) throw new PyError('ValueError', `leaderboard_run(): ${error}`);
      return null;
    },

    // ---------------------------------------------------------- sensores
    can_harvest(ctx, args) {
      expectCount('can_harvest', args, 0);
      const body = bodyOf(ctx);
      return ctx.env.world.canHarvestAt(body.x, body.y);
    },
    get_pos_x(ctx, args) {
      expectCount('get_pos_x', args, 0);
      return bodyOf(ctx).x;
    },
    get_pos_y(ctx, args) {
      expectCount('get_pos_y', args, 0);
      return bodyOf(ctx).y;
    },
    get_world_size(ctx, args) {
      expectCount('get_world_size', args, 0);
      return ctx.env.world.size;
    },
    get_entity_type(ctx, args) {
      expectCount('get_entity_type', args, 0);
      const body = bodyOf(ctx);
      const entity = ctx.env.world.tileAt(body.x, body.y).entity;
      return entity === null ? null : member(enums.Entities, entity);
    },
    get_ground_type(ctx, args) {
      expectCount('get_ground_type', args, 0);
      const body = bodyOf(ctx);
      return member(enums.Grounds, ctx.env.world.tileAt(body.x, body.y).ground);
    },
    get_water(ctx, args) {
      expectCount('get_water', args, 0);
      const body = bodyOf(ctx);
      return ctx.env.world.tileAt(body.x, body.y).waterLevel;
    },
    measure(ctx, args) {
      expectCount('measure', args, 0, 1);
      const dir = args.length > 0 && args[0] !== null ? expectDirection('measure', args[0], enums) : undefined;
      const body = bodyOf(ctx);
      const value = ctx.env.world.measureAt(body.x, body.y, dir);
      return Array.isArray(value) ? new PyTuple(value) : value;
    },
    can_move(ctx, args) {
      expectCount('can_move', args, 1);
      const dir = expectDirection('can_move', args[0], enums);
      return ctx.env.world.canMove(bodyOf(ctx), dir);
    },
    get_companion(ctx, args) {
      expectCount('get_companion', args, 0);
      requireGrant(ctx, 'functions', 'get_companion', 'get_companion()');
      const body = bodyOf(ctx);
      const c = ctx.env.world.tileAt(body.x, body.y).companion;
      if (!c) return null;
      return new PyTuple([member(enums.Entities, c.entity), new PyTuple([c.x, c.y])]);
    },
    num_unlocked(ctx, args) {
      expectCount('num_unlocked', args, 1);
      const thing = args[0];
      const world = ctx.env.world;
      if (thing instanceof EnumValue && thing.enumName === 'Unlocks') return techLevel(world.unlocks, thing.name);
      if (thing instanceof EnumValue && thing.enumName === 'Entities') return world.isGranted('entities', thing.name) ? 1 : 0;
      if (thing instanceof EnumValue && thing.enumName === 'Items') return world.isGranted('items', thing.name) ? 1 : 0;
      if (thing instanceof EnumValue && thing.enumName === 'Hats') return world.hatLock(thing.name) === null ? 1 : 0;
      throw new PyError('TypeError', `num_unlocked() espera Unlocks, Entities, Items o Hats, no '${pyRepr(thing)}'`);
    },
    get_cost(ctx, args) {
      expectCount('get_cost', args, 1, 2);
      const thing = args[0];
      const world = ctx.env.world;
      if (thing instanceof EnumValue && thing.enumName === 'Entities') {
        return costDict(enums, world.balance.entities[thing.name]?.plantCost ?? {});
      }
      if (thing instanceof EnumValue && thing.enumName === 'Unlocks') {
        const node = findTech(world.techTree, thing.name);
        if (!node) return null;
        if (args.length > 1 && args[1] !== null) {
          const level = toInteger(args[1], 'el nivel de get_cost()');
          const def = node.levels[level - 1];
          return def ? costDict(enums, def.cost) : null;
        }
        const next = nextLevel(world.techTree, world.unlocks, thing.name);
        return next ? costDict(enums, next.cost) : null;
      }
      throw new PyError('TypeError', `get_cost() espera Entities o Unlocks, no '${pyRepr(thing)}'`);
    },
    num_items(ctx, args) {
      expectCount('num_items', args, 1);
      const item = expectEnum('num_items', args[0], enums.Items, 'un ítem (por ejemplo Items.Hay)');
      return ctx.env.world.inventory.get(item.name);
    },
    get_time(ctx, args) {
      expectCount('get_time', args, 0);
      return ctx.env.world.simTime;
    },
    get_tick_count(ctx, args) {
      expectCount('get_tick_count', args, 0);
      return ctx.env.world.totalTicks;
    },

    // ---------------------------------------------------------- salida
    print(ctx, args) {
      const text = joinArgs(args);
      const { world } = ctx.env;
      const body = bodyOf(ctx);
      world.record('prints');
      ctx.env.log(ctx.drone.id, text);
      world.emit({ kind: 'print', tick: world.totalTicks, droneId: body.id, x: body.x, y: body.y, text });
      body.action = {
        kind: 'print',
        startTick: world.totalTicks,
        endTick: actionEnd(world, ctx.cost),
        fromX: body.x,
        fromY: body.y,
        toX: body.x,
        toY: body.y,
        text,
      };
      return ctx.beginAction({
        kind: 'print',
        complete: () => {
          body.action = null;
          return null;
        },
        cancel: () => {
          body.action = null;
        },
      });
    },
    quick_print(ctx, args) {
      ctx.env.log(ctx.drone.id, joinArgs(args));
      return null;
    },

    // ---------------------------------------------------------- utilidades
    len(_ctx, args) {
      expectCount('len', args, 1);
      return pyLen(args[0]);
    },
    range(_ctx, args) {
      expectCount('range', args, 1, 3);
      const nums = args.map((a) => toInteger(a, 'cada argumento de range()'));
      const [start, stop, step] = nums.length === 1 ? [0, nums[0], 1] : [nums[0], nums[1], nums[2] ?? 1];
      if (step === 0) throw new PyError('ValueError', 'el paso de range() no puede ser cero');
      return new PyRange(start, stop, step);
    },
    abs(_ctx, args) {
      expectCount('abs', args, 1);
      const n = toNumberOrNull(args[0]);
      if (n === null) throw new PyError('TypeError', `abs() necesita un número, no '${typeName(args[0])}'`);
      return Math.abs(n);
    },
    min(ctx, args) {
      return minMax('min', ctx, args);
    },
    max(ctx, args) {
      return minMax('max', ctx, args);
    },
    random(ctx, args) {
      expectCount('random', args, 0);
      return ctx.env.world.scriptRng.nextFloat();
    },
    str(_ctx, args) {
      expectCount('str', args, 0, 1);
      return args.length === 0 ? '' : pyStr(args[0]);
    },
    int(_ctx, args) {
      expectCount('int', args, 0, 1);
      if (args.length === 0) return 0;
      const v = args[0];
      if (typeof v === 'string') return parseIntLiteral(v);
      const n = toNumberOrNull(v);
      if (n === null) throw new PyError('TypeError', `int() no acepta un valor de tipo '${typeName(v)}'`);
      if (!Number.isFinite(n)) throw new PyError('ValueError', `no se puede convertir ${pyRepr(v)} a entero`);
      return Math.trunc(n);
    },
    float(_ctx, args) {
      expectCount('float', args, 0, 1);
      if (args.length === 0) return 0;
      const v = args[0];
      if (typeof v === 'string') return parseFloatLiteral(v);
      const n = toNumberOrNull(v);
      if (n === null) throw new PyError('TypeError', `float() no acepta un valor de tipo '${typeName(v)}'`);
      return n;
    },
    bool(_ctx, args) {
      expectCount('bool', args, 0, 1);
      return args.length === 0 ? false : isTruthy(args[0]);
    },
    list(_ctx, args) {
      expectCount('list', args, 0, 1);
      return args.length === 0 ? [] : iterateAll(args[0]);
    },
    tuple(_ctx, args) {
      expectCount('tuple', args, 0, 1);
      return new PyTuple(args.length === 0 ? [] : iterateAll(args[0]));
    },
    set(_ctx, args) {
      expectCount('set', args, 0, 1);
      const out = new PySet();
      if (args.length === 1) for (const x of iterateAll(args[0])) out.add(x);
      return out;
    },
    dict(_ctx, args) {
      expectCount('dict', args, 0, 1);
      const out = new PyDict();
      if (args.length === 0) return out;
      const src = args[0];
      if (src instanceof PyDict) {
        for (const [k, v] of src.entries()) out.set(k, v);
        return out;
      }
      for (const pair of iterateAll(src)) {
        const kv = iterateAll(pair);
        if (kv.length !== 2) {
          throw new PyError('ValueError', 'dict() necesita pares (clave, valor) de longitud 2');
        }
        out.set(kv[0], kv[1]);
      }
      return out;
    },
  };

  const globals = new Map<string, RuntimeValue>();
  for (const [name, impl] of Object.entries(fns)) globals.set(name, new BuiltinFunction(name, impl));
  // Compatibilidad con scripts externos: pet_the_piggy() es la misma acción que pet_the_dog().
  globals.set('pet_the_piggy', new BuiltinFunction('pet_the_piggy', fns.pet_the_dog));
  globals.set('Items', enums.Items);
  globals.set('Entities', enums.Entities);
  globals.set('Grounds', enums.Grounds);
  globals.set('Directions', enums.Directions);
  globals.set('Hats', enums.Hats);
  globals.set('Unlocks', enums.Unlocks);
  globals.set('Leaderboards', enums.Leaderboards);
  for (const dir of DIRECTIONS) globals.set(dir, member(enums.Directions, dir));
  return globals;
}
