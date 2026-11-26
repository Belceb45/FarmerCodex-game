import { describe, expect, it } from 'vitest';
import { megaPumpkinYield } from '../../src/engine/subsystems/pumpkin';
import { World } from '../../src/engine/world';
import { runProgram } from '../helpers';
import { advance, balanceWith, cells, placeDrone, put, soilFarm, TICKS } from './util';

const UNLOCKS = { Plant: 1, Carrots: 1, Pumpkins: 1 };
const NO_DEATH = balanceWith({ pumpkin: { deathRate: 0 } });
/** 2.0 s ± 20 % = como mucho 2.4 s = 960 ticks a 400 ticks/s. */
const GROW_TICKS = 1000;

function growPumpkins(world: World, at: [number, number][]): void {
  for (const [x, y] of at) put(world, x, y, 'Pumpkin', false);
  advance(world, GROW_TICKS);
}

describe('Calabazas: fórmula de la megacalabaza (doc 03 §3.1)', () => {
  it('capped_cubic (por defecto): N³ hasta N = 6 y N² · 6 por encima', () => {
    const world = new World({ seed: 1, size: 1 });
    expect([1, 2, 3, 4, 5, 6].map((n) => megaPumpkinYield(world, n))).toEqual([1, 8, 27, 64, 125, 216]);
    expect(megaPumpkinYield(world, 7)).toBe(7 * 7 * 6);
    expect(megaPumpkinYield(world, 10)).toBe(600);
  });

  it('pure_cubic: N³ para cualquier N', () => {
    const world = new World({ seed: 1, size: 1, balance: balanceWith({ pumpkin: { formulaMode: 'pure_cubic' } }) });
    expect(megaPumpkinYield(world, 7)).toBe(343);
    expect(megaPumpkinYield(world, 10)).toBe(1000);
  });

  it('maxCubicMergeSize sale de balance.json', () => {
    const world = new World({ seed: 1, size: 1, balance: balanceWith({ pumpkin: { maxCubicMergeSize: 2 } }) });
    expect(megaPumpkinYield(world, 2)).toBe(8);
    expect(megaPumpkinYield(world, 3)).toBe(3 * 3 * 2);
  });
});

describe('Calabazas: muerte al madurar', () => {
  it('con deathRate 0.2 muere cerca de 1 de cada 5 (Dead_Pumpkin), siempre igual con la misma semilla', () => {
    const run = () => {
      const world = soilFarm({ size: 32, balance: balanceWith({ pumpkin: { deathRate: 0.2 } }) });
      growPumpkins(world, cells(32));
      return world.grid.tiles.map((t) => t.entity);
    };
    const a = run();
    const dead = a.filter((e) => e === 'Dead_Pumpkin').length;
    expect(a.filter((e) => e === 'Pumpkin').length + dead).toBe(1024);
    expect(dead / 1024).toBeGreaterThan(0.16);
    expect(dead / 1024).toBeLessThan(0.24);
    expect(run()).toEqual(a);
  });

  it('deathRate 1 las mata todas y 0 ninguna', () => {
    const all = soilFarm({ balance: balanceWith({ pumpkin: { deathRate: 1 } }) });
    growPumpkins(all, cells(3));
    expect(all.grid.tiles.every((t) => t.entity === 'Dead_Pumpkin')).toBe(true);
    const none = soilFarm({ balance: NO_DEATH });
    growPumpkins(none, cells(3));
    expect(none.grid.tiles.every((t) => t.entity === 'Pumpkin')).toBe(true);
  });

  it('Dead_Pumpkin: can_harvest() es False y harvest() la quita sin dar nada en 200 ticks', () => {
    const world = soilFarm({ unlocks: UNLOCKS, balance: balanceWith({ pumpkin: { deathRate: 1 } }) });
    growPumpkins(world, [[0, 0]]);
    expect(world.tileAt(0, 0).entity).toBe('Dead_Pumpkin');
    expect(runProgram('quick_print(can_harvest())', { world }).output).toEqual(['False']);
    const before = world.inventory.toRecord();
    const r = runProgram('quick_print(harvest())\nquick_print(get_tick_count())', { world });
    const start = r.world.totalTicks - r.ticks;
    expect(r.output).toEqual(['True', String(start + TICKS.physicalActionSuccess)]);
    expect(world.tileAt(0, 0).entity).toBeNull();
    expect(world.inventory.toRecord()).toEqual(before);
  });

  it('plant() reemplaza una Dead_Pumpkin', () => {
    const world = soilFarm({ unlocks: UNLOCKS, balance: balanceWith({ pumpkin: { deathRate: 1 } }) });
    growPumpkins(world, [[0, 0]]);
    world.inventory.add('Carrot', 1);
    expect(runProgram('quick_print(plant(Entities.Pumpkin))', { world }).output).toEqual(['True']);
    expect(world.tileAt(0, 0).entity).toBe('Pumpkin');
  });
});

