import { describe, expect, it } from 'vitest';
import { createHost } from './helpers';

const FARM_SCRIPT = ['while True:', '    if can_harvest():', '        harvest()', '    move(North)', ''].join('\n');

describe('Criterios de aceptación de la Fase 1', () => {
  it('el script base cosecha Items.Hay de forma continua', () => {
    const h = createHost();
    h.load(FARM_SCRIPT);
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    // Cada vuelta del bucle cuesta ~402 ticks (sensor + cosecha + movimiento): ~1 heno por segundo a 1x.
    h.advance(10_000);
    const hay1 = h.host.currentWorld.inventory.get('Hay');
    expect(hay1).toBeGreaterThanOrEqual(8);
    h.advance(10_000);
    const hay2 = h.host.currentWorld.inventory.get('Hay');
    expect(hay2).toBeGreaterThanOrEqual(hay1 + 8);
    expect(h.lastSnapshot().inventory.Hay).toBe(hay2);
    expect(h.lastSnapshot().runState).toBe('running');
  });

  it('un bucle infinito sin acciones físicas no bloquea y se detiene al instante con STOP_ALL', () => {
    const h = createHost();
    h.load('while True: x = 1');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(1000);
    const ticks = h.host.currentWorld.totalTicks;
    // A velocidad 1x avanzan ~400 ticks por segundo real.
    expect(ticks).toBeGreaterThan(350);
    expect(ticks).toBeLessThanOrEqual(400);
    h.host.handleMessage({ type: 'STOP_ALL' });
    expect(h.host.isTicking()).toBe(false);
    expect(h.lastSnapshot().runState).toBe('idle');
    h.advance(1000);
    expect(h.host.currentWorld.totalTicks).toBe(ticks);
  });

  it('cada pump ejecuta una ráfaga acotada aunque el reloj salte mucho', () => {
    const h = createHost();
    h.load('while True: x = 1');
    h.host.handleMessage({ type: 'SET_SPEED_MULTIPLIER', multiplier: 1000 });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(60_000, 60_000);
    // Retraso acumulable máximo: 0.25 s a 400 000 ticks/s.
    expect(h.host.currentWorld.totalTicks).toBeLessThanOrEqual(100_001);
  });

  it('al detener el script, simTime se congela y el pasto deja de crecer', () => {
    const h = createHost();
    h.load(['harvest()', 'while True:', '    x = 1'].join('\n'));
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(600);
    const tile = h.host.currentWorld.tileAt(0, 0);
    expect(tile.growthProgress).toBeGreaterThan(0);
    h.host.handleMessage({ type: 'STOP_ALL' });
    const progress = tile.growthProgress;
    const simTime = h.host.currentWorld.simTime;
    h.advance(10_000);
    expect(h.host.currentWorld.simTime).toBe(simTime);
    expect(tile.growthProgress).toBe(progress);
  });

  it('cuando el script termina solo, el mundo también se congela (regla No-Idle)', () => {
    const h = createHost();
    h.load('move(North)');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(3000);
    // 200 ticks de la acción + 1 tick para ejecutar el final del módulo; después, nada más.
    expect(h.host.currentWorld.totalTicks).toBe(201);
    expect(h.lastSnapshot().runState).toBe('finished');
    h.advance(3000);
    expect(h.host.currentWorld.totalTicks).toBe(201);
    expect(h.consoleLines().some((l) => l.includes('finalizado'))).toBe(true);
  });
});

