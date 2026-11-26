/**
 * Isometría 2:1 del doc 05 §3: casilla lógica de 128 × 64 px, origen (0, 0) en el Sur-Oeste,
 * North (y + 1) y East (x + 1) hacia arriba en la pantalla. Funciones puras (se prueban sin DOM).
 */

export const TILE_W = 128;
export const TILE_H = 64;
/** Píxeles por unidad de altura (cámara a 30° de elevación, la misma con la que se hornean los sprites). */
export const HEIGHT_PX = 78.38;

/** Punto continuo del suelo (u, v) → pantalla. La casilla (x, y) ocupa [x, x+1] × [y, y+1]. */
export function isoX(u: number, v: number): number {
  return (u - v) * (TILE_W / 2);
}

export function isoY(u: number, v: number, z = 0): number {
  return -(u + v) * (TILE_H / 2) - z * HEIGHT_PX;
}

/** Centro de la cara superior de la casilla (x, y): el anclaje (0.5, 0.75) de terrenos y cultivos. */
export function tileCenter(x: number, y: number): { x: number; y: number } {
  return { x: isoX(x + 0.5, y + 0.5), y: isoY(x + 0.5, y + 0.5) };
}

/** Casilla bajo un punto de pantalla (inversa algebraica del doc 05, sin hitboxes). */
export function pickTile(sx: number, sy: number): { x: number; y: number } {
  return { x: Math.floor(sx / TILE_W - sy / TILE_H), y: Math.floor(-sy / TILE_H - sx / TILE_W) };
}

/** Orden de dibujo: lo más al Sur-Oeste queda delante (zIndex = −(x + y)). */
export function depthOf(x: number, y: number): number {
  return -(x + y);
}

/** Rectángulo de pantalla que ocupa una granja de w × h casillas (sin alturas). */
export function boardBounds(w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: isoX(0, h), y0: isoY(w, h), x1: isoX(w, 0), y1: isoY(0, 0) };
}
