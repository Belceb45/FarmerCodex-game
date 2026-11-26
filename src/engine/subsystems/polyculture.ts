import { polycultureMultiplier, techLevel } from '../tech';
import type { EntityKind, TileState } from '../types';
import type { World } from '../world';

/**
 * Policultivo (doc 03 §3.4): con el desbloqueo, cada planta elige un compañero (otra especie) en una
 * casilla a distancia Manhattan ≤ `companionRadius`. Si al cosechar está ahí, el rendimiento se
 * multiplica de `baseMultiplier` (nivel 1) a `maxMultiplier` (nivel máximo).
 */

export const COMPANION_PLANTS: readonly EntityKind[] = ['Grass', 'Bush', 'Tree', 'Carrot'];

export function assignCompanion(world: World, tile: TileState): void {
  tile.companion = undefined;
  if (techLevel(world.unlocks, 'Polyculture') < 1 || tile.entity === null || !COMPANION_PLANTS.includes(tile.entity)) return;
  const others = COMPANION_PLANTS.filter((e) => e !== tile.entity);
  const r = world.balance.polyculture.companionRadius;
  const spots: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < 1 || d > r) continue;
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (world.grid.inBounds(x, y)) spots.push([x, y]);
    }
  }
  if (spots.length === 0) return;
  const entity = others[world.rng.nextInt(0, others.length - 1)];
  const [x, y] = spots[world.rng.nextInt(0, spots.length - 1)];
  tile.companion = { entity, x, y };
}

/** Multiplicador de la cosecha de esta casilla según su compañero (1 si no se cumple). */
export function companionBonus(world: World, tile: TileState): number {
  const c = tile.companion;
  if (!c || !world.grid.inBounds(c.x, c.y)) return 1;
  if (world.grid.get(c.x, c.y).entity !== c.entity) return 1;
  const cfg = world.balance.polyculture;
  return polycultureMultiplier(world.techTree, world.unlocks, cfg.baseMultiplier, cfg.maxMultiplier);
}
