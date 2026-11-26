import type { TileState } from '../types';
import type { World } from '../world';

/**
 * Girasoles (doc 03 §3.2): pétalos enteros en [minPetals, maxPetals]. Con al menos
 * `minCountForBonus` girasoles en la granja, cosechar el de más pétalos multiplica la energía
 * por `powerMultiplier`; cosechar uno que no es el máximo deja la siguiente cosecha a potencia normal.
 */

export function rollPetals(world: World): number {
  const cfg = world.balance.sunflower;
  return world.rng.nextInt(cfg.minPetals, cfg.maxPetals);
}

/** Multiplicador de energía de esta cosecha (actualiza la penalización de la siguiente). */
export function sunflowerMultiplier(world: World, tile: TileState): number {
  const cfg = world.balance.sunflower;
  let count = 0;
  let max = -Infinity;
  for (const t of world.grid.tiles) {
    if (t.entity !== 'Sunflower') continue;
    count++;
    max = Math.max(max, t.petals ?? 0);
  }
  const isMax = (tile.petals ?? 0) >= max;
  const penalized = world.sunflowerPenalty;
  world.sunflowerPenalty = cfg.earlyHarvestResetToNormal && !isMax;
  return count >= cfg.minCountForBonus && isMax && !penalized ? cfg.powerMultiplier : 1;
}

/**
 * Consumo automático de Items.Power (doc 01 §3): mientras quede energía, cada dron activo gasta
 * `powerCostPerDroneTick` por tick del mundo y trabaja `powerSpeedMultiplier` veces más rápido.
 * Devuelve el multiplicador de velocidad de este tick (1 sin energía).
 */
export function consumePower(world: World, activeDrones: number): number {
  if (activeDrones <= 0) return 1;
  const have = world.inventory.get('Power');
  if (have <= 0) return 1;
  const { powerCostPerDroneTick, powerSpeedMultiplier } = world.balance.ticks;
  world.inventory.add('Power', -Math.min(have, powerCostPerDroneTick * activeDrones));
  return powerSpeedMultiplier;
}
