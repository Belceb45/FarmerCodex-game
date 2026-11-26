import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../../src/config/balance';
import { cactusYield, isCactusSorted } from '../../src/engine/subsystems/cactus';
import { World } from '../../src/engine/world';
import { runProgram } from '../helpers';
import { advance, balanceWith, cells, put, soilFarm, TICKS } from './util';

const UNLOCKS = { Plant: 1, Carrots: 1, Pumpkins: 1, Cactus: 1 };

/** Coloca cactus maduros con los tamaños dados: rows[y][x]; null = casilla vacía. */
function cactusFarm(rows: (number | null)[][], options: Parameters<typeof soilFarm>[0] = {}): World {
  const world = soilFarm({ size: Math.max(rows.length, rows[0].length), unlocks: UNLOCKS, ...options });
  rows.forEach((row, y) =>
    row.forEach((size, x) => {
      if (size === null) return;
      put(world, x, y, 'Cactus');
      world.tileAt(x, y).cactusSize = size;
    }),
  );
  return world;
}

/** 3×3 ordenada: el tamaño crece hacia el Norte y hacia el Este. */
const SORTED = [
  [0, 1, 2],
  [1, 2, 3],
  [2, 3, 4],
];

describe('Cactus: tamaño y crecimiento (doc 03 §3.3)', () => {
  it('cada cactus nace con tamaño 0..9 y madura en growthDurationSec (1 s fijo)', () => {
    const world = soilFarm({ size: 32 });
    for (const [x, y] of cells(32)) put(world, x, y, 'Cactus', false);
    const sizes = world.grid.tiles.map((t) => t.cactusSize ?? -1);
    expect(Math.min(...sizes)).toBe(0);
    expect(Math.max(...sizes)).toBe(9);
    expect(world.grid.tiles.every((t) => t.growthDuration === DEFAULT_BALANCE.cactus.growthDurationSec)).toBe(true);
    const ticksToGrow = DEFAULT_BALANCE.cactus.growthDurationSec * TICKS.baseTicksPerSecond;
    advance(world, ticksToGrow - 1);
    expect(world.grid.tiles.some((t) => t.growthProgress >= 1)).toBe(false);
    advance(world, 2);
    expect(world.grid.tiles.every((t) => t.growthProgress >= 1)).toBe(true);
  });

  it('minSize, maxSize y growthDurationSec salen de balance.json', () => {
    const world = soilFarm({ balance: balanceWith({ cactus: { minSize: 4, maxSize: 4, growthDurationSec: 2 } }) });
    for (const [x, y] of cells(3)) put(world, x, y, 'Cactus', false);
    expect(world.grid.tiles.every((t) => t.cactusSize === 4 && t.growthDuration === 2)).toBe(true);
  });

  it('measure() devuelve el tamaño del cactus', () => {
    const world = cactusFarm([[3, 8]]);
    expect(runProgram('quick_print(measure())\nquick_print(measure(East))', { world }).output).toEqual(['3', '8']);
  });
});

describe('Cactus: orden 2D', () => {
  it('Norte y Este deben ser ≥, Sur y Oeste ≤ (solo cuentan vecinos cactus y sin envoltura)', () => {
    const world = cactusFarm([
      [null, 4, null],
      [4, 5, 6],
      [null, 6, null],
    ]);
    expect(isCactusSorted(world, 1, 1)).toBe(true);
    world.tileAt(1, 2).cactusSize = 4;
    expect(isCactusSorted(world, 1, 1)).toBe(false);
    expect(isCactusSorted(world, 1, 2)).toBe(false);
    world.tileAt(1, 2).cactusSize = 6;
    // Un vecino que no es cactus no cuenta.
    put(world, 2, 1, 'Bush');
    expect(isCactusSorted(world, 1, 1)).toBe(true);
    // Sin envoltura: (0, 1) no compara con (2, 1) aunque sea más chico.
    world.tileAt(0, 1).cactusSize = 0;
    put(world, 2, 1, 'Cactus');
    world.tileAt(2, 1).cactusSize = 9;
    expect(isCactusSorted(world, 0, 1)).toBe(true);
  });
});

