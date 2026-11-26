import { describe, expect, it } from 'vitest';
import { MAX_PENDING_EVENTS } from '../src/engine/world';
import { ConsoleBuffer } from '../src/store/consoleBuffer';
import { createHost } from './helpers';

/**
 * DoD de la Fase 4: 100 000 ticks con la flota completa (32 drones) sin fugas en la pila de
 * llamadas, el planificador, los cuerpos del mundo, los resultados de wait_for, los eventos ni la
 * consola de la interfaz (búfer circular de 1000 líneas).
 */
const PROGRAM = [
  'def depth(n):',
  '    if n == 0:',
  '        return 0',
  '    return 1 + depth(n - 1)',
  'def worker(seed):',
  '    i = 0',
  '    while True:',
  '        i += 1',
  '        depth(6)',
  '        quick_print(seed, i)',
  '        if i % 25 == 0:',
  '            move(East)',
  'def short(n):',
  '    return [depth(n)] * 3',
  'for k in range(30):',
  '    spawn_drone(worker, k)',
  'total = 0',
  'while True:',
  '    h = spawn_drone(short, 4)',
  '    if h != None:',
  '        total += len(wait_for(h))',
  '    print(total)',
].join('\n');

describe('Prueba de estrés: 100 000 ticks con 32 drones', () => {
  it('mantiene acotadas todas las estructuras', { timeout: 60_000 }, () => {
    const h = createHost({ worldSize: 8 });
    h.host.currentWorld.unlocks.Megafarm = 5;
    h.load(PROGRAM);
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });

    const ui = new ConsoleBuffer(1000);
    let consumed = 0;
    let maxStack = 0;
    let maxOperand = 0;
    let maxDrones = 0;
    const drain = () => {
      for (; consumed < h.messages.length; consumed++) {
        const m = h.messages[consumed];
        if (m.type === 'CONSOLE_LOG') ui.push({ droneId: m.droneId, text: m.message, tick: m.tick, kind: 'log' });
        else if (m.type === 'CONSOLE_BATCH') for (const l of m.lines) ui.push({ droneId: l.droneId, text: l.message, tick: l.tick, kind: 'log' });
      }
      // Los mensajes ya procesados se descartan como haría el hilo principal.
      h.messages.splice(0, consumed);
      consumed = 0;
    };

    for (let chunk = 0; chunk < 20; chunk++) {
      h.host.handleMessage({ type: 'STEP_TICK', ticks: 5000 });
      drain();
      for (const vm of h.host.currentScheduler.all) {
        maxStack = Math.max(maxStack, vm.callStack.length);
        for (const frame of vm.callStack) maxOperand = Math.max(maxOperand, frame.stack.length);
      }
      maxDrones = Math.max(maxDrones, h.host.currentScheduler.all.length, h.host.currentWorld.drones.length);
    }

    const world = h.host.currentWorld;
    expect(world.totalTicks).toBe(100_000);
    expect(h.errors()).toHaveLength(0);
    expect(h.host.currentScheduler.activeCount()).toBeGreaterThanOrEqual(31);
    expect(maxDrones).toBeLessThanOrEqual(32);
    // worker → depth(6) llega a 8 marcos; nunca crecen entre iteraciones.
    expect(maxStack).toBeLessThanOrEqual(9);
    expect(maxOperand).toBeLessThanOrEqual(16);
    // Hijos cortos creados y recogidos sin acumularse.
    expect(h.host.currentFleet.spawnedTotal).toBeGreaterThan(100);
    expect(h.host.currentFleet.storedResults).toBeLessThanOrEqual(4096);
    expect(world.drainEvents().length).toBeLessThanOrEqual(MAX_PENDING_EVENTS);
    expect(world.stats.maxActiveDrones).toBe(32);
    // Consola de la interfaz: búfer circular lleno pero nunca por encima de 1000 líneas.
    expect(ui.size).toBe(1000);
    expect(ui.toArray()).toHaveLength(1000);
  });
});
