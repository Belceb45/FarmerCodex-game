import { describe, expect, it } from 'vitest';
import type { BalanceConfig } from '../../src/config/balance';
import { COMPANION_PLANTS } from '../../src/engine/subsystems/polyculture';
import type { EntityKind } from '../../src/engine/types';
import { World } from '../../src/engine/world';
import { runProgram } from '../helpers';
import { balanceWith, cells, placeDrone, put } from './util';

const BASE = { Plant: 1, Trees: 1, Carrots: 1, Mazes: 1 };

function polyWorld(level: number, balance?: BalanceConfig): World {
  return new World({ seed: 31, size: 8, balance, unlocks: { ...BASE, Polyculture: level } });
}

/** Arbusto maduro en (3, 3) con su compañero ya plantado donde lo pide. */
function bushWithCompanion(world: World): void {
  put(world, 3, 3, 'Bush');
  const c = world.tileAt(3, 3).companion;
  if (!c) throw new Error('el arbusto no pidió compañero');
  put(world, c.x, c.y, c.entity, false);
}

describe('Policultivo (doc 03 §3.4)', () => {
  it('sin Polyculture, get_companion() detiene el script y las plantas no piden compañero', () => {
    const world = polyWorld(0);
    put(world, 0, 0, 'Bush');
    expect(world.tileAt(0, 0).companion).toBeUndefined();
    expect(runProgram('get_companion()', { world }).error).toMatch(/Unlocks\.Polyculture/);
  });

  it('cada planta pide otra especie a distancia Manhattan 1..companionRadius dentro de la granja', () => {
    const world = polyWorld(1);
    const kinds: EntityKind[] = ['Grass', 'Bush', 'Tree', 'Carrot'];
    cells(8).forEach(([x, y], i) => put(world, x, y, kinds[i % 4]));
    const radius = world.balance.polyculture.companionRadius;
    for (const t of world.grid.tiles) {
      const c = t.companion;
      expect(c).toBeDefined();
      if (!c) continue;
      expect(c.entity).not.toBe(t.entity);
      expect(COMPANION_PLANTS).toContain(c.entity);
      const d = Math.abs(c.x - t.x) + Math.abs(c.y - t.y);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(radius);
      expect(world.grid.inBounds(c.x, c.y)).toBe(true);
    }
  });

  it('get_companion() devuelve (entidad, (x, y)) en 1 tick, o None si la casilla no pide nada', () => {
    const world = polyWorld(1);
    put(world, 3, 3, 'Bush');
    placeDrone(world, 3, 3);
    const c = world.tileAt(3, 3).companion;
    const r = runProgram('quick_print(get_companion())\nquick_print(get_tick_count())', { world });
    expect(r.output).toEqual([`(Entities.${c?.entity}, (${c?.x}, ${c?.y}))`, String(world.balance.builtinCosts.get_companion)]);
    world.clearTile(world.tileAt(3, 3));
    expect(runProgram('quick_print(get_companion())', { world }).output).toEqual(['None']);
  });

  it('con el compañero en su casilla, la cosecha se multiplica de 5× (nivel 1) a 15× (nivel 5)', () => {
    const wood = [1, 2, 3, 4, 5].map((level) => {
      const world = polyWorld(level);
      bushWithCompanion(world);
      return world.harvestAt(3, 3).items.Wood;
    });
    expect(wood).toEqual([5, 7.5, 10, 12.5, 15]);
  });

  it('sin el compañero (u otra especie en su casilla) la cosecha es normal', () => {
    const world = polyWorld(5);
    put(world, 3, 3, 'Bush');
    const wanted = world.tileAt(3, 3).companion;
    if (!wanted) throw new Error('sin compañero');
    world.clearTile(world.tileAt(wanted.x, wanted.y));
    expect(world.harvestAt(3, 3).items).toEqual({ Wood: 1 });
    const other = polyWorld(5);
    put(other, 3, 3, 'Bush');
    const c = other.tileAt(3, 3).companion;
    if (!c) throw new Error('sin compañero');
    put(other, c.x, c.y, COMPANION_PLANTS.find((e) => e !== c.entity && e !== 'Bush') ?? 'Grass');
    expect(other.harvestAt(3, 3).items).toEqual({ Wood: 1 });
  });

  it('baseMultiplier, maxMultiplier y companionRadius salen de balance.json', () => {
    const balance = balanceWith({ polyculture: { baseMultiplier: 2, maxMultiplier: 4, companionRadius: 1 } });
    const at = (level: number) => {
      const world = polyWorld(level, balance);
      bushWithCompanion(world);
      const c = world.tileAt(3, 3).companion;
      expect(Math.abs((c?.x ?? 0) - 3) + Math.abs((c?.y ?? 0) - 3)).toBe(1);
      return world.harvestAt(3, 3).items.Wood;
    };
    expect([at(1), at(3), at(5)]).toEqual([2, 3, 4]);
  });

  it('el compañero se guarda con la partida', () => {
    const world = polyWorld(2);
    bushWithCompanion(world);
    const copy = World.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    expect(copy.tileAt(3, 3).companion).toEqual(world.tileAt(3, 3).companion);
    expect(copy.harvestAt(3, 3).items).toEqual({ Wood: 7.5 });
  });
});
