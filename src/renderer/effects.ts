import { Container, Sprite, Texture } from 'pixi.js';
import { clamp01, easeOutQuad, lerp } from './animMath';

export type ParticleKind = 'spark' | 'dust' | 'bubble' | 'glow' | 'leaf' | 'puff';

export interface EmitParticleOptions {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind?: ParticleKind;
  tint?: number;
  gravity?: number;
  drag?: number;
  maxLife?: number;
  startScale?: number;
  endScale?: number;
  startAlpha?: number;
  rotation?: number;
  rotSpeed?: number;
  additive?: boolean;
}

interface PooledParticle {
  sprite: Sprite;
  active: boolean;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  rotSpeed: number;
}

interface PooledShockwave {
  sprite: Sprite;
  active: boolean;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  squashY: number;
}

/** Tope estricto de partículas activas simultáneas (doc 08 §6). */
export const MAX_POOL_PARTICLES = 150;
const MAX_SHOCKWAVES = 24;

function makeCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  return Texture.from(canvas);
}

function buildParticleTextures(): Record<ParticleKind, Texture> {
  const spark = makeCanvasTexture(24, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(c, 1);
    ctx.lineTo(c + 4, c - 3);
    ctx.lineTo(s - 1, c);
    ctx.lineTo(c + 4, c + 3);
    ctx.lineTo(c, s - 1);
    ctx.lineTo(c - 4, c + 3);
    ctx.lineTo(1, c);
    ctx.lineTo(c - 4, c - 3);
    ctx.closePath();
    ctx.fill();
  });

  const dust = makeCanvasTexture(20, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, 2);
    ctx.lineTo(s - 3, c - 3);
    ctx.lineTo(s - 2, c + 4);
    ctx.lineTo(c + 1, s - 2);
    ctx.lineTo(3, c + 4);
    ctx.lineTo(2, c - 3);
    ctx.closePath();
    ctx.fill();
  });

  const bubble = makeCanvasTexture(20, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c - 2, c - 2, 1, c, c, c - 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fill();
  });

  const glow = makeCanvasTexture(64, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

  const leaf = makeCanvasTexture(20, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, 2);
    ctx.lineTo(s - 4, c);
    ctx.lineTo(c, s - 2);
    ctx.lineTo(4, c);
    ctx.closePath();
    ctx.fill();
  });

  const puff = makeCanvasTexture(32, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 2, c, c, c - 1);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.fill();
  });

  return { spark, dust, bubble, glow, leaf, puff };
}

