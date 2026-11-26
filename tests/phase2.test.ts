import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/config/balance';
import { DEFAULT_TECH_TREE, farmSize, speedMultiplier } from '../src/engine/tech';
import { GroundType } from '../src/engine/types';
import { World, type SerializedWorldStateV1 } from '../src/engine/world';
import { createHost, runProgram } from './helpers';

const TICKS = DEFAULT_BALANCE.ticks;
const ALL = { Plant: 1, Trees: 1, Carrots: 1, Watering: 1, Fertilizer: 1 };

/** Granja de 3×3 con todo lo de la Fase 2 desbloqueado. */
function farm(seed = 5, unlocks: Record<string, number> = ALL): World {
  return new World({ seed, size: 3, unlocks });
}

function advance(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.advanceTick();
}

describe('Fase 2: siembra (plant)', () => {
  it('plantar Carrot sobre Grassland falla en silencio, cuesta 1 tick y no descuenta inventario', () => {
    const world = farm();
    world.inventory.add('Hay', 5);
    world.inventory.add('Wood', 5);
    const r = runProgram('quick_print(plant(Entities.Carrot))\nquick_print(get_tick_count())', { world });
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['False', String(TICKS.physicalActionFail)]);
    expect(world.inventory.toRecord()).toMatchObject({ Hay: 5, Wood: 5 });
    expect(world.tileAt(0, 0).entity).toBe('Grass');
  });

  it('plantar Carrot sobre Soil descuenta el costo, deja un brote al instante y espera 200 ticks', () => {
    const world = farm();
    world.tillAt(0, 0);
    world.inventory.add('Hay', 3);
    world.inventory.add('Wood', 3);
    const r = runProgram('quick_print(plant(Entities.Carrot))\nquick_print(get_tick_count())', { world });
    expect(r.output).toEqual(['True', String(TICKS.physicalActionSuccess)]);
    const cost = DEFAULT_BALANCE.entities.Carrot.plantCost;
    expect(world.inventory.get('Hay')).toBe(3 - cost.Hay);
    expect(world.inventory.get('Wood')).toBe(3 - cost.Wood);
    expect(world.tileAt(0, 0).entity).toBe('Carrot');
    expect(world.tileAt(0, 0).growthProgress).toBeGreaterThan(0);
  });

  it('sin recursos, o con la casilla ocupada, plant() devuelve False', () => {
    const world = farm();
    world.tillAt(0, 0);
    expect(runProgram('quick_print(plant(Entities.Carrot))', { world }).output).toEqual(['False']);
    world.plantAt(1, 0, 'Bush');
    const r = runProgram('move(East)\nquick_print(plant(Entities.Tree))', { world });
    expect(r.output).toEqual(['False']);
    expect(world.tileAt(1, 0).entity).toBe('Bush');
  });

  it('el pasto cuenta como casilla libre: plantar un Bush lo reemplaza', () => {
    const world = farm();
    expect(world.tileAt(0, 0).entity).toBe('Grass');
    expect(runProgram('quick_print(plant(Entities.Bush))', { world }).output).toEqual(['True']);
    expect(world.tileAt(0, 0).entity).toBe('Bush');
  });

  it('sin el desbloqueo, plant() detiene el script indicando qué tecnología falta', () => {
    const locked = runProgram('plant(Entities.Bush)', { world: new World({ seed: 1, size: 3 }) });
    expect(locked.error).toMatch(/^UnlockError: plant\(\) requiere desbloquear «Siembra» \(Unlocks\.Plant\)/);
    const noTrees = runProgram('plant(Entities.Tree)', { world: farm(5, { Plant: 1 }) });
    expect(noTrees.error).toMatch(/Unlocks\.Trees/);
  });
});

describe('Fase 2: labrado', () => {
  it('till() destruye cultivos existentes sin devolver recursos y alterna el suelo', () => {
    const world = farm();
    world.tillAt(0, 0);
    world.inventory.add('Hay', 1);
    world.inventory.add('Wood', 1);
    expect(world.plantAt(0, 0, 'Carrot').ok).toBe(true);
    world.plantAt(1, 0, 'Tree');
    runProgram('till()\nmove(East)\ntill()', { world });
    expect(world.tileAt(0, 0)).toMatchObject({ ground: GroundType.Grassland, entity: 'Grass' });
    expect(world.tileAt(1, 0)).toMatchObject({ ground: GroundType.Soil, entity: null });
    expect(world.inventory.get('Carrot')).toBe(0);
    expect(world.inventory.get('Wood')).toBe(0);
  });
});

