import { describe, expect, it } from 'vitest';
import { findTech } from '../../src/engine/tech';
import { ITEM_KINDS } from '../../src/engine/types';
import { World } from '../../src/engine/world';
import { runProgram } from '../helpers';

/** Base de la Fase 2 más Girasoles y Calabazas: lo previo a las ramas de la Fase 3. */
const BASE = { Plant: 1, Trees: 1, Carrots: 1, Watering: 1, Fertilizer: 1, Sunflowers: 1, Pumpkins: 1 };
const BRANCHES = ['Cactus', 'Dinosaurs', 'Mazes'];

/** Inventario de sobra de todo menos Items.Power (que aceleraría al dron y cambiaría los ticks medidos). */
function richWorld(unlocks: Record<string, number> = BASE): World {
  const world = new World({ seed: 3, size: 3, unlocks });
  for (const item of ITEM_KINDS) if (item !== 'Power') world.inventory.add(item, 1e9);
  return world;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

describe('Árbol tecnológico de la Fase 3', () => {
  it('Cactus, Dinosaurios y Laberintos se desbloquean en cualquier orden', () => {
    for (const order of permutations(BRANCHES)) {
      const world = richWorld();
      for (const id of order) expect(world.unlock(id), `${order.join(' → ')}: ${id}`).toMatchObject({ ok: true, level: 1 });
    }
  });

  it('ninguna de las tres ramas exige otra de ellas', () => {
    for (const id of BRANCHES) {
      const node = findTech(richWorld().techTree, id);
      expect(node?.requires.filter((r) => BRANCHES.includes(r))).toEqual([]);
    }
  });

  it('Policultivo queda bloqueado hasta completar Laberintos', () => {
    const world = richWorld();
    world.unlock('Cactus');
    world.unlock('Dinosaurs');
    const before = world.checkUnlock('Polyculture');
    expect(before.ok).toBe(false);
    expect(before.ok ? '' : before.message).toMatch(/Laberintos/);
    expect(world.unlock('Polyculture').ok).toBe(false);
    expect(world.unlock('Mazes').ok).toBe(true);
    expect(world.unlock('Polyculture')).toMatchObject({ ok: true, level: 1 });
  });

  it('Policultivo solo pide Laberintos: se compra sin Cactus ni Dinosaurios', () => {
    const world = richWorld();
    world.unlock('Mazes');
    expect(world.checkUnlock('Polyculture').ok).toBe(true);
  });

  it('unlock() desde el DSL respeta el bloqueo (False en 1 tick) y desbloquea cuando se cumple', () => {
    const world = richWorld();
    const r = runProgram('quick_print(unlock(Unlocks.Polyculture))\nquick_print(get_tick_count())', { world });
    expect(r.output).toEqual(['False', String(world.balance.ticks.physicalActionFail)]);
    const ok = runProgram('quick_print(unlock(Unlocks.Mazes))\nquick_print(unlock(Unlocks.Polyculture))\nquick_print(num_unlocked(Unlocks.Polyculture))', {
      world,
    });
    expect(ok.output).toEqual(['True', 'True', '1']);
  });

  it('cada rama habilita lo suyo: plant(Cactus) y swap(), Hats.Dinosaur_Hat, Weird_Substance y get_companion()', () => {
    const world = richWorld();
    expect(world.isGranted('entities', 'Cactus')).toBe(false);
    expect(world.isGranted('functions', 'swap')).toBe(false);
    expect(world.isGranted('hats', 'Dinosaur_Hat')).toBe(false);
    expect(world.isGranted('items', 'Weird_Substance')).toBe(false);
    expect(world.isGranted('functions', 'get_companion')).toBe(false);
    for (const id of [...BRANCHES, 'Polyculture']) world.unlock(id);
    expect(world.isGranted('entities', 'Cactus')).toBe(true);
    expect(world.isGranted('functions', 'swap')).toBe(true);
    expect(world.isGranted('hats', 'Dinosaur_Hat')).toBe(true);
    expect(world.isGranted('items', 'Weird_Substance')).toBe(true);
    expect(world.isGranted('functions', 'get_companion')).toBe(true);
  });
});
