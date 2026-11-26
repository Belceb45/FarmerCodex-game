import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, type BalanceConfig } from '../../src/config/balance';
import { cleanAmount } from '../../src/engine/inventory';
import { World } from '../../src/engine/world';
import { createHost, runProgram } from '../helpers';
import { balanceWith, cells, placeDrone, put, soilFarm, TICKS } from './util';

const UNLOCKS = { Plant: 1, Carrots: 1, Sunflowers: 1 };

/**
 * Granja 4×4 con `count` girasoles maduros. Los pétalos se fijan a mano: el primero tiene el
 * máximo (15) y los demás 7..14, para saber cuál es el mayor.
 */
function sunflowerFarm(count: number, balance: BalanceConfig = DEFAULT_BALANCE): World {
  const world = soilFarm({ size: 4, balance, unlocks: UNLOCKS });
  cells(4)
    .slice(0, count)
    .forEach(([x, y], i) => {
      put(world, x, y, 'Sunflower');
      world.tileAt(x, y).petals = i === 0 ? 15 : 7 + (i % 8);
    });
  return world;
}

describe('Girasoles: pétalos y measure() (doc 03 §3.2)', () => {
  it('cada girasol nace con 7 a 15 pétalos elegidos con el PRNG con semilla', () => {
    const grow = () => {
      const world = soilFarm({ size: 32 });
      for (const [x, y] of cells(32)) put(world, x, y, 'Sunflower', false);
      return world.grid.tiles.map((t) => t.petals ?? -1);
    };
    const petals = grow();
    expect(Math.min(...petals)).toBe(7);
    expect(Math.max(...petals)).toBe(15);
    expect(grow()).toEqual(petals);
  });

  it('minPetals y maxPetals salen de balance.json', () => {
    const world = soilFarm({ balance: balanceWith({ sunflower: { minPetals: 11, maxPetals: 11 } }) });
    for (const [x, y] of cells(3)) put(world, x, y, 'Sunflower');
    expect(world.grid.tiles.every((t) => t.petals === 11)).toBe(true);
  });

  it('measure() lee los pétalos de la casilla o de la vecina (con envoltura) y cuesta 1 tick', () => {
    const world = soilFarm({ size: 4 });
    put(world, 0, 0, 'Sunflower');
    put(world, 1, 0, 'Sunflower');
    put(world, 3, 0, 'Sunflower');
    world.tileAt(0, 0).petals = 9;
    world.tileAt(1, 0).petals = 12;
    world.tileAt(3, 0).petals = 14;
    const r = runProgram(
      'quick_print(measure())\nquick_print(measure(East))\nquick_print(measure(West))\nquick_print(measure(North))\nquick_print(get_tick_count())',
      { world },
    );
    expect(r.output).toEqual(['9', '12', '14', 'None', String(4 * DEFAULT_BALANCE.builtinCosts.measure)]);
  });
});

describe('Girasoles: bonificación de energía', () => {
  it('con 10 girasoles, cosechar el de más pétalos da Power × powerMultiplier (8)', () => {
    const world = sunflowerFarm(10);
    expect(world.harvestAt(0, 0).items).toEqual({ Power: DEFAULT_BALANCE.sunflower.powerMultiplier });
  });

  it('con 9 girasoles no hay bonificación', () => {
    const world = sunflowerFarm(9);
    expect(world.harvestAt(0, 0).items).toEqual({ Power: 1 });
  });

  it('cosechar uno que no es el máximo da potencia normal y deja la siguiente cosecha también normal', () => {
    const world = sunflowerFarm(12);
    expect(world.harvestAt(1, 0).items).toEqual({ Power: 1 });
    // Quedan 11: el máximo rinde normal por la penalización…
    expect(world.harvestAt(0, 0).items).toEqual({ Power: 1 });
    // …y la penalización dura una sola cosecha: el nuevo máximo (14 pétalos) vuelve a rendir ×8.
    const best = world.grid.tiles.filter((t) => t.entity === 'Sunflower').sort((a, b) => (b.petals ?? 0) - (a.petals ?? 0))[0];
    expect(world.harvestAt(best.x, best.y).items).toEqual({ Power: 8 });
  });

  it('earlyHarvestResetToNormal = false quita la penalización', () => {
    const world = sunflowerFarm(12, balanceWith({ sunflower: { earlyHarvestResetToNormal: false } }));
    world.harvestAt(1, 0);
    expect(world.harvestAt(0, 0).items).toEqual({ Power: 8 });
  });

  it('powerMultiplier y minCountForBonus salen de balance.json', () => {
    expect(sunflowerFarm(10, balanceWith({ sunflower: { powerMultiplier: 5 } })).harvestAt(0, 0).items).toEqual({ Power: 5 });
    expect(sunflowerFarm(3, balanceWith({ sunflower: { minCountForBonus: 3 } })).harvestAt(0, 0).items).toEqual({ Power: 8 });
  });

  it('la penalización se guarda con la partida', () => {
    const world = sunflowerFarm(12);
    world.harvestAt(1, 0);
    const copy = World.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    expect(copy.sunflowerPenalty).toBe(true);
    expect(copy.harvestAt(0, 0).items).toEqual({ Power: 1 });
  });
});