describe('Cactus: cosecha en cadena', () => {
  it('quadratic (por defecto): n cactus maduros y ordenados rinden n² con una sola cosecha', () => {
    const world = cactusFarm(SORTED);
    expect(world.harvestAt(1, 1).items).toEqual({ Cactus: 81 });
    expect(world.grid.tiles.every((t) => t.entity === null)).toBe(true);
  });

  it('sqrt_scaled: n · ⌊√n⌋', () => {
    const balance = balanceWith({ cactus: { formulaMode: 'sqrt_scaled' } });
    expect(cactusFarm(SORTED, { balance }).harvestAt(0, 0).items).toEqual({ Cactus: 27 });
    const eight = cactusFarm(
      [
        [0, 1, 2],
        [1, 2, 3],
        [2, 3, null],
      ],
      { balance },
    );
    expect(eight.harvestAt(0, 0).items).toEqual({ Cactus: 8 * 2 });
    const world = new World({ seed: 1, size: 1, balance });
    expect([1, 4, 9, 10, 16].map((n) => cactusYield(world, n))).toEqual([1, 8, 27, 30, 64]);
  });

  it('la cadena no cruza cactus mal ordenados: el desordenado se cosecha solo', () => {
    const world = cactusFarm([[1, 5, 3]]);
    expect(world.harvestAt(0, 0).items).toEqual({ Cactus: 1 });
    expect(world.tileAt(1, 0).entity).toBe('Cactus');
    expect(world.harvestAt(1, 0).items).toEqual({ Cactus: 1 });
  });

  it('los cactus inmaduros no entran en la cadena y cosecharlos no da nada', () => {
    const world = cactusFarm([[1, 2, 3]]);
    world.tileAt(1, 0).growthProgress = 0.5;
    expect(world.harvestAt(0, 0).items).toEqual({ Cactus: 1 });
    expect(world.harvestAt(1, 0)).toMatchObject({ removed: true, mature: false, items: {} });
    expect(world.harvestAt(2, 0).items).toEqual({ Cactus: 1 });
  });
});

describe('Cactus: swap()', () => {
  it('intercambia con la vecina en 200 ticks, también con casillas vacías; en el borde falla con 1 tick', () => {
    const world = cactusFarm([[2, 7, null]]);
    const r = runProgram(
      [
        'quick_print(swap(East))',
        'quick_print(get_tick_count())',
        'quick_print(swap(North))',
        'a = get_tick_count()',
        'quick_print(swap(West))',
        'quick_print(get_tick_count() - a)',
      ].join('\n'),
      { world },
    );
    expect(r.output).toEqual(['True', String(TICKS.physicalActionSuccess), 'True', 'False', String(TICKS.physicalActionFail)]);
    expect(world.tileAt(1, 0).cactusSize).toBe(2);
    expect(world.tileAt(0, 0).entity).toBeNull();
    expect(world.tileAt(0, 1)).toMatchObject({ entity: 'Cactus', cactusSize: 7, growthProgress: 1 });
  });

  it('swap() requiere desbloquear Cactus', () => {
    const world = cactusFarm([[2, 7]], { unlocks: { Plant: 1 } });
    expect(runProgram('swap(East)', { world }).error).toMatch(/Unlocks\.Cactus/);
  });

  it('un programa que ordena con measure() y swap() consigue la cosecha completa (n²)', () => {
    const world = cactusFarm([
      [7, 2, 9],
      [0, 5, 3],
      [8, 1, 4],
    ]);
    const source = `
n = get_world_size()

def goto(x, y):
    while get_pos_x() < x:
        move(East)
    while get_pos_x() > x:
        move(West)
    while get_pos_y() < y:
        move(North)
    while get_pos_y() > y:
        move(South)

for y in range(n):
    for i in range(n):
        for x in range(n - 1):
            goto(x, y)
            if measure() > measure(East):
                swap(East)
for x in range(n):
    for i in range(n):
        for y in range(n - 1):
            goto(x, y)
            if measure() > measure(North):
                swap(North)
goto(0, 0)
harvest()
`;
    const r = runProgram(source, { world });
    expect(r.error).toBeNull();
    expect(world.inventory.get('Cactus')).toBe(81);
  });
});