describe('Fase 2: árboles', () => {
  it('un árbol crece más despacio con otros árboles en casillas ortogonales', () => {
    const alone = farm();
    const crowded = farm();
    alone.plantAt(1, 1, 'Tree');
    for (const [x, y] of [
      [1, 1],
      [0, 1],
      [2, 1],
    ]) {
      crowded.plantAt(x, y, 'Tree');
    }
    alone.tileAt(1, 1).growthDuration = 7;
    crowded.tileAt(1, 1).growthDuration = 7;
    advance(alone, 39);
    advance(crowded, 39);
    const slowdown = DEFAULT_BALANCE.entities.Tree.adjacentSlowdown ?? 0;
    expect(crowded.tileAt(1, 1).growthProgress).toBeCloseTo(alone.tileAt(1, 1).growthProgress / (1 + 2 * slowdown), 10);
  });

  it('un árbol maduro da más madera que un arbusto', () => {
    expect(DEFAULT_BALANCE.entities.Tree.yield.Wood).toBeGreaterThan(DEFAULT_BALANCE.entities.Bush.yield.Wood);
  });
});

describe('Fase 2: agua y evaporación', () => {
  it('use_item(Items.Water) gasta agua, sube la humedad y cuesta 200 ticks', () => {
    const world = farm(5, { Plant: 1, Watering: 1 });
    world.inventory.add('Water', 2);
    const r = runProgram('quick_print(use_item(Items.Water))\nquick_print(get_tick_count())\nquick_print(get_water())', { world });
    expect(r.output.slice(0, 2)).toEqual(['True', String(TICKS.physicalActionSuccess)]);
    expect(Number(r.output[2])).toBeGreaterThanOrEqual(DEFAULT_BALANCE.water.amountPerUse - DEFAULT_BALANCE.water.evaporationAmount);
  });

  it('cada unidad añade amountPerUse y la humedad no pasa de 1', () => {
    const world = farm();
    world.inventory.add('Water', 10);
    expect(world.waterAt(0, 0, 2).ok).toBe(true);
    expect(world.tileAt(0, 0).waterLevel).toBe(2 * DEFAULT_BALANCE.water.amountPerUse);
    expect(world.inventory.get('Water')).toBe(8);
    world.waterAt(0, 0, 8);
    expect(world.tileAt(0, 0).waterLevel).toBe(1);
    expect(world.waterAt(0, 0, 1)).toEqual({ ok: false, reason: 'items' });
  });

  it('la humedad acelera el crecimiento (1 + humedad · growthBonusAtFull)', () => {
    const dry = farm();
    const wet = farm();
    for (const w of [dry, wet]) {
      w.plantAt(0, 0, 'Bush');
      w.tileAt(0, 0).growthDuration = 4;
    }
    wet.tileAt(0, 0).waterLevel = 1;
    advance(dry, 39);
    advance(wet, 39);
    const bonus = DEFAULT_BALANCE.water.growthBonusAtFull;
    expect(wet.tileAt(0, 0).growthProgress).toBeCloseTo(dry.tileAt(0, 0).growthProgress * (1 + bonus), 10);
  });

  it('la evaporación es determinista: misma semilla, mismos niveles de humedad', () => {
    const levels = (seed: number) => {
      const w = farm(seed);
      for (const t of w.grid.tiles) t.waterLevel = 1;
      advance(w, 8000);
      return w.grid.tiles.map((t) => t.waterLevel);
    };
    expect(levels(11)).toEqual(levels(11));
    expect(levels(11)).not.toEqual(levels(12));
  });

  it('solo evapora en los intervalos de 0.1 s simulados y nunca baja de 0', () => {
    const world = farm();
    for (const t of world.grid.tiles) t.waterLevel = 0.015;
    advance(world, world.evaporationIntervalTicks - 1);
    expect(world.grid.tiles.every((t) => t.waterLevel === 0.015)).toBe(true);
    advance(world, 60_000);
    expect(world.grid.tiles.every((t) => t.waterLevel === 0)).toBe(true);
  });

  it('en cada intervalo, cada casilla húmeda pierde humedad con probabilidad ≈ 10 %', () => {
    const world = farm(3);
    for (const t of world.grid.tiles) t.waterLevel = 1;
    const intervals = 500;
    advance(world, intervals * world.evaporationIntervalTicks);
    const lost = world.grid.tiles.reduce((sum, t) => sum + (1 - t.waterLevel), 0);
    const events = lost / DEFAULT_BALANCE.water.evaporationAmount;
    const expected = 9 * intervals * DEFAULT_BALANCE.water.evaporationChance;
    expect(events).toBeGreaterThan(expected * 0.85);
    expect(events).toBeLessThan(expected * 1.15);
  });

  it('el logro Mud Farm se desbloquea con toda la granja por encima de 0.5', () => {
    const world = farm();
    for (const t of world.grid.tiles) t.waterLevel = 0.6;
    world.tileAt(2, 2).waterLevel = 0.4;
    advance(world, world.evaporationIntervalTicks);
    expect(world.achievements.has('Mud Farm')).toBe(false);
    world.tileAt(2, 2).waterLevel = 0.6;
    advance(world, world.evaporationIntervalTicks);
    expect(world.achievements.has('Mud Farm')).toBe(true);
    expect(world.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'achievement', id: 'Mud Farm' }));
  });
});