describe('Items.Power: velocidad ×2 (doc 01 §3, doc 02 §2)', () => {
  const program = 'move(North)\nquick_print(get_tick_count())';

  it('sin energía, move() termina a los 200 ticks', () => {
    expect(runProgram(program, { world: soilFarm() }).output).toEqual([String(TICKS.physicalActionSuccess)]);
  });

  it('con energía, cada dron descuenta 2 ticks de espera por tick del mundo y gasta powerCostPerDroneTick', () => {
    const world = soilFarm();
    world.inventory.add('Power', 10);
    const r = runProgram(program, { world });
    expect(r.output).toEqual([String(TICKS.physicalActionSuccess / TICKS.powerSpeedMultiplier)]);
    expect(world.inventory.get('Power')).toBe(cleanAmount(10 - r.ticks * TICKS.powerCostPerDroneTick));
  });

  it('al agotarse la energía el dron vuelve a velocidad normal', () => {
    const world = soilFarm();
    world.inventory.add('Power', 0.1);
    // 0.1 / 0.0025 = 40 ticks acelerados (80 de trabajo) + 120 normales = 160.
    expect(runProgram(program, { world }).output).toEqual(['160']);
    expect(world.inventory.get('Power')).toBe(0);
  });

  it('powerSpeedMultiplier y powerCostPerDroneTick salen de balance.json', () => {
    const balance = balanceWith({ ticks: { ...TICKS, powerSpeedMultiplier: 4, powerCostPerDroneTick: 0.01 } });
    const world = soilFarm({ balance });
    world.inventory.add('Power', 10);
    const r = runProgram(program, { world, balance });
    expect(r.output).toEqual(['50']);
    expect(world.inventory.get('Power')).toBe(cleanAmount(10 - r.ticks * 0.01));
  });

  it('el host del Worker aplica la energía, la indica en el snapshot y acorta la animación', () => {
    const world = soilFarm();
    world.inventory.add('Power', 5);
    const h = createHost();
    h.host.handleMessage({ type: 'INIT_GAME', seed: 7, savedState: world.serialize() });
    h.load(program);
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(100);
    const snap = h.lastSnapshot();
    expect(snap.powered).toBe(true);
    const action = snap.drones[0].action;
    expect(action?.kind).toBe('move');
    expect((action?.endTick ?? 0) - (action?.startTick ?? 0)).toBe(TICKS.physicalActionSuccess / TICKS.powerSpeedMultiplier);
    h.advance(1000);
    expect(h.consoleLines()).toContain('100');
    expect(h.lastSnapshot().powered).toBe(false);
  });
});

describe('Girasoles: siembra', () => {
  it('plant(Entities.Sunflower) cuesta una zanahoria y exige Soil', () => {
    const world = soilFarm({ unlocks: UNLOCKS });
    world.inventory.add('Carrot', 1);
    placeDrone(world, 0, 0);
    expect(runProgram('quick_print(plant(Entities.Sunflower))', { world }).output).toEqual(['True']);
    expect(world.inventory.get('Carrot')).toBe(0);
    expect(world.tileAt(0, 0).petals).toBeGreaterThanOrEqual(7);
  });
});
