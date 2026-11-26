import { TILE_H, TILE_W } from './projection';

/**
 * Vuelo libre de los drones (independientes de la granja). Mientras su script corre, un dron sigue
 * exactamente su casilla más un desfase que se amortigua con un resorte crítico: si arrastras la
 * granja se queda atrás un instante y la alcanza volando. Sin script flota donde quedó y no se mueve
 * aunque muevas la granja. Funciones puras (sin Pixi ni DOM) para probarlas en Node.
 */

/** Rigidez del resorte del vuelo (rad/s): ~0.8 s para cruzar la pantalla y posarse. */
export const FLY_OMEGA = 8;

/**
 * Un paso exacto de un resorte críticamente amortiguado hacia 0 (estable con cualquier dt):
 * x(t) = (x0 + (v0 + ω·x0)·t)·e^(−ωt).
 */
export function springStep(x: number, v: number, omega: number, dt: number): [number, number] {
  const e = Math.exp(-omega * dt);
  const k = v + omega * x;
  return [(x + k * dt) * e, (v - omega * k * dt) * e];
}

/** Inversa continua de la proyección a nivel del suelo: punto de la granja → (u, v) en casillas. */
export function groundToTile(fx: number, fy: number): { u: number; v: number } {
  return { u: fx / TILE_W - fy / TILE_H, v: -fx / TILE_W - fy / TILE_H };
}

/** ¿El punto (coordenadas de la granja) cae sobre la plataforma de w × h casillas? */
export function overBoard(fx: number, fy: number, w: number, h: number): boolean {
  const { u, v } = groundToTile(fx, fy);
  return u >= 0 && v >= 0 && u <= w && v <= h;
}

export interface FlyerInput {
  /** Trabaja sobre la granja (su script corre) o camina por ella (dinosaurio). */
  attached: boolean;
  /** Su casilla en coordenadas de cámara: posición de la granja + proyección de la posición lógica. */
  tileX: number;
  tileY: number;
  /** Cuánto se movió la granja desde el fotograma anterior (coordenadas de cámara). */
  fieldDx: number;
  fieldDy: number;
  /** Su posición lógica saltó (clear(), set_world_size(), cambio de granja): vuela, no se teletransporta. */
  teleport: boolean;
  /** Pegado a la granja sin retraso (el dinosaurio camina sobre ella). */
  rigid: boolean;
  /** Punto al que lo arrastra el jugador (coordenadas de cámara), o null. */
  hold: { x: number; y: number } | null;
}

/** Posición en vuelo de un dron: punto del suelo bajo él en coordenadas de cámara. */
export class FreeFlight {
  gx: number;
  gy: number;
  /** Desfase respecto a su destino y su velocidad (px/s). */
  ox = 0;
  oy = 0;
  vx = 0;
  vy = 0;
  attached: boolean;
  /** Donde flota cuando no trabaja. */
  freeX: number;
  freeY: number;

  constructor(x: number, y: number, attached: boolean) {
    this.gx = x;
    this.gy = y;
    this.freeX = x;
    this.freeY = y;
    this.attached = attached;
  }

  update(input: FlyerInput, dt: number): void {
    if (input.attached) {
      if (!this.attached || input.teleport) {
        // Despega desde donde estaba (o desde su casilla anterior) y vuela hasta la nueva.
        this.ox = this.gx - input.tileX;
        this.oy = this.gy - input.tileY;
      } else if (!input.rigid) {
        // La granja se movió sin él: se queda atrás y la alcanza.
        this.ox -= input.fieldDx;
        this.oy -= input.fieldDy;
      }
    } else if (this.attached) {
      // Terminó su script: se queda flotando justo donde está.
      this.freeX = this.gx;
      this.freeY = this.gy;
      this.ox = this.oy = this.vx = this.vy = 0;
    }
    this.attached = input.attached;
    const tx = input.attached ? input.tileX : this.freeX;
    const ty = input.attached ? input.tileY : this.freeY;
    if (input.hold) {
      const nx = input.hold.x - tx;
      const ny = input.hold.y - ty;
      const step = Math.max(dt, 1 / 240);
      this.vx = (nx - this.ox) / step;
      this.vy = (ny - this.oy) / step;
      this.ox = nx;
      this.oy = ny;
    } else {
      [this.ox, this.vx] = springStep(this.ox, this.vx, FLY_OMEGA, dt);
      [this.oy, this.vy] = springStep(this.oy, this.vy, FLY_OMEGA, dt);
    }
    this.gx = tx + this.ox;
    this.gy = ty + this.oy;
  }

  /** Al soltarlo: libre se queda donde lo dejaron; trabajando vuelve volando a su casilla. */
  release(): void {
    if (this.attached) return;
    this.freeX = this.gx;
    this.freeY = this.gy;
    this.ox = this.oy = this.vx = this.vy = 0;
  }

  /** Un dron libre vuelve volando a (x, y), por ejemplo sobre su casilla al recentrar la vista. */
  sendTo(x: number, y: number): void {
    if (this.attached) return;
    this.ox = this.gx - x;
    this.oy = this.gy - y;
    this.freeX = x;
    this.freeY = y;
  }
}