describe('Fase 2: fertilizante e infección', () => {
  it('quita growthReductionSec segundos al crecimiento restante y marca la planta como infectada', () => {
    const world = farm();
    world.plantAt(0, 0, 'Bush');
    world.tileAt(0, 0).growthDuration = 4;
    world.inventory.add('Fertilizer', 1);
    expect(world.fertilizeAt(0, 0, 1).ok).toBe(true);
    const tile = world.tileAt(0, 0);
    expect(tile.growthProgress).toBeCloseTo(DEFAULT_BALANCE.fertilizer.growthReductionSec / 4, 10);
    expect(tile.isInfected).toBe(true);
    expect(world.inventory.get('Fertilizer')).toBe(0);
    expect(tile.waterLevel).toBe(0);
  });

  it('una cosecha infectada convierte el 50 % del rendimiento en Weird_Substance', () => {
    const world = farm();
    world.plantAt(0, 0, 'Tree');
    world.inventory.add('Fertilizer', 5);
    world.fertilizeAt(0, 0, 1);
    world.tileAt(0, 0).growthProgress = 1;
    const result = world.harvestAt(0, 0);
    const wood = DEFAULT_BALANCE.entities.Tree.yield.Wood;
    const ratio = DEFAULT_BALANCE.fertilizer.infectedWeirdSubstanceRatio;
    expect(result.items).toEqual({ Wood: wood * (1 - ratio), Weird_Substance: wood * ratio });
    expect(world.inventory.get('Weird_Substance')).toBe(wood * ratio);
    expect(world.tileAt(0, 0).isInfected).toBe(false);
  });

  it('desde el script: use_item(Items.Fertilizer) sin planta devuelve False y no gasta', () => {
    const world = farm();
    world.tillAt(0, 0);
    world.inventory.add('Fertilizer', 2);
    const r = runProgram('quick_print(use_item(Items.Fertilizer))', { world });
    expect(r.output).toEqual(['False']);
    // No se gastó nada (solo el relleno automático de los ticks transcurridos).
    expect(world.inventory.get('Fertilizer')).toBeGreaterThanOrEqual(2);
    expect(world.inventory.get('Fertilizer')).toBeLessThan(2.01);
  });

  it('sin desbloquear Fertilizer, use_item(Items.Fertilizer) detiene el script', () => {
    const r = runProgram('use_item(Items.Fertilizer)', { world: farm(5, { Plant: 1 }) });
    expect(r.error).toMatch(/Unlocks\.Fertilizer/);
  });

  it('Weird_Substance se usa con los laberintos: sin desbloquear Mazes detiene el script', () => {
    const world = farm();
    world.inventory.add('Weird_Substance', 1);
    expect(runProgram('use_item(Items.Weird_Substance)', { world }).error).toMatch(/Unlocks\.Mazes/);
  });
});

