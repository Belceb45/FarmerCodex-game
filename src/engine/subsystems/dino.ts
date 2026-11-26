import { DIRECTION_DELTAS, DIRECTIONS, type Direction, type DroneBody } from '../types';
import type { World } from '../world';

/**
 * Modo Dinosaurio (doc 03 §3.6): con Hats.Dinosaur_Hat aparece una manzana; comerla añade un
 * segmento de cola (Dinosaur) que ocupa las casillas por las que pasó el dron y bloquea el paso.
 * Al quedarse sin movimientos o quitarse el sombrero, la cola se cosecha: Bone = largo² · bonePerSquare.
 */

export interface DinoState {
  droneId: number;
  /** Segmentos de la cola, del más reciente al más antiguo. */
  tail: { x: number; y: number }[];
  /** Manzanas comidas = largo de la cola. */
  length: number;
  apple: { x: number; y: number } | null;
}

/** Coloca una manzana en una casilla libre (sin entidad y sin el dron) elegida con el PRNG. */
export function spawnApple(world: World): void {
  const dino = world.dino;
  if (!dino) return;
  const body = world.getDrone(dino.droneId);
  const free = world.grid.tiles.filter((t) => t.entity === null && (t.x !== body.x || t.y !== body.y));
  if (free.length === 0) {
    dino.apple = null;
    return;
  }
  const t = free[world.rng.nextInt(0, free.length - 1)];
  t.entity = 'Apple';
  t.growthProgress = 1;
  t.growthDuration = 0;
  dino.apple = { x: t.x, y: t.y };
}

/** Vacía la granja (se conservan suelo y humedad) y empieza la persecución. */
export function startDino(world: World, body: DroneBody): void {
  if (world.maze) world.endMaze();
  for (const t of world.grid.tiles) world.clearTile(t);
  world.dino = { droneId: body.id, tail: [], length: 0, apple: null };
  spawnApple(world);
  world.emit({ kind: 'dino', tick: world.totalTicks, x: body.x, y: body.y, phase: 'start', length: 0 });
}

export function dinoCanMove(world: World, body: DroneBody, direction: Direction): boolean {
  const d = DIRECTION_DELTAS[direction];
  const x = body.x + d.dx;
  const y = body.y + d.dy;
  if (!world.grid.inBounds(x, y)) return false;
  return world.grid.get(x, y).entity !== 'Dinosaur';
}

export function isTrapped(world: World, body: DroneBody): boolean {
  return DIRECTIONS.every((dir) => !dinoCanMove(world, body, dir));
}

/** Tras mover la cabeza desde (prevX, prevY): crece si comió y la cola ocupa las últimas posiciones. */
export function dinoAfterMove(world: World, prevX: number, prevY: number, x: number, y: number): void {
  const dino = world.dino;
  if (!dino) return;
  const head = world.grid.get(x, y);
  const ate = head.entity === 'Apple';
  if (ate) {
    dino.length++;
    world.clearTile(head);
    world.record('maxTail', dino.length, 'max');
  }
  dino.tail.unshift({ x: prevX, y: prevY });
  const seg = world.grid.get(prevX, prevY);
  world.clearTile(seg);
  seg.entity = 'Dinosaur';
  seg.growthProgress = 0;
  seg.growthDuration = world.balance.dinosaur.tailSegmentGrowthSec;
  while (dino.tail.length > dino.length) {
    const end = dino.tail.pop();
    if (end) world.clearTile(world.grid.get(end.x, end.y));
  }
  if (ate) {
    spawnApple(world);
    world.emit({ kind: 'dino', tick: world.totalTicks, x, y, phase: 'eat', length: dino.length });
  }
}

/** Termina el modo: cosecha la cola (Bone = largo² · bonePerSquare) y devuelve la granja al estado normal. */
export function endDino(world: World): number {
  const dino = world.dino;
  if (!dino) return 0;
  const bones = dino.length * dino.length * world.balance.dinosaur.bonePerSquare;
  world.gain('Bone', bones);
  const body = world.getDrone(dino.droneId);
  world.dino = null;
  for (const t of world.grid.tiles) {
    if (t.entity === 'Dinosaur' || t.entity === 'Apple') world.clearTile(t);
    world.autoSpawn(t);
  }
  world.emit({ kind: 'dino', tick: world.totalTicks, x: body.x, y: body.y, phase: 'end', length: dino.length });
  return bones;
}
