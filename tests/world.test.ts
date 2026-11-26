import { describe, expect, it } from 'vitest';
import { cloneBalance, DEFAULT_BALANCE } from '../src/config/balance';
import { GroundType } from '../src/engine/types';
import { World } from '../src/engine/world';

describe('World: estado inicial', () => {
  it('empieza con la granja del nivel 0 de Expand (1×1), pasto maduro y el dron en (0, 0)', () => {
    const world = new World({ seed: 1 });
    expect([world.width, world.height]).toEqual([1, 1]);
    for (const tile of world.grid.tiles) {
      expect(tile.ground).toBe(GroundType.Grassland);
      expect(tile.entity).toBe('Grass');
      expect(tile.growthProgress).toBe(1);
    }
    expect(world.drones).toEqual([{ id: 0, x: 0, y: 0, action: null, hat: 'Farmer_Cap' }]);
    expect(world.totalTicks).toBe(0);
    expect(world.simTime).toBe(0);
  });

  it('respeta los límites de tamaño de balance.json (1×1 a 32×32)', () => {
    expect(new World({ seed: 1, size: 0 }).size).toBe(1);
    expect(new World({ seed: 1, size: 99 }).size).toBe(DEFAULT_BALANCE.world.maxSize);
  });

  it('admite granjas rectangulares (1×3) con envoltura independiente por eje', () => {
    const world = new World({ seed: 1, width: 1, height: 3 });
    expect(world.grid.tiles).toHaveLength(3);
    expect(world.size).toBe(3);
    expect(world.grid.wrap(1, 3)).toEqual({ x: 0, y: 0 });
    expect(world.grid.index(0, 2)).toBe(2);
  });

  it('el índice plano usa el origen Sur-Oeste', () => {
    const world = new World({ seed: 1, size: 4 });
    expect(world.grid.index(0, 0)).toBe(0);
    expect(world.grid.index(3, 0)).toBe(3);
    expect(world.grid.index(0, 1)).toBe(4);
    expect(world.tileAt(2, 3)).toMatchObject({ x: 2, y: 3 });
  });
});

describe('World: crecimiento y cosecha', () => {
  it('el pasto crece solo mientras avanzan los ticks y madura según su duración', () => {
    const world = new World({ seed: 3, size: 3 });
    world.harvestAt(0, 0);
    const tile = world.tileAt(0, 0);
    expect(tile.entity).toBe('Grass');
    expect(tile.growthProgress).toBe(0);
    const cfg = DEFAULT_BALANCE.entities.Grass;
    expect(tile.growthDuration).toBeGreaterThanOrEqual(cfg.growthSec * (1 - cfg.growthVariance));
    expect(tile.growthDuration).toBeLessThanOrEqual(cfg.growthSec * (1 + cfg.growthVariance));
    const ticksNeeded = Math.ceil(tile.growthDuration * DEFAULT_BALANCE.ticks.baseTicksPerSecond);
    for (let i = 0; i < ticksNeeded - 5; i++) world.advanceTick();
    expect(tile.growthProgress).toBeLessThan(1);
    expect(world.canHarvestAt(0, 0)).toBe(false);
    for (let i = 0; i < 10; i++) world.advanceTick();
    expect(tile.growthProgress).toBe(1);
    expect(world.canHarvestAt(0, 0)).toBe(true);
  });

  it('cosechar pasto maduro da heno y el pasto rebrota', () => {
    const world = new World({ seed: 1, size: 3 });
    const result = world.harvestAt(1, 1);
    expect(result).toEqual({ removed: true, mature: true, items: { Hay: 1 } });
    expect(world.inventory.get('Hay')).toBe(1);
    expect(world.tileAt(1, 1)).toMatchObject({ entity: 'Grass', growthProgress: 0 });
    expect(world.drainEvents()).toEqual([
      { kind: 'harvest', tick: 0, x: 1, y: 1, mature: true, items: { Hay: 1 } },
    ]);
  });

  it('cosechar pasto inmaduro lo destruye sin dar heno', () => {
    const world = new World({ seed: 1, size: 3 });
    world.harvestAt(0, 0);
    for (let i = 0; i < 20; i++) world.advanceTick();
    const result = world.harvestAt(0, 0);
    expect(result.removed).toBe(true);
    expect(result.mature).toBe(false);
    expect(world.inventory.get('Hay')).toBe(1);
    expect(world.tileAt(0, 0).growthProgress).toBe(0);
  });

  it('till alterna Grassland <-> Soil y destruye la entidad', () => {
    const world = new World({ seed: 1, size: 3 });
    world.tillAt(0, 0);
    expect(world.tileAt(0, 0)).toMatchObject({ ground: GroundType.Soil, entity: null });
    expect(world.harvestAt(0, 0).removed).toBe(false);
    world.tillAt(0, 0);
    expect(world.tileAt(0, 0)).toMatchObject({ ground: GroundType.Grassland, entity: 'Grass', growthProgress: 0 });
    expect(world.inventory.get('Hay')).toBe(0);
  });

  it('el rendimiento sale de balance.json', () => {
    const balance = cloneBalance();
    balance.entities.Grass.yield = { Hay: 3 };
    const world = new World({ seed: 1, balance, size: 3 });
    world.harvestAt(0, 0);
    expect(world.inventory.get('Hay')).toBe(3);
  });
});

describe('World: movimiento y tamaño', () => {
  it('moveDrone envuelve los bordes', () => {
    const world = new World({ seed: 1, size: 3 });
    world.moveDrone(0, 'West');
    expect(world.drones[0]).toMatchObject({ x: 2, y: 0 });
    world.moveDrone(0, 'South');
    expect(world.drones[0]).toMatchObject({ x: 2, y: 2 });
    world.moveDrone(0, 'North');
    world.moveDrone(0, 'East');
    expect(world.drones[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('en una granja 1x1 el dron siempre vuelve a la misma casilla', () => {
    const world = new World({ seed: 1, size: 1 });
    world.moveDrone(0, 'North');
    expect(world.drones[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('resize conserva las casillas existentes y siembra las nuevas', () => {
    const world = new World({ seed: 1, size: 2 });
    world.tillAt(1, 1);
    world.drones[0].x = 1;
    world.resize(4);
    expect(world.size).toBe(4);
    expect(world.tileAt(1, 1).ground).toBe(GroundType.Soil);
    expect(world.tileAt(3, 3)).toMatchObject({ ground: GroundType.Grassland, entity: 'Grass' });
    world.resize(1);
    expect(world.drones[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('World: determinismo y serialización', () => {
  it('misma semilla => mismas duraciones de crecimiento', () => {
    const run = (seed: number) => {
      const world = new World({ seed, size: 4 });
      for (let x = 0; x < 4; x++) world.harvestAt(x, 0);
      return world.grid.tiles.slice(0, 4).map((t) => t.growthDuration);
    };
    expect(run(10)).toEqual(run(10));
    expect(run(10)).not.toEqual(run(11));
  });

  it('serialize/deserialize reconstruye el mismo estado y continúa igual', () => {
    const world = new World({ seed: 77, size: 3 });
    world.harvestAt(0, 0);
    world.tillAt(2, 2);
    for (let i = 0; i < 37; i++) world.advanceTick();
    world.moveDrone(0, 'East');
    const copy = World.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    expect(copy.serialize()).toEqual(world.serialize());
    world.harvestAt(1, 0);
    copy.harvestAt(1, 0);
    for (let i = 0; i < 50; i++) {
      world.advanceTick();
      copy.advanceTick();
    }
    expect(copy.serialize()).toEqual(world.serialize());
  });
});
