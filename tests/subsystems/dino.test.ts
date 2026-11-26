import { describe, expect, it } from 'vitest';
import type { BalanceConfig } from '../../src/config/balance';
import { DEFAULT_HAT } from '../../src/engine/types';
import { World } from '../../src/engine/world';
import { runProgram } from '../helpers';
import { balanceWith, placeDrone, put, TICKS } from './util';

const UNLOCKS = { Plant: 1, Carrots: 1, Pumpkins: 1, Dinosaurs: 1 };

function dinoWorld(options: { balance?: BalanceConfig; width?: number; height?: number } = {}): World {
  return new World({ seed: 41, width: options.width ?? 5, height: options.height ?? 5, balance: options.balance, unlocks: UNLOCKS });
}

/** Inicia el modo Dinosaurio con el dron en (0, 0) llevando el sombrero. */
function startDino(world: World): void {
  const body = world.getDrone(0);
  body.hat = 'Dinosaur_Hat';
  world.startDino(body);
}

/** Lleva la manzana a (x, y) (la aparición aleatoria se prueba aparte). */
function placeApple(world: World, x: number, y: number): void {
  const dino = world.dino;
  if (!dino) throw new Error('sin modo Dinosaurio');
  if (dino.apple) world.clearTile(world.tileAt(dino.apple.x, dino.apple.y));
  const tile = world.tileAt(x, y);
  world.clearTile(tile);
  tile.entity = 'Apple';
  tile.growthProgress = 1;
  dino.apple = { x, y };
}

/** Come manzanas en fila hacia el Este desde (0, 0): la cola queda de `n` segmentos. */
function eatEast(world: World, n: number): void {
  for (let i = 1; i <= n; i++) {
    placeApple(world, i, 0);
    expect(world.moveDrone(0, 'East')).toBe(true);
  }
}

