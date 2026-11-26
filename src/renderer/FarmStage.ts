import { AlphaFilter, Application, Container, Graphics, Sprite } from 'pixi.js';
import { entityFromCode, type EntityKind, type SimEvent } from '../engine/types';
import { drainSceneEvents, liveSnapshot } from '../store/liveSnapshot';
import { MEGA_MEMBER, TILE_FLAG_INFECTED, TILE_FLAG_UNSORTED, type RenderSnapshot } from '../worker/protocol';
import {
  actionDurationMs,
  BASE_TICKS_PER_SECOND,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutBounce,
  easeOutQuad,
  flyerCountForAmount,
  getLodLevel,
  isFastAction,
  type LodLevel,
} from './animMath';
import { ParticlePool } from './effects';
import {
  drawFaces,
  drawGroundBlob,
  drawShadows,
  groundFromScreen,
  MeshBuilder,
  screenX,
  screenY,
  SHADOW_ALPHA,
  TILE,
  viewDepth,
  type ClipRect,
} from './iso3d';
import { buildBush, buildCarrot, buildTree } from './models/crops';
import { buildDog } from './models/dog';
import { buildDrone, DRONE_HOVER, type DroneAnim } from './models/drone';
import { buildGrass, buildGround, buildIsland, ISLAND_MARGIN } from './models/island';
import {
  buildApple,
  buildCactus,
  buildDeadPumpkin,
  buildDinoSegment,
  buildHedge,
  buildMegaPumpkin,
  buildPumpkin,
  buildSunflower,
  buildTreasure,
  CORNER_NE,
  CORNER_NW,
  CORNER_SE,
  CORNER_SW,
} from './models/subsystems';
import { hash2, mix, PALETTE } from './palette';
import { createBubble, createGlowTexture, createHeart, createItemFlyer } from './sprites';

export interface HoverTile {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export interface StageCallbacks {
  onHoverTile?: (tile: HoverTile | null) => void;
  onFps?: (fps: number) => void;
  /** Posición (en píxeles del lienzo) del contador de un ítem en el HUD; null si está oculto. */
  getItemTarget?: (item: string) => { x: number; y: number } | null;
  onItemArrived?: (item: string) => void;
  /** Márgenes ocupados por las ventanas y el HUD: la granja se encuadra en el espacio libre. */
  getFitInsets?: () => { left: number; right: number; top: number; bottom: number };
}

interface TileView {
  x: number;
  y: number;
  ground: Graphics;
  grass: Graphics;
  shadow: Graphics;
  groundBaseX: number;
  groundBaseY: number;
  baseX: number;
  baseY: number;
  groundKey: string;
  entityKey: string;
  kind: EntityKind | null;
  phase: number;
  mature: boolean;
  infected: boolean;
  /** Las plantas se mecen con el viento; setos, cofres, cactus y calabazas no. */
  sway: boolean;
  /** Lado de la megacalabaza dibujada en esta casilla (0 si no hay). */
  mega: number;
  /** Próximo momento (s) en que suelta una partícula de infección. */
  nextSpore: number;
  /** Squash & stretch elástico (maduración, fertilizante, megacalabaza): baja de 1 a 0. */
  pop: number;
  popStrength: number;
  /** Pop-in de entrada (0 = inactivo, >0..1 avanzando hacia 1). */
  spawnT: number;
  /** Retardo antes de iniciar spawnT (oleada radial de muros Hedge). */
  spawnDelay: number;
  /** Compresión de suelo al labrar (till): baja de 1 a 0. */
  tillT: number;
  /** Aplastamiento al morir una calabaza (Dead_Pumpkin): baja de 1 a 0. */
  deadT: number;
  /** Salto corto en arco al intercambiar dos casillas (swap): baja de 1 a 0. */
  swapT: number;
  swapDx: number;
  swapDy: number;
}

interface DroneView {
  main: Graphics;
  ghost: Graphics;
  mainFade: AlphaFilter;
  ghostFade: AlphaFilter;
  tiltX: number;
  tiltY: number;
  tiltVx: number;
  tiltVy: number;
  rotor: number;
  phase: number;
  lastHat: string;
  hatPop: number;
  nextPowerSpark: number;
  lastActionStamp: string;
}

interface DogState {
  g: Graphics;
  x: number;
  y: number;
  z: number;
  heading: number;
  pathT: number;
  ready: boolean;
  visit: { x: number; y: number; start: number; end: number } | null;
  nextHeart: number;
  nextSpark: number;
}

interface Flyer {
  node: Container;
  fromX: number;
  fromY: number;
  ctrlX: number;
  ctrlY: number;
  toX: number;
  toY: number;
  t: number;
  duration: number;
  spin: number;
  item: string;
}

interface Bubble {
  node: Container;
  wx: number;
  wy: number;
  wz: number;
  age: number;
}

interface Heart {
  g: Graphics;
  wx: number;
  wy: number;
  wz: number;
  age: number;
  drift: number;
}

interface TileHaloTarget {
  x: number;
  y: number;
  tint: number;
  scale: number;
  phase: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const MAX_TILE_PIXELS = 150;
const FLYER_DURATION = 0.54;
const BUBBLE_DURATION = 1.8;
const HEART_DURATION = 1.1;
/** Inclinación máxima del dron hacia la dirección de avance (~9°, doc 08 §2). */
const MAX_TILT = (9 * Math.PI) / 180;
const SUNFLOWER_BONUS_MIN_COUNT = 10;

/** Plantas que se mecen con el viento al madurar. */
const SWAYING: ReadonlySet<EntityKind> = new Set(['Grass', 'Bush', 'Tree', 'Carrot', 'Sunflower']);

/**
 * Postes de esquina de un seto: hacen falta donde llega un muro de una casilla vecina y la propia
 * casilla no tiene muro en ninguno de los dos lados de esa esquina (si no, su medio muro ya la cubre).
 */
function hedgeCorners(x: number, y: number, bits: number, wall: (x: number, y: number, bit: number) => boolean): number {
  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;
  let corners = 0;
  if (!(bits & (W | S)) && (wall(x, y - 1, W) || wall(x - 1, y, S))) corners |= CORNER_SW;
  if (!(bits & (E | S)) && (wall(x, y - 1, E) || wall(x + 1, y, S))) corners |= CORNER_SE;
  if (!(bits & (E | N)) && (wall(x, y + 1, E) || wall(x + 1, y, N))) corners |= CORNER_NE;
  if (!(bits & (W | N)) && (wall(x, y + 1, W) || wall(x - 1, y, N))) corners |= CORNER_NW;
  return corners;
}

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Escena PixiJS de la granja en 2.5D low-poly. Lee el último snapshot del contenedor mutable
 * (sin pasar por React), interpola los drones a 60 FPS y proyecta las mallas con `iso3d`.
 */
export class FarmStage {
  private app: Application | null = null;
  private disposed = false;
  private readonly container: HTMLElement;
  private readonly callbacks: StageCallbacks;
  private readonly mb = new MeshBuilder();
  private readonly camera = new Container();
  private glow: Sprite | null = null;
  private readonly island = new Graphics();
  private readonly tileLayer = new Container();
  private readonly shadowLayer = new Container();
  private readonly actorShadow = new Graphics();
  private readonly entityLayer = new Container();
  private readonly haloLayer = new Container();
  private readonly actorLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly overlay = new Container();
  private pool: ParticlePool | null = null;
  private haloSprites: Sprite[] = [];
  private haloTargets: TileHaloTarget[] = [];
  private tiles: TileView[] = [];
  private gridW = 0;
  private gridH = 0;
  private clip: ClipRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private islandBottom = 0;
  private readonly drones = new Map<number, DroneView>();
  private readonly dog: DogState;
  private flyers: Flyer[] = [];
  private bubbles: Bubble[] = [];
  private hearts: Heart[] = [];
  private lastSeq = -1;
  private time = 0;
  private lod: LodLevel = 'HIGH';
  private reducedMotion = false;
  private harvestCounter = 0;
  private nextAmbientMote = 0.6;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private autoFit = true;
  private viewW = 0;
  private viewH = 0;
  private fpsTimer = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(container: HTMLElement, callbacks: StageCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.dog = {
      g: new Graphics(),
      x: 0,
      y: 0,
      z: 1,
      heading: 0,
      pathT: Math.PI * 0.2,
      ready: false,
      visit: null,
      nextHeart: 0,
      nextSpark: 0,
    };
  }