function buildRingTexture(): Texture {
  return makeCanvasTexture(96, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, c * 0.45, c, c, c * 0.96);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.96, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Pool reutilizable de partículas y ondas expansivas (doc 08 §6).
 * Evita crear y destruir objetos `Graphics` en cada evento de cosecha, riego o labrado.
 */
export class ParticlePool {
  readonly layer: Container;
  private readonly textures: Record<ParticleKind, Texture>;
  private readonly ringTexture: Texture;
  private readonly items: PooledParticle[] = [];
  private readonly waves: PooledShockwave[] = [];
  private cursor = 0;
  private waveCursor = 0;

  constructor(layer: Container, capacity = MAX_POOL_PARTICLES) {
    this.layer = layer;
    this.textures = buildParticleTextures();
    this.ringTexture = buildRingTexture();
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite(this.textures.dust);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.layer.addChild(sprite);
      this.items.push({
        sprite,
        active: false,
        vx: 0,
        vy: 0,
        gravity: 0,
        drag: 0,
        life: 0,
        maxLife: 0.4,
        startScale: 1,
        endScale: 0,
        startAlpha: 1,
        rotSpeed: 0,
      });
    }
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const sprite = new Sprite(this.ringTexture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.layer.addChild(sprite);
      this.waves.push({
        sprite,
        active: false,
        life: 0,
        maxLife: 0.3,
        startScale: 0.2,
        endScale: 1.2,
        startAlpha: 0.8,
        squashY: 0.72,
      });
    }
  }

  /** Textura radial reutilizable para halos aditivos (girasol máximo, cofre, energía). */
  get glowTexture(): Texture {
    return this.textures.glow;
  }

  emit(opt: EmitParticleOptions): void {
    const n = this.items.length;
    let slot: PooledParticle | null = null;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      if (!this.items[idx].active) {
        slot = this.items[idx];
        this.cursor = (idx + 1) % n;
        break;
      }
    }
    if (!slot) {
      slot = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % n;
    }
    const kind = opt.kind ?? 'dust';
    const s = slot.sprite;
    s.texture = this.textures[kind];
    s.tint = opt.tint ?? 0xffffff;
    s.blendMode = opt.additive ? 'add' : 'normal';
    s.position.set(opt.x, opt.y);
    s.rotation = opt.rotation ?? 0;
    s.alpha = opt.startAlpha ?? 1;
    const startScale = opt.startScale ?? 0.45;
    s.scale.set(startScale);
    s.visible = true;

    slot.active = true;
    slot.vx = opt.vx;
    slot.vy = opt.vy;
    slot.gravity = opt.gravity ?? 220;
    slot.drag = opt.drag ?? 0;
    slot.life = 0;
    slot.maxLife = Math.max(0.05, opt.maxLife ?? 0.45);
    slot.startScale = startScale;
    slot.endScale = opt.endScale ?? 0.1;
    slot.startAlpha = opt.startAlpha ?? 1;
    slot.rotSpeed = opt.rotSpeed ?? 0;
  }

  /** Emite un anillo/halo expansivo sobre el plano de la casilla (isométrico achatado en Y). */
  emitShockwave(opt: {
    x: number;
    y: number;
    tint: number;
    startScale?: number;
    endScale?: number;
    maxLife?: number;
    startAlpha?: number;
    squashY?: number;
    additive?: boolean;
  }): void {
    const n = this.waves.length;
    let slot: PooledShockwave | null = null;
    for (let i = 0; i < n; i++) {
      const idx = (this.waveCursor + i) % n;
      if (!this.waves[idx].active) {
        slot = this.waves[idx];
        this.waveCursor = (idx + 1) % n;
        break;
      }
    }
    if (!slot) {
      slot = this.waves[this.waveCursor];
      this.waveCursor = (this.waveCursor + 1) % n;
    }
    const s = slot.sprite;
    s.tint = opt.tint;
    s.blendMode = opt.additive === false ? 'normal' : 'add';
    s.position.set(opt.x, opt.y);
    const startScale = opt.startScale ?? 0.18;
    const squashY = opt.squashY ?? 0.72;
    s.scale.set(startScale, startScale * squashY);
    s.alpha = opt.startAlpha ?? 0.75;
    s.visible = true;

    slot.active = true;
    slot.life = 0;
    slot.maxLife = Math.max(0.08, opt.maxLife ?? 0.32);
    slot.startScale = startScale;
    slot.endScale = opt.endScale ?? 1.15;
    slot.startAlpha = opt.startAlpha ?? 0.75;
    slot.squashY = squashY;
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const u = clamp01(p.life / p.maxLife);
      if (p.drag > 0) {
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      if (p.rotSpeed !== 0) p.sprite.rotation += p.rotSpeed * dt;
      const scale = lerp(p.startScale, p.endScale, u);
      p.sprite.scale.set(scale);
      // Fade-in muy breve al nacer para partículas suaves y fade-out al final.
      const fadeIn = u < 0.08 ? u / 0.08 : 1;
      const fadeOut = 1 - u * u;
      p.sprite.alpha = p.startAlpha * fadeIn * fadeOut;
    }

    for (const w of this.waves) {
      if (!w.active) continue;
      w.life += dt;
      if (w.life >= w.maxLife) {
        w.active = false;
        w.sprite.visible = false;
        continue;
      }
      const u = clamp01(w.life / w.maxLife);
      const e = easeOutQuad(u);
      const sc = lerp(w.startScale, w.endScale, e);
      w.sprite.scale.set(sc, sc * w.squashY);
      w.sprite.alpha = w.startAlpha * (1 - u);
    }
  }

  destroy(): void {
    for (const p of this.items) p.sprite.destroy();
    for (const w of this.waves) w.sprite.destroy();
    this.items.length = 0;
    this.waves.length = 0;
    for (const tex of Object.values(this.textures)) tex.destroy(true);
    this.ringTexture.destroy(true);
  }
}
