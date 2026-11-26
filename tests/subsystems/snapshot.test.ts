import { describe, expect, it } from 'vitest';
import { entityCode } from '../../src/engine/types';
import { World } from '../../src/engine/world';
import { MEGA_MEMBER, TILE_FLAG_INFECTED, TILE_FLAG_UNSORTED } from '../../src/worker/protocol';
import { createHost } from '../helpers';
import { advance, balanceWith, put, soilFarm } from './util';

/** Snapshot que el Worker enviaría al hilo principal para esta partida. */
function snapshotOf(world: World) {
  const h = createHost({ balance: world.balance });
  h.host.handleMessage({ type: 'INIT_GAME', seed: 1, savedState: world.serialize() });
  return h.lastSnapshot();
}

describe('Snapshot del Worker: datos de la Fase 3 para el renderizador', () => {
  it('pétalos y tamaños en meta; los cactus mal ordenados llevan el flag de diagnóstico', () => {
    const world = soilFarm();
    put(world, 0, 0, 'Sunflower');
    world.tileAt(0, 0).petals = 13;
    world.tileAt(0, 0).isInfected = true;
    put(world, 0, 1, 'Cactus');
    world.tileAt(0, 1).cactusSize = 6;
    put(world, 1, 1, 'Cactus');
    world.tileAt(1, 1).cactusSize = 2;
    put(world, 2, 2, 'Cactus');
    world.tileAt(2, 2).cactusSize = 9;
    const { tiles } = snapshotOf(world);
    const i = (x: number, y: number) => y * 3 + x;
    expect(tiles.meta[i(0, 0)]).toBe(13);
    expect(tiles.meta[i(0, 1)]).toBe(6);
    expect(tiles.flags[i(0, 0)]).toBe(TILE_FLAG_INFECTED);
    expect(tiles.flags[i(0, 1)] & TILE_FLAG_UNSORTED).toBe(TILE_FLAG_UNSORTED);
    expect(tiles.flags[i(1, 1)] & TILE_FLAG_UNSORTED).toBe(TILE_FLAG_UNSORTED);
    expect(tiles.flags[i(2, 2)]).toBe(0);
  });

  it('megacalabaza: el lado en su esquina Sur-Oeste y MEGA_MEMBER en el resto', () => {
    const world = soilFarm({ balance: balanceWith({ pumpkin: { deathRate: 0 } }) });
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      put(world, x, y, 'Pumpkin', false);
    }
    advance(world, 1000);
    const { tiles } = snapshotOf(world);
    expect(Array.from(tiles.mega)).toEqual([0, 0, 0, 0, 2, MEGA_MEMBER, 0, MEGA_MEMBER, MEGA_MEMBER]);
  });

  it('muros del laberinto y compañeros del policultivo', () => {
    const maze = new World({ seed: 21, size: 4, unlocks: { Plant: 1, Mazes: 1 } });
    put(maze, 0, 0, 'Bush');
    maze.inventory.add('Weird_Substance', 4);
    maze.useWeirdSubstance(0, 0, 4);
    expect(Array.from(snapshotOf(maze).tiles.walls)).toEqual(maze.grid.tiles.map((t) => t.mazeWalls));

    const poly = new World({ seed: 31, size: 4, unlocks: { Plant: 1, Mazes: 1, Polyculture: 1 } });
    put(poly, 1, 1, 'Bush');
    const c = poly.tileAt(1, 1).companion;
    const { tiles } = snapshotOf(poly);
    const k = 1 * 4 + 1;
    expect([tiles.compEntity[k], tiles.compX[k], tiles.compY[k]]).toEqual([entityCode(c?.entity ?? null), c?.x, c?.y]);
  });
});
