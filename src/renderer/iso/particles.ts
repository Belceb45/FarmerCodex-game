import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { MAX_PARTICLES } from './lod';

/**
 * Pool de partículas (doc 08 §6): objetos reutilizados en dos `ParticleContainer` (normal y aditivo
 * para chispas y halos), con un tope estricto de 150 activas.
 */
export interface ParticleSpec {
  texture: Texture;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  lifeMs: number;
  startScale: number;
  endScale: number;
  tint?: number;
  alpha?: number;
  additive?: boolean;
  spin?: number;
  rotation?: number;
  /** Rozamiento suave del aire (0 = sin freno). */
  drag?: number;
}

interface LiveParticle {
  particle: Particle;
  container: ParticleContainer;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  lifeMs: number;
  maxLifeMs: number;
  startScale: number;
  endScale: number;
  alpha: number;
  spin: number;
}

function makeContainer(): ParticleContainer {
  return new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
}

export class ParticlePool {
  readonly normal = makeContainer();
  readonly additive = makeContainer();
  /** Activas como máximo en este pool (la granja y el cielo se reparten el tope de 150). */
  readonly max: number;
  private live: LiveParticle[] = [];
  private free: Particle[] = [];

  constructor(max = MAX_PARTICLES) {
    this.max = max;
    this.additive.blendMode = 'add';
  }

  get count(): number {
    return this.live.length;
  }

  /** Lanza una partícula; devuelve false si el pool está lleno (se descarta en silencio). */
  spawn(spec: ParticleSpec): boolean {
    if (this.live.length >= this.max) return false;
    const particle = this.free.pop() ?? new Particle({ texture: spec.texture, anchorX: 0.5, anchorY: 0.5 });
    particle.texture = spec.texture;
    particle.anchorX = 0.5;
    particle.anchorY = 0.5;
    particle.x = spec.x;
    particle.y = spec.y;
    particle.scaleX = particle.scaleY = spec.startScale;
    particle.rotation = spec.rotation ?? 0;
    particle.tint = spec.tint ?? 0xffffff;
    particle.alpha = spec.alpha ?? 1;
    const container = spec.additive ? this.additive : this.normal;
    container.addParticle(particle);
    this.live.push({
      particle,
      container,
      vx: spec.vx,
      vy: spec.vy,
      gravity: spec.gravity,
      drag: spec.drag ?? 0,
      lifeMs: 0,
      maxLifeMs: spec.lifeMs,
      startScale: spec.startScale,
      endScale: spec.endScale,
      alpha: spec.alpha ?? 1,
      spin: spec.spin ?? 0,
    });
    return true;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const p = this.live[i];
      p.lifeMs += dtMs;
      if (p.lifeMs >= p.maxLifeMs) {
        p.container.removeParticle(p.particle);
        this.free.push(p.particle);
        continue;
      }
      const k = p.lifeMs / p.maxLifeMs;
      if (p.drag > 0) {
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
      p.vy += p.gravity * dt;
      p.particle.x += p.vx * dt;
      p.particle.y += p.vy * dt;
      p.particle.rotation += p.spin * dt;
      const s = p.startScale + (p.endScale - p.startScale) * k;
      p.particle.scaleX = p.particle.scaleY = s;
      const fadeIn = k < 0.06 ? k / 0.06 : 1;
      const fadeOut = k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85;
      p.particle.alpha = p.alpha * fadeIn * fadeOut;
      this.live[w++] = p;
    }
    this.live.length = w;
  }

  clear(): void {
    for (const p of this.live) {
      p.container.removeParticle(p.particle);
      this.free.push(p.particle);
    }
    this.live.length = 0;
  }
}