describe('SimulationHost: control de ejecución', () => {
  it('PAUSE detiene el avance y lo reanuda', () => {
    const h = createHost();
    h.load(FARM_SCRIPT);
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(500);
    h.host.handleMessage({ type: 'PAUSE', paused: true });
    const ticks = h.host.currentWorld.totalTicks;
    h.advance(2000);
    expect(h.host.currentWorld.totalTicks).toBe(ticks);
    expect(h.lastSnapshot().runState).toBe('paused');
    h.host.handleMessage({ type: 'PAUSE', paused: false });
    h.advance(500);
    expect(h.host.currentWorld.totalTicks).toBeGreaterThan(ticks);
  });

  it('Paso avanza sentencia a sentencia mostrando la próxima línea', () => {
    const h = createHost();
    h.load(['a = 1', 'b = a + 1', 'move(North)', 'quick_print(a, b)'].join('\n'));
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py', startPaused: true });
    const line = () => h.lastSnapshot().drones[0].line;
    expect(h.lastSnapshot().runState).toBe('paused');
    expect(line()).toBe(1);
    h.host.handleMessage({ type: 'STEP_TICK' });
    expect(line()).toBe(2);
    h.host.handleMessage({ type: 'STEP_TICK' });
    expect(line()).toBe(3);
    const before = h.host.currentWorld.totalTicks;
    h.host.handleMessage({ type: 'STEP_TICK' });
    expect(line()).toBe(4);
    expect(h.host.currentWorld.totalTicks - before).toBeGreaterThanOrEqual(200);
    expect(h.host.currentWorld.drones[0].y).toBe(1);
    h.host.handleMessage({ type: 'STEP_TICK' });
    expect(h.consoleLines()).toContain('1 2');
    expect(h.lastSnapshot().runState).toBe('finished');
  });

  it('Paso entra en las funciones', () => {
    const h = createHost();
    h.load(['def f():', '    x = 1', '    return x', 'y = f()', 'z = y'].join('\n'));
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py', startPaused: true });
    const visited: (number | null)[] = [h.lastSnapshot().drones[0].line];
    for (let i = 0; i < 5; i++) {
      h.host.handleMessage({ type: 'STEP_TICK' });
      visited.push(h.lastSnapshot().drones[0].line);
    }
    expect(visited).toEqual([1, 4, 2, 3, 5, null]);
  });

  it('STEP_TICK con un número avanza exactamente esos ticks', () => {
    const h = createHost();
    h.load(FARM_SCRIPT);
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py', startPaused: true });
    h.host.handleMessage({ type: 'STEP_TICK', ticks: 37 });
    expect(h.host.currentWorld.totalTicks).toBe(37);
  });

  it('la velocidad multiplica los ticks por segundo real', () => {
    const h = createHost();
    h.load('while True: x = 1');
    h.host.handleMessage({ type: 'SET_SPEED_MULTIPLIER', multiplier: 4 });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(1000);
    expect(h.host.currentWorld.totalTicks).toBeGreaterThan(1500);
    expect(h.host.currentWorld.totalTicks).toBeLessThanOrEqual(1600);
  });

  it('los snapshots se emiten a ~30 Hz y no en cada tick', () => {
    const h = createHost();
    h.load('while True: x = 1');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    const before = h.messages.filter((m) => m.type === 'STATE_SNAPSHOT').length;
    h.advance(1000, 2);
    const count = h.messages.filter((m) => m.type === 'STATE_SNAPSHOT').length - before;
    expect(count).toBeGreaterThanOrEqual(25);
    expect(count).toBeLessThanOrEqual(31);
  });

  it('el snapshot empaqueta las casillas en arreglos planos e incluye la acción en curso', () => {
    const h = createHost();
    h.load('move(East)');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(100);
    const snap = h.lastSnapshot();
    expect(snap.tiles.ground).toBeInstanceOf(Uint8Array);
    expect(snap.tiles.growth).toBeInstanceOf(Float32Array);
    expect(snap.tiles.entity.length).toBe(snap.worldSize * snap.worldSize);
    expect(snap.drones[0].action).toMatchObject({ kind: 'move', fromX: 0, toX: 1, startTick: 0, endTick: 200 });
  });

  it('SET_WORLD_SIZE cambia la granja solo cuando no hay scripts activos', () => {
    const h = createHost();
    h.host.handleMessage({ type: 'SET_WORLD_SIZE', size: 4 });
    expect(h.lastSnapshot().worldSize).toBe(4);
    h.load('while True: x = 1');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.handleMessage({ type: 'SET_WORLD_SIZE', size: 1 });
    expect(h.host.currentWorld.size).toBe(4);
  });
});

describe('SimulationHost: errores y consola', () => {
  it('un error de sintaxis se reporta con su línea sin iniciar el dron', () => {
    const h = createHost();
    h.load('x = 1\nwhile True\n    x = 2');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    const [err] = h.errors();
    expect(err).toMatchObject({ type: 'RUNTIME_ERROR', droneId: 0, file: 'main.py', line: 2 });
    if (err.type === 'RUNTIME_ERROR') expect(err.error).toMatch(/^SyntaxError/);
    expect(h.lastSnapshot().runState).toBe('error');
    expect(h.host.isTicking()).toBe(false);
  });

  it('un error en ejecución detiene el dron, indica la función y congela el mundo', () => {
    const h = createHost();
    h.load(['def dividir(a):', '    return 10 / a', 'move(North)', 'dividir(0)'].join('\n'));
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(2000);
    const [err] = h.errors();
    expect(err).toMatchObject({ line: 2 });
    if (err.type === 'RUNTIME_ERROR') {
      expect(err.error).toContain('ZeroDivisionError');
      expect(err.error).toContain('dividir');
    }
    expect(h.lastSnapshot().runState).toBe('error');
    const ticks = h.host.currentWorld.totalTicks;
    h.advance(1000);
    expect(h.host.currentWorld.totalTicks).toBe(ticks);
  });

  it('print aparece en la consola y en los eventos de la escena', () => {
    const h = createHost();
    h.load('print("hola", 42)');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(50);
    expect(h.consoleLines()).toContain('hola 42');
    const events = h.messages.flatMap((m) => (m.type === 'STATE_SNAPSHOT' ? m.snapshot.events : []));
    expect(events.some((e) => e.kind === 'print' && e.text === 'hola 42')).toBe(true);
  });

  it('una inundación de quick_print se agrupa en lotes acotados', () => {
    const h = createHost();
    h.load('while True:\n    quick_print("spam")');
    h.host.handleMessage({ type: 'SET_SPEED_MULTIPLIER', multiplier: 200 });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.advance(500, 16);
    const batches = h.messages.filter((m) => m.type === 'CONSOLE_BATCH');
    expect(batches.length).toBeGreaterThan(0);
    for (const b of batches) if (b.type === 'CONSOLE_BATCH') expect(b.lines.length).toBeLessThanOrEqual(500);
  });
});

describe('Determinismo de extremo a extremo', () => {
  it('misma semilla y mismo script => mismo mundo tras N ticks', () => {
    const script = [
      'while True:',
      '    if random() < 0.3:',
      '        till()',
      '    if can_harvest():',
      '        harvest()',
      '    move(North)',
      '    if get_pos_y() == 0:',
      '        move(East)',
    ].join('\n');
    const run = (seed: number) => {
      const h = createHost({ seed });
      h.host.handleMessage({ type: 'INIT_GAME', seed, worldSize: 4 });
      h.load(script);
      h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
      h.host.runTicks(30_000);
      return h.host.currentWorld.serialize();
    };
    const a = run(123);
    expect(run(123)).toEqual(a);
    expect(run(124)).not.toEqual(a);
    expect(a.inventory.Hay).toBeGreaterThan(0);
  });
});
