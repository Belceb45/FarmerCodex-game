import { describe, expect, it } from 'vitest';
import type { BalanceConfig } from '../../src/config/balance';
import { WALL_BIT } from '../../src/engine/subsystems/maze';
import { DIRECTION_DELTAS, DIRECTIONS, type SimEvent } from '../../src/engine/types';
import { World } from '../../src/engine/world';
import { runProgram } from '../helpers';
import { advance, balanceWith, placeDrone, put, TICKS } from './util';

/** Granja 4×4 con un arbusto bajo el dron (0, 0), Weird_Substance de sobra y Laberintos desbloqueado. */
function mazeWorld(options: { balance?: BalanceConfig; mazes?: number; size?: number } = {}): World {
  const world = new World({ seed: 21, size: options.size ?? 4, balance: options.balance, unlocks: { Plant: 1, Mazes: options.mazes ?? 1 } });
  put(world, 0, 0, 'Bush');
  world.inventory.add('Weird_Substance', 100);
  return world;
}

function withMaze(options: Parameters<typeof mazeWorld>[0] = {}): World {
  const world = mazeWorld(options);
  expect(world.useWeirdSubstance(0, 0, world.size)).toBe(true);
  return world;
}

function treasure(world: World): { x: number; y: number } {
  const t = world.maze?.treasure;
  if (!t) throw new Error('no hay tesoro visible');
  return t;
}

function mazeEvents(world: World): Extract<SimEvent, { kind: 'maze' }>[] {
  return world.drainEvents().filter((e): e is Extract<SimEvent, { kind: 'maze' }> => e.kind === 'maze');
}

describe('Laberintos: creación (doc 03 §3.5)', () => {
  it('use_item(Items.Weird_Substance, n) sobre un arbusto crea un laberinto perfecto con un tesoro en 200 ticks', () => {
    const world = mazeWorld();
    const r = runProgram('quick_print(use_item(Items.Weird_Substance, 4))\nquick_print(get_tick_count())', { world });
    expect(r.output).toEqual(['True', String(TICKS.physicalActionSuccess)]);
    expect(world.inventory.get('Weird_Substance')).toBe(96);
    const kinds = world.grid.tiles.map((t) => t.entity);
    expect(kinds.filter((k) => k === 'Treasure')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'Hedge')).toHaveLength(15);
    expect(world.tileAt(0, 0).entity).toBe('Hedge');

    // Perfecto: muros simétricos, exactamente w·h − 1 pasos abiertos y todas las casillas conectadas.
    let passages = 0;
    for (const t of world.grid.tiles) {
      for (const dir of DIRECTIONS) {
        const d = DIRECTION_DELTAS[dir];
        const nx = t.x + d.dx;
        const ny = t.y + d.dy;
        const open = ((t.mazeWalls ?? 15) & WALL_BIT[dir]) === 0;
        if (!world.grid.inBounds(nx, ny)) {
          expect(open).toBe(false);
          continue;
        }
        const back = DIRECTIONS[(DIRECTIONS.indexOf(dir) + 2) % 4];
        expect(((world.tileAt(nx, ny).mazeWalls ?? 15) & WALL_BIT[back]) === 0).toBe(open);
        if (open && (dir === 'North' || dir === 'East')) passages++;
      }
    }
    expect(passages).toBe(15);
    const seen = new Set(['0,0']);
    const queue = [[0, 0]];
    while (queue.length) {
      const [x, y] = queue.shift() as number[];
      for (const dir of DIRECTIONS) {
        const d = DIRECTION_DELTAS[dir];
        const key = `${x + d.dx},${y + d.dy}`;
        if (((world.tileAt(x, y).mazeWalls ?? 15) & WALL_BIT[dir]) === 0 && !seen.has(key)) {
          seen.add(key);
          queue.push([x + d.dx, y + d.dy]);
        }
      }
    }
    expect(seen.size).toBe(16);
  });

  it('falla en 1 tick sin gastar nada fuera de un arbusto, con menos sustancia que el lado o sin inventario', () => {
    const offBush = mazeWorld();
    placeDrone(offBush, 1, 0);
    expect(runProgram('quick_print(use_item(Items.Weird_Substance, 4))\nquick_print(get_tick_count())', { world: offBush }).output).toEqual([
      'False',
      String(TICKS.physicalActionFail),
    ]);
    expect(offBush.inventory.get('Weird_Substance')).toBe(100);
    expect(runProgram('quick_print(use_item(Items.Weird_Substance, 3))', { world: mazeWorld() }).output).toEqual(['False']);
    const poor = mazeWorld();
    poor.inventory.add('Weird_Substance', -98);
    expect(runProgram('quick_print(use_item(Items.Weird_Substance, 4))', { world: poor }).output).toEqual(['False']);
    expect(poor.maze).toBeNull();
  });

  it('substancePerSide sale de balance.json', () => {
    const balance = balanceWith({ maze: { substancePerSide: 2 } });
    expect(runProgram('quick_print(use_item(Items.Weird_Substance, 4))', { world: mazeWorld({ balance }), balance }).output).toEqual(['False']);
    expect(runProgram('quick_print(use_item(Items.Weird_Substance, 8))', { world: mazeWorld({ balance }), balance }).output).toEqual(['True']);
  });

  it('la misma semilla genera el mismo laberinto', () => {
    const walls = () => withMaze().grid.tiles.map((t) => [t.mazeWalls, t.entity]);
    expect(walls()).toEqual(walls());
  });
});