describe('Calabazas: megacalabazas', () => {
  it('un cuadrado 3×3 de calabazas maduras se fusiona y rinde 27 con una sola cosecha de 200 ticks', () => {
    const world = soilFarm({ unlocks: UNLOCKS, balance: NO_DEATH });
    growPumpkins(world, cells(3));
    for (const t of world.grid.tiles) expect(t.mega).toEqual({ x: 0, y: 0, size: 3 });
    placeDrone(world, 1, 1);
    const start = world.totalTicks;
    const r = runProgram('quick_print(harvest())\nquick_print(get_tick_count())', { world });
    expect(r.output).toEqual(['True', String(start + TICKS.physicalActionSuccess)]);
    expect(world.inventory.get('Pumpkin')).toBe(27);
    expect(world.grid.tiles.every((t) => t.entity === null && t.mega === undefined)).toBe(true);
  });

  it('un 2×2 dentro de la granja rinde 8 y las calabazas sueltas 1', () => {
    const world = soilFarm({ balance: NO_DEATH });
    growPumpkins(world, [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 2],
    ]);
    expect(world.tileAt(1, 1).mega).toEqual({ x: 0, y: 0, size: 2 });
    expect(world.tileAt(2, 2).mega).toBeUndefined();
    expect(world.harvestAt(2, 2).items).toEqual({ Pumpkin: 1 });
    expect(world.harvestAt(0, 1).items).toEqual({ Pumpkin: 8 });
  });

  it('una Dead_Pumpkin en el cuadrado impide la fusión', () => {
    const world = soilFarm({ balance: NO_DEATH });
    put(world, 1, 1, 'Dead_Pumpkin');
    growPumpkins(world, [
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(world.grid.tiles.some((t) => t.mega)).toBe(false);
    expect(world.harvestAt(0, 0).items).toEqual({ Pumpkin: 1 });
  });

  it('cambiar formulaMode en balance.json cambia la cosecha sin tocar código', () => {
    const harvest3x3 = (mode: 'capped_cubic' | 'pure_cubic') => {
      const world = soilFarm({ balance: balanceWith({ pumpkin: { deathRate: 0, maxCubicMergeSize: 2, formulaMode: mode } }) });
      growPumpkins(world, cells(3));
      return world.harvestAt(0, 0).items.Pumpkin;
    };
    expect(harvest3x3('capped_cubic')).toBe(18);
    expect(harvest3x3('pure_cubic')).toBe(27);
  });

  it('la fusión, las muertes y el guardado se conservan al serializar', () => {
    const world = soilFarm({ balance: NO_DEATH });
    growPumpkins(world, cells(2));
    const copy = World.deserialize(JSON.parse(JSON.stringify(world.serialize())), NO_DEATH);
    expect(copy.tileAt(1, 1).mega).toEqual({ x: 0, y: 0, size: 2 });
    expect(copy.harvestAt(0, 0).items).toEqual({ Pumpkin: 8 });
  });
});
