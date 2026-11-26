import type { TileState } from '../types';
import type { World } from '../world';

/**
 * Cactus (doc 03 §3.3): tamaño entero en [minSize, maxSize]. Una casilla está ordenada si sus
 * vecinos cactus al Norte y al Este son ≥ y los del Sur y el Oeste son ≤. La cosecha de un cactus
 * maduro y ordenado se propaga (BFS) por los cactus maduros y ordenados conectados.
 */

export function rollCactusSize(world: World): number {
  const cfg = world.balance.cactus;
  return world.rng.nextInt(cfg.minSize, cfg.maxSize);
}

const RULES: readonly { dx: number; dy: number; neighborMustBeBigger: boolean }[] = [
  { dx: 0, dy: 1, neighborMustBeBigger: true },
  { dx: 1, dy: 0, neighborMustBeBigger: true },
  { dx: 0, dy: -1, neighborMustBeBigger: false },
  { dx: -1, dy: 0, neighborMustBeBigger: false },
];

export function isCactusSorted(world: World, x: number, y: number): boolean {
  const tile = world.grid.get(x, y);
  if (tile.entity !== 'Cactus') return true;
  const size = tile.cactusSize ?? 0;
  for (const r of RULES) {
    const nx = x + r.dx;
    const ny = y + r.dy;
    if (!world.grid.inBounds(nx, ny)) continue;
    const n = world.grid.get(nx, ny);
    if (n.entity !== 'Cactus') continue;
    const ns = n.cactusSize ?? 0;
    if (r.neighborMustBeBigger ? ns < size : ns > size) return false;
  }
  return true;
}

/** Cactus que se cosechan juntos desde (x, y): el inicial y, si está ordenado, su componente BFS. */
export function cactusChain(world: World, x: number, y: number): TileState[] {
  const start = world.grid.get(x, y);
  if (!isCactusSorted(world, x, y)) return [start];
  const seen = new Set<number>([world.grid.index(x, y)]);
  const queue: TileState[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    for (const r of RULES) {
      const nx = t.x + r.dx;
      const ny = t.y + r.dy;
      if (!world.grid.inBounds(nx, ny)) continue;
      const key = world.grid.index(nx, ny);
      if (seen.has(key)) continue;
      const n = world.grid.get(nx, ny);
      if (n.entity !== 'Cactus' || n.growthProgress < 1 || !isCactusSorted(world, nx, ny)) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return queue;
}

/** Rendimiento (en unidades del rendimiento base) de una cadena de n cactus. */
export function cactusYield(world: World, n: number): number {
  return world.balance.cactus.formulaMode === 'sqrt_scaled' ? n * Math.floor(Math.sqrt(n)) : n * n;
}
