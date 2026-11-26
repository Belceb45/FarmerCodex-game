import { levelValue } from '../tech';
import type { Direction } from '../types';
import type { World } from '../world';

/**
 * Laberintos (doc 03 §3.5): Weird_Substance sobre un arbusto convierte la granja en un laberinto
 * perfecto (setos entre casillas) con un tesoro que da oro según el lado. Aplicarla sobre el tesoro
 * lo recicla (hasta `maxRecycleCount` veces) y el cofre reaparece tras `relocateTicks` ticks.
 */

export interface MazeState {
  /** Lado usado para el oro (el mayor de la granja). */
  side: number;
  treasure: { x: number; y: number } | null;
  /** Tick en que reaparece el tesoro tras reciclar (null si está visible). */
  relocateAt: number | null;
  recycles: number;
}

export const WALL_BIT: Readonly<Record<Direction, number>> = { North: 1, East: 2, South: 4, West: 8 };

const STEPS: readonly { dx: number; dy: number; bit: number; opposite: number }[] = [
  { dx: 0, dy: 1, bit: 1, opposite: 4 },
  { dx: 1, dy: 0, bit: 2, opposite: 8 },
  { dx: 0, dy: -1, bit: 4, opposite: 1 },
  { dx: -1, dy: 0, bit: 8, opposite: 2 },
];

/** Weird_Substance necesaria para crear o reciclar el laberinto de esta granja. */
export function substanceNeeded(world: World): number {
  return Math.max(1, Math.ceil(world.balance.maze.substancePerSide * world.size));
}

/** Laberinto perfecto sobre toda la granja con DFS iterativo y el PRNG (todas las casillas conectadas). */
export function generateMaze(world: World, startX: number, startY: number): void {
  const { width: w, height: h } = world;
  for (const t of world.grid.tiles) {
    world.clearTile(t);
    t.entity = 'Hedge';
    t.growthProgress = 1;
    t.mazeWalls = 15;
  }
  const visited = new Uint8Array(w * h);
  const stack: [number, number][] = [[startX, startY]];
  visited[startY * w + startX] = 1;
  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const options = STEPS.filter((s) => {
      const nx = cx + s.dx;
      const ny = cy + s.dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !visited[ny * w + nx];
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const s = options[world.rng.nextInt(0, options.length - 1)];
    const nx = cx + s.dx;
    const ny = cy + s.dy;
    const a = world.grid.get(cx, cy);
    const b = world.grid.get(nx, ny);
    a.mazeWalls = (a.mazeWalls ?? 15) & ~s.bit;
    b.mazeWalls = (b.mazeWalls ?? 15) & ~s.opposite;
    visited[ny * w + nx] = 1;
    stack.push([nx, ny]);
  }
}

/** Coloca el tesoro en una casilla aleatoria distinta de (avoidX, avoidY). */
export function placeTreasure(world: World, avoidX: number, avoidY: number): void {
  const maze = world.maze;
  if (!maze) return;
  const candidates = world.grid.tiles.filter((t) => t.entity === 'Hedge' && (t.x !== avoidX || t.y !== avoidY));
  const pool = candidates.length > 0 ? candidates : world.grid.tiles.filter((t) => t.entity === 'Hedge');
  if (pool.length === 0) return;
  const t = pool[world.rng.nextInt(0, pool.length - 1)];
  t.entity = 'Treasure';
  maze.treasure = { x: t.x, y: t.y };
}

/** Oro del tesoro: lado · goldPerSide · (reciclados + 1) · multiplicador del nivel de Mazes. */
export function treasureGold(world: World): number {
  const maze = world.maze;
  if (!maze) return 0;
  const mult = levelValue(world.techTree, world.unlocks, 'Mazes', 1);
  return maze.side * world.balance.maze.goldPerSide * (maze.recycles + 1) * mult;
}

/** ¿Hay un muro del laberinto en esa dirección desde (x, y)? */
export function hasWall(world: World, x: number, y: number, direction: Direction): boolean {
  return ((world.grid.get(x, y).mazeWalls ?? 0) & WALL_BIT[direction]) !== 0;
}
