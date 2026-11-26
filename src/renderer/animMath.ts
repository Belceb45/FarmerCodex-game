/**
 * Utilidades matemáticas puras para las animaciones procedurales (doc 08).
 * Sin dependencias de DOM ni PixiJS para poder probarlas directamente en Vitest.
 */

export type LodLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Umbral de duración por debajo del cual se omite el rebote elástico para evitar parpadeo (doc 08 §1.2). */
export const FAST_ACTION_THRESHOLD_MS = 35;

/** Ticks por segundo base del juego (sin mejoras de velocidad). */
export const BASE_TICKS_PER_SECOND = 400;

export function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutQuad(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export function easeInCubic(t: number): number {
  const x = clamp01(t);
  return x * x * x;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Curva con ligero sobreimpulso elástico al final (pop-in de brotes, sombreros y muros). */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp01(t);
  const c3 = overshoot + 1;
  const u = x - 1;
  return 1 + c3 * u * u * u + overshoot * u * u;
}

/** Rebote elástico de caída (aparición de manzanas). */
export function easeOutBounce(t: number): number {
  let x = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    x -= 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (x < 2.5 / d1) {
    x -= 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

/**
 * Nivel de detalle automático (doc 08 §6): mantiene 60 FPS degradando partículas ambientales
 * y efectos redundantes cuando suben los drones activos o la velocidad efectiva.
 */
export function getLodLevel(activeDrones: number, effectiveSpeed: number): LodLevel {
  if (activeDrones > 16 || effectiveSpeed > 25) return 'LOW';
  if (activeDrones > 8 || effectiveSpeed > 10) return 'MEDIUM';
  return 'HIGH';
}

/** Duración estimada en milisegundos reales de una acción física del dron. */
export function actionDurationMs(startTick: number, endTick: number, ticksPerSecond: number): number {
  if (ticksPerSecond <= 0) return Infinity;
  const ticks = Math.max(0, endTick - startTick);
  return (ticks / ticksPerSecond) * 1000;
}

/** Verdadero si la acción es demasiado corta para rebotes elásticos (doc 08 §1.2: < 35 ms). */
export function isFastAction(durationMs: number): boolean {
  return durationMs > 0 && durationMs < FAST_ACTION_THRESHOLD_MS;
}

/** Cantidad de íconos voladores al HUD según rendimiento cosechado y LOD. */
export function flyerCountForAmount(amount: number, lod: LodLevel, harvestIndex: number): number {
  if (lod === 'LOW' || amount <= 0) return 0;
  if (lod === 'MEDIUM') return harvestIndex % 3 === 0 ? 1 : 0;
  if (amount >= 10) return 3;
  if (amount >= 3) return 2;
  return 1;
}
