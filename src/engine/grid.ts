import type { BalanceConfig, EntityBalance } from '../config/balance';
import type { DeterministicRandom } from './prng';
import { GroundType, isEntityKind, type EntityKind, type TileState } from './types';

/**
 * Cuadrícula de `width` × `height` casillas (la expansión pasa por 1×3 antes de ser cuadrada).
 * Índice plano = y * width + x, con (0, 0) en la esquina Sur-Oeste.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly tiles: TileState[];

  constructor(width: number, height: number = width) {
    for (const v of [width, height]) {
      if (!Number.isInteger(v) || v < 1) throw new RangeError(`Tamaño de cuadrícula inválido: ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.tiles = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) this.tiles.push(createTile(x, y));
    }
  }

  /** Lado mayor (lo que devuelve get_world_size()). */
  get size(): number {
    return Math.max(this.width, this.height);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): TileState {
    if (!this.inBounds(x, y)) throw new RangeError(`Casilla fuera de la cuadrícula: (${x}, ${y})`);
    return this.tiles[this.index(x, y)];
  }

  /** Envoltura toroidal: cruzar un borde lleva al borde opuesto. */
  wrap(x: number, y: number): { x: number; y: number } {
    const w = this.width;
    const h = this.height;
    return { x: ((x % w) + w) % w, y: ((y % h) + h) % h };
  }
}

export function createTile(x: number, y: number): TileState {
  return {
    x,
    y,
    ground: GroundType.Grassland,
    entity: null,
    growthProgress: 0,
    growthDuration: 0,
    waterLevel: 0,
    isInfected: false,
  };
}

export function entityBalance(balance: BalanceConfig, kind: EntityKind): EntityBalance {
  const cfg = balance.entities[kind];
  if (!cfg) throw new Error(`La entidad '${kind}' no tiene parámetros en balance.json`);
  return cfg;
}

/** Duración de crecimiento de una instancia: media ± variación, usando el PRNG determinista. */
export function rollGrowthDuration(cfg: EntityBalance, rng: DeterministicRandom): number {
  const v = cfg.growthVariance;
  return cfg.growthSec * (1 - v + 2 * v * rng.nextFloat());
}

export function spawnEntity(
  tile: TileState,
  kind: EntityKind,
  balance: BalanceConfig,
  rng: DeterministicRandom,
  mature = false,
): void {
  const cfg = entityBalance(balance, kind);
  tile.entity = kind;
  tile.growthDuration = rollGrowthDuration(cfg, rng);
  tile.growthProgress = mature ? 1 : 0;
  tile.isInfected = false;
}

export function clearEntity(tile: TileState): void {
  tile.entity = null;
  tile.growthProgress = 0;
  tile.growthDuration = 0;
  tile.isInfected = false;
}

/** Hace aparecer la entidad espontánea del suelo (p. ej. pasto en Grassland) si la casilla quedó vacía. */
export function applyAutoSpawn(
  tile: TileState,
  balance: BalanceConfig,
  rng: DeterministicRandom,
  mature = false,
): void {
  if (tile.entity !== null) return;
  for (const [kind, cfg] of Object.entries(balance.entities)) {
    if (isEntityKind(kind) && cfg.autoSpawnOn.includes(tile.ground)) {
      spawnEntity(tile, kind, balance, rng, mature);
      return;
    }
  }
}

/** Avanza el crecimiento `dtSec` segundos multiplicados por `rate` (agua, vecinos…). */
export function advanceGrowth(tile: TileState, dtSec: number, rate = 1): void {
  if (tile.entity === null || tile.growthProgress >= 1) return;
  if (tile.growthDuration <= 0) {
    tile.growthProgress = 1;
    return;
  }
  tile.growthProgress = Math.min(1, tile.growthProgress + (dtSec * rate) / tile.growthDuration);
}