describe('Laberintos: movimiento', () => {
  it('can_move() (1 tick) y move() respetan los muros; los bordes no envuelven y fallar cuesta 1 tick', () => {
    const world = withMaze();
    const expected = DIRECTIONS.map((dir) => {
      const d = DIRECTION_DELTAS[dir];
      return world.grid.inBounds(d.dx, d.dy) && ((world.tileAt(0, 0).mazeWalls ?? 15) & WALL_BIT[dir]) === 0;
    });
    const r = runProgram(DIRECTIONS.map((d) => `quick_print(can_move(${d}))`).join('\n') + '\nquick_print(get_tick_count())', { world });
    expect(r.output).toEqual([...expected.map((v) => (v ? 'True' : 'False')), String(4 * world.balance.builtinCosts.can_move)]);
    expect(expected[2]).toBe(false); // South desde y = 0: borde
    const blocked = runProgram('a = get_tick_count()\nquick_print(move(South))\nquick_print(get_tick_count() - a)', { world });
    expect(blocked.output).toEqual(['False', String(TICKS.physicalActionFail)]);
    expect(world.getDrone(0)).toMatchObject({ x: 0, y: 0 });
    const open = DIRECTIONS[expected.indexOf(true)];
    expect(runProgram(`quick_print(move(${open}))`, { world }).output).toEqual(['True']);
    const d = DIRECTION_DELTAS[open];
    expect(world.getDrone(0)).toMatchObject({ x: d.dx, y: d.dy });
  });

  it('plant() falla y till() no toca los setos', () => {
    const world = withMaze();
    world.inventory.add('Hay', 10);
    expect(runProgram('quick_print(plant(Entities.Bush))\ntill()', { world }).output).toEqual(['False']);
    expect(world.tileAt(0, 0).entity).toBe('Hedge');
  });
});

describe('Laberintos: tesoro y oro', () => {
  it('measure() da la posición del tesoro desde cualquier casilla', () => {
    const world = withMaze();
    const t = treasure(world);
    expect(runProgram('quick_print(measure())', { world }).output).toEqual([`(${t.x}, ${t.y})`]);
  });

  it('harvest() del tesoro da oro = lado · goldPerSide · nivel de Mazes y devuelve la granja a la normalidad', () => {
    const world = withMaze();
    const t = treasure(world);
    placeDrone(world, t.x, t.y);
    expect(runProgram('quick_print(can_harvest())\nquick_print(harvest())', { world }).output).toEqual(['True', 'True']);
    expect(world.inventory.get('Gold')).toBe(4);
    expect(world.maze).toBeNull();
    expect(world.grid.tiles.every((tile) => tile.entity === 'Grass' && tile.mazeWalls === undefined)).toBe(true);
  });

  it('el nivel de Mazes (value del árbol) y goldPerSide multiplican el oro', () => {
    const gold = (options: Parameters<typeof mazeWorld>[0]) => {
      const world = withMaze(options);
      const t = treasure(world);
      return world.harvestAt(t.x, t.y).items.Gold;
    };
    expect(gold({ mazes: 3 })).toBe(12);
    expect(gold({ balance: balanceWith({ maze: { goldPerSide: 5 } }) })).toBe(20);
    expect(gold({ size: 6 })).toBe(6);
  });
});

