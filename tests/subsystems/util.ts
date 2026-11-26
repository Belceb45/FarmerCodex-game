import { DEFAULT_BALANCE, type BalanceConfig } from '../../src/config/balance';
import type { EntityKind } from '../../src/engine/types';
import { World, type WorldOptions } from '../../src/engine/world';

type BalancePatch = { [K in keyof BalanceConfig]?: Partial<BalanceConfig[K]> };

export const TICKS = DEFAULT_BALANCE.ticks;

/** Copia de balance.json con algunos valores cambiados: demuestra que el motor lee el archivo y no constantes. */
export function balanceWith(patch: BalancePatch): BalanceConfig {
  const out = JSON.parse(JSON.stringify(DEFAULT_BALANCE)) as BalanceConfig;
  for (const [section, values] of Object.entries(patch)) {
    Object.assign((out as unknown as Record<string, object>)[section], values);
  }
  return out;
}

/** Granja (3×3 por defecto) con todas las casillas en Soil y sin plantas. */
export function soilFarm(options: Partial<WorldOptions> = {}): World {
  const world = new World({ seed: 11, size: 3, ...options });
  for (const t of world.grid.tiles) world.tillAt(t.x, t.y);
  world.drainEvents();
  return world;
}

/** Hace aparecer `kind` en (x, y) (madura por defecto) con los datos de su subsistema. */
export function put(world: World, x: number, y: number, kind: EntityKind, mature = true): void {
  world.spawn(world.tileAt(x, y), kind, mature);
}

export function advance(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.advanceTick();
}

export function cells(width: number, height = width): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.push([x, y]);
  return out;
}

/** Coloca el dron 0 en (x, y). */
export function placeDrone(world: World, x: number, y: number): void {
  const body = world.getDrone(0);
  body.x = x;
  body.y = y;
}
