import { Application, Container, Sprite, Text, type Texture } from 'pixi.js';
import { entityFromCode, type EntityKind, type SimEvent } from '../../engine/types';
import { drainSceneEvents, liveSnapshot } from '../../store/liveSnapshot';
import { MEGA_MEMBER, TILE_FLAG_INFECTED, TILE_FLAG_UNSORTED, type DroneSnapshot, type RenderSnapshot } from '../../worker/protocol';
import type { FarmScene, HoverTile, StageCallbacks } from '../stageTypes';
import { loadAtlas, type Atlas } from './atlas';
import { clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutBounce, easeOutQuad, lerp } from './easing';
import { FreeFlight, overBoard } from './flight';
import { getLodLevel, MAX_PARTICLES, type LodLevel } from './lod';
import { entityVisual, type Visual } from './visuals';
import { ParticlePool } from './particles';
import { boardBounds, depthOf, HEIGHT_PX, isoX, isoY, pickTile, tileCenter } from './projection';
import { SpritePool } from './spritePool';

/**
 * Escenario de la granja con sprites 2.5D del atlas (docs 05, 06 y 08): isometría 2:1, cinco capas
 * (fondo, plataforma cacheada, entidades ordenadas por profundidad, drones y efectos con pool de
 * partículas) y animaciones procedurales sobre sprites estáticos. Consume el mismo RenderSnapshot
 * que el renderizador low-poly, que queda como respaldo si el atlas no carga.
 *
 * La granja, los drones y el perro son objetos separados: la granja (`field`) se arrastra sola y
 * los voladores (`sky`) tienen su propia posición. Un dron con script en marcha vuela hasta su
 * casilla y la sigue; sin script flota donde quedó. El perro patrulla su zona, no la granja.
 */

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
/** Zoom máximo al encuadrar automáticamente (las texturas están a 2×). */
const MAX_FIT_ZOOM = 1.6;
/** Altura de vuelo del dron (casillas). */
const HOVER = 0.95;
const HOVER_PX = HOVER * HEIGHT_PX;
const TILT = 0.14;
const SHADOW_ALPHA = 0.3;
const FLYER_MS = 440;
const ROTOR_FRAME_MS = 40;
const ROTOR_POWERED_FRAME_MS = 22;
/** do_a_flip(): siempre 1000 ms de tiempo real (doc 08 §1, excepción absoluta). */
const FLIP_MS = 1000;
const FLIP_JUMP_PX = 28;
/** Aparición de un dron hijo (spawn_drone). */
const SPAWN_MS = 320;
/** Vistas de dron guardadas para reutilizar (Megafarm: hasta 32 a la vez). */
const MAX_POOLED_DRONES = 32;
/** Partículas del cielo (chispas del brazo, estela de Power, perro); el resto del tope es de la granja. */
const SKY_PARTICLES = 50;
/** Recentrar con doble clic: la granja y la cámara vuelven a su sitio en este tiempo. */
const VIEW_RESET_MS = 420;
/** Movimiento mínimo (px) para que pulsar se convierta en arrastrar. */
const DRAG_THRESHOLD = 3;
const WIND_KINDS: ReadonlySet<EntityKind> = new Set(['Grass']);

const C = {
  amber: 0xff941a,
  brass: 0xd4a34a,
  gold: 0xffe066,
  dust: 0x4a3a2e,
  dustGrey: 0x8a8079,
  grass: 0x968e5c,
  leaf: 0x7d854c,
  leafDry: 0x8c8457,
  splinter: 0x6e5e4e,
  water: 0x4ac6e8,
  weird: 0x9b3bd1,
  weirdLight: 0xc76bff,
  apple: 0x8a3636,
  green: 0x63c784,
  steam: 0xd8d2c6,
};

interface Tween {
  t: number;
  dur: number;
  delay: number;
  step: (k: number) => void;
  done?: () => void;
}

interface TileView {
  x: number;
  y: number;
  /** Centro de la casilla en la escena (se calcula una vez al crear la cuadrícula). */
  cx: number;
  cy: number;
  /** Punto de anclaje actual del cultivo (el centro del bloque en las megacalabazas). */
  px: number;
  py: number;
  /** Un evento tocó la casilla: se sincroniza aunque el snapshot no cambie. */
  dirty: boolean;
  sprite: Sprite | null;
  texName: string;
  kind: EntityKind | null;
  growth: number;
  meta: number;
  infected: boolean;
  unsorted: boolean;
  mega: number;
  sx: number;
  sy: number;
  tint: number;
  /** Modificadores de animación (tweens). */
  ax: number;
  ay: number;
  ox: number;
  oy: number;
  rot: number;
  alpha: number;
  walls: Sprite[];
  wallKey: string;
  glow: Sprite | null;
  water: Sprite | null;
  waterNow: number;
  waterTarget: number;
  nextSpore: number;
  phase: number;
}

interface DroneView {
  root: Container;
  body: Container;
  shadow: Sprite;
  bodySprite: Sprite;
  rotorL: Sprite;
  rotorR: Sprite;
  arm: Sprite;
  hat: Sprite;
  hatName: string;
  hatScale: number;
  hatVersion: number;
  dino: Sprite;
  tilt: number;
  tiltV: number;
  rotorClock: number;
  rotorFrame: number;
  actionKey: string;
  armClock: number;
  nextPowerSpark: number;
  lastX: number;
  lastY: number;
  fade: number;
  /** Último rumbo de la cabeza de dinosaurio. */
  facing: 'N' | 'E' | 'S' | 'W';
  /** Inicio (s de escena) de la pirueta de do_a_flip, o null. */
  flipAt: number | null;
  /** Inicio de la animación de aparición de spawn_drone, o null. */
  spawnAt: number | null;
  /** Vuelo libre: posición propia, independiente de la granja. */
  flyer: FreeFlight;
  /** Su último movimiento salía por un borde (el salto siguiente es un wrap-around, con fundido). */
  wrapping: boolean;
  /** Punto al que lo arrastra el jugador, o null. */
  hold: { x: number; y: number } | null;
}

interface Flyer {
  sprite: Sprite;
  fromX: number;
  fromY: number;
  ctrlX: number;
  ctrlY: number;
  toX: number;
  toY: number;
  t: number;
  spin: number;
  item: string;
}

interface Label {
  text: Text;
  wx: number;
  wy: number;
  age: number;
  dur: number;
}

interface Pet {
  sprite: Sprite;
  shadow: Sprite;
  /** Punto del suelo bajo el perro, en coordenadas de cámara (no de la granja). */
  gx: number;
  gy: number;
  /** Altura de vuelo (casillas). */
  z: number;
  /** Centro de su patrulla: es suyo, no se mueve al arrastrar la granja. */
  homeX: number;
  homeY: number;
  pathT: number;
  ready: boolean;
  /** pet_the_dog(): vuela hasta el dron que lo llamó (x, y: su casilla por si ya no existe). */
  visit: { droneId: number; x: number; y: number; start: number; end: number } | null;
  squash: number;
  /** Punto al que lo arrastra el jugador, o null. */
  hold: { x: number; y: number } | null;
}

type DragTarget = { kind: 'field' } | { kind: 'drone'; id: number } | { kind: 'pet' };

const ITEM_SPRITES: Readonly<Record<string, string>> = {
  Hay: 'item_hay',
  Wood: 'item_wood',
  Carrot: 'item_carrot',
  Water: 'item_water',
  Fertilizer: 'item_fertilizer',
  Weird_Substance: 'item_weird_substance',
  Pumpkin: 'item_pumpkin',
  Power: 'item_power',
  Cactus: 'item_cactus',
  Gold: 'item_gold',
  Bone: 'item_bone',
};

