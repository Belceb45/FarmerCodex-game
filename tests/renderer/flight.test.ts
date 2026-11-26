import { describe, expect, it } from 'vitest';
import { FLY_OMEGA, FreeFlight, groundToTile, overBoard, springStep, type FlyerInput } from '../../src/renderer/iso/flight';
import { isoX, isoY, tileCenter } from '../../src/renderer/iso/projection';

const DT = 1 / 60;

/** Avanza `seconds` a 60 FPS con la misma entrada (la granja quieta salvo en el primer fotograma). */
function fly(f: FreeFlight, input: Partial<FlyerInput>, seconds: number): void {
  const base: FlyerInput = { attached: false, tileX: 0, tileY: 0, fieldDx: 0, fieldDy: 0, teleport: false, rigid: false, hold: null };
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    f.update({ ...base, ...input, ...(i > 0 ? { fieldDx: 0, fieldDy: 0, teleport: false } : {}) }, DT);
  }
}

describe('Vuelo libre: la granja, el dron y el perro son independientes', () => {
  it('el resorte crítico converge sin oscilar y es estable con pasos grandes', () => {
    let x = 500;
    let v = 0;
    let prev = x;
    for (let i = 0; i < 120; i++) {
      [x, v] = springStep(x, v, FLY_OMEGA, DT);
      expect(x).toBeLessThanOrEqual(prev + 1e-9);
      expect(x).toBeGreaterThanOrEqual(0);
      prev = x;
    }
    expect(Math.abs(x)).toBeLessThan(1);
    const [big] = springStep(500, 0, FLY_OMEGA, 5);
    expect(Math.abs(big)).toBeLessThan(1);
  });

  it('la inversa del suelo coincide con la proyección y detecta si un punto cae sobre la isla', () => {
    const c = tileCenter(2, 3);
    const t = groundToTile(c.x, c.y);
    expect(t.u).toBeCloseTo(2.5);
    expect(t.v).toBeCloseTo(3.5);
    expect(overBoard(c.x, c.y, 4, 4)).toBe(true);
    expect(overBoard(c.x, c.y, 2, 4)).toBe(false);
    expect(overBoard(isoX(-1, 0), isoY(-1, 0), 4, 4)).toBe(false);
  });

  it('un dron sin script no se mueve al arrastrar la granja', () => {
    const f = new FreeFlight(100, 50, false);
    fly(f, { attached: false, tileX: 400, tileY: 300, fieldDx: 300, fieldDy: 250 }, 1);
    expect(f.gx).toBeCloseTo(100);
    expect(f.gy).toBeCloseTo(50);
  });

  it('un dron trabajando se queda atrás al arrastrar la granja y la alcanza volando', () => {
    const f = new FreeFlight(0, 0, true);
    fly(f, { attached: true, tileX: 0, tileY: 0 }, 0.2);
    // La granja salta 200 px: en ese fotograma el dron sigue donde estaba.
    f.update({ attached: true, tileX: 200, tileY: 0, fieldDx: 200, fieldDy: 0, teleport: false, rigid: false, hold: null }, DT);
    expect(f.gx).toBeLessThan(20);
    fly(f, { attached: true, tileX: 200, tileY: 0 }, 0.25);
    expect(f.gx).toBeGreaterThan(60);
    expect(f.gx).toBeLessThan(200);
    fly(f, { attached: true, tileX: 200, tileY: 0 }, 1.5);
    expect(f.gx).toBeCloseTo(200, 0);
  });

  it('al empezar el script despega desde donde flotaba y vuela hasta su casilla', () => {
    const f = new FreeFlight(-600, 400, false);
    const tile = tileCenter(0, 0);
    fly(f, { attached: true, tileX: tile.x, tileY: tile.y }, 0.1);
    const mid = Math.hypot(f.gx - tile.x, f.gy - tile.y);
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(Math.hypot(-600 - tile.x, 400 - tile.y));
    fly(f, { attached: true, tileX: tile.x, tileY: tile.y }, 2);
    expect(f.gx).toBeCloseTo(tile.x, 0);
    expect(f.gy).toBeCloseTo(tile.y, 0);
  });

  it('al terminar el script se queda flotando donde está', () => {
    const f = new FreeFlight(0, 0, true);
    fly(f, { attached: true, tileX: 300, tileY: -100 }, 2);
    fly(f, { attached: false, tileX: 0, tileY: 0, fieldDx: -500, fieldDy: 0 }, 1);
    expect(f.gx).toBeCloseTo(300, 0);
    expect(f.gy).toBeCloseTo(-100, 0);
  });

  it('el dinosaurio camina pegado a la granja (sin retraso)', () => {
    const f = new FreeFlight(0, 0, true);
    f.update({ attached: true, tileX: 150, tileY: 40, fieldDx: 150, fieldDy: 40, teleport: false, rigid: true, hold: null }, DT);
    expect(f.gx).toBeCloseTo(150);
    expect(f.gy).toBeCloseTo(40);
  });

  it('clear() o set_world_size() lo llevan volando a su nueva casilla en vez de teletransportarlo', () => {
    const f = new FreeFlight(500, 0, true);
    fly(f, { attached: true, tileX: 500, tileY: 0 }, 1);
    f.update({ attached: true, tileX: 0, tileY: 0, fieldDx: 0, fieldDy: 0, teleport: true, rigid: false, hold: null }, DT);
    expect(f.gx).toBeGreaterThan(450);
    fly(f, { attached: true, tileX: 0, tileY: 0 }, 2);
    expect(f.gx).toBeCloseTo(0, 0);
  });

  it('se puede agarrar: libre se queda donde lo sueltas y trabajando vuelve a su casilla', () => {
    const free = new FreeFlight(0, 0, false);
    fly(free, { attached: false, hold: { x: 250, y: -80 } }, 0.2);
    expect([free.gx, free.gy]).toEqual([250, -80]);
    free.release();
    fly(free, { attached: false }, 1);
    expect(free.gx).toBeCloseTo(250);
    expect(free.gy).toBeCloseTo(-80);

    const busy = new FreeFlight(0, 0, true);
    fly(busy, { attached: true, tileX: 0, tileY: 0, hold: { x: 300, y: 0 } }, 0.2);
    expect(busy.gx).toBeCloseTo(300);
    busy.release();
    fly(busy, { attached: true, tileX: 0, tileY: 0 }, 2);
    expect(busy.gx).toBeCloseTo(0, 0);
  });

  it('al recentrar, un dron libre vuelve volando sobre su casilla', () => {
    const f = new FreeFlight(-400, 200, false);
    f.sendTo(64, -32);
    fly(f, { attached: false }, 2);
    expect(f.gx).toBeCloseTo(64, 0);
    expect(f.gy).toBeCloseTo(-32, 0);
  });
});