  async init(): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: this.container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    if (this.disposed) {
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.app = app;
    const canvas = app.canvas;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.setAttribute('aria-label', 'Vista de la granja');
    this.container.appendChild(canvas);

    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      this.reducedMotion = mq.matches;
      const onMotionChange = (ev: MediaQueryListEvent) => {
        this.reducedMotion = ev.matches;
      };
      mq.addEventListener?.('change', onMotionChange);
      this.cleanup.push(() => mq.removeEventListener?.('change', onMotionChange));
    }

    const glow = new Sprite(createGlowTexture());
    glow.anchor.set(0.5);
    glow.tint = PALETTE.glow;
    glow.alpha = 0.3;
    this.glow = glow;

    this.pool = new ParticlePool(this.fxLayer);

    // Las sombras se dibujan opacas y la capa aplica la opacidad 0.28 de una vez (sin solapes oscuros).
    this.shadowLayer.filters = [new AlphaFilter({ alpha: SHADOW_ALPHA, resolution: 'inherit', antialias: 'inherit' })];
    this.shadowLayer.addChild(this.actorShadow);
    this.entityLayer.sortableChildren = true;
    this.actorLayer.sortableChildren = true;
    this.actorLayer.addChild(this.dog.g);
    this.camera.addChild(
      glow,
      this.island,
      this.tileLayer,
      this.shadowLayer,
      this.entityLayer,
      this.haloLayer,
      this.actorLayer,
      this.fxLayer,
    );
    app.stage.addChild(this.camera, this.overlay);
    this.bindInput(canvas);
    app.ticker.add((ticker) => this.frame(ticker.deltaMS));
  }

  destroy(): void {
    this.disposed = true;
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
    this.pool?.destroy();
    this.pool = null;
    for (const h of this.haloSprites) h.destroy();
    this.haloSprites.length = 0;
    this.haloTargets.length = 0;
    if (this.app) {
      this.app.destroy({ removeView: true }, { children: true });
      this.app = null;
    }
  }

  zoomBy(factor: number, cx = this.viewW / 2, cy = this.viewH / 2): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.panX = cx - (cx - this.panX) * (next / this.zoom);
    this.panY = cy - (cy - this.panY) * (next / this.zoom);
    this.zoom = next;
    this.autoFit = false;
  }

  resetView(): void {
    this.autoFit = true;
    this.fit();
  }

  /** Vuelve a encuadrar solo si el jugador no ha movido la cámara a mano. */
  refit(): void {
    if (this.autoFit) this.fit();
  }

  /** Detiene el dibujo mientras la granja no se ve (vista del árbol tecnológico). */
  setPaused(paused: boolean): void {
    const ticker = this.app?.ticker;
    if (!ticker) return;
    if (paused) ticker.stop();
    else ticker.start();
  }

  // ---------------------------------------------------------------- bucle de dibujo

  private frame(deltaMs: number): void {
    const app = this.app;
    if (!app) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    this.time += dt;

    const w = app.screen.width;
    const h = app.screen.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      if (this.autoFit) this.fit();
    }

    this.actorShadow.clear();
    const snap = liveSnapshot.current;
    if (snap) {
      const activeDrones = snap.drones.reduce((acc, d) => acc + (d.status === 'RUNNING' || d.status === 'WAITING' ? 1 : 0), 0);
      const effectiveSpeed = snap.ticksPerSecond > 0 ? snap.ticksPerSecond / BASE_TICKS_PER_SECOND : 1;
      this.lod = getLodLevel(activeDrones, effectiveSpeed);

      if (snap.width !== this.gridW || snap.height !== this.gridH) this.rebuildGrid(snap.width, snap.height);
      if (snap.seq !== this.lastSeq) {
        this.lastSeq = snap.seq;
        this.syncTiles(snap);
      }
      this.animateTiles(dt);
      this.updateHalos();
      this.updateDrones(snap, dt);
    }
    this.updateDog(dt);
    for (const event of drainSceneEvents()) this.spawnEvent(event);
    this.spawnAmbientMotes();
    this.updateEffects(dt);

    this.camera.scale.set(this.zoom);
    this.camera.position.set(this.panX, this.panY);