describe('Laberintos: reciclaje', () => {
  it('Weird_Substance sobre el tesoro lo esconde relocateTicks ticks; measure() da None hasta que reaparece', () => {
    const world = withMaze();
    world.drainEvents();
    const t = treasure(world);
    placeDrone(world, t.x, t.y);
    const r = runProgram(
      [
        'quick_print(use_item(Items.Weird_Substance, 4))',
        'quick_print(measure())',
        'while measure() == None:',
        '    pass',
        'quick_print(get_tick_count())',
        'quick_print(measure())',
      ].join('\n'),
      { world },
    );
    const events = mazeEvents(world);
    const recycle = events.find((e) => e.phase === 'recycle');
    const relocated = events.find((e) => e.phase === 'relocated');
    expect(recycle && relocated).toBeTruthy();
    expect((relocated?.tick ?? 0) - (recycle?.tick ?? 0)).toBe(world.balance.maze.relocateTicks);
    const nt = treasure(world);
    expect(nt).not.toEqual(t);
    expect(r.output).toEqual(['True', 'None', expect.any(String), `(${nt.x}, ${nt.y})`]);
    expect(Number(r.output[2])).toBeGreaterThanOrEqual(relocated?.tick ?? Infinity);
    expect(world.maze?.recycles).toBe(1);
    // Cada reciclado suma el oro de un laberinto más.
    expect(world.harvestAt(nt.x, nt.y).items).toEqual({ Gold: 8 });
  });

  it('relocateTicks sale de balance.json', () => {
    const world = withMaze({ balance: balanceWith({ maze: { relocateTicks: 50 } }) });
    const t = treasure(world);
    world.drainEvents();
    world.useWeirdSubstance(t.x, t.y, 4);
    advance(world, 49);
    expect(world.maze?.treasure).toBeNull();
    advance(world, 1);
    expect(world.maze?.treasure).not.toBeNull();
  });

  it('se puede reciclar hasta maxRecycleCount veces; al llegar se desbloquea el logro Recycling', () => {
    const world = withMaze({ balance: balanceWith({ maze: { maxRecycleCount: 2 } }) });
    for (let i = 0; i < 2; i++) {
      const t = treasure(world);
      expect(world.useWeirdSubstance(t.x, t.y, 4)).toBe(true);
      advance(world, world.balance.maze.relocateTicks);
    }
    expect(world.achievements.has('Recycling')).toBe(true);
    const t = treasure(world);
    expect(world.weirdSubstanceTarget(t.x, t.y, 4)).toBeNull();
    expect(world.useWeirdSubstance(t.x, t.y, 4)).toBe(false);
    expect(world.harvestAt(t.x, t.y).items).toEqual({ Gold: 4 * 3 });
  });

  it('el laberinto (con reciclado en curso) se guarda y la copia sigue igual que el original', () => {
    const world = withMaze();
    const t = treasure(world);
    world.useWeirdSubstance(t.x, t.y, 4);
    advance(world, 20);
    const copy = World.deserialize(JSON.parse(JSON.stringify(world.serialize())));
    expect(copy.maze).toEqual(world.maze);
    expect(copy.grid.tiles.map((x) => x.mazeWalls)).toEqual(world.grid.tiles.map((x) => x.mazeWalls));
    advance(world, 200);
    advance(copy, 200);
    expect(copy.maze?.treasure).toEqual(world.maze?.treasure);
  });
});