describe('Modo Dinosaurio (doc 03 §3.6)', () => {
  it('sin desbloquear Dinosaurs, change_hat(Hats.Dinosaur_Hat) detiene el script y num_unlocked da 0', () => {
    const locked = new World({ seed: 41, size: 5, unlocks: { Plant: 1 } });
    expect(runProgram('quick_print(num_unlocked(Hats.Dinosaur_Hat))', { world: locked }).output).toEqual(['0']);
    expect(runProgram('change_hat(Hats.Dinosaur_Hat)', { world: locked }).error).toMatch(/Unlocks\.Dinosaurs/);
    expect(runProgram('quick_print(num_unlocked(Hats.Dinosaur_Hat))', { world: dinoWorld() }).output).toEqual(['1']);
  });

  it('equipar el sombrero (200 ticks) vacía la granja y hace aparecer una manzana que measure() localiza', () => {
    const world = dinoWorld();
    const r = runProgram('change_hat(Hats.Dinosaur_Hat)\nquick_print(get_tick_count())\nquick_print(measure())', { world });
    const apple = world.dino?.apple;
    expect(apple).toBeTruthy();
    expect(r.output).toEqual([String(world.balance.builtinCosts.change_hat), `(${apple?.x}, ${apple?.y})`]);
    expect(world.getDrone(0).hat).toBe('Dinosaur_Hat');
    const entities = world.grid.tiles.map((t) => t.entity).filter((e) => e !== null);
    expect(entities).toEqual(['Apple']);
    expect(apple).not.toEqual({ x: 0, y: 0 });
  });

  it('cada manzana alarga la cola: los segmentos Dinosaur ocupan las casillas previas (0.2 s) y bloquean el paso', () => {
    const world = dinoWorld();
    startDino(world);
    eatEast(world, 1);
    expect(world.dino?.length).toBe(1);
    expect(world.tileAt(0, 0)).toMatchObject({ entity: 'Dinosaur', growthProgress: 0, growthDuration: world.balance.dinosaur.tailSegmentGrowthSec });
    expect(world.canMove(world.getDrone(0), 'West')).toBe(false);
    // La manzana nueva aparece en una casilla libre.
    const apple = world.dino?.apple;
    expect(apple && world.tileAt(apple.x, apple.y).entity).toBe('Apple');
    placeApple(world, 2, 0);
    world.moveDrone(0, 'East');
    placeApple(world, 4, 4);
    world.moveDrone(0, 'North');
    expect(world.dino?.tail).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(world.tileAt(0, 0).entity).toBeNull();
    expect(world.tileAt(1, 0).entity).toBe('Dinosaur');
  });

  it('move() contra la cola o el borde falla en 1 tick: no hay envoltura', () => {
    const world = dinoWorld();
    startDino(world);
    eatEast(world, 2);
    placeApple(world, 4, 4);
    const r = runProgram(
      ['a = get_tick_count()', 'quick_print(move(West))', 'quick_print(can_move(South))', 'quick_print(get_tick_count() - a)'].join('\n'),
      { world },
    );
    expect(r.output).toEqual(['False', 'False', String(TICKS.physicalActionFail + world.balance.builtinCosts.can_move)]);
    placeDrone(world, 4, 2);
    expect(world.canMove(world.getDrone(0), 'East')).toBe(false);
  });

  it('quitarse el sombrero cosecha la cola: Bone = L² · bonePerSquare y la granja vuelve a la normalidad', () => {
    const world = dinoWorld();
    startDino(world);
    eatEast(world, 3);
    const r = runProgram('change_hat(Hats.Farmer_Cap)\nquick_print(num_items(Items.Bone))', { world });
    expect(r.output).toEqual(['9']);
    expect(world.dino).toBeNull();
    expect(world.grid.tiles.some((t) => t.entity === 'Dinosaur' || t.entity === 'Apple')).toBe(false);
    expect(world.grid.tiles.every((t) => t.entity === 'Grass')).toBe(true);
  });

  it('si queda atrapado, la cola se cosecha sola y el dron recupera su sombrero', () => {
    const world = dinoWorld({ width: 2, height: 1 });
    startDino(world);
    // La única casilla libre es (1, 0): ahí aparece la manzana.
    expect(world.dino?.apple).toEqual({ x: 1, y: 0 });
    world.moveDrone(0, 'East');
    expect(world.dino).toBeNull();
    expect(world.inventory.get('Bone')).toBe(1);
    expect(world.getDrone(0).hat).toBe(DEFAULT_HAT);
  });

  it('bonePerSquare y tailSegmentGrowthSec salen de balance.json', () => {
    const balance = balanceWith({ dinosaur: { bonePerSquare: 3, tailSegmentGrowthSec: 0.5 } });
    const world = dinoWorld({ balance });
    startDino(world);
    eatEast(world, 2);
    expect(world.tileAt(1, 0).growthDuration).toBe(0.5);
    expect(world.endDino()).toBe(12);
    expect(world.inventory.get('Bone')).toBe(12);
  });

  it('la cola madura en tailSegmentGrowthSec de tiempo simulado', () => {
    const world = dinoWorld();
    startDino(world);
    eatEast(world, 1);
    const ticks = world.balance.dinosaur.tailSegmentGrowthSec * TICKS.baseTicksPerSecond;
    for (let i = 0; i < ticks + 1; i++) world.advanceTick();
    expect(world.tileAt(0, 0).growthProgress).toBe(1);
  });

  it('equipar el sombrero cierra un laberinto activo, y plant() no funciona durante el modo', () => {
    const world = new World({ seed: 41, size: 4, unlocks: { ...UNLOCKS, Mazes: 1 } });
    put(world, 0, 0, 'Bush');
    world.inventory.add('Weird_Substance', 10);
    world.useWeirdSubstance(0, 0, 4);
    expect(world.maze).not.toBeNull();
    startDino(world);
    expect(world.maze).toBeNull();
    world.inventory.add('Hay', 5);
    expect(world.checkPlant(3, 3, 'Bush')).toEqual({ ok: false, reason: 'occupied' });
  });

  it('el modo Dinosaurio se guarda y se restaura', () => {
    const world = dinoWorld();
    startDino(world);
    eatEast(world, 2);
    const copy = World.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    expect(copy.dino).toEqual(world.dino);
    expect(copy.getDrone(0).hat).toBe('Dinosaur_Hat');
    expect(copy.canMove(copy.getDrone(0), 'West')).toBe(false);
    expect(copy.endDino()).toBe(4);
  });
});