    this.fpsTimer += deltaMs;
    if (this.fpsTimer >= 500) {
      this.fpsTimer = 0;
      this.callbacks.onFps?.(Math.round(app.ticker.FPS));
    }
  }

  /** Punto del mundo → coordenadas de la cámara (antes de zoom y paneo). */
  private toCamera(wx: number, wy: number, wz: number): { x: number; y: number } {
    return { x: screenX(wx), y: screenY(wy, wz) };
  }

  private cameraToScreen(p: { x: number; y: number }): { x: number; y: number } {
    return { x: this.panX + p.x * this.zoom, y: this.panY + p.y * this.zoom };
  }

  private rebuildGrid(w: number, h: number): void {
    for (const t of this.tiles) {
      t.ground.destroy();
      t.grass.destroy();
      t.shadow.destroy();
    }
    this.tiles = [];
    this.haloTargets = [];
    this.gridW = w;
    this.gridH = h;
    const m = ISLAND_MARGIN;
    this.clip = { x0: -m, y0: -m, x1: w + m, y1: h + m };

    this.mb.clear();
    buildIsland(this.mb, w, h);
    this.island.clear();
    drawFaces(this.island, this.mb.faces);
    let bottom = 0;
    for (const face of this.mb.faces) for (const q of face.p) bottom = Math.max(bottom, screenY(q[1], q[2]));
    this.islandBottom = bottom;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ground = new Graphics();
        const grass = new Graphics();
        const shadow = new Graphics();
        const gBase = this.toCamera(x + 0.5, y + 0.5, 0);
        const eBase = this.toCamera(x + 0.5, y + 0.48, 0);
        ground.position.set(gBase.x, gBase.y);
        grass.position.set(eBase.x, eBase.y);
        grass.zIndex = -viewDepth(y + 0.5, 0);
        this.tileLayer.addChild(ground);
        this.entityLayer.addChild(grass);
        this.shadowLayer.addChildAt(shadow, 0);
        this.tiles.push({
          x,
          y,
          ground,
          grass,
          shadow,
          groundBaseX: gBase.x,
          groundBaseY: gBase.y,
          baseX: eBase.x,
          baseY: eBase.y,
          groundKey: '',
          entityKey: '',
          kind: null,
          phase: hash2(x, y) * Math.PI * 2,
          mature: false,
          infected: false,
          sway: false,
          mega: 0,
          nextSpore: 0,
          pop: 0,
          popStrength: 0.14,
          spawnT: 0,
          spawnDelay: 0,
          tillT: 0,
          deadT: 0,
          swapT: 0,
          swapDx: 0,
          swapDy: 0,
        });
      }
    }
    if (this.glow) {
      const c = this.toCamera(w / 2, h / 2, -0.4);
      this.glow.position.set(c.x, c.y);
      this.glow.scale.set(Math.max(3.4, (Math.max(w, h) * TILE * 3.8) / 256));
    }
    this.lastSeq = -1;
    if (this.autoFit) this.fit();
  }

  /** Redibuja solo las casillas cuyo estado visual cambió (crecimiento cuantizado en 12 niveles). */
  private syncTiles(snap: RenderSnapshot): void {
    const { ground, entity, growth, water, flags, meta, walls, mega } = snap.tiles;
    const n = this.gridW;
    const m = this.gridH;
    const wall = (x: number, y: number, bit: number): boolean => x >= 0 && y >= 0 && x < n && y < m && (walls[y * n + x] & bit) !== 0;

    // Detectar girasoles (halo dorado en los de máximo pétalos cuando hay >= 10) y cofres.
    let sunflowerCount = 0;
    let maxPetals = 0;
    for (let i = 0; i < this.tiles.length && i < entity.length; i++) {
      if (entityFromCode(entity[i]) === 'Sunflower') {
        sunflowerCount++;
        if (growth[i] >= 1 && meta[i] > maxPetals) maxPetals = meta[i];
      }
    }

    const nextHalos: TileHaloTarget[] = [];

    for (let i = 0; i < this.tiles.length && i < ground.length; i++) {
      const view = this.tiles[i];
      const x = i % n;
      const y = Math.floor(i / n);
      const wet = Math.round(water[i] * 8) / 8;
      const groundKey = `${ground[i]}:${wet}`;
      if (groundKey !== view.groundKey) {
        view.groundKey = groundKey;
        this.mb.clear();
        buildGround(this.mb, x, y, ground[i], wet);
        view.ground.clear();
        drawFaces(view.ground, this.mb.faces, view.groundBaseX, view.groundBaseY);
      }

      const kind = entityFromCode(entity[i]);
      const g = Math.min(1, growth[i]);
      const level = Math.floor(g * 12);
      const infected = kind !== null && (flags[i] & TILE_FLAG_INFECTED) !== 0;
      const megaSide = kind === 'Pumpkin' ? mega[i] : 0;
      const wallBits = walls[i];
      const corners = kind === 'Hedge' || kind === 'Treasure' ? hedgeCorners(x, y, wallBits, wall) : 0;

      if (kind === 'Sunflower' && sunflowerCount >= SUNFLOWER_BONUS_MIN_COUNT && g >= 1 && meta[i] === maxPetals && maxPetals > 0) {
        const p = this.toCamera(x + 0.5, y + 0.52, 0.72);
        nextHalos.push({ x: p.x, y: p.y, tint: PALETTE.sunPetalLight, scale: 0.72, phase: view.phase });
      } else if (kind === 'Treasure') {
        const p = this.toCamera(x + 0.5, y + 0.48, 0.25);
        nextHalos.push({ x: p.x, y: p.y, tint: PALETTE.chestGoldLight, scale: 0.85, phase: view.phase });
      }

      let detail = '';
      if (kind === 'Sunflower') detail = `p${meta[i]}`;
      else if (kind === 'Cactus') detail = `s${meta[i]}${flags[i] & TILE_FLAG_UNSORTED ? 'u' : ''}`;
      else if (megaSide) detail = `m${megaSide}`;
      if (wallBits || corners) detail += `w${wallBits}c${corners}`;
      const entityKey = kind === null ? 'none' : `${kind}:${level}:${infected ? 1 : 0}:${detail}`;

      if (entityKey !== view.entityKey) {
        const isFirstSync = view.entityKey === '';
        const prevKind = view.kind;
        const hadEntity = !isFirstSync && prevKind !== null;
        view.entityKey = entityKey;
        const mature = kind !== null && g >= 1;
        const formed = megaSide >= 2 && megaSide !== MEGA_MEMBER && view.mega !== megaSide;

        // Disparar transiciones orgánicas según el cambio detectado.
        if (!isFirstSync) {
          if (formed) {
            view.pop = 1;
            view.popStrength = 0.24;
          } else if (mature && !view.mature && hadEntity) {
            view.pop = 1;
            view.popStrength = 0.14;
          }
          if (kind === 'Dead_Pumpkin' && prevKind !== 'Dead_Pumpkin' && hadEntity) {
            view.deadT = 1;
          } else if (kind !== null && kind !== prevKind && (kind === 'Apple' || kind === 'Dinosaur')) {
            view.spawnT = 0.001;
            view.spawnDelay = 0;
          }
        }

        view.kind = kind;
        view.mature = mature;
        view.infected = infected;
        view.sway = kind !== null && SWAYING.has(kind);
        view.mega = megaSide === MEGA_MEMBER ? 0 : megaSide;
        view.grass.clear();
        view.shadow.clear();
        if (kind !== null && megaSide !== MEGA_MEMBER) {
          const shown = mature ? 1 : level / 12;
          this.mb.clear();
          let base = this.toCamera(x + 0.5, y + 0.48, 0);
          switch (kind) {
            case 'Grass':
              buildGrass(this.mb, x, y, shown);
              break;
            case 'Bush':
              buildBush(this.mb, x, y, shown, infected);
              break;
            case 'Tree':
              buildTree(this.mb, x, y, shown, infected);
              break;
            case 'Carrot':
              buildCarrot(this.mb, x, y, shown, infected);
              break;
            case 'Pumpkin':
              if (megaSide >= 2) {
                buildMegaPumpkin(this.mb, x, y, megaSide);
                base = this.toCamera(x + megaSide / 2, y + megaSide / 2, 0);
              } else {
                buildPumpkin(this.mb, x, y, shown, infected);
              }
              break;
            case 'Dead_Pumpkin':
              buildDeadPumpkin(this.mb, x, y);
              break;
            case 'Sunflower':
              buildSunflower(this.mb, x, y, shown, meta[i], infected);
              break;
            case 'Cactus':
              buildCactus(this.mb, x, y, shown, meta[i], (flags[i] & TILE_FLAG_UNSORTED) === 0, infected);
              break;
            case 'Hedge':
              buildHedge(this.mb, x, y, wallBits, corners);
              break;
            case 'Treasure':
              buildHedge(this.mb, x, y, wallBits, corners);
              buildTreasure(this.mb, x, y);
              break;
            case 'Apple':
              buildApple(this.mb, x, y);
              break;
            case 'Dinosaur':
              buildDinoSegment(this.mb, x, y, shown);
              break;
          }
          view.baseX = base.x;
          view.baseY = base.y;
          view.grass.position.set(base.x, base.y);
          drawFaces(view.grass, this.mb.faces, base.x, base.y);
          if (kind === 'Grass' || kind === 'Carrot') {
            const r = (kind === 'Carrot' ? 0.12 : 0.08) + 0.12 * shown;
            drawGroundBlob(view.shadow, x + 0.54, y + 0.45, r * 1.2, r * 0.75);
          } else {
            drawShadows(view.shadow, this.mb.faces, this.clip);
          }
        }
      }
    }

    this.haloTargets = nextHalos;
  }

  private animateTiles(dt: number): void {
    const w = this.gridW;
    const allowIdle = !this.reducedMotion && this.lod !== 'LOW';
    const wind = this.lod === 'HIGH' ? 1 : 0.45;

    for (let i = 0; i < this.tiles.length; i++) {
      const view = this.tiles[i];

      // 1. Compresión del suelo al labrar (till).
      if (view.tillT > 0) {
        view.tillT = Math.max(0, view.tillT - dt / 0.16);
        const u = 1 - view.tillT;
        const compress = Math.sin(easeOutQuad(u) * Math.PI) * 0.12;
        view.ground.scale.set(1 + compress * 0.35, 1 - compress);
      } else if (view.ground.scale.y !== 1) {
        view.ground.scale.set(1, 1);
      }

      // 2. Transformaciones compuestas de la entidad.
      let sx = 1;
      let sy = 1;
      let ox = 0;
      let oy = 0;
      let skewX = 0;

      // Pop-in de entrada (plant, Apple, Dinosaur, Hedge radial).
      if (view.spawnT > 0) {
        if (view.spawnDelay > 0) {
          view.spawnDelay = Math.max(0, view.spawnDelay - dt);
          sx = 0.01;
          sy = 0.01;
        } else {
          const speed = view.kind === 'Apple' ? 1 / 0.28 : view.kind === 'Hedge' ? 1 / 0.24 : 1 / 0.17;
          view.spawnT = Math.min(1, view.spawnT + dt * speed);
          const u = view.spawnT;
          if (view.kind === 'Apple') {
            const b = easeOutBounce(u);
            oy -= (1 - b) * 18;
            const s = 0.65 + 0.35 * easeOutQuad(u);
            sx *= s;
            sy *= s;
          } else if (view.kind === 'Hedge') {
            sy *= Math.max(0.05, easeOutBack(u, 1.4));
          } else {
            const s = Math.max(0.08, easeOutBack(u, 1.8));
            sx *= s;
            sy *= s;
          }
          if (view.spawnT >= 1) view.spawnT = 0;
        }
      }

      // Squash & stretch elástico (maduración, fertilizante, megacalabaza).
      if (view.pop > 0) {
        view.pop = Math.max(0, view.pop - dt * 3.8);
        const u = 1 - view.pop;
        const wave = Math.sin(u * Math.PI * 1.5) * view.pop * view.popStrength;
        sx *= 1 + wave;
        sy *= 1 - wave * 0.72;
      }

      // Aplastamiento de Dead_Pumpkin al morir.
      if (view.deadT > 0) {
        view.deadT = Math.max(0, view.deadT - dt / 0.24);
        const u = 1 - view.deadT;
        const squash = Math.sin(u * Math.PI) * 0.26;
        sx *= 1 + squash * 0.7;
        sy *= 1 - squash;
        ox += Math.sin(u * Math.PI * 6) * 2.2 * view.deadT;
      }

      // Arco corto en swap().
      if (view.swapT > 0) {
        view.swapT = Math.max(0, view.swapT - dt / 0.16);
        const arc = Math.sin(view.swapT * Math.PI);
        ox += view.swapDx * view.swapT * 18;
        oy += view.swapDy * view.swapT * 12 - arc * 10;
        sx *= 1 + arc * 0.08;
        sy *= 1 - arc * 0.05;
      }

      // Idle orgánico diferenciado por especie.
      if (allowIdle && view.kind !== null && view.spawnDelay <= 0) {
        if (view.kind === 'Grass' && view.mature) {
          // Ola de viento coherente recorriendo la pradera.
          skewX = Math.sin(this.time * 2.2 + view.x * 0.65 + view.y * 0.45) * 0.055 * wind;
        } else if (view.kind === 'Tree' && view.mature) {
          skewX = Math.sin(this.time * 1.15 + view.phase) * 0.025 * wind;
        } else if (view.kind === 'Bush' && view.mature) {
          const breath = Math.sin(this.time * 2.1 + view.phase) * 0.016 * wind;
          sx *= 1 + breath;
          sy *= 1 - breath * 0.8;
          skewX = Math.sin(this.time * 1.8 + view.phase) * 0.02 * wind;
        } else if (view.kind === 'Sunflower' && view.mature) {
          skewX = Math.sin(this.time * 1.65 + view.phase) * 0.032 * wind;
        } else if (view.kind === 'Carrot' && view.mature) {
          skewX = Math.sin(this.time * 2.0 + view.phase) * 0.03 * wind;
        } else if (view.kind === 'Apple') {
          const pulse = 1 + Math.sin(this.time * 3.4 + view.phase) * 0.055;
          sx *= pulse;
          sy *= pulse;
          oy -= (0.5 + 0.5 * Math.sin(this.time * 2.8 + view.phase)) * 2.5;
        } else if (view.kind === 'Dinosaur') {
          skewX = Math.sin(this.time * 3.6 + (view.x + view.y) * 0.9) * 0.038 * wind;
        }
      }

      view.grass.scale.set(sx, sy);
      view.grass.skew.x = skewX;
      view.grass.position.set(view.baseX + ox, view.baseY + oy);

      // Burbujas/esporas moradas que suben de las plantas infectadas (solo en HIGH/MEDIUM).
      if (view.infected && this.lod !== 'LOW' && this.time >= view.nextSpore) {
        const interval = this.lod === 'HIGH' ? 0.75 : 1.5;
        view.nextSpore = this.time + interval + hash2(i, Math.floor(this.time)) * 0.65;
        const p = this.toCamera((i % w) + 0.3 + hash2(i, 3) * 0.4, Math.floor(i / w) + 0.4, 0.06);
        this.pool?.emit({
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 12,
          vy: -20 - Math.random() * 14,
          kind: 'bubble',
          tint: PALETTE.weirdLight,
          gravity: -18,
          maxLife: 0.65,
          startScale: 0.3,
          endScale: 0.06,
          startAlpha: 0.85,
          additive: true,
        });
      }
    }
  }

  /** Actualiza los halos aditivos de girasoles máximos y cofres del tesoro. */
  private updateHalos(): void {
    const pool = this.pool;
    if (!pool) return;
    const targets = this.lod === 'LOW' ? [] : this.haloTargets;
    while (this.haloSprites.length < targets.length) {
      const s = new Sprite(pool.glowTexture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.haloLayer.addChild(s);
      this.haloSprites.push(s);
    }
    for (let i = 0; i < this.haloSprites.length; i++) {
      const s = this.haloSprites[i];
      if (i >= targets.length) {
        s.visible = false;
        continue;
      }
      const t = targets[i];
      const pulse = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 3.2 + t.phase);
      s.visible = true;
      s.tint = t.tint;
      s.position.set(t.x, t.y);
      s.scale.set(t.scale * (0.9 + pulse * 0.22));
      s.alpha = 0.24 + pulse * 0.2;
    }
  }

  private estimateTick(snap: RenderSnapshot): number {
    if (snap.runState !== 'running' || snap.ticksPerSecond <= 0) return snap.tick;
    const elapsed = (performance.now() - liveSnapshot.receivedAt) / 1000;
    return snap.tick + Math.min(elapsed, 0.1) * snap.ticksPerSecond;
  }

  private updateDrones(snap: RenderSnapshot, dt: number): void {
    const estimated = this.estimateTick(snap);
    const w = this.gridW;
    const h = this.gridH;
    const seen = new Set<number>();

    for (const d of snap.drones) {
      seen.add(d.id);
      let view = this.drones.get(d.id);
      if (!view) {
        view = {
          main: new Graphics(),
          ghost: new Graphics(),
          mainFade: new AlphaFilter({ alpha: 1, resolution: 'inherit' }),
          ghostFade: new AlphaFilter({ alpha: 1, resolution: 'inherit' }),
          tiltX: 0,
          tiltY: 0,
          tiltVx: 0,
          tiltVy: 0,
          rotor: hash2(d.id, 3) * Math.PI,
          phase: d.id * 1.7,
          lastHat: d.hat,
          hatPop: 0,
          nextPowerSpark: 0,
          lastActionStamp: '',
        };
        this.actorLayer.addChild(view.main, view.ghost);
        this.drones.set(d.id, view);
      }

      if (d.hat !== view.lastHat) {
        view.lastHat = d.hat;
        view.hatPop = 0.001;
      }
      let hatScale = 1;
      if (view.hatPop > 0) {
        view.hatPop = Math.min(1, view.hatPop + dt / 0.22);
        hatScale = Math.max(0.05, easeOutBack(view.hatPop, 2.0));
        if (view.hatPop >= 1) view.hatPop = 0;
      }

      let px = d.x;
      let py = d.y;
      let dirX = 0;
      let dirY = 0;
      let dip = 0;
      let yaw = 0;
      let wiggle = 0;
      let workPulse = 0;

      const action = d.action;
      if (action) {
        const progress = clamp01((estimated - action.startTick) / Math.max(1, action.endTick - action.startTick));
        const durMs = actionDurationMs(action.startTick, action.endTick, snap.ticksPerSecond);
        const fast = isFastAction(durMs);

        if (action.kind === 'move') {
          const e = fast ? progress : easeInOutCubic(progress);
          px = action.fromX + (action.toX - action.fromX) * e;
          py = action.fromY + (action.toY - action.fromY) * e;
          dirX = Math.sign(action.toX - action.fromX);
          dirY = Math.sign(action.toY - action.fromY);
        } else if (action.kind === 'harvest') {
          const arc = Math.sin(progress * Math.PI);
          dip = arc * (fast ? 0.06 : 0.16);
          workPulse = arc;
          if (!fast) wiggle = Math.sin(progress * Math.PI * 2) * 0.075;
        } else if (action.kind === 'till') {
          const arc = Math.sin(progress * Math.PI);
          const buzz = fast ? 0 : Math.abs(Math.sin(progress * Math.PI * 4)) * 0.038;
          dip = arc * (fast ? 0.05 : 0.13) + buzz;
          workPulse = arc * (0.65 + 0.35 * Math.sin(progress * Math.PI * 6));
        } else if (action.kind === 'plant') {
          const arc = easeOutQuad(Math.sin(progress * Math.PI));
          dip = arc * (fast ? 0.05 : 0.12);
          workPulse = arc;
        } else if (action.kind === 'use') {
          const arc = Math.sin(progress * Math.PI);
          dip = arc * (fast ? 0.05 : 0.11);
          workPulse = arc;
          if (!fast) wiggle = Math.sin(progress * Math.PI * 3) * 0.11;
        } else if (action.kind === 'swap') {
          const arc = Math.sin(progress * Math.PI);
          dip = arc * (fast ? 0.04 : 0.09);
          workPulse = arc;
          if (!fast) yaw = arc * 0.55;
        } else if (action.kind === 'unlock') {
          dip = -Math.sin(progress * Math.PI) * (fast ? 0.05 : 0.14);
          yaw = easeInOutCubic(progress) * Math.PI * 2;
          workPulse = Math.sin(progress * Math.PI);
        } else if (action.kind === 'hat') {
          yaw = easeInOutCubic(progress) * Math.PI * 2;
          dip = -Math.sin(progress * Math.PI) * 0.08;
        } else if (action.kind === 'pet') {
          wiggle = Math.sin(progress * Math.PI * 6) * 0.15 * (1 - progress);
          dip = -Math.abs(Math.sin(progress * Math.PI * 3)) * 0.06;
        }

        // Chispas breves al iniciar una acción de trabajo en el punto de contacto.
        if (this.lod === 'HIGH' && !fast && progress > 0.35 && (action.kind === 'harvest' || action.kind === 'till' || action.kind === 'plant')) {
          const stamp = `${action.kind}:${action.startTick}`;
          if (view.lastActionStamp !== stamp) {
            view.lastActionStamp = stamp;
            const pt = this.toCamera(px + 0.5, py + 0.5, DRONE_HOVER - dip - 0.14);
            this.emitBurst(pt.x, pt.y, 3, [PALETTE.spark, PALETTE.sparkWhite], {
              kind: 'spark',
              speed: 75,
              gravity: 190,
              maxLife: 0.24,
              startScale: 0.42,
              endScale: 0.05,
              additive: true,
            });
          }
        }
      }

      // Envoltura toroidal: el dron sale por un borde mientras su "fantasma" entra por el opuesto.
      let gx = px;
      let gy = py;
      if (px > w - 1) gx = px - w;
      else if (px < 0) gx = px + w;
      if (py > h - 1) gy = py - h;
      else if (py < 0) gy = py + h;
      const outside = (x: number, y: number): number => Math.max(0, -x, x - (w - 1), -y, y - (h - 1));
      const hasGhost = gx !== px || gy !== py;

      // Resorte amortiguado para la inclinación (más natural que un lerp lineal).
      const targetTx = dirX * MAX_TILT;
      const targetTy = dirY * MAX_TILT;
      const stiffness = 140;
      const damping = 18;
      const stepDt = Math.min(dt, 0.033);
      view.tiltVx += ((targetTx - view.tiltX) * stiffness - view.tiltVx * damping) * stepDt;
      view.tiltVy += ((targetTy - view.tiltY) * stiffness - view.tiltVy * damping) * stepDt;
      view.tiltX += view.tiltVx * stepDt;
      view.tiltY += view.tiltVy * stepDt;

      const alive = d.status === 'RUNNING' || d.status === 'WAITING';
      const running = snap.runState === 'running' && alive;
      const paused = snap.runState === 'paused' && alive;
      const powered = running && snap.powered;

      // El dron siempre está volando: las hélices giran también en pausa o detenido (decisión Fase 3).
      view.rotor += dt * (powered ? 58 : 38);

      let eye: number = PALETTE.droneEyeIdle;
      if (d.status === 'ERROR') eye = PALETTE.droneEyeError;
      else if (paused) eye = PALETTE.droneEyePaused;
      else if (powered) eye = mix(PALETTE.droneEyeRun, PALETTE.sunPetalLight, 0.55 + 0.45 * Math.sin(this.time * 10 + view.phase));
      else if (running) eye = PALETTE.droneEyeRun;

      // Estela de energía dorada cuando Items.Power acelera al dron.
      if (powered && this.lod !== 'LOW' && this.time >= view.nextPowerSpark) {
        view.nextPowerSpark = this.time + (this.lod === 'HIGH' ? 0.09 : 0.22);
        const pt = this.toCamera(px + 0.5 + (Math.random() - 0.5) * 0.28, py + 0.5 + (Math.random() - 0.5) * 0.2, DRONE_HOVER - 0.05);
        this.pool?.emit({
          x: pt.x,
          y: pt.y,
          vx: (Math.random() - 0.5) * 26 - dirX * 22,
          vy: 12 + Math.random() * 18,
          kind: 'spark',
          tint: PALETTE.sunPetalLight,
          gravity: -25,
          maxLife: 0.34,
          startScale: 0.42,
          endScale: 0.05,
          startAlpha: 0.9,
          additive: true,
        });
      }

      const idleBob = this.reducedMotion
        ? 0
        : Math.sin(this.time * 3.2 + view.phase) * 0.024 + Math.sin(this.time * 6.4 + view.phase * 1.7) * 0.006;
      const idleRock = this.reducedMotion ? 0 : Math.sin(this.time * 1.9 + view.phase) * 0.018;

      const anim: DroneAnim = {
        time: this.time,
        rotor: view.rotor,
        spinning: true,
        tiltX: view.tiltX + wiggle + idleRock,
        tiltY: view.tiltY,
        yaw,
        eye,
        lookX: dirX,
        lookY: dirY,
        hat: d.hat,
        hatScale,
        workPulse,
        powered,
      };
      const dz = idleBob - dip;
      this.drawDrone(view.main, view.mainFade, px, py, 1 - Math.min(1, outside(px, py)), anim, dz);
      this.drawDrone(view.ghost, view.ghostFade, gx, gy, hasGhost ? 1 - Math.min(1, outside(gx, gy)) : 0, anim, dz);
    }

    for (const [id, view] of this.drones) {
      if (seen.has(id)) continue;
      view.main.destroy();
      view.ghost.destroy();
      this.drones.delete(id);
    }
  }

  private drawDrone(g: Graphics, fade: AlphaFilter, px: number, py: number, alpha: number, anim: DroneAnim, dz: number): void {
    g.visible = alpha > 0.01;
    if (!g.visible) return;
    const wx = px + 0.5;
    const wy = py + 0.5;
    const wz = DRONE_HOVER + dz;
    this.mb.clear();
    this.mb.translate(wx, wy, wz);
    buildDrone(this.mb, anim);
    g.clear();
    drawFaces(g, this.mb.faces);
    g.zIndex = -viewDepth(wy, wz);
    const faded = alpha < 0.999;
    if (faded) fade.alpha = alpha;
    const hasFilter = Array.isArray(g.filters) ? g.filters.length > 0 : Boolean(g.filters);
    if (faded !== hasFilter) g.filters = faded ? [fade] : [];
    if (alpha > 0.35) drawShadows(this.actorShadow, this.mb.faces, this.clip);
  }

  /** Perro alcancía: patrulla alrededor de la isla y, con pet_the_dog(), vuela junto al dron a celebrar. */
  private updateDog(dt: number): void {
    const w = this.gridW;
    const h = this.gridH;
    if (w === 0) return;
    const dog = this.dog;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2 + 0.85;
    const ry = h / 2 + 0.7;
    let tx: number;
    let ty: number;
    let tz: number;
    let happy = false;
    let stretch = 1;
    const visit = dog.visit;
    if (visit && this.time < visit.end) {
      tx = visit.x + 0.5 + 0.62;
      ty = visit.y + 0.5 + 0.1;
      tz = 0.82;
      if (this.time > visit.start + 0.55) {
        happy = true;
        const hop = Math.abs(Math.sin((this.time - visit.start) * 8));
        tz += hop * 0.14;
        stretch = 0.9 + hop * 0.24;
      }
    } else {
      if (visit) {
        dog.visit = null;
        dog.pathT = Math.atan2((dog.y - cy) / ry, (dog.x - cx) / rx);
      }
      dog.pathT += dt * 0.3;
      tx = cx + Math.cos(dog.pathT) * rx;
      ty = cy + Math.sin(dog.pathT) * ry;
      tz = 1.15 + Math.sin(this.time * 1.7) * 0.07;
    }
    if (!dog.ready) {
      dog.x = tx;
      dog.y = ty;
      dog.z = tz;
      dog.heading = dog.pathT + Math.PI / 2;
      dog.ready = true;
    }
    const k = Math.min(1, dt * (dog.visit ? 4.5 : 2.5));
    const nx = dog.x + (tx - dog.x) * k;
    const ny = dog.y + (ty - dog.y) * k;
    const vx = (nx - dog.x) / Math.max(dt, 1e-4);
    const vy = (ny - dog.y) / Math.max(dt, 1e-4);
    dog.x = nx;
    dog.y = ny;
    dog.z += (tz - dog.z) * k;
    let desired = dog.heading;
    if (happy && visit) desired = Math.atan2(visit.y + 0.5 - dog.y, visit.x + 0.5 - dog.x) + Math.sin(this.time * 6) * 0.5;
    else if (Math.hypot(vx, vy) > 0.05) desired = Math.atan2(vy, vx);
    const turn = angleDelta(desired, dog.heading);
    dog.heading += turn * Math.min(1, dt * 6);
    const bank = Math.max(-0.4, Math.min(0.4, -turn * 0.8));

    this.mb.clear();
    this.mb.translate(dog.x, dog.y, dog.z);
    buildDog(this.mb, {
      heading: dog.heading,
      bank,
      flap: 0.9 + 0.7 * Math.sin(this.time * (happy ? 16 : 10)),
      wag: Math.sin(this.time * (happy ? 24 : 9)) * (happy ? 0.75 : 0.35),
      stretch,
    });
    dog.g.clear();
    drawFaces(dog.g, this.mb.faces);
    dog.g.zIndex = -viewDepth(dog.y, dog.z);
    drawShadows(this.actorShadow, this.mb.faces, this.clip);

    if (happy && this.time >= dog.nextHeart) {
      dog.nextHeart = this.time + 0.16;
      this.spawnHeart(dog.x + 0.1, dog.y, dog.z + 0.2);
    }
    if (happy && this.lod !== 'LOW' && this.time >= dog.nextSpark) {
      dog.nextSpark = this.time + 0.26;
      const p = this.toCamera(dog.x, dog.y, dog.z + 0.12);
      this.emitBurst(p.x, p.y, 3, [PALETTE.chestGoldLight, PALETTE.sparkWhite], {
        kind: 'spark',
        speed: 65,
        gravity: 90,
        maxLife: 0.42,
        startScale: 0.45,
        endScale: 0.05,
        additive: true,
      });
    }
  }

  // ---------------------------------------------------------------- efectos

  private emitBurst(
    cx: number,
    cy: number,
    count: number,
    colors: number[],
    opt: {
      kind?: 'spark' | 'dust' | 'bubble' | 'glow' | 'leaf' | 'puff';
      speed?: number;
      gravity?: number;
      drag?: number;
      maxLife?: number;
      startScale?: number;
      endScale?: number;
      startAlpha?: number;
      radial?: boolean;
      additive?: boolean;
      spin?: number;
    } = {},
  ): void {
    const pool = this.pool;
    if (!pool || this.lod === 'LOW') return;
    const scaled = this.lod === 'MEDIUM' ? Math.max(1, Math.ceil(count * 0.45)) : count;
    const speed = opt.speed ?? 90;
    const kind = opt.kind ?? 'dust';
    for (let i = 0; i < scaled; i++) {
      const angle = opt.radial
        ? (i / scaled) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
        : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      const v = speed * (0.55 + Math.random() * 0.65);
      const maxLife = (opt.maxLife ?? 0.45) * (0.8 + Math.random() * 0.4);
      pool.emit({
        x: cx + (Math.random() - 0.5) * 6,
        y: cy + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        kind,
        tint: colors[i % colors.length],
        gravity: opt.gravity ?? 220,
        drag: opt.drag ?? 0.4,
        maxLife,
        startScale: (opt.startScale ?? 0.38) * (0.8 + Math.random() * 0.4),
        endScale: opt.endScale ?? 0.06,
        startAlpha: opt.startAlpha ?? 0.95,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * (opt.spin ?? (kind === 'leaf' ? 9 : 4)),
        additive: opt.additive,
      });
    }
  }

  private spawnAmbientMotes(): void {
    if (this.reducedMotion || this.lod !== 'HIGH' || this.gridW === 0 || !this.pool) return;
    if (this.time < this.nextAmbientMote) return;
    this.nextAmbientMote = this.time + 0.55 + Math.random() * 0.5;
    const wx = -0.6 + Math.random() * (this.gridW + 1.2);
    const wy = -0.5 + Math.random() * (this.gridH + 1.0);
    const wz = 0.25 + Math.random() * 1.1;
    const p = this.toCamera(wx, wy, wz);
    this.pool.emit({
      x: p.x,
      y: p.y,
      vx: 6 + Math.random() * 10,
      vy: -6 - Math.random() * 8,
      kind: 'glow',
      tint: PALETTE.glow,
      gravity: 0,
      drag: 0.1,
      maxLife: 2.2 + Math.random() * 1.2,
      startScale: 0.14,
      endScale: 0.04,
      startAlpha: 0.22,
      additive: true,
    });
  }

  private spawnHeart(wx: number, wy: number, wz: number): void {
    if (this.hearts.length > 16) return;
    const g = createHeart();
    this.fxLayer.addChild(g);
    this.hearts.push({ g, wx, wy, wz, age: 0, drift: (Math.random() - 0.5) * 0.4 });
  }

  private tileAt(x: number, y: number): TileView | undefined {
    if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH) return undefined;
    return this.tiles[y * this.gridW + x];
  }

  private spawnEvent(event: SimEvent): void {
    if (this.gridW === 0 || event.x >= this.gridW || event.y >= this.gridH) return;
    const ground = this.toCamera(event.x + 0.5, event.y + 0.5, 0.15);
    const tile = this.tileAt(event.x, event.y);

    if (event.kind === 'harvest') {
      this.harvestCounter++;
      if (event.mature) {
        this.emitBurst(ground.x, ground.y, 7, [PALETTE.spark, PALETTE.sparkWhite], {
          kind: 'spark',
          speed: 125,
          gravity: 250,
          maxLife: 0.42,
          startScale: 0.46,
          endScale: 0.05,
          additive: true,
        });
        if (this.lod === 'HIGH') {
          this.pool?.emitShockwave({
            x: ground.x,
            y: ground.y + 4,
            tint: PALETTE.spark,
            startScale: 0.18,
            endScale: 0.78,
            maxLife: 0.26,
            startAlpha: 0.5,
          });
        }
        for (const [item, amount] of Object.entries(event.items)) {
          const count = flyerCountForAmount(amount, this.lod, this.harvestCounter);
          for (let k = 0; k < count; k++) {
            const spreadX = (k - (count - 1) / 2) * 14;
            const spreadY = -6 - k * 5;
            this.spawnFlyer(item, ground.x + spreadX, ground.y + spreadY, k * 0.05);
          }
        }
      } else {
        this.emitBurst(ground.x, ground.y, 6, [PALETTE.leafBit, PALETTE.bladeYoung], {
          kind: 'leaf',
          speed: 85,
          gravity: 290,
          maxLife: 0.48,
          startScale: 0.42,
          endScale: 0.12,
        });
      }
    } else if (event.kind === 'till') {
      if (tile) tile.tillT = 1;
      this.emitBurst(ground.x, ground.y + 4, 7, [PALETTE.dust, PALETTE.soilRidge, PALETTE.soilWet], {
        kind: 'dust',
        speed: 78,
        gravity: 240,
        maxLife: 0.42,
        startScale: 0.42,
        endScale: 0.1,
      });
      this.emitBurst(ground.x, ground.y + 2, 3, [PALETTE.spark, PALETTE.sparkWhite], {
        kind: 'spark',
        speed: 95,
        gravity: 210,
        maxLife: 0.24,
        startScale: 0.36,
        endScale: 0.05,
        additive: true,
      });
    } else if (event.kind === 'plant') {
      if (tile) {
        tile.spawnT = 0.001;
        tile.spawnDelay = 0;
      }
      this.emitBurst(ground.x, ground.y + 4, 6, [PALETTE.dust, PALETTE.sproutLeaf], {
        kind: 'leaf',
        speed: 65,
        gravity: 200,
        maxLife: 0.38,
        startScale: 0.36,
        endScale: 0.08,
      });
    } else if (event.kind === 'water') {
      this.emitBurst(ground.x, ground.y, 9, [PALETTE.waterDrop, 0xd8f1ff], {
        kind: 'bubble',
        speed: 115,
        gravity: 330,
        maxLife: 0.44,
        startScale: 0.38,
        endScale: 0.08,
      });
      if (this.lod !== 'LOW') {
        this.pool?.emitShockwave({
          x: ground.x,
          y: ground.y + 5,
          tint: PALETTE.waterDrop,
          startScale: 0.16,
          endScale: 0.92,
          maxLife: 0.32,
          startAlpha: 0.65,
        });
      }
    } else if (event.kind === 'fertilize') {
      if (tile) {
        tile.pop = 1;
        tile.popStrength = 0.2;
      }
      this.emitBurst(ground.x, ground.y, 8, [PALETTE.weirdLight, PALETTE.foliageLight, PALETTE.sparkWhite], {
        kind: 'bubble',
        speed: 85,
        gravity: -40,
        maxLife: 0.52,
        startScale: 0.4,
        endScale: 0.08,
        additive: true,
      });
      if (this.lod !== 'LOW') {
        this.pool?.emitShockwave({
          x: ground.x,
          y: ground.y + 3,
          tint: PALETTE.weirdLight,
          startScale: 0.18,
          endScale: 1.0,
          maxLife: 0.34,
          startAlpha: 0.72,
        });
      }
    } else if (event.kind === 'unlock') {
      const p = this.toCamera(event.x + 0.5, event.y + 0.5, DRONE_HOVER);
      this.emitBurst(p.x, p.y, 12, [PALETTE.chestGoldLight, PALETTE.spark, PALETTE.sparkWhite], {
        kind: 'spark',
        speed: 135,
        gravity: 160,
        maxLife: 0.6,
        startScale: 0.52,
        endScale: 0.06,
        radial: true,
        additive: true,
      });
      if (this.lod !== 'LOW') {
        this.pool?.emitShockwave({
          x: p.x,
          y: p.y,
          tint: PALETTE.chestGoldLight,
          startScale: 0.2,
          endScale: 1.5,
          maxLife: 0.42,
          startAlpha: 0.85,
          squashY: 1,
        });
      }
    } else if (event.kind === 'hat') {
      const p = this.toCamera(event.x + 0.5, event.y + 0.5, DRONE_HOVER + 0.18);
      this.emitBurst(p.x, p.y, 8, [PALETTE.puff], {
        kind: 'puff',
        speed: 58,
        gravity: -10,
        drag: 1.8,
        maxLife: 0.46,
        startScale: 0.35,
        endScale: 0.95,
        startAlpha: 0.85,
        radial: true,
      });
      const dv = this.drones.get(event.droneId);
      if (dv) dv.hatPop = 0.001;
    } else if (event.kind === 'swap') {
      const other = this.toCamera(event.toX + 0.5, event.toY + 0.5, 0.15);
      const dx = event.toX - event.x;
      const dy = event.toY - event.y;
      if (tile) {
        tile.swapT = 1;
        tile.swapDx = dx;
        tile.swapDy = -dy;
      }
      const otherTile = this.tileAt(event.toX, event.toY);
      if (otherTile) {
        otherTile.swapT = 1;
        otherTile.swapDx = -dx;
        otherTile.swapDy = dy;
      }
      this.emitBurst(ground.x, ground.y, 5, [PALETTE.dust, PALETTE.cactusLight], { kind: 'dust', speed: 75, gravity: 210 });
      this.emitBurst(other.x, other.y, 5, [PALETTE.dust, PALETTE.cactusLight], { kind: 'dust', speed: 75, gravity: 210 });
    } else if (event.kind === 'pumpkin') {
      if (event.dead) {
        if (tile) tile.deadT = 1;
        this.emitBurst(ground.x, ground.y, 8, [PALETTE.deadPumpkin, PALETTE.deadPumpkinLight], {
          kind: 'puff',
          speed: 55,
          gravity: -20,
          drag: 1.5,
          maxLife: 0.55,
          startScale: 0.35,
          endScale: 0.8,
          startAlpha: 0.75,
          radial: true,
        });
      } else if (event.mega >= 2) {
        const side = tile?.mega || event.mega;
        if (tile) {
          tile.pop = 1;
          tile.popStrength = 0.26;
        }
        const c = this.toCamera(event.x + side / 2, event.y + side / 2, Math.min(1.5, 0.28 + 0.1 * side));
        this.emitBurst(c.x, c.y, 12, [PALETTE.pumpkinLight, PALETTE.sparkWhite, PALETTE.spark], {
          kind: 'spark',
          speed: 145,
          gravity: 210,
          maxLife: 0.55,
          startScale: 0.55,
          endScale: 0.08,
          radial: true,
          additive: true,
        });
        if (this.lod !== 'LOW') {
          this.pool?.emitShockwave({
            x: c.x,
            y: c.y + 8,
            tint: PALETTE.pumpkinLight,
            startScale: 0.3,
            endScale: 1.2 + side * 0.3,
            maxLife: 0.38,
            startAlpha: 0.8,
          });
        }
      }
    } else if (event.kind === 'maze') {
      if (event.phase === 'start') {
        // Oleada radial de crecimiento de muros Hedge desde el arbusto origen (doc 08 §5).
        if (!this.reducedMotion && this.lod !== 'LOW') {
          for (const t of this.tiles) {
            const dist = Math.abs(t.x - event.x) + Math.abs(t.y - event.y);
            t.spawnT = 0.001;
            t.spawnDelay = Math.min(0.32, dist * 0.016);
          }
        }
        for (let k = 0; k < 6; k++) {
          const p = this.toCamera(hash2(k, event.tick) * this.gridW, hash2(event.tick, k) * this.gridH, 0.3);
          this.emitBurst(p.x, p.y, 4, [PALETTE.hedgeLight, PALETTE.leafBit], { kind: 'leaf', speed: 90, gravity: 220 });
        }
      } else if (event.phase === 'end') {
        for (let k = 0; k < 6; k++) {
          const p = this.toCamera(hash2(k, event.tick) * this.gridW, hash2(event.tick, k) * this.gridH, 0.3);
          this.emitBurst(p.x, p.y, 4, [PALETTE.hedgeLight, PALETTE.chestGoldLight], { kind: 'leaf', speed: 95, gravity: 220 });
        }
      } else if (event.phase === 'recycle') {
        this.emitBurst(ground.x, ground.y, 10, [PALETTE.weirdLight, PALETTE.weird, PALETTE.chestGoldLight], {
          kind: 'bubble',
          speed: 105,
          gravity: 80,
          maxLife: 0.52,
          startScale: 0.44,
          endScale: 0.08,
          radial: true,
          additive: true,
        });
        if (this.lod !== 'LOW') {
          this.pool?.emitShockwave({
            x: ground.x,
            y: ground.y + 4,
            tint: PALETTE.weird,
            startScale: 0.2,
            endScale: 1.45,
            maxLife: 0.36,
            startAlpha: 0.85,
          });
        }
      } else {
        this.emitBurst(ground.x, ground.y, 9, [PALETTE.chestGoldLight, PALETTE.sparkWhite], {
          kind: 'spark',
          speed: 115,
          gravity: 190,
          maxLife: 0.48,
          startScale: 0.48,
          endScale: 0.06,
          radial: true,
          additive: true,
        });
        if (this.lod !== 'LOW') {
          this.pool?.emitShockwave({
            x: ground.x,
            y: ground.y + 4,
            tint: PALETTE.chestGoldLight,
            startScale: 0.18,
            endScale: 1.15,
            maxLife: 0.32,
            startAlpha: 0.8,
          });
        }
      }
    } else if (event.kind === 'dino') {
      if (event.phase === 'eat') {
        this.emitBurst(ground.x, ground.y, 7, [PALETTE.apple, PALETTE.appleLight, PALETTE.appleLeaf], {
          kind: 'dust',
          speed: 95,
          gravity: 240,
          maxLife: 0.42,
          startScale: 0.42,
          endScale: 0.08,
        });
      } else {
        this.emitBurst(ground.x, ground.y, 9, [PALETTE.puff], {
          kind: 'puff',
          speed: 65,
          gravity: -15,
          drag: 1.6,
          maxLife: 0.5,
          startScale: 0.4,
          endScale: 0.95,
          radial: true,
        });
      }
    } else if (event.kind === 'pet') {
      this.dog.visit = { x: event.x, y: event.y, start: this.time, end: this.time + 2.4 };
      this.dog.nextHeart = this.time + 0.55;
      this.dog.nextSpark = this.time + 0.65;
    } else if (event.kind === 'print') {
      const node = createBubble(event.text);
      node.scale.set(0.5);
      this.overlay.addChild(node);
      this.bubbles.push({ node, wx: event.x + 0.5, wy: event.y + 0.5, wz: DRONE_HOVER + 0.45, age: 0 });
      if (this.bubbles.length > 6) {
        const old = this.bubbles.shift();
        old?.node.destroy({ children: true });
      }
    }
  }

  private spawnFlyer(item: string, cx: number, cy: number, delay = 0): void {
    if (this.flyers.length > 28) return;
    const to = this.callbacks.getItemTarget?.(item);
    if (!to) return;
    const from = this.cameraToScreen({ x: cx, y: cy });
    const node = createItemFlyer(item);
    node.position.set(from.x, from.y);
    node.visible = delay <= 0;
    this.overlay.addChild(node);
    const arcLift = 65 + Math.random() * 45;
    const sideBend = (Math.random() - 0.5) * 60;
    this.flyers.push({
      node,
      fromX: from.x,
      fromY: from.y,
      ctrlX: (from.x + to.x) / 2 + sideBend,
      ctrlY: Math.min(from.y, to.y) - arcLift,
      toX: to.x,
      toY: to.y,
      t: -delay / FLYER_DURATION,
      duration: FLYER_DURATION * (0.9 + Math.random() * 0.2),
      spin: (Math.random() > 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.35),
      item,
    });
  }

  private updateEffects(dt: number): void {
    this.pool?.update(dt);

    this.hearts = this.hearts.filter((h) => {
      h.age += dt;
      if (h.age >= HEART_DURATION) {
        h.g.destroy();
        return false;
      }
      const p = h.age / HEART_DURATION;
      const c = this.toCamera(h.wx + h.drift * p, h.wy, h.wz + p * 0.65);
      h.g.position.set(c.x, c.y);
      const pop = p < 0.25 ? easeOutBack(p / 0.25, 1.8) : 1;
      h.g.scale.set(0.55 + pop * 0.45);
      h.g.alpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      return true;
    });

    this.flyers = this.flyers.filter((f) => {
      f.t += dt / f.duration;
      if (f.t < 0) return true;
      if (!f.node.visible) f.node.visible = true;
      if (f.t >= 1) {
        f.node.destroy({ children: true });
        this.callbacks.onItemArrived?.(f.item);
        return false;
      }
      // Inicio ágil + aceleración suave hacia el contador del HUD.
      const t = 0.25 * easeOutQuad(f.t) + 0.75 * easeInCubic(f.t);
      const u = 1 - t;
      f.node.x = u * u * f.fromX + 2 * u * t * f.ctrlX + t * t * f.toX;
      f.node.y = u * u * f.fromY + 2 * u * t * f.ctrlY + t * t * f.toY;
      const pop = f.t < 0.18 ? easeOutBack(f.t / 0.18, 1.4) : 1;
      f.node.scale.set((1.12 - 0.52 * t) * pop);
      f.node.rotation = Math.sin(f.t * Math.PI) * f.spin;
      return true;
    });

    this.bubbles = this.bubbles.filter((b) => {
      b.age += dt;
      if (b.age >= BUBBLE_DURATION) {
        b.node.destroy({ children: true });
        return false;
      }
      const p = b.age / BUBBLE_DURATION;
      const pos = this.cameraToScreen(this.toCamera(b.wx, b.wy, b.wz));
      b.node.position.set(pos.x, pos.y - easeOutQuad(p) * 28);
      const intro = b.age < 0.16 ? easeOutBack(b.age / 0.16, 1.8) : 1;
      b.node.scale.set(intro);
      b.node.alpha = p < 0.1 ? p / 0.1 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      return true;
    });
  }

  // ---------------------------------------------------------------- cámara y entrada

  /** Rectángulo (coordenadas de cámara) que debe caber en pantalla: isla, dron y vuelo del perro. */
  private contentBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const w = this.gridW;
    const h = this.gridH;
    const reachX = 0.85 + 0.4;
    const reachY = 0.7 + 0.4;
    const top = Math.min(this.toCamera(0, h + reachY, 1.4).y, this.toCamera(0, h, DRONE_HOVER + 0.5).y);
    const bottom = Math.max(this.islandBottom, this.toCamera(0, -reachY, 0.9).y);
    return { x0: screenX(-reachX), y0: top, x1: screenX(w + reachX), y1: bottom };
  }

  private fit(): void {
    if (this.gridW === 0 || this.viewW === 0 || this.viewH === 0) return;
    const insets = this.callbacks.getFitInsets?.() ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const availW = Math.max(120, this.viewW - insets.left - insets.right);
    const availH = Math.max(120, this.viewH - insets.top - insets.bottom);
    const b = this.contentBounds();
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    let z = Math.min((availW * 0.9) / bw, (availH * 0.9) / bh);
    z = Math.max(MIN_ZOOM, Math.min(z, MAX_TILE_PIXELS / TILE));
    this.zoom = z;
    this.panX = insets.left + (availW - bw * z) / 2 - b.x0 * z;
    this.panY = insets.top + (availH - bh * z) / 2 - b.y0 * z;
  }

  private pick(sx: number, sy: number, clientX: number, clientY: number): HoverTile | null {
    if (this.gridW === 0) return null;
    const g = groundFromScreen((sx - this.panX) / this.zoom, (sy - this.panY) / this.zoom);
    const col = Math.floor(g.x);
    const row = Math.floor(g.y);
    if (col < 0 || row < 0 || col >= this.gridW || row >= this.gridH) return null;
    return { x: col, y: row, clientX, clientY };
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        this.drag = null;
      } else {
        this.drag = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY, moved: false };
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch.dist > 0) this.zoomBy(dist / this.pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinch.dist = dist;
        return;
      }
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (!this.drag.moved && Math.abs(dx) + Math.abs(dy) > 3) {
          this.drag.moved = true;
          canvas.style.cursor = 'grabbing';
          this.callbacks.onHoverTile?.(null);
        }
        if (this.drag.moved) {
          this.panX = this.drag.panX + dx;
          this.panY = this.drag.panY + dy;
          this.autoFit = false;
          return;
        }
      }
      this.callbacks.onHoverTile?.(this.pick(p.x, p.y, e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) this.drag = null;
      canvas.style.cursor = 'grab';
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onLeave = () => this.callbacks.onHoverTile?.(null);
    const onDouble = () => this.resetView();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('dblclick', onDouble);
    this.cleanup.push(() => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDouble);
    });
  }
}