/** ¿Mismo contenido? (comparación de suelos sin crear cadenas en cada snapshot). */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function mixColor(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - k) + ((b >> s) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class IsoStage implements FarmScene {
  private app: Application | null = null;
  private atlas: Atlas | null = null;
  private disposed = false;
  private readonly container: HTMLElement;
  private readonly callbacks: StageCallbacks;
  private readonly background = new Container();
  private readonly camera = new Container();
  /** La granja: isla, cultivos y sus efectos. Se arrastra sola. */
  private readonly field = new Container();
  /** Los voladores: drones, perro, sus chispas y los textos de print(). */
  private readonly sky = new Container();
  private readonly platform = new Container();
  private readonly waterLayer = new Container();
  private readonly shadowLayer = new Container();
  private readonly entities = new Container();
  private readonly droneLayer = new Container();
  private readonly labelLayer = new Container();
  /** Destellos y ondas sobre las casillas (encima de los cultivos, debajo de los voladores). */
  private readonly fieldFx = new Container();
  private readonly overlay = new Container();
  private readonly particles = new ParticlePool(MAX_PARTICLES - SKY_PARTICLES);
  private readonly skyParticles = new ParticlePool(SKY_PARTICLES);
  private readonly pool = new SpritePool(1024);
  private readonly dronePool: DroneView[] = [];
  /** Piruetas y apariciones que llegan antes de que exista la vista del dron. */
  private readonly pendingFlips = new Map<number, number>();
  private readonly pendingSpawns = new Map<number, number>();
  /** Arrays del snapshot ya aplicado (inmutables: cada snapshot trae los suyos) para sincronizar solo lo que cambia. */
  private prevTiles: RenderSnapshot['tiles'] | null = null;
  private prevDino = false;
  private tiles: TileView[] = [];
  private gridW = 0;
  private gridH = 0;
  private groundKey = '';
  private platformCached = false;
  private cacheZoom = 1;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly drones = new Map<number, DroneView>();
  private readonly seenDrones = new Set<number>();
  private tail: Sprite[] = [];
  private pet: Pet | null = null;
  private motes: { sprite: Sprite; vx: number; vy: number }[] = [];
  private motesPlaced = false;
  private tweens: Tween[] = [];
  private flyers: Flyer[] = [];
  private labels: Label[] = [];
  private pendingSwaps: { x: number; y: number; toX: number; toY: number }[] = [];
  private pendingMegas: { x: number; y: number }[] = [];
  private cactusHarvest: { x: number; y: number } | null = null;
  private mazeOrigin: { x: number; y: number; at: number } | null = null;
  private relocated: { x: number; y: number } | null = null;
  private harvestCount = 0;
  private lod: LodLevel = 'HIGH';
  private reducedMotion = false;
  private lastSeq = -1;
  private time = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  /** Posición de la granja en coordenadas de cámara (se arrastra con el puntero). */
  private fieldX = 0;
  private fieldY = 0;
  /** La del fotograma anterior: los drones que trabajan persiguen la diferencia. */
  private lastFieldX = 0;
  private lastFieldY = 0;
  /** Recentrado animado (doble clic): de dónde a dónde van la cámara y la granja. */
  private viewTween: { t: number; from: [number, number, number, number, number]; to: [number, number, number, number, number] } | null = null;
  private autoFit = true;
  private viewW = 0;
  private viewH = 0;
  private fpsTimer = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private drag: { target: DragTarget; x: number; y: number; fieldX: number; fieldY: number; grabX: number; grabY: number; moved: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(container: HTMLElement, callbacks: StageCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
  }

  /** Carga el atlas y crea la escena; lanza si el atlas no está disponible (el llamador usa el respaldo). */
  async init(): Promise<void> {
    const atlas = await loadAtlas();
    if (this.disposed) return;
    this.atlas = atlas;
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

    this.entities.sortableChildren = true;
    this.droneLayer.sortableChildren = true;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      this.reducedMotion = mq.matches;
      const onMotion = (ev: MediaQueryListEvent) => {
        this.reducedMotion = ev.matches;
      };
      mq.addEventListener?.('change', onMotion);
      this.cleanup.push(() => mq.removeEventListener?.('change', onMotion));
    }
    this.field.addChild(this.platform, this.waterLayer, this.shadowLayer, this.entities, this.particles.normal, this.particles.additive, this.fieldFx);
    this.sky.addChild(this.droneLayer, this.skyParticles.normal, this.skyParticles.additive, this.labelLayer);
    this.camera.addChild(this.field, this.sky);
    app.stage.addChild(this.background, this.camera, this.overlay);
    this.createMotes();
    this.createPet();
    this.bindInput(canvas);
    app.ticker.add((ticker) => this.frame(ticker.deltaMS));
  }

  destroy(): void {
    this.disposed = true;
    this.tweens.length = 0;
    this.pool.drain();
    for (const view of this.dronePool) {
      view.root.destroy({ children: true });
      view.shadow.destroy();
    }
    this.dronePool.length = 0;
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
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
    this.scheduleRecache();
  }

  /**
   * Doble clic: la granja vuelve a su sitio y se encuadra; el perro vuelve a patrullar alrededor
   * y los drones que flotaban libres regresan volando sobre su casilla.
   */
  resetView(): void {
    this.autoFit = true;
    const target = this.computeFit(0, 0);
    if (!target) return;
    this.viewTween = {
      t: 0,
      from: [this.zoom, this.panX, this.panY, this.fieldX, this.fieldY],
      to: [target.zoom, target.panX, target.panY, 0, 0],
    };
    const snap = liveSnapshot.current;
    if (snap) {
      for (const d of snap.drones) {
        this.drones.get(d.id)?.flyer.sendTo(isoX(d.x + 0.5, d.y + 0.5), isoY(d.x + 0.5, d.y + 0.5));
      }
    }
    if (this.pet && this.gridW > 0) {
      this.pet.homeX = isoX(this.gridW / 2, this.gridH / 2);
      this.pet.homeY = isoY(this.gridW / 2, this.gridH / 2);
    }
  }

  refit(): void {
    if (this.autoFit) this.fit();
  }

  setPaused(paused: boolean): void {
    const ticker = this.app?.ticker;
    if (!ticker) return;
    if (paused) ticker.stop();
    else ticker.start();
  }

  private tex(name: string): Texture {
    if (!this.atlas) throw new Error('Atlas sin cargar');
    return this.atlas.tex(name);
  }

  private sprite(name: string): Sprite {
    return new Sprite(this.tex(name));
  }

  /** Sprite reutilizable del pool: se devuelve con recycle(), nunca con destroy(). */
  private pooled(name: string): Sprite {
    return this.pool.acquire(this.tex(name));
  }

  private recycle(sprite: Sprite | null | undefined): void {
    this.pool.release(sprite);
  }

  /** Estadísticas del renderizador (pruebas de rendimiento y depuración). */
  get stats(): { tiles: number; drones: number; pooledSprites: number; createdSprites: number; pooledDrones: number; lod: LodLevel } {
    return {
      tiles: this.tiles.length,
      drones: this.drones.size,
      pooledSprites: this.pool.available,
      createdSprites: this.pool.totalCreated,
      pooledDrones: this.dronePool.length,
      lod: this.lod,
    };
  }

  /** Cambia la textura conservando el anclaje propio de cada frame del atlas. */
  private setTex(sprite: Sprite, name: string): void {
    const texture = this.tex(name);
    sprite.texture = texture;
    if (texture.defaultAnchor) sprite.anchor.set(texture.defaultAnchor.x, texture.defaultAnchor.y);
  }

  private setTexIfNeeded(sprite: Sprite, name: string): void {
    if (sprite.texture !== this.tex(name)) this.setTex(sprite, name);
  }

  private tween(dur: number, step: (k: number) => void, opts: { delay?: number; done?: () => void } = {}): void {
    this.tweens.push({ t: 0, dur: Math.max(1, dur), delay: opts.delay ?? 0, step, done: opts.done });
  }

  // ---------------------------------------------------------------- bucle

  private frame(deltaMs: number): void {
    const app = this.app;
    if (!app) return;
    const dtMs = Math.min(deltaMs, 100);
    const dt = dtMs / 1000;
    this.time += dt;
    const w = app.screen.width;
    const h = app.screen.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      if (this.autoFit) this.fit();
    }
    this.updateViewTween(dtMs);
    const snap = liveSnapshot.current;
    if (snap) {
      const active = snap.drones.filter((d) => d.status === 'RUNNING' || d.status === 'WAITING').length;
      const speed = snap.ticksPerSecond > 0 ? (snap.ticksPerSecond / 400) * (snap.powered ? 2 : 1) : 0;
      this.lod = getLodLevel(active, speed);
      if (snap.width !== this.gridW || snap.height !== this.gridH) this.rebuildGrid(snap.width, snap.height);
      // Los eventos se procesan antes de aplicar el nuevo estado: así se conoce lo que había.
      for (const event of drainSceneEvents()) this.handleEvent(event);
      if (snap.seq !== this.lastSeq) {
        this.lastSeq = snap.seq;
        this.sync(snap);
      }
      this.updateDrones(snap, dt);
      this.updateTail(snap);
    } else {
      drainSceneEvents();
    }
    this.updateTweens(dtMs);
    this.animateTiles(dt);
    this.updatePet(dt);
    this.updateMotes(dt);
    this.particles.update(dtMs);
    this.skyParticles.update(dtMs);
    this.updateFlyers(dtMs);
    this.updateLabels(dt);
    this.lastFieldX = this.fieldX;
    this.lastFieldY = this.fieldY;
    this.camera.scale.set(this.zoom);
    this.camera.position.set(this.panX, this.panY);
    this.field.position.set(this.fieldX, this.fieldY);
    this.fpsTimer += deltaMs;
    if (this.fpsTimer >= 500) {
      this.fpsTimer = 0;
      this.callbacks.onFps?.(Math.round(app.ticker.FPS));
    }
  }

  private updateViewTween(dtMs: number): void {
    const vt = this.viewTween;
    if (!vt) return;
    vt.t = Math.min(1, vt.t + dtMs / VIEW_RESET_MS);
    const k = easeInOutCubic(vt.t);
    const at = (i: number) => lerp(vt.from[i], vt.to[i], k);
    // El zoom se interpola en escala logarítmica para que no «salte» al acercarse.
    this.zoom = Math.exp(lerp(Math.log(vt.from[0]), Math.log(vt.to[0]), k));
    this.panX = at(1);
    this.panY = at(2);
    this.fieldX = at(3);
    this.fieldY = at(4);
    if (vt.t >= 1) {
      this.viewTween = null;
      this.scheduleRecache();
    }
  }

  private updateTweens(dtMs: number): void {
    const keep: Tween[] = [];
    for (const tw of this.tweens) {
      if (tw.delay > 0) {
        tw.delay -= dtMs;
        keep.push(tw);
        continue;
      }
      tw.t += dtMs;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) tw.done?.();
      else keep.push(tw);
    }
    this.tweens = keep;
  }

  // ---------------------------------------------------------------- cuadrícula y plataforma

  private rebuildGrid(w: number, h: number): void {
    // Al crecer la isla (Expand) el perro desplaza su patrulla lo mismo que se movió el centro de la isla.
    if (this.pet?.ready && this.gridW > 0) {
      this.pet.homeX += isoX(w / 2, h / 2) - isoX(this.gridW / 2, this.gridH / 2);
      this.pet.homeY += isoY(w / 2, h / 2) - isoY(this.gridW / 2, this.gridH / 2);
    }
    for (const t of this.tiles) {
      this.recycle(t.sprite);
      t.glow?.destroy();
      this.recycle(t.water);
      for (const s of t.walls) s.destroy();
    }
    this.tiles = [];
    this.gridW = w;
    this.gridH = h;
    this.prevTiles = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = tileCenter(x, y);
        this.tiles.push({
          x,
          y,
          cx: c.x,
          cy: c.y,
          px: c.x,
          py: c.y,
          dirty: true,
          sprite: null,
          texName: '',
          kind: null,
          growth: 0,
          meta: 0,
          infected: false,
          unsorted: false,
          mega: 0,
          sx: 1,
          sy: 1,
          tint: 0xffffff,
          ax: 1,
          ay: 1,
          ox: 0,
          oy: 0,
          rot: 0,
          alpha: 1,
          walls: [],
          wallKey: '',
          glow: null,
          water: null,
          waterNow: 0,
          waterTarget: 0,
          nextSpore: 0,
          phase: ((x * 7 + y * 13) % 17) / 2.7,
        });
      }
    }
    this.groundKey = '';
    this.lastSeq = -1;
    if (this.autoFit) this.fit();
  }

  /** Capa 1: base, placas y bordes. Solo se reconstruye al labrar o al expandir (doc 05 §4). */
  private buildPlatform(ground: Uint8Array): void {
    const layer = this.platform;
    if (this.platformCached) {
      layer.cacheAsTexture(false);
      this.platformCached = false;
    }
    for (const child of layer.removeChildren()) child.destroy();
    const w = this.gridW;
    const h = this.gridH;
    // Bordes laterales detrás de las placas no se ven: se dibujan delante (al final).
    const order: { x: number; y: number }[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) order.push({ x, y });
    order.sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const { x, y } of order) {
      const c = tileCenter(x, y);
      const base = this.sprite('tile_base');
      base.position.set(c.x, c.y);
      layer.addChild(base);
    }
    for (const { x, y } of order) {
      const c = tileCenter(x, y);
      const plate = this.sprite(ground[y * w + x] === 1 ? 'tile_soil' : 'tile_grassland');
      plate.position.set(c.x, c.y);
      layer.addChild(plate);
    }
    for (let x = w - 1; x >= 0; x--) {
      const c = tileCenter(x, 0);
      const edge = this.sprite('platform_edge_s');
      edge.position.set(c.x, c.y);
      layer.addChild(edge);
    }
    for (let y = h - 1; y >= 0; y--) {
      const c = tileCenter(0, y);
      const edge = this.sprite('platform_edge_w');
      edge.position.set(c.x, c.y);
      layer.addChild(edge);
    }
    const corner = this.sprite('platform_corner');
    const c0 = tileCenter(0, 0);
    corner.position.set(c0.x, c0.y);
    layer.addChild(corner);
    this.cachePlatform();
  }

  private cachePlatform(): void {
    const b = boardBounds(this.gridW, this.gridH);
    const width = b.x1 - b.x0 + 64;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Resolución según el zoom, sin pasar de 4096 px de textura.
    const resolution = Math.max(0.5, Math.min(dpr * Math.max(1, this.zoom), 4096 / width, 2.5));
    if (this.platformCached) this.platform.cacheAsTexture(false);
    this.platform.cacheAsTexture({ resolution, antialias: true });
    this.platformCached = true;
    this.cacheZoom = this.zoom;
  }

  private scheduleRecache(): void {
    if (!this.platformCached || Math.abs(this.zoom / this.cacheZoom - 1) < 0.25) return;
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = null;
      if (this.platformCached) this.cachePlatform();
    }, 250);
  }

  // ---------------------------------------------------------------- sincronización con el snapshot

  private sync(snap: RenderSnapshot): void {
    const { ground, entity, growth, water, flags, meta, walls, mega } = snap.tiles;
    const prev = this.prevTiles;
    if (this.groundKey === '' || !prev || !sameBytes(prev.ground, ground)) {
      this.groundKey = 'built';
      this.buildPlatform(ground);
    }
    const w = this.gridW;
    const dinoMode = snap.dino !== null;
    // Casillas sucias: solo se recorren las que cambiaron en el snapshot o las que tocó un evento.
    const full = !prev || prev.entity.length !== entity.length || this.prevDino !== dinoMode;
    for (let i = 0; i < this.tiles.length && i < entity.length; i++) {
      const t = this.tiles[i];
      if (
        !full &&
        !t.dirty &&
        prev.entity[i] === entity[i] &&
        prev.growth[i] === growth[i] &&
        prev.water[i] === water[i] &&
        prev.flags[i] === flags[i] &&
        prev.meta[i] === meta[i] &&
        prev.walls[i] === walls[i] &&
        prev.mega[i] === mega[i]
      ) {
        continue;
      }
      t.dirty = false;
      const kind = entityFromCode(entity[i]);
      t.waterTarget = water[i];
      if (t.waterTarget > 0.01 && !t.water) {
        const s = this.pooled('tile_water_overlay');
        s.position.set(t.cx, t.cy);
        s.alpha = 0;
        this.waterLayer.addChild(s);
        t.water = s;
      }
      const g = Math.min(1, growth[i]);
      const megaSide = kind === 'Pumpkin' ? mega[i] : 0;
      const infected = kind !== null && (flags[i] & TILE_FLAG_INFECTED) !== 0;
      const unsorted = (flags[i] & TILE_FLAG_UNSORTED) !== 0;
      this.syncWalls(t, kind, walls[i]);
      this.syncEntity(t, kind, g, meta[i], unsorted, megaSide, dinoMode);
      t.infected = infected;
    }
    this.prevTiles = snap.tiles;
    this.prevDino = dinoMode;
    // Animaciones que dependen del estado nuevo.
    for (const s of this.pendingSwaps) this.animateSwap(s);
    this.pendingSwaps = [];
    for (const m of this.pendingMegas) {
      const t = this.tiles[m.y * w + m.x];
      if (t?.sprite && t.mega >= 2) {
        this.tween(220, (k) => {
          t.ax = lerp(1.15, 1, easeOutBack(k));
          t.ay = lerp(0.85, 1, easeOutBack(k));
        });
      }
    }
    this.pendingMegas = [];
    this.cactusHarvest = null;
    this.updateSunflowerGlow(snap);
  }

  private syncEntity(t: TileView, kind: EntityKind | null, g: number, meta: number, unsorted: boolean, megaSide: number, dinoMode: boolean): void {
    const prevKind = t.kind;
    const hidden = kind === null || kind === 'Hedge' || megaSide === MEGA_MEMBER || (kind === 'Dinosaur' && dinoMode);
    if (hidden) {
      if (t.sprite) {
        // Cactus cosechados en cadena: cascada de «pops» con 35 ms por salto (tope 450 ms).
        if (prevKind === 'Cactus' && this.cactusHarvest) {
          const d = Math.abs(t.x - this.cactusHarvest.x) + Math.abs(t.y - this.cactusHarvest.y);
          this.ghostPop(t, Math.min(450, d * 35));
        } else if (prevKind === 'Pumpkin' && t.mega >= 2) {
          this.ghostFade(t, 200);
        } else {
          this.recycle(t.sprite);
        }
        t.sprite = null;
      }
      t.kind = kind;
      t.texName = '';
      t.mega = megaSide === MEGA_MEMBER ? 0 : megaSide;
      t.growth = g;
      return;
    }
    let visual: Visual | null;
    if (megaSide >= 2) {
      visual = { tex: 'pumpkin_mega', sx: megaSide / 2, sy: megaSide / 2, tint: 0xffffff };
    } else {
      visual = entityVisual(kind, g, meta, unsorted);
    }
    if (!visual) return;
    const isNew = !t.sprite || prevKind !== kind;
    if (!t.sprite) {
      t.sprite = this.pooled(visual.tex);
      this.entities.addChild(t.sprite);
    } else if (t.texName !== visual.tex) {
      this.setTex(t.sprite, visual.tex);
    }
    // Posición: la megacalabaza se centra en su bloque N × N.
    if (megaSide >= 2) {
      t.px = isoX(t.x + megaSide / 2, t.y + megaSide / 2);
      t.py = isoY(t.x + megaSide / 2, t.y + megaSide / 2);
    } else {
      t.px = t.cx;
      t.py = t.cy;
    }
    t.sprite.position.set(t.px, t.py);
    t.sprite.zIndex = depthOf(t.x, t.y) + (kind === 'Treasure' ? 0.1 : 0);
    const texChanged = t.texName !== visual.tex;
    t.texName = visual.tex;
    t.sx = visual.sx;
    t.sy = visual.sy;
    t.tint = visual.tint;
    t.mega = megaSide;
    if (isNew) {
      t.ax = t.ay = 1;
      t.ox = t.oy = t.rot = 0;
      t.alpha = 1;
      if (prevKind === 'Pumpkin' && kind === 'Dead_Pumpkin') {
        // Al morir se aplasta y queda podrida.
        this.tween(180, (k) => (t.ay = lerp(0.72, 1, easeOutQuad(k))));
      } else if (kind === 'Apple') {
        // Cae desde 16 px con rebote.
        this.tween(220, (k) => (t.oy = lerp(-16, 0, easeOutBounce(k))));
      } else if (kind === 'Treasure' && this.relocated && this.relocated.x === t.x && this.relocated.y === t.y) {
        this.relocated = null;
        t.alpha = 0;
        this.tween(320, (k) => (t.alpha = k));
      } else if (g < 0.2 || megaSide >= 2) {
        // plant(): el brote aparece al instante con pop-in (doc 08 §4).
        this.tween(140, (k) => {
          const s = lerp(0.1, 1, easeOutBack(k));
          t.ax = t.ay = s;
        });
      }
    } else if (texChanged && (kind === 'Bush' || kind === 'Carrot' || kind === 'Sunflower' || kind === 'Tree')) {
      // Cambio de fase: pulso corto.
      this.tween(160, (k) => {
        const s = 1 + Math.sin(k * Math.PI) * 0.12;
        t.ax = t.ay = s;
      });
    }
    t.kind = kind;
    t.growth = g;
    t.meta = meta;
    t.unsorted = unsorted;
  }

  /** Muros del laberinto: S y O de cada casilla, más N y E en los bordes (doc 06: hedge_n/e/s/w). */
  private syncWalls(t: TileView, kind: EntityKind | null, bits: number): void {
    const maze = kind === 'Hedge' || kind === 'Treasure';
    const north = t.y === this.gridH - 1;
    const east = t.x === this.gridW - 1;
    const key = maze ? `${bits}:${north ? 1 : 0}${east ? 1 : 0}` : '';
    if (key === t.wallKey) return;
    const had = t.walls.length > 0;
    for (const s of t.walls) {
      if (!maze) this.sinkWall(s);
      else s.destroy();
    }
    t.walls = [];
    t.wallKey = key;
    if (!maze) return;
    const c = tileCenter(t.x, t.y);
    const base = depthOf(t.x, t.y);
    const add = (name: string, dz: number) => {
      const s = this.sprite(name);
      s.position.set(c.x, c.y);
      s.zIndex = base + dz;
      this.entities.addChild(s);
      t.walls.push(s);
      if (!had && this.mazeOrigin) {
        // Brotan del suelo con retardo radial desde el arbusto de origen.
        const d = Math.abs(t.x - this.mazeOrigin.x) + Math.abs(t.y - this.mazeOrigin.y);
        s.scale.y = 0;
        this.tween(240, (k) => {
          if (!s.destroyed) s.scale.y = easeOutBack(k);
        }, { delay: d * 15 });
      }
    };
    if (bits & 4) add('hedge_s', 0.45);
    if (bits & 8) add('hedge_w', 0.45);
    if (north && bits & 1) add('hedge_n', -0.45);
    if (east && bits & 2) add('hedge_e', -0.45);
  }

  private sinkWall(s: Sprite): void {
    this.tween(
      200,
      (k) => {
        if (!s.destroyed) s.scale.y = 1 - easeOutQuad(k);
      },
      {
        done: () => {
          if (!s.destroyed) s.destroy();
        },
      },
    );
  }

  /** Halo dorado tenue en los girasoles de más pétalos (si hay >= 10) y en el cofre del tesoro (doc 08 §§4-5). */
  private updateSunflowerGlow(snap: RenderSnapshot): void {
    let count = 0;
    let best = -1;
    const { entity, meta, growth } = snap.tiles;
    for (let i = 0; i < entity.length; i++) {
      if (entityFromCode(entity[i]) !== 'Sunflower') continue;
      count++;
      if (growth[i] >= 1 && meta[i] > best) best = meta[i];
    }
    this.tiles.forEach((t, i) => {
      const kind = entityFromCode(entity[i]);
      const isBestSunflower = kind === 'Sunflower' && count >= 10 && growth[i] >= 1 && best > 0 && meta[i] === best;
      const isTreasure = kind === 'Treasure';
      const want = isBestSunflower || isTreasure;
      if (want && !t.glow) {
        const glow = this.sprite('fx_glow');
        glow.blendMode = 'add';
        glow.tint = isTreasure ? C.gold : C.brass;
        glow.alpha = 0.35;
        glow.scale.set(isTreasure ? 0.95 : 1.3);
        const c = tileCenter(t.x, t.y);
        glow.position.set(isTreasure ? c.x : c.x - 8, isTreasure ? c.y - 20 : c.y - 52);
        glow.zIndex = depthOf(t.x, t.y) + 0.2;
        this.entities.addChild(glow);
        t.glow = glow;
      } else if (want && t.glow) {
        const c = tileCenter(t.x, t.y);
        t.glow.tint = isTreasure ? C.gold : C.brass;
        t.glow.position.set(isTreasure ? c.x : c.x - 8, isTreasure ? c.y - 20 : c.y - 52);
      } else if (!want && t.glow) {
        t.glow.destroy();
        t.glow = null;
      }
    });
  }

  private animateTiles(dt: number): void {
    const wind = this.lod === 'HIGH' && !this.reducedMotion;
    const idle = this.lod !== 'LOW' && !this.reducedMotion;
    for (const t of this.tiles) {
      if (t.water) {
        t.waterNow += (t.waterTarget - t.waterNow) * Math.min(1, dt / 0.24);
        t.water.alpha = clamp01(t.waterNow) * 0.95;
        if (t.waterTarget <= 0.01 && t.waterNow < 0.01) {
          this.recycle(t.water);
          t.water = null;
        }
      }
      if (t.glow) {
        const pulse = idle ? 0.5 + 0.5 * Math.sin(this.time * (t.kind === 'Treasure' ? 3.4 : 2.2) + t.phase) : 0.5;
        t.glow.visible = this.lod !== 'LOW';
        t.glow.alpha = (t.kind === 'Treasure' ? 0.2 : 0.24) + pulse * 0.22;
        const baseScale = t.kind === 'Treasure' ? 0.88 : 1.2;
        t.glow.scale.set(baseScale + pulse * 0.22);
      }
      const s = t.sprite;
      if (!s) continue;
      let sx = t.sx * t.ax;
      let sy = t.sy * t.ay;
      let skew = 0;
      let bobY = 0;
      if (t.growth >= 1 && idle) {
        if (t.kind && WIND_KINDS.has(t.kind) && wind) {
          // Ola de viento diagonal recorriendo la pradera.
          skew = Math.sin(this.time * 2.2 + t.x * 0.65 + t.y * 0.45) * 0.055;
        } else if (t.kind === 'Bush') {
          const b = Math.sin(this.time * 1.8 + t.phase) * 0.016;
          sx *= 1 + b;
          sy *= 1 - b * 0.85;
        } else if (t.kind === 'Tree' && wind) {
          skew = Math.sin(this.time * 1.25 + t.phase) * 0.025;
        } else if (t.kind === 'Carrot' && wind) {
          skew = Math.sin(this.time * 2.4 + t.phase) * 0.022;
        } else if (t.kind === 'Sunflower') {
          skew = Math.sin(this.time * 1.3 + t.phase) * 0.024;
        } else if (t.kind === 'Apple') {
          const w = Math.sin(this.time * 3 + t.phase) * 0.5 + 0.5;
          const p = 1 + w * 0.06;
          sx *= p;
          sy *= p;
          bobY = -w * 2.2;
        }
      }
      s.scale.set(sx, sy);
      s.skew.x = skew;
      s.rotation = t.rot;
      s.alpha = t.alpha;
      s.position.set(t.px + t.ox, t.py + t.oy + bobY);
      // Infección: pulso violeta tenue y una burbuja cada 1.2 s.
      if (t.infected) {
        s.tint = mixColor(t.tint, C.weirdLight, 0.12 + Math.sin(this.time * 3 + t.phase) * 0.08);
        if (this.time >= t.nextSpore) {
          t.nextSpore = this.time + 1.2;
          if (this.lod !== 'LOW') this.burst(t.px + (t.phase % 1) * 16 - 8, t.py - 4, 1, 'fx_bubble', C.weirdLight, { speed: 18, gravity: -40, life: 900, additive: true, scale: [0.35, 0.6] });
        }
      } else {
        s.tint = t.tint;
      }
    }
  }

  // ---------------------------------------------------------------- eventos

  private handleEvent(event: SimEvent): void {
    if (this.gridW === 0 || event.x >= this.gridW || event.y >= this.gridH || event.x < 0 || event.y < 0) return;
    const t = this.tiles[event.y * this.gridW + event.x];
    if (t) t.dirty = true;
    const c = tileCenter(event.x, event.y);
    const low = this.lod === 'LOW';
    switch (event.kind) {
      case 'flip': {
        // La pirueta se ve incluso con LOD LOW (doc 08 §6).
        const view = this.drones.get(event.droneId);
        if (view) view.flipAt = this.time;
        else this.pendingFlips.set(event.droneId, this.time);
        break;
      }
      case 'spawn':
        this.pendingSpawns.set(event.droneId, this.time);
        if (!low) {
          this.shockwave(c.x, c.y - HOVER_PX * 0.5, C.amber, 1.1, 300);
          this.burst(c.x, c.y - HOVER_PX * 0.5, 5, 'fx_spark', C.amber, { speed: 110, gravity: 160, life: 300, additive: true, scale: [0.5, 0.12], drag: 0.8 });
        }
        break;
      case 'clear':
        for (const tile of this.tiles) tile.dirty = true;
        if (!low) this.shockwave(c.x, c.y, C.dust, 2.4, 420);
        break;
      case 'harvest':
        this.onHarvest(t, event.mature, event.items);
        break;
      case 'till':
        this.onTill(event.x, event.y, event.ground === 'Soil');
        break;
      case 'plant':
        if (!low) this.burst(c.x, c.y, 4, 'fx_dust', C.dust, { speed: 40, gravity: 60, life: 380, scale: [0.35, 0.6] });
        break;
      case 'water':
        if (!low) {
          for (let k = 0; k < 6; k++) {
            const a = -Math.PI / 2 + (k / 5 - 0.5) * 2.2;
            this.particles.spawn({ texture: this.tex('fx_bubble'), x: c.x, y: c.y - 6, vx: Math.cos(a) * 70, vy: Math.sin(a) * 90, gravity: 360, lifeMs: 240 + k * 10, startScale: 0.45, endScale: 0.25, tint: C.water, drag: 0.6 });
          }
          this.shockwave(c.x, c.y + 2, C.water, 0.9, 260);
        }
        break;
      case 'fertilize':
        if (t.sprite) {
          this.tween(300, (k) => {
            const wave = Math.sin(k * Math.PI) * 0.16;
            t.ax = 1 + wave;
            t.ay = 1 + wave * 1.15;
          });
        }
        if (!low) {
          for (let k = 0; k < 5; k++) {
            this.particles.spawn({ texture: this.tex('fx_bubble'), x: c.x + (k - 2) * 6, y: c.y - 6, vx: (k - 2) * 6, vy: -50 - k * 6, gravity: -10, lifeMs: 300 + k * 30, startScale: 0.35, endScale: 0.15, tint: k % 2 ? C.green : C.weirdLight, additive: true });
          }
          this.flash(c.x, c.y - 16, 220, C.weirdLight, 0.85);
        }
        break;
      case 'unlock':
        if (!low) {
          this.shockwave(c.x, c.y - HOVER_PX * 0.45, C.gold, 1.5, 380);
          this.burst(c.x, c.y - HOVER_PX * 0.6, 10, 'fx_spark', C.gold, { speed: 140, gravity: 180, life: 480, additive: true, scale: [0.6, 0.12], drag: 1.2 });
        }
        break;
      case 'swap': {
        this.pendingSwaps.push({ x: event.x, y: event.y, toX: event.toX, toY: event.toY });
        const other = this.tiles[event.toY * this.gridW + event.toX];
        if (other) other.dirty = true;
        break;
      }
      case 'pumpkin':
        if (event.mega >= 2) {
          // Destello claro de las N × N casillas antes de fundirse.
          const corner = this.megaCorner(event.x, event.y, event.mega);
          for (let dy = 0; dy < event.mega; dy++) {
            for (let dx = 0; dx < event.mega; dx++) {
              const cc = tileCenter(corner.x + dx, corner.y + dy);
              this.flash(cc.x, cc.y - 18, 110, 0xfff0c0, 1.0);
            }
          }
          this.pendingMegas.push(corner);
        } else if (event.dead && !low) {
          this.burst(c.x, c.y - 10, 4, 'fx_dust', C.dustGrey, { speed: 30, gravity: -20, life: 500, scale: [0.4, 0.7] });
        }
        break;
      case 'maze':
        if (event.phase === 'start') {
          this.mazeOrigin = { x: event.x, y: event.y, at: this.time };
          this.shockwave(c.x, c.y);
        } else if (event.phase === 'recycle') {
          this.shockwave(c.x, c.y);
          this.dematerialize(t);
        } else if (event.phase === 'relocated') {
          this.relocated = { x: event.x, y: event.y };
          if (!low) this.spiral(c.x, c.y - 20, [C.gold, C.weirdLight]);
        } else if (event.phase === 'end') {
          this.mazeOrigin = null;
        }
        break;
      case 'dino':
        if (event.phase === 'start') {
          this.burst(c.x, c.y - HOVER_PX * 0.5, 6, 'fx_dust', C.steam, { speed: 60, gravity: -30, life: 180 + 200, scale: [0.6, 1.1] });
          this.burst(c.x, c.y - HOVER_PX * 0.5, 4, 'fx_spark', C.amber, { speed: 120, gravity: 200, life: 220, additive: true, scale: [0.5, 0.2] });
        } else if (event.phase === 'eat') {
          this.burst(c.x, c.y - 10, 4, 'fx_bubble', C.apple, { speed: 70, gravity: 220, life: 300, scale: [0.45, 0.2] });
        } else if (event.phase === 'end') {
          this.disintegrateTail();
        }
        break;
      case 'hat': {
        const view = this.drones.get(event.droneId);
        if (view && !low) this.burst(view.root.x, view.root.y - HOVER_PX - 20, 6, 'fx_dust', 0xf2ece4, { speed: 50, gravity: -10, life: 300, scale: [0.4, 0.8], sky: true });
        break;
      }
      case 'pet':
        if (this.pet) {
          this.pet.visit = { droneId: event.droneId, x: event.x, y: event.y, start: this.time, end: this.time + 2.4 };
        }
        break;
      case 'print':
        this.addLabel(event.droneId, event.text);
        break;
      default:
        break;
    }
  }

  private megaCorner(x: number, y: number, size: number): { x: number; y: number } {
    // El evento llega desde la casilla que maduró; la esquina Sur-Oeste del bloque se lee del snapshot.
    const snap = liveSnapshot.current;
    if (snap) {
      const { mega } = snap.tiles;
      for (let cy = Math.max(0, y - size + 1); cy <= y; cy++) {
        for (let cx = Math.max(0, x - size + 1); cx <= x; cx++) {
          if (mega[cy * this.gridW + cx] === size) return { x: cx, y: cy };
        }
      }
    }
    return { x, y };
  }

  private onHarvest(t: TileView, mature: boolean, items: Record<string, number>): void {
    const c = tileCenter(t.x, t.y);
    const low = this.lod === 'LOW';
    const kind = t.kind;
    if (kind === 'Treasure') {
      // Se abre el cofre con rebote elástico y lanza oro hacia el HUD.
      const open = this.pooled('treasure_open');
      open.position.set(c.x, c.y);
      open.zIndex = depthOf(t.x, t.y) + 0.15;
      this.entities.addChild(open);
      this.tween(
        700,
        (k) => {
          if (open.destroyed) return;
          const pop = k < 0.25 ? easeOutBack(k / 0.25) : 1;
          open.scale.set(0.85 + 0.15 * pop, 0.8 + 0.2 * pop);
          open.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        },
        {
          done: () => this.recycle(open),
        },
      );
      if (!low) {
        this.flash(c.x, c.y - 22, 280, C.gold, 1.5);
        this.burst(c.x, c.y - 24, 10, 'fx_spark', C.gold, { speed: 140, gravity: 260, life: 420, additive: true, scale: [0.6, 0.2], drag: 0.9 });
      }
    } else if (kind === 'Cactus') {
      this.cactusHarvest = { x: t.x, y: t.y };
    } else if (t.sprite && kind) {
      this.exitAnimation(t, kind, mature);
    }
    if (!mature) {
      if (!low) this.burst(c.x, c.y - 8, kind === 'Dead_Pumpkin' ? 5 : 4, 'fx_dust', kind === 'Dead_Pumpkin' ? C.dustGrey : C.dust, { speed: 45, gravity: 40, life: 420, scale: [0.4, 0.75], drag: 1.1 });
      return;
    }
    if (!low) {
      const sparks = this.lod === 'MEDIUM' ? 1 : 4;
      this.burst(c.x, c.y - 16, sparks, 'fx_spark', C.amber, { speed: 120, gravity: 240, life: 220, additive: true, scale: [0.5, 0.15], drag: 0.8 });
    }
    // Vuelo al HUD: con LOD MEDIUM, un ícono cada 3 cosechas; con LOW, ninguno.
    this.harvestCount++;
    if (low || (this.lod === 'MEDIUM' && this.harvestCount % 3 !== 0)) return;
    const entries = Object.entries(items).filter(([, amount]) => amount > 0);
    let emitted = 0;
    for (const [item, amount] of entries) {
      const count = this.lod === 'HIGH' ? (amount >= 10 ? 3 : amount >= 3 ? 2 : 1) : 1;
      for (let j = 0; j < count && emitted < 3; j++) {
        this.spawnFlyer(item, c.x + (emitted - 1) * 12, c.y - 30 - j * 6, emitted * 55);
        emitted++;
      }
    }
  }

  /** Animación de salida de cada cultivo al cosecharlo (doc 08 §4). */
  private exitAnimation(t: TileView, kind: EntityKind, mature: boolean): void {
    const ghost = t.sprite;
    if (!ghost) return;
    t.sprite = null;
    t.texName = '';
    t.kind = null;
    const c = tileCenter(t.x, t.y);
    const low = this.lod === 'LOW';
    const sx = ghost.scale.x;
    const sy = ghost.scale.y;
    const done = () => this.recycle(ghost);
    if (!mature) {
      this.tween(160, (k) => {
        if (!ghost.destroyed) ghost.alpha = 1 - k;
      }, { done });
      return;
    }
    switch (kind) {
      case 'Grass':
        ghost.scale.y = 0.25 * sy;
        this.tween(160, (k) => {
          if (!ghost.destroyed) ghost.alpha = 1 - k;
        }, { done });
        if (!low) this.burst(c.x, c.y - 10, 4, 'fx_leaf', C.grass, { speed: 70, gravity: 260, life: 420, scale: [0.6, 0.4], spin: 8, drag: 0.6 });
        break;
      case 'Bush':
        this.tween(
          100,
          (k) => {
            if (!ghost.destroyed) ghost.x = c.x + Math.sin(k * Math.PI * 4) * 2.5;
          },
          {
            done: () =>
              this.tween(140, (k) => {
                if (!ghost.destroyed) ghost.alpha = 1 - k;
              }, { done }),
          },
        );
        if (!low) this.burst(c.x, c.y - 18, 5, 'fx_leaf', C.leafDry, { speed: 80, gravity: 200, life: 500, scale: [0.6, 0.4], spin: 6, drag: 0.7 });
        break;
      case 'Tree':
        this.tween(
          180,
          (k) => {
            if (ghost.destroyed) return;
            ghost.rotation = ((15 * Math.PI) / 180) * easeOutQuad(k);
            ghost.alpha = 1 - k;
          },
          { done },
        );
        if (!low) this.burst(c.x, c.y - 30, 5, 'fx_splinter', C.splinter, { speed: 90, gravity: 260, life: 450, scale: [0.7, 0.5], spin: 10, drag: 0.5 });
        break;
      case 'Carrot':
        if (!low) this.burst(c.x, c.y - 4, 3, 'fx_dust', C.dust, { speed: 55, gravity: 160, life: 320, scale: [0.35, 0.6], drag: 1.0 });
        this.tween(
          120,
          (k) => {
            if (ghost.destroyed) return;
            const e = easeOutQuad(k);
            ghost.y = c.y - 14 * e;
            ghost.scale.set(sx * (1 - 0.14 * e), sy * (1 + 0.18 * e));
          },
          {
            done: () =>
              this.tween(120, (k) => {
                if (!ghost.destroyed) ghost.alpha = 1 - k;
              }, { done }),
          },
        );
        break;
      case 'Pumpkin':
      case 'Sunflower':
        if (kind === 'Sunflower' && !low) {
          this.flash(c.x - 8, c.y - 52, 260, C.gold, 1.6);
          this.burst(c.x - 6, c.y - 46, 4, 'fx_spark', C.gold, { speed: 85, gravity: -50, life: 400, additive: true, scale: [0.5, 0.12], drag: 0.9 });
        }
        this.tween(
          200,
          (k) => {
            if (ghost.destroyed) return;
            ghost.scale.set(sx * (1 + k * 0.2), sy * (1 - k * 0.3));
            ghost.alpha = 1 - k;
          },
          { done },
        );
        break;
      default:
        this.tween(160, (k) => {
          if (!ghost.destroyed) ghost.alpha = 1 - k;
        }, { done });
    }
  }

  private ghostPop(t: TileView, delay: number): void {
    const ghost = t.sprite;
    if (!ghost) return;
    const sx = ghost.scale.x;
    const sy = ghost.scale.y;
    const c = tileCenter(t.x, t.y);
    this.tween(
      140,
      (k) => {
        if (ghost.destroyed) return;
        const s = 1 + Math.sin(k * Math.PI) * 0.25;
        ghost.scale.set(sx * s, sy * s * (1 - k * 0.5));
        ghost.alpha = 1 - k;
      },
      {
        delay,
        done: () => {
          this.recycle(ghost);
          if (this.lod === 'HIGH') this.burst(c.x, c.y - 20, 2, 'fx_spark', C.green, { speed: 80, gravity: 200, life: 220, additive: true, scale: [0.4, 0.1] });
        },
      },
    );
  }

  private ghostFade(t: TileView, dur: number): void {
    const ghost = t.sprite;
    if (!ghost) return;
    this.tween(
      dur,
      (k) => {
        if (!ghost.destroyed) ghost.alpha = 1 - k;
      },
      {
        done: () => this.recycle(ghost),
      },
    );
  }

  private onTill(x: number, y: number, toSoil: boolean): void {
    const c = tileCenter(x, y);
    // Pulso de compresión con conservación de volumen sobre la capa cacheada.
    const plate = this.pooled(toSoil ? 'tile_soil' : 'tile_grassland');
    plate.position.set(c.x, c.y);
    this.waterLayer.addChild(plate);
    this.tween(
      160,
      (k) => {
        if (plate.destroyed) return;
        const e = easeOutQuad(k);
        plate.scale.set(lerp(1.06, 1, e), lerp(0.88, 1, e));
      },
      {
        done: () => this.recycle(plate),
      },
    );
    if (this.lod === 'LOW') return;
    this.burst(c.x, c.y, 6, 'fx_dust', C.dust, { speed: 60, gravity: 80, life: 420, scale: [0.45, 0.8], drag: 1.0 });
    this.burst(c.x, c.y - 4, 2, 'fx_spark', 0xf2ece4, { speed: 120, gravity: 300, life: 200, additive: true, scale: [0.4, 0.15], drag: 0.7 });
  }

  private animateSwap(s: { x: number; y: number; toX: number; toY: number }): void {
    const a = this.tiles[s.y * this.gridW + s.x];
    const b = this.tiles[s.toY * this.gridW + s.toX];
    if (!a || !b) return;
    const ca = tileCenter(a.x, a.y);
    const cb = tileCenter(b.x, b.y);
    // Cada contenido llega desde la casilla de la otra con un arco corto (120 ms).
    const run = (t: TileView, from: { x: number; y: number }, to: { x: number; y: number }) => {
      this.tween(120, (k) => {
        const e = easeOutQuad(k);
        t.ox = (from.x - to.x) * (1 - e);
        t.oy = (from.y - to.y) * (1 - e) - Math.sin(k * Math.PI) * 12;
      });
    };
    run(a, cb, ca);
    run(b, ca, cb);
  }

  private dematerialize(t: TileView): void {
    const c = tileCenter(t.x, t.y);
    const ghost = this.pooled('treasure_closed');
    ghost.position.set(c.x, c.y);
    ghost.zIndex = depthOf(t.x, t.y) + 0.15;
    this.entities.addChild(ghost);
    this.tween(
      450,
      (k) => {
        if (ghost.destroyed) return;
        ghost.alpha = 1 - k;
        ghost.scale.set(1 - k * 0.3, 1 + k * 0.2);
      },
      {
        done: () => this.recycle(ghost),
      },
    );
    if (this.lod !== 'LOW') this.spiral(c.x, c.y - 20, [C.weirdLight, C.gold]);
  }

  private disintegrateTail(): void {
    this.tail.forEach((seg, i) => {
      const sy0 = seg.scale.y || 1;
      this.tween(
        160,
        (k) => {
          if (seg.destroyed) return;
          seg.alpha = 1 - k;
          seg.scale.y = sy0 * (1 - k * 0.45);
        },
        {
          delay: i * 40,
          done: () => {
            if (!seg.destroyed) {
              if (this.lod !== 'LOW') this.burst(seg.x, seg.y - 14, 3, 'fx_dust', C.dustGrey, { speed: 50, gravity: 60, life: 380, scale: [0.4, 0.7], drag: 0.9 });
              if (i < 3) this.spawnFlyer('Bone', seg.x, seg.y - 20, 0);
              this.recycle(seg);
            }
          },
        },
      );
    });
    this.tail = [];
  }

  // ---------------------------------------------------------------- efectos

  private burst(
    x: number,
    y: number,
    count: number,
    texture: string,
    tint: number,
    opt: { speed: number; gravity: number; life: number; scale: [number, number]; additive?: boolean; spin?: number; drag?: number; sky?: boolean },
  ): void {
    // Las chispas de los voladores viven en el cielo (sus coordenadas); las de las casillas, en la granja.
    const pool = opt.sky ? this.skyParticles : this.particles;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / count - 0.5) * Math.PI * 1.3 + Math.sin(this.time * 13 + i) * 0.2;
      const v = opt.speed * (0.7 + ((i * 37) % 10) / 20);
      pool.spawn({
        texture: this.tex(texture),
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: opt.gravity,
        drag: opt.drag ?? 0,
        lifeMs: opt.life * (0.85 + ((i * 53) % 10) / 33),
        startScale: opt.scale[0],
        endScale: opt.scale[1],
        tint,
        additive: opt.additive,
        spin: opt.spin ? opt.spin * (i % 2 ? 1 : -1) : 0,
        rotation: i * 1.3,
      });
    }
  }

  /** Destello aditivo breve (fx_glow). */
  private flash(x: number, y: number, dur: number, tint: number, scale: number): void {
    const s = this.pooled('fx_glow');
    s.blendMode = 'add';
    s.tint = tint;
    s.position.set(x, y);
    s.scale.set(scale);
    this.fieldFx.addChild(s);
    this.tween(
      dur,
      (k) => {
        if (!s.destroyed) s.alpha = Math.sin(k * Math.PI);
      },
      {
        done: () => this.recycle(s),
      },
    );
  }

  /** Onda expansiva aditiva (Weird_Substance, agua, desbloqueos; doc 08 §3). */
  private shockwave(x: number, y: number, tint = C.weird, maxScale = 1.4, dur = 280): void {
    const s = this.pooled('fx_glow');
    s.blendMode = 'add';
    s.tint = tint;
    s.position.set(x, y);
    this.fieldFx.addChild(s);
    this.tween(
      dur,
      (k) => {
        if (s.destroyed) return;
        const sc = lerp(0.2, maxScale, easeOutQuad(k));
        s.scale.set(sc * 2, sc);
        s.alpha = lerp(0.85, 0, k);
      },
      {
        done: () => this.recycle(s),
      },
    );
  }

  private spiral(x: number, y: number, colors: number[]): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.particles.spawn({
        texture: this.tex('fx_spark'),
        x: x + Math.cos(a) * 18,
        y: y + Math.sin(a) * 9,
        vx: -Math.sin(a) * 60,
        vy: Math.cos(a) * 30 - 30,
        gravity: -20,
        lifeMs: 500,
        startScale: 0.5,
        endScale: 0.1,
        tint: colors[i % colors.length],
        additive: true,
      });
    }
  }

  private spawnFlyer(item: string, x: number, y: number, delay: number): void {
    const name = ITEM_SPRITES[item];
    if (!name || this.flyers.length > 24) return;
    const target = this.callbacks.getItemTarget?.(item);
    if (!target) return;
    const sprite = this.pooled(name);
    sprite.anchor.set(0.5);
    // (x, y) es un punto de la granja: se suma su posición para pasarlo a pantalla.
    const from = { x: this.panX + (x + this.fieldX) * this.zoom, y: this.panY + (y + this.fieldY) * this.zoom };
    sprite.position.set(from.x, from.y);
    sprite.scale.set(0.55);
    sprite.visible = delay <= 0;
    this.overlay.addChild(sprite);
    const bend = ((this.flyers.length % 3) - 1) * 36;
    const lift = 80 + (this.flyers.length % 3) * 16;
    this.flyers.push({
      sprite,
      fromX: from.x,
      fromY: from.y,
      ctrlX: (from.x + target.x) / 2 + bend,
      ctrlY: Math.min(from.y, target.y) - lift,
      toX: target.x,
      toY: target.y,
      t: -delay / FLYER_MS,
      spin: (this.flyers.length % 2 ? 1 : -1) * 0.35,
      item,
    });
  }

  private updateFlyers(dtMs: number): void {
    this.flyers = this.flyers.filter((f) => {
      f.t += dtMs / FLYER_MS;
      if (f.t < 0) return true;
      f.sprite.visible = true;
      if (f.t >= 1) {
        this.recycle(f.sprite);
        this.callbacks.onItemArrived?.(f.item);
        return false;
      }
      const k = 0.22 * easeOutQuad(f.t) + 0.78 * easeInCubic(f.t);
      const u = 1 - k;
      f.sprite.x = u * u * f.fromX + 2 * u * k * f.ctrlX + k * k * f.toX;
      f.sprite.y = u * u * f.fromY + 2 * u * k * f.ctrlY + k * k * f.toY;
      const intro = f.t < 0.16 ? easeOutBack(f.t / 0.16) : 1;
      f.sprite.scale.set((0.58 - 0.18 * k) * intro);
      f.sprite.rotation = Math.sin(f.t * Math.PI) * f.spin;
      return true;
    });
  }

  private addLabel(droneId: number, text: string): void {
    const view = this.drones.get(droneId);
    if (!view) return;
    const snap = liveSnapshot.current;
    const tps = snap && snap.ticksPerSecond > 0 ? snap.ticksPerSecond : 400;
    const label = new Text({
      text: text.length > 48 ? text.slice(0, 47) + '…' : text,
      style: {
        fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
        fontSize: 14,
        fontWeight: '700',
        fill: C.amber,
        stroke: { color: 0x1e1916, width: 4, join: 'round' },
      },
    });
    label.anchor.set(0.5, 1);
    label.resolution = 2;
    this.labelLayer.addChild(label);
    this.labels.push({ text: label, wx: view.root.x, wy: view.root.y - HOVER_PX - 46, age: 0, dur: Math.max(0.4, Math.min(2.5, 200 / tps)) });
    if (this.labels.length > 6) this.labels.shift()?.text.destroy();
  }

  private updateLabels(dt: number): void {
    this.labels = this.labels.filter((l) => {
      l.age += dt;
      if (l.age >= l.dur) {
        l.text.destroy();
        return false;
      }
      const p = l.age / l.dur;
      l.text.position.set(l.wx, l.wy - 26 * easeOutQuad(p));
      l.text.alpha = p < 0.1 ? p / 0.1 : p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
      const intro = l.age < 0.14 ? easeOutBack(l.age / 0.14) : 1;
      l.text.scale.set(intro / this.zoom);
      return true;
    });
  }

  // ---------------------------------------------------------------- drones

  private estimateTick(snap: RenderSnapshot): number {
    if (snap.runState !== 'running' || snap.ticksPerSecond <= 0) return snap.tick;
    const elapsed = (performance.now() - liveSnapshot.receivedAt) / 1000;
    return snap.tick + Math.min(elapsed, 0.1) * snap.ticksPerSecond;
  }

  /** Dónde nace la vista de un dron: sobre su casilla, en la posición actual de la granja. */
  private newFlyer(d: DroneSnapshot, attached: boolean): FreeFlight {
    return new FreeFlight(this.fieldX + isoX(d.x + 0.5, d.y + 0.5), this.fieldY + isoY(d.x + 0.5, d.y + 0.5), attached);
  }

  private createDrone(d: DroneSnapshot, attached: boolean): DroneView {
    const reused = this.dronePool.pop();
    if (reused) {
      this.resetDrone(reused, d, attached);
      return reused;
    }
    const root = new Container();
    const body = new Container();
    const shadow = this.sprite('fx_shadow');
    shadow.alpha = SHADOW_ALPHA;
    this.shadowLayer.addChild(shadow);
    const rotorL = this.sprite('drone_rotor_a');
    const rotorR = this.sprite('drone_rotor_a');
    rotorL.position.set(-34, -2);
    rotorR.position.set(34, -2);
    rotorR.scale.x = -1;
    const arm = this.sprite('drone_arm');
    arm.position.set(-2, 18);
    const bodySprite = this.sprite('drone_body');
    const hat = this.sprite(this.hatTexture(d.hat));
    hat.position.set(0, -24);
    body.addChild(arm, rotorL, rotorR, bodySprite, hat);
    body.y = -HOVER_PX;
    const dino = this.sprite('dino_head');
    dino.visible = false;
    root.addChild(body, dino);
    this.droneLayer.addChild(root);
    return {
      root,
      body,
      shadow,
      bodySprite,
      rotorL,
      rotorR,
      arm,
      hat,
      hatName: d.hat,
      hatScale: 1,
      hatVersion: 0,
      dino,
      tilt: 0,
      tiltV: 0,
      rotorClock: 0,
      rotorFrame: 0,
      actionKey: '',
      armClock: 1,
      nextPowerSpark: 0,
      lastX: d.x,
      lastY: d.y,
      fade: 1,
      facing: 'W',
      flipAt: null,
      spawnAt: null,
      flyer: this.newFlyer(d, attached),
      wrapping: false,
      hold: null,
    };
  }

  /** Reutiliza una vista de dron del pool para otro dron (Megafarm crea y retira hijos sin parar). */
  private resetDrone(view: DroneView, d: DroneSnapshot, attached: boolean): void {
    // Invalida cualquier tween de sombrero pendiente del dueño anterior.
    view.hatVersion++;
    view.hatName = d.hat;
    view.hatScale = 1;
    this.setTex(view.hat, this.hatTexture(d.hat));
    this.setTex(view.rotorL, 'drone_rotor_a');
    this.setTex(view.rotorR, 'drone_rotor_a');
    view.tilt = 0;
    view.tiltV = 0;
    view.rotorClock = 0;
    view.rotorFrame = 0;
    view.actionKey = '';
    view.armClock = 1;
    view.nextPowerSpark = 0;
    view.lastX = d.x;
    view.lastY = d.y;
    view.fade = 1;
    view.facing = 'W';
    view.flipAt = null;
    view.spawnAt = null;
    view.flyer = this.newFlyer(d, attached);
    view.wrapping = false;
    view.hold = null;
    view.root.alpha = 1;
    view.root.scale.set(1);
    view.body.visible = true;
    view.body.rotation = 0;
    view.body.y = -HOVER_PX;
    view.arm.rotation = 0;
    view.dino.visible = false;
    view.dino.rotation = 0;
    view.dino.y = 0;
    view.shadow.visible = true;
    view.shadow.alpha = SHADOW_ALPHA;
    view.shadow.scale.set(1);
    this.droneLayer.addChild(view.root);
    this.shadowLayer.addChild(view.shadow);
  }

  private releaseDrone(view: DroneView): void {
    view.hatVersion++;
    if (this.lod !== 'LOW' && view.root.alpha > 0.05) {
      this.burst(view.root.x, view.root.y - HOVER_PX + 6, 5, 'fx_dust', C.steam, { speed: 50, gravity: -30, life: 360, scale: [0.45, 0.9], drag: 0.9, sky: true });
    }
    view.root.removeFromParent();
    view.shadow.removeFromParent();
    if (this.dronePool.length < MAX_POOLED_DRONES) {
      this.dronePool.push(view);
    } else {
      view.root.destroy({ children: true });
      view.shadow.destroy();
    }
  }

  private hatTexture(hat: string): string {
    const name = `hat_${hat}`;
    return this.atlas?.has(name) ? name : 'hat_Farmer_Cap';
  }

  private updateDrones(snap: RenderSnapshot, dt: number): void {
    const estimated = this.estimateTick(snap);
    const w = this.gridW;
    const h = this.gridH;
    const seen = this.seenDrones;
    seen.clear();
    const stepDt = Math.min(dt, 0.033);
    const runActive = snap.runState === 'running' || snap.runState === 'paused';
    const fieldDx = this.fieldX - this.lastFieldX;
    const fieldDy = this.fieldY - this.lastFieldY;
    for (const [id, at] of this.pendingFlips) if (this.time - at > 2) this.pendingFlips.delete(id);
    for (const [id, at] of this.pendingSpawns) if (this.time - at > 2) this.pendingSpawns.delete(id);
    for (const d of snap.drones) {
      seen.add(d.id);
      const alive = d.status === 'RUNNING' || d.status === 'WAITING';
      const dinoMode = d.hat === 'Dinosaur_Hat';
      // Trabaja sobre la granja mientras su script corre; el dinosaurio camina sobre ella siempre.
      const attached = dinoMode || (runActive && alive);
      let view = this.drones.get(d.id);
      if (!view) {
        view = this.createDrone(d, attached);
        this.drones.set(d.id, view);
        const flipAt = this.pendingFlips.get(d.id);
        if (flipAt !== undefined) {
          view.flipAt = flipAt;
          this.pendingFlips.delete(d.id);
        }
        const spawnAt = this.pendingSpawns.get(d.id);
        if (spawnAt !== undefined) {
          view.spawnAt = spawnAt;
          this.pendingSpawns.delete(d.id);
        }
      }
      let px = d.x;
      let py = d.y;
      let dirX = 0;
      let dirY = 0;
      let arm = 0;
      let actionDip = 0;
      let actionTilt = 0;
      const action = d.action;
      if (action) {
        const progress = clamp01((estimated - action.startTick) / Math.max(1, action.endTick - action.startTick));
        const durationMs = ((action.endTick - action.startTick) / Math.max(1, snap.ticksPerSecond)) * 1000;
        const fast = durationMs < 35;
        if (action.kind === 'move') {
          // Transición suave a velocidad normal; directa por debajo de 35 ms (doc 08 §1.2).
          const e = fast ? 1 : durationMs < 140 ? progress : 0.45 * progress + 0.55 * easeInOutCubic(progress);
          px = action.fromX + (action.toX - action.fromX) * e;
          py = action.fromY + (action.toY - action.fromY) * e;
          dirX = Math.sign(action.toX - action.fromX);
          dirY = Math.sign(action.toY - action.fromY);
        } else if (action.kind === 'harvest' || action.kind === 'plant' || action.kind === 'till' || action.kind === 'swap' || action.kind === 'use') {
          const key = `${action.kind}:${action.startTick}`;
          if (key !== view.actionKey) {
            view.actionKey = key;
            view.armClock = 0;
          }
          if (!fast) {
            const arc = Math.sin(progress * Math.PI);
            if (action.kind === 'harvest') {
              actionDip = arc * 8;
              actionTilt = Math.sin(progress * Math.PI * 2) * 0.055;
            } else if (action.kind === 'till') {
              actionDip = arc * 7 + Math.abs(Math.sin(progress * Math.PI * 4)) * 2.5;
            } else if (action.kind === 'plant') {
              actionDip = easeOutQuad(arc) * 6;
            } else if (action.kind === 'use') {
              actionDip = arc * 5;
              actionTilt = Math.sin(progress * Math.PI * 3) * 0.08;
            } else if (action.kind === 'swap') {
              actionDip = arc * 4;
              actionTilt = arc * 0.07;
            }
          }
        } else if (action.kind === 'unlock' && !fast) {
          actionDip = -Math.sin(progress * Math.PI) * 14;
        } else if (action.kind === 'pet' && !fast) {
          actionDip = -Math.abs(Math.sin(progress * Math.PI * 3)) * 6;
          actionTilt = Math.sin(progress * Math.PI * 6) * 0.09 * (1 - progress);
        }
      }
      // Brazo: baja +0.55 rad en 80 ms (easeOutQuad), suelta chispas en el punto bajo y vuelve.
      if (view.armClock < 0.16) {
        const before = view.armClock;
        view.armClock += dt;
        const k = view.armClock < 0.08 ? easeOutQuad(view.armClock / 0.08) : 1 - easeOutQuad(Math.min(1, (view.armClock - 0.08) / 0.08));
        arm = 0.55 * k;
        if (before < 0.08 && view.armClock >= 0.08 && this.lod !== 'LOW') {
          const n = this.lod === 'MEDIUM' ? 1 : 3 + (d.id % 3);
          this.burst(view.root.x - 8, view.root.y - HOVER_PX + 52 + actionDip, n, 'fx_spark', C.amber, { speed: 110, gravity: 260, life: 220, additive: true, scale: [0.45, 0.12], drag: 0.7, sky: true });
        }
      }
      // Salto de borde a borde (wrap-around): sin lerp y fundido rápido de 60 ms. Cualquier otro salto
      // (clear(), set_world_size(), el paso a otra granja) se hace volando hasta la casilla nueva.
      const jumped = Math.abs(d.x - view.lastX) > 1.5 || Math.abs(d.y - view.lastY) > 1.5;
      view.lastX = d.x;
      view.lastY = d.y;
      let teleport = false;
      if (jumped) {
        if (view.wrapping) view.fade = 0;
        else teleport = true;
        view.wrapping = false;
      }
      if (action?.kind === 'move') view.wrapping = action.toX < 0 || action.toY < 0 || action.toX >= w || action.toY >= h;
      else if (action) view.wrapping = false;
      view.fade = Math.min(1, view.fade + dt / 0.06);
      const outside = Math.max(0, -px, px - (w - 1), -py, py - (h - 1));
      let alpha = Math.min(view.fade, 1 - Math.min(1, outside));
      // spawn_drone: el hijo brota de la casilla del padre con un rebote corto.
      let spawnScale = 1;
      if (view.spawnAt !== null) {
        const u = ((this.time - view.spawnAt) * 1000) / SPAWN_MS;
        if (u >= 1) {
          view.spawnAt = null;
        } else {
          const k = clamp01(u);
          spawnScale = lerp(0.3, 1, easeOutBack(k));
          alpha *= clamp01(k * 1.6);
        }
      }
      // do_a_flip(): 1000 ms reales, giro completo 2π·easeInOutCubic(u) y salto −28·4u(1−u) px (doc 08 §2).
      let flipRot = 0;
      let flipY = 0;
      if (view.flipAt !== null) {
        const u = ((this.time - view.flipAt) * 1000) / FLIP_MS;
        if (u >= 1) {
          view.flipAt = null;
        } else {
          const k = clamp01(u);
          flipRot = 2 * Math.PI * easeInOutCubic(k);
          flipY = -FLIP_JUMP_PX * 4 * k * (1 - k);
        }
      }
      // Vuelo propio: sigue su casilla (más el desfase que deja arrastrar la granja) o flota libre.
      const flyer = view.flyer;
      flyer.update(
        {
          attached,
          tileX: this.fieldX + isoX(px + 0.5, py + 0.5),
          tileY: this.fieldY + isoY(px + 0.5, py + 0.5),
          fieldDx,
          fieldDy,
          teleport,
          rigid: dinoMode,
          hold: dinoMode ? null : view.hold,
        },
        dt,
      );
      const sx = flyer.gx;
      const sy = flyer.gy;
      view.root.position.set(sx, sy);
      view.root.scale.set(spawnScale);
      view.root.alpha = alpha;
      view.root.zIndex = sy;
      // Inclinación con amortiguación de resorte hacia el vector de movimiento en pantalla y hacia donde vuela.
      const screenDir = Math.sign(dirX - dirY);
      const flightTilt = this.reducedMotion ? 0 : Math.max(-0.3, Math.min(0.3, flyer.vx * 0.00045));
      const targetTilt = screenDir * TILT + flightTilt;
      view.tiltV += ((targetTilt - view.tilt) * 150 - view.tiltV * 18) * stepDt;
      view.tilt += view.tiltV * stepDt;

      const powered = snap.runState === 'running' && alive && snap.powered;

      // Flotación continua y hélices siempre girando (el dron siempre está volando).
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4 + d.id) * 3 + Math.sin(this.time * 8 + d.id * 1.7) * 0.6;
      const rotorPeriod = powered ? ROTOR_POWERED_FRAME_MS : ROTOR_FRAME_MS;
      view.rotorClock += dt * 1000;
      if (view.rotorClock >= rotorPeriod) {
        view.rotorClock %= rotorPeriod;
        view.rotorFrame ^= 1;
        const name = view.rotorFrame ? 'drone_rotor_b' : 'drone_rotor_a';
        this.setTex(view.rotorL, name);
        this.setTex(view.rotorR, name);
      }
      // Estela dorada sutil mientras Items.Power acelera al dron.
      if (powered && this.lod !== 'LOW' && this.time >= view.nextPowerSpark) {
        view.nextPowerSpark = this.time + (this.lod === 'HIGH' ? 0.09 : 0.22);
        this.skyParticles.spawn({
          texture: this.tex('fx_spark'),
          x: sx + (Math.random() - 0.5) * 20,
          y: sy - HOVER_PX + 10 + bob + actionDip,
          vx: -screenDir * 30 + (Math.random() - 0.5) * 24,
          vy: 16 + Math.random() * 18,
          gravity: -20,
          drag: 0.8,
          lifeMs: 320,
          startScale: 0.44,
          endScale: 0.06,
          tint: C.gold,
          additive: true,
        });
      }
      // Sombrero: el anterior encoge y el nuevo entra con easeOutBack (180 ms), protegido ante cambios rápidos.
      if (d.hat !== view.hatName) {
        const v = view;
        const next = d.hat;
        const version = ++v.hatVersion;
        v.hatName = next;
        this.tween(
          90,
          (k) => {
            if (v.hatVersion === version) v.hatScale = 1 - k;
          },
          {
            done: () => {
              if (v.hatVersion !== version || v.hat.destroyed) return;
              this.setTex(v.hat, this.hatTexture(next));
              this.tween(180, (k) => {
                if (v.hatVersion === version) v.hatScale = easeOutBack(k);
              });
            },
          },
        );
      }
      view.hat.scale.set(view.hatScale);
      view.arm.rotation = arm;
      view.body.visible = !dinoMode;
      view.dino.visible = dinoMode;
      if (dinoMode) {
        if (dirX < 0) view.facing = 'W';
        else if (dirX > 0) view.facing = 'E';
        else if (dirY < 0) view.facing = 'S';
        else if (dirY > 0) view.facing = 'N';
        // Oeste: cabeza tal cual; Sur: reflejada; Este: de espaldas; Norte: de espaldas reflejada.
        const back = view.facing === 'E' || view.facing === 'N';
        this.setTexIfNeeded(view.dino, back ? 'dino_head_back' : 'dino_head');
        view.dino.scale.set(view.facing === 'S' || view.facing === 'N' ? -1 : 1, 1);
        view.dino.rotation = flipRot;
        view.dino.y = flipY;
        view.shadow.visible = false;
      } else {
        const totalY = bob + actionDip + flipY;
        view.body.y = -HOVER_PX + totalY;
        view.body.rotation = view.tilt + actionTilt + flipRot;
        // La sombra cae sobre la granja solo si el dron vuela encima de ella (fuera, al vacío).
        const fx = sx - this.fieldX;
        const fy = sy - this.fieldY;
        view.shadow.visible = overBoard(fx, fy, w, h);
        view.shadow.position.set(fx, fy + 2);
        // Al acercarse al suelo (totalY > 0) la sombra se hace un poco más nítida y grande.
        const heightRatio = clamp01(1 - totalY / HOVER_PX);
        view.shadow.alpha = SHADOW_ALPHA * alpha * lerp(1.18, 0.85, heightRatio);
        view.shadow.scale.set(lerp(1.06, 0.86, heightRatio));
      }
    }
    for (const [id, view] of this.drones) {
      if (seen.has(id)) continue;
      this.releaseDrone(view);
      this.drones.delete(id);
    }
  }

  /** Cola del dinosaurio: cada segmento avanza hacia el precedente en sincronía con la cabeza. */
  private updateTail(snap: RenderSnapshot): void {
    const dino = snap.dino;
    if (!dino) {
      if (this.tail.length) {
        for (const s of this.tail) this.recycle(s);
        this.tail = [];
      }
      return;
    }
    const head = snap.drones.find((d) => d.id === dino.droneId);
    let headFrom: [number, number] | null = head ? [head.x, head.y] : null;
    let progress = 0;
    if (head?.action?.kind === 'move') {
      const estimated = this.estimateTick(snap);
      progress = clamp01((estimated - head.action.startTick) / Math.max(1, head.action.endTick - head.action.startTick));
      headFrom = [head.action.fromX, head.action.fromY];
    }
    while (this.tail.length < dino.tail.length) {
      const s = this.pooled('dino_segment');
      this.entities.addChild(s);
      this.tail.push(s);
    }
    while (this.tail.length > dino.tail.length) this.recycle(this.tail.pop());
    dino.tail.forEach(([tx, ty], i) => {
      const target = i === 0 ? headFrom : dino.tail[i - 1];
      const [nx, ny] = target ?? [tx, ty];
      const px = progress > 0 ? lerp(tx, nx, progress) : tx;
      const py = progress > 0 ? lerp(ty, ny, progress) : ty;
      const s = this.tail[i];
      const last = i === dino.tail.length - 1;
      // Dirección hacia el segmento precedente: a lo largo de x se dibuja tal cual, a lo largo de y reflejado.
      const alongY = Math.abs(ny - ty) > Math.abs(nx - tx);
      const towardViewer = alongY ? ny < ty : nx < tx;
      this.setTexIfNeeded(s, last ? (towardViewer ? 'dino_tail' : 'dino_tail_front') : 'dino_segment');
      s.scale.set(alongY ? -1 : 1, 1);
      s.rotation = Math.sin(this.time * 6 + i * Math.PI) * 0.04;
      s.position.set(isoX(px + 0.5, py + 0.5), isoY(px + 0.5, py + 0.5));
      s.zIndex = depthOf(px, py) + 0.05;
    });
  }

  // ---------------------------------------------------------------- mascota y fondo

  private createPet(): void {
    const sprite = this.sprite('pet_dog');
    const shadow = this.sprite('fx_shadow');
    shadow.alpha = SHADOW_ALPHA;
    shadow.scale.set(0.8);
    this.shadowLayer.addChild(shadow);
    this.droneLayer.addChild(sprite);
    this.pet = { sprite, shadow, gx: 0, gy: 0, z: 1.3, homeX: 0, homeY: 0, pathT: 0.6, ready: false, visit: null, squash: 0, hold: null };
  }

  /** Desplazamiento (coordenadas de cámara) del perro respecto al centro de su patrulla. */
  private petOrbit(pathT: number): { x: number; y: number } {
    const du = Math.cos(pathT) * (this.gridW / 2 + 1.1);
    const dv = Math.sin(pathT) * (this.gridH / 2 + 1.1);
    return { x: isoX(du, dv), y: isoY(du, dv) };
  }

  /**
   * Órbita sinusoidal lenta alrededor de su zona (al empezar, la isla); con pet_the_dog() vuela al
   * dron que lo llamó, esté donde esté, y rebota (doc 08 §2). Es libre: arrastrar la granja no lo mueve.
   */
  private updatePet(dt: number): void {
    const pet = this.pet;
    if (!pet || this.gridW === 0) return;
    const w = this.gridW;
    const h = this.gridH;
    if (!pet.ready) {
      pet.homeX = this.fieldX + isoX(w / 2, h / 2);
      pet.homeY = this.fieldY + isoY(w / 2, h / 2);
    }
    let tx: number;
    let ty: number;
    let tz: number;
    let happy = false;
    const visit = pet.visit;
    if (pet.hold) {
      tx = pet.hold.x;
      ty = pet.hold.y;
      tz = 1.55;
    } else if (visit && this.time < visit.end) {
      // Vuela hasta el dron (aunque esté lejos de la granja) y se pone a su lado.
      const flyer = this.drones.get(visit.droneId)?.flyer;
      const bx = flyer ? flyer.gx : this.fieldX + isoX(visit.x + 0.5, visit.y + 0.5);
      const by = flyer ? flyer.gy : this.fieldY + isoY(visit.x + 0.5, visit.y + 0.5);
      tx = bx + isoX(0.7, -0.3);
      ty = by + isoY(0.7, -0.3);
      tz = 0.95;
      if (this.time > visit.start + 0.55) happy = true;
    } else {
      if (visit) pet.visit = null;
      pet.pathT += dt * 0.25;
      const orbit = this.petOrbit(pet.pathT);
      tx = pet.homeX + orbit.x;
      ty = pet.homeY + orbit.y;
      tz = 1.35 + Math.sin(this.time * 1.7) * 0.08;
    }
    if (!pet.ready) {
      pet.gx = tx;
      pet.gy = ty;
      pet.z = tz;
      pet.ready = true;
    }
    const k = pet.hold ? 1 : Math.min(1, dt * (pet.visit ? 4 : 2.2));
    const prevSx = pet.gx;
    pet.gx += (tx - pet.gx) * k;
    pet.gy += (ty - pet.gy) * k;
    pet.z += (tz - pet.z) * Math.min(1, dt * 6);
    const sx = pet.gx;
    const sy = pet.gy;
    const vx = (sx - prevSx) / Math.max(dt, 1e-3);
    const dirSign = Math.abs(vx) > 4 ? (vx > 0 ? -1 : 1) : Math.sign(pet.sprite.scale.x || 1);
    pet.sprite.scale.x = dirSign * Math.abs(pet.sprite.scale.x || 1);
    const targetRot = this.reducedMotion ? 0 : Math.max(-0.14, Math.min(0.14, vx * 0.0007));
    pet.sprite.rotation += (targetRot - pet.sprite.rotation) * Math.min(1, dt * 8);
    // Dos rebotes rápidos (scaleY 0.8 → 1.2 → 1.0 en 400 ms con conservación de área) y chispas doradas.
    if (happy && visit && pet.squash === 0) {
      pet.squash = 1;
      const sp = pet.sprite;
      // Dos rebotes de 200 ms: 1 → 0.8 → 1.2 → 1.0.
      this.tween(
        400,
        (q) => {
          if (sp.destroyed) return;
          const u = (q * 2) % 1;
          const syScale = u < 1 / 3 ? lerp(1, 0.8, u * 3) : u < 2 / 3 ? lerp(0.8, 1.2, (u - 1 / 3) * 3) : lerp(1.2, 1, (u - 2 / 3) * 3);
          const sxMag = 1 / Math.sqrt(Math.max(0.5, syScale));
          sp.scale.set(Math.sign(sp.scale.x || 1) * sxMag, syScale);
        },
        {
          done: () => {
            if (!sp.destroyed) sp.scale.set(Math.sign(sp.scale.x || 1), 1);
          },
        },
      );
      this.burst(sx, sy - pet.z * HEIGHT_PX, 5, 'fx_spark', C.brass, { speed: 110, gravity: 160, life: 400, additive: true, scale: [0.55, 0.15], drag: 0.7, sky: true });
    }
    if (!pet.visit) pet.squash = 0;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3.3) * 3;
    pet.sprite.position.set(sx, sy - pet.z * HEIGHT_PX + bob);
    pet.sprite.zIndex = sy - 0.5;
    // Su sombra solo cae sobre la isla cuando vuela encima; fuera de ella no tiene dónde caer.
    const fx = sx - this.fieldX;
    const fy = sy - this.fieldY;
    pet.shadow.position.set(fx, fy + 2);
    pet.shadow.visible = overBoard(fx, fy, w, h);
  }

  /** Al soltar al perro sigue patrullando desde donde lo dejaron. */
  private releasePet(): void {
    const pet = this.pet;
    if (!pet?.hold) return;
    pet.hold = null;
    const orbit = this.petOrbit(pet.pathT);
    pet.homeX = pet.gx - orbit.x;
    pet.homeY = pet.gy - orbit.y;
  }

  /** Capa 0: motas de polvo lentas sobre el vacío atmosférico (el gradiente lo pinta el CSS). */
  private createMotes(): void {
    for (let i = 0; i < 18; i++) {
      const s = this.sprite('fx_dust');
      s.tint = 0x9fb5bf;
      s.alpha = 0.05 + (i % 5) * 0.015;
      s.scale.set(0.4 + (i % 4) * 0.25);
      s.position.set(((i * 397) % 1000) / 1000, ((i * 631) % 1000) / 1000);
      this.background.addChild(s);
      this.motes.push({ sprite: s, vx: 4 + (i % 3) * 3, vy: -2 - (i % 4) });
    }
    this.motesPlaced = false;
  }

  private updateMotes(dt: number): void {
    const show = this.lod === 'HIGH' && !this.reducedMotion;
    this.background.visible = show;
    if (!show || this.viewW === 0) return;
    if (!this.motesPlaced) {
      // Las posiciones iniciales eran fracciones de la vista.
      for (const m of this.motes) m.sprite.position.set(m.sprite.x * this.viewW, m.sprite.y * this.viewH);
      this.motesPlaced = true;
    }
    for (const m of this.motes) {
      const s = m.sprite;
      s.x = (s.x + m.vx * dt + this.viewW + 40) % (this.viewW + 40);
      s.y = (s.y + m.vy * dt + this.viewH + 40) % (this.viewH + 40);
    }
  }

  // ---------------------------------------------------------------- cámara y entrada

  /** Rectángulo en coordenadas de cámara: la plataforma (donde esté), sus bordes, alturas y la patrulla del perro. */
  private contentBounds(fieldX: number, fieldY: number): { x0: number; y0: number; x1: number; y1: number } {
    const b = boardBounds(this.gridW, this.gridH);
    return { x0: b.x0 - 150 + fieldX, y0: b.y0 - 200 + fieldY, x1: b.x1 + 150 + fieldX, y1: b.y1 + 110 + fieldY };
  }

  /** Zoom y paneo que encuadran la granja en `fieldX, fieldY` dentro del hueco libre de ventanas. */
  private computeFit(fieldX: number, fieldY: number): { zoom: number; panX: number; panY: number } | null {
    if (this.gridW === 0 || this.viewW === 0 || this.viewH === 0) return null;
    const insets = this.callbacks.getFitInsets?.() ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const availW = Math.max(120, this.viewW - insets.left - insets.right);
    const availH = Math.max(120, this.viewH - insets.top - insets.bottom);
    const b = this.contentBounds(fieldX, fieldY);
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    let z = Math.min((availW * 0.94) / bw, (availH * 0.94) / bh);
    z = Math.max(MIN_ZOOM, Math.min(z, MAX_FIT_ZOOM));
    return { zoom: z, panX: insets.left + (availW - bw * z) / 2 - b.x0 * z, panY: insets.top + (availH - bh * z) / 2 - b.y0 * z };
  }

  private fit(): void {
    const target = this.computeFit(this.fieldX, this.fieldY);
    if (!target) return;
    this.viewTween = null;
    this.zoom = target.zoom;
    this.panX = target.panX;
    this.panY = target.panY;
    this.scheduleRecache();
  }

  /** Pantalla → coordenadas de cámara (las de los voladores). */
  private toCamera(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }

  private pick(sx: number, sy: number, clientX: number, clientY: number): HoverTile | null {
    if (this.gridW === 0) return null;
    const c = this.toCamera(sx, sy);
    const t = pickTile(c.x - this.fieldX, c.y - this.fieldY);
    if (t.x < 0 || t.y < 0 || t.x >= this.gridW || t.y >= this.gridH) return null;
    return { x: t.x, y: t.y, clientX, clientY };
  }

  /** ¿Qué hay bajo el puntero? El perro o un dron (si se agarran) y, si no, la granja. */
  private hitTarget(sx: number, sy: number): DragTarget {
    const inside = (target: Container, pad: number) => {
      const b = target.getBounds();
      return sx >= b.minX - pad && sx <= b.maxX + pad && sy >= b.minY - pad && sy <= b.maxY + pad;
    };
    if (this.pet?.ready && this.pet.sprite.visible && inside(this.pet.sprite, 4)) return { kind: 'pet' };
    // El de delante (más abajo en pantalla) primero.
    let best: { id: number; y: number } | null = null;
    for (const [id, view] of this.drones) {
      if (!view.body.visible || view.root.alpha < 0.2 || !inside(view.body, 2)) continue;
      if (!best || view.root.y > best.y) best = { id, y: view.root.y };
    }
    return best ? { kind: 'drone', id: best.id } : { kind: 'field' };
  }

  /** Suelta lo que se estaba arrastrando: el perro patrulla desde ahí y el dron libre se queda ahí. */
  private endDrag(): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.moved) return;
    if (drag.target.kind === 'pet') this.releasePet();
    if (drag.target.kind === 'drone') {
      const view = this.drones.get(drag.target.id);
      if (view) {
        view.hold = null;
        view.flyer.release();
      }
    }
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
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        this.endDrag();
      } else {
        // La rueda central siempre mueve la granja; el botón principal agarra lo que haya debajo.
        const target: DragTarget = e.button === 1 ? { kind: 'field' } : this.hitTarget(p.x, p.y);
        const c = this.toCamera(p.x, p.y);
        let grabX = 0;
        let grabY = 0;
        if (target.kind === 'pet' && this.pet) {
          grabX = c.x - this.pet.gx;
          grabY = c.y - this.pet.gy;
        } else if (target.kind === 'drone') {
          const flyer = this.drones.get(target.id)?.flyer;
          if (flyer) {
            grabX = c.x - flyer.gx;
            grabY = c.y - flyer.gy;
          }
        }
        this.viewTween = null;
        this.drag = { target, x: e.clientX, y: e.clientY, fieldX: this.fieldX, fieldY: this.fieldY, grabX, grabY, moved: false };
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
      const drag = this.drag;
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
          drag.moved = true;
          canvas.style.cursor = 'grabbing';
          this.callbacks.onHoverTile?.(null);
        }
        if (drag.moved) {
          const c = this.toCamera(p.x, p.y);
          const hold = { x: c.x - drag.grabX, y: c.y - drag.grabY };
          if (drag.target.kind === 'field') {
            // Solo se mueve la granja: los drones libres y el perro se quedan donde están.
            this.fieldX = drag.fieldX + dx / this.zoom;
            this.fieldY = drag.fieldY + dy / this.zoom;
            this.autoFit = false;
          } else if (drag.target.kind === 'pet' && this.pet) {
            this.pet.hold = hold;
          } else if (drag.target.kind === 'drone') {
            const view = this.drones.get(drag.target.id);
            if (view) view.hold = hold;
          }
          return;
        }
      }
      this.callbacks.onHoverTile?.(this.pick(p.x, p.y, e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) this.endDrag();
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