describe('Fase 2: árbol tecnológico', () => {
  it('desbloquear descuenta el costo, exige los requisitos y respeta el nivel máximo', () => {
    const world = new World({ seed: 1 });
    expect(world.unlock('Trees')).toEqual({ ok: false, message: expect.stringMatching(/requiere antes: Siembra/) });
    expect(world.unlock('Plant')).toEqual({ ok: false, message: expect.stringMatching(/faltan recursos/) });
    world.inventory.add('Hay', 60);
    expect(world.unlock('Plant')).toEqual({ ok: true, level: 1 });
    expect(world.inventory.get('Hay')).toBe(10);
    expect(world.unlock('Plant')).toEqual({ ok: false, message: expect.stringMatching(/nivel máximo/) });
  });

  it('Expand recorre los tamaños del documento: 1×1 → 1×3 → 3×3 → 4×4', () => {
    const world = new World({ seed: 1 });
    world.inventory.add('Hay', 10_000);
    world.inventory.add('Wood', 10_000);
    const sizes = [[world.width, world.height]];
    for (let i = 0; i < 3; i++) {
      expect(world.unlock('Expand').ok).toBe(true);
      sizes.push([world.width, world.height]);
    }
    expect(sizes).toEqual([
      [1, 1],
      [1, 3],
      [3, 3],
      [4, 4],
    ]);
    expect(farmSize(DEFAULT_TECH_TREE, world.unlocks)).toEqual([4, 4]);
  });

  it('Speed multiplica los ticks por segundo del simulador', () => {
    const h = createHost();
    expect(h.host.ticksPerRealSecond()).toBe(TICKS.baseTicksPerSecond);
    h.host.currentWorld.inventory.add('Hay', 20);
    h.host.handleMessage({ type: 'UNLOCK_TECH', techId: 'Speed' });
    expect(h.host.ticksPerRealSecond()).toBe(TICKS.baseTicksPerSecond * speedMultiplier(DEFAULT_TECH_TREE, { Speed: 1 }));
    expect(h.lastSnapshot().unlocks.Speed).toBe(1);
    expect(h.messages.some((m) => m.type === 'SAVE_REQUIRED')).toBe(true);
  });

  it('unlock(), num_unlocked() y get_cost() desde el código', () => {
    const world = new World({ seed: 1, size: 3 });
    world.inventory.add('Hay', 50);
    const r = runProgram(
      [
        'quick_print(get_cost(Unlocks.Plant))',
        'quick_print(unlock(Unlocks.Plant))',
        'quick_print(num_unlocked(Unlocks.Plant), num_unlocked(Entities.Bush), num_unlocked(Entities.Carrot))',
        'quick_print(get_cost(Unlocks.Plant))',
        'quick_print(get_cost(Entities.Carrot))',
        'quick_print(unlock(Unlocks.Trees))',
      ].join('\n'),
      { world },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['{Items.Hay: 50}', 'True', '1 1 0', 'None', '{Items.Hay: 1, Items.Wood: 1}', 'False']);
  });

  it('los depósitos se rellenan solo mientras corre la simulación y respetan su capacidad', () => {
    const world = farm(5, { Plant: 1, Watering: 1 });
    advance(world, TICKS.baseTicksPerSecond);
    expect(world.inventory.get('Water')).toBe(DEFAULT_BALANCE.water.refillPerSecPerLevel);
    advance(world, 60 * TICKS.baseTicksPerSecond);
    expect(world.inventory.get('Water')).toBe(DEFAULT_BALANCE.water.tankCapacityPerLevel);
  });
});

describe('Fase 2: guardado', () => {
  it('serializar y restaurar conserva cuadrícula, inventario, desbloqueos, humedad, infección y logros', () => {
    const world = farm(9);
    world.inventory.add('Wood', 12.5);
    world.tillAt(2, 2);
    world.tileAt(1, 1).waterLevel = 0.75;
    world.inventory.add('Fertilizer', 1);
    world.fertilizeAt(0, 0, 1);
    world.unlockAchievement('Mud Farm');
    advance(world, 333);
    const restored = World.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    expect(restored.serialize()).toEqual(world.serialize());
    advance(world, 500);
    advance(restored, 500);
    expect(restored.serialize()).toEqual(world.serialize());
  });

  it('acepta estados guardados con el formato de la Fase 1', () => {
    const old = new World({ seed: 4, size: 3 }).serialize();
    const v1: SerializedWorldStateV1 = {
      version: 1,
      seed: old.seed,
      rngState: old.rngState,
      scriptRngState: old.scriptRngState,
      size: 3,
      totalTicks: old.totalTicks,
      tiles: old.tiles,
      inventory: { Hay: 7 },
      drones: old.drones,
    };
    const restored = World.deserialize(v1);
    expect([restored.width, restored.height]).toEqual([3, 3]);
    expect(restored.inventory.get('Hay')).toBe(7);
    expect(restored.unlocks.Grass).toBe(1);
  });

  it('el simulador pide guardar al terminar un script', () => {
    const h = createHost();
    h.load('move(North)');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(1500);
    const saves = h.messages.filter((m) => m.type === 'SAVE_REQUIRED');
    expect(saves.length).toBeGreaterThan(0);
    const last = saves[saves.length - 1];
    expect(last.type === 'SAVE_REQUIRED' && last.state.drones[0].y).toBe(1);
  });
});
