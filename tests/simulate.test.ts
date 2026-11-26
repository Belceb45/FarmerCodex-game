import { describe, expect, it } from 'vitest';
import type { LeaderboardDef } from '../src/engine/leaderboards';
import { DEFAULT_TECH_TREE, farmSize } from '../src/engine/tech';
import { GroundType } from '../src/engine/types';
import { World } from '../src/engine/world';
import { createHost, runProgram } from './helpers';

/** Host con una granja de `size` × `size` y los archivos dados, ejecutando `main.py`. */
function hostWith(files: Record<string, string>, size = 6) {
  const h = createHost({ worldSize: size });
  h.host.handleMessage({ type: 'SYNC_FILES', files });
  return h;
}

/** runTicks() no vacía la consola ni emite snapshots: un mensaje inocuo lo hace. */
function flush(h: ReturnType<typeof createHost>) {
  h.host.handleMessage({ type: 'PAUSE', paused: false });
}

function run(h: ReturnType<typeof createHost>, ticks = 200_000) {
  h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
  h.host.runTicks(ticks);
  flush(h);
}

// ------------------------------------------------------------------ set_world_size

describe('set_world_size() (doc 02)', () => {
  it('reduce la granja, la limpia y devuelve el dron a (0, 0)', () => {
    const world = new World({ seed: 3, size: 6 });
    const r = runProgram(
      'move(East)\nmove(North)\ntill()\nset_world_size(4)\nquick_print(get_world_size(), get_pos_x(), get_pos_y(), get_ground_type())',
      { world },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['4 0 0 Grounds.Grassland']);
    expect(world.width).toBe(4);
    expect(world.height).toBe(4);
    expect(world.fullWidth).toBe(6);
    expect(world.grid.tiles.every((t) => t.ground === GroundType.Grassland)).toBe(true);
  });

  it('el lado mínimo es 3, nunca crece más que lo desbloqueado y ≤ 0 restaura la granja completa', () => {
    const sizes = (size: number, source: string) => runProgram(source, { world: new World({ seed: 1, size }) }).output;
    expect(sizes(6, 'set_world_size(1)\nquick_print(get_world_size())')).toEqual(['3']);
    expect(sizes(6, 'set_world_size(3)\nset_world_size(0)\nquick_print(get_world_size())')).toEqual(['6']);
    expect(sizes(6, 'set_world_size(10)\nquick_print(get_world_size())')).toEqual(['6']);
    expect(sizes(2, 'set_world_size(3)\nquick_print(get_world_size())')).toEqual(['2']);
    expect(sizes(6, 'set_world_size(4.9)\nquick_print(get_world_size())')).toEqual(['4']);
    const bad = runProgram('set_world_size("3")');
    expect(bad.error).toMatch(/^TypeError: set_world_size\(\) necesita un número/);
  });

  it('cuesta 200 ticks (balance.json) y aplica el cambio al terminar la espera', () => {
    const r = runProgram('t0 = get_tick_count()\nset_world_size(3)\nt1 = get_tick_count()\nquick_print(t1 - t0)', {
      world: new World({ seed: 1, size: 5 }),
    });
    expect(r.output).toEqual(['200']);
  });

  it('dura lo que la ejecución: al terminar o al detener vuelve el tamaño completo', () => {
    const h = hostWith({ 'main.py': 'set_world_size(3)\nquick_print(get_world_size())' });
    run(h);
    expect(h.consoleLines()).toContain('3');
    expect(h.host.currentWorld.width).toBe(6);
    expect(h.host.currentWorld.sizeLimit).toBeNull();

    h.host.handleMessage({ type: 'SYNC_FILES', files: { 'main.py': 'set_world_size(4)\nwhile True:\n    harvest()' } });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(1000);
    expect(h.host.currentWorld.width).toBe(4);
    h.host.handleMessage({ type: 'STOP_ALL' });
    expect(h.host.currentWorld.width).toBe(6);
    expect(h.lastSnapshot().width).toBe(6);
  });

  it('un guardado con la granja reducida se recarga con el tamaño completo', () => {
    const world = new World({ seed: 2, size: 5 });
    world.setSizeLimit(3);
    const saved = world.serialize();
    expect(saved.width).toBe(3);
    const loaded = World.deserialize(saved);
    expect([loaded.width, loaded.height]).toEqual([5, 5]);
    expect(loaded.sizeLimit).toBeNull();
  });

  it('Expand durante una ejecución reducida respeta el límite', () => {
    const world = new World({ seed: 2, size: 5 });
    world.setSizeLimit(3);
    world.resizeTo(7, 7);
    expect([world.width, world.height]).toEqual([3, 3]);
    world.clearSizeLimit();
    expect([world.width, world.height]).toEqual([7, 7]);
  });

  it('no está disponible en un intento de marcador', () => {
    const board: LeaderboardDef = { id: 'Hay', name: 'Heno', description: 'prueba', size: [3, 3], seed: 1, goal: { item: 'Hay', amount: 3 } };
    const h = createHost({ worldSize: 3, leaderboards: [board] });
    h.host.handleMessage({ type: 'SYNC_FILES', files: { 'run.py': 'set_world_size(3)' } });
    h.host.handleMessage({ type: 'START_LEADERBOARD', boardId: 'Hay', file: 'run.py' });
    h.host.runTicks(1000);
    expect(h.errors()[0]).toMatchObject({ error: expect.stringMatching(/^ValueError: set_world_size\(\) no está disponible en un intento de marcador/) });
  });
});

// ------------------------------------------------------------------ inicio en (0, 0)

describe('Cada ejecución empieza en (0, 0)', () => {
  it('el dron principal vuelve a (0, 0) al pulsar ▶ aunque el script anterior lo dejara en otra casilla', () => {
    const h = hostWith({ 'main.py': 'move(East)\nmove(North)' });
    run(h);
    expect(h.host.currentWorld.getDrone(0)).toMatchObject({ x: 1, y: 1 });
    h.host.handleMessage({ type: 'SYNC_FILES', files: { 'main.py': 'quick_print(get_pos_x(), get_pos_y())\nmove(North)' } });
    run(h);
    expect(h.consoleLines()).toContain('0 0');
  });

  it('el dinosaurio conserva su casilla: su cola sigue en la granja', () => {
    const world = new World({ seed: 4, size: 5 });
    const body = world.getDrone(0);
    body.x = 2;
    body.y = 3;
    world.startDino(body);
    world.resetMainDrone();
    expect(body).toMatchObject({ x: 2, y: 3 });
    world.endDino();
    world.resetMainDrone();
    expect(body).toMatchObject({ x: 0, y: 0 });
  });
});

// ------------------------------------------------------------------ simulate

describe('simulate() (doc 02)', () => {
  it('ejecuta el archivo en una granja aislada y devuelve los segundos simulados', () => {
    const h = hostWith({
      'main.py': 't = simulate("sim.py", Unlocks, {}, {}, 0, 1)\nquick_print(t)',
      'sim.py': 'move(North)\nmove(North)',
    });
    const home = h.host.currentWorld;
    const inventory = { ...home.inventory.toRecord() };
    run(h);
    expect(h.errors()).toEqual([]);
    // Dos move() de 200 ticks = 400 ticks = 1 s simulado (400 ticks/s; los floats enteros se imprimen sin decimales).
    expect(h.consoleLines()).toContain('1');
    expect(h.host.currentWorld).toBe(home);
    expect(home.inventory.toRecord()).toEqual(inventory);
    // La granja principal estuvo congelada: solo cuenta la llamada (200 ticks), no los 400 simulados.
    expect(home.totalTicks).toBeLessThan(300);
    expect(h.consoleLines().some((l) => l.startsWith('🧪 Simulación de sim.py: 1.00 s'))).toBe(true);
  });

  it('acepta el nombre sin «.py» y usa valores por defecto', () => {
    const h = hostWith({ 'main.py': 'quick_print(simulate("sim"))', 'sim.py': 'move(East)' });
    run(h);
    expect(h.errors()).toEqual([]);
    expect(h.consoleLines()).toContain('0.5');
  });

  it('sim_globals, sim_items y sim_unlocks preparan la granja simulada sin tocar tus datos', () => {
    const [expandW, expandH] = farmSize(DEFAULT_TECH_TREE, { Expand: 2 });
    const h = hostWith({
      'main.py': [
        'l = [1]',
        'simulate("sim.py", {Unlocks.Expand: 2}, {Items.Carrot: 50}, {"a": 21, "l": l}, 3, 1)',
        'quick_print("casa", len(l), num_items(Items.Carrot))',
      ].join('\n'),
      'sim.py': 'quick_print("sim", a * 2, num_items(Items.Carrot), get_world_size())\nl.append(2)\nquick_print(len(l))',
    });
    run(h);
    expect(h.errors()).toEqual([]);
    const lines = h.consoleLines();
    expect(lines).toContain(`sim 42 50 ${Math.max(expandW, expandH)}`);
    expect(lines).toContain('2');
    expect(lines).toContain('casa 1 0');
  });

  it('es determinista: la misma semilla repite random() y otra lo cambia', () => {
    const h = hostWith({
      'main.py': 'simulate("sim.py", None, None, None, 5)\nsimulate("sim.py", None, None, None, 5)\nsimulate("sim.py", None, None, None, 6)',
      'sim.py': 'quick_print(random())',
    });
    run(h);
    const values = h.consoleLines().filter((l) => /^0\.\d+$/.test(l));
    expect(values).toHaveLength(3);
    expect(values[0]).toBe(values[1]);
    expect(values[2]).not.toBe(values[0]);
  });

  it('muestra la granja simulada mientras corre y luego vuelve la tuya', () => {
    const h = hostWith({
      'main.py': 'simulate("sim.py", None, None, None, 0, 2)',
      'sim.py': 'for i in range(5):\n    move(North)',
    });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(400);
    flush(h);
    const during = h.lastSnapshot();
    expect(during.simulation).toMatchObject({ file: 'sim.py', seed: 0, speedup: 2 });
    expect(h.host.currentWorld).not.toBe(h.host.homeWorld);
    expect(during.runState).toBe('running');
    h.host.runTicks(100_000);
    flush(h);
    expect(h.lastSnapshot().simulation).toBeNull();
    expect(h.host.currentWorld).toBe(h.host.homeWorld);
    expect(h.lastSnapshot().runState).toBe('finished');
  });

  it('un error en el archivo simulado detiene al que llamó con un RuntimeError', () => {
    const h = hostWith({ 'main.py': 'simulate("sim.py")\nquick_print("no llega")', 'sim.py': 'move(North)\nx = y' });
    run(h);
    const errors = h.errors();
    expect(errors[0]).toMatchObject({ file: 'sim.py', line: 2, error: expect.stringMatching(/^NameError/) });
    expect(errors[1]).toMatchObject({ file: 'main.py', line: 1, error: expect.stringMatching(/^RuntimeError: simulate\(\): sim\.py, línea 2: NameError/) });
    expect(h.consoleLines()).not.toContain('no llega');
    expect(h.host.currentWorld).toBe(h.host.homeWorld);
  });

  it('valida el archivo y no se puede anidar ni usar leaderboard_run() dentro', () => {
    const missing = hostWith({ 'main.py': 'simulate("nada.py")' });
    run(missing);
    expect(missing.errors()[0]).toMatchObject({ error: "ValueError: simulate(): no existe el archivo 'nada.py'" });

    const nested = hostWith({ 'main.py': 'simulate("sim.py")', 'sim.py': 'simulate("sim.py")' });
    run(nested);
    expect(nested.errors()[0]).toMatchObject({ file: 'sim.py', error: expect.stringMatching(/no se puede usar dentro de otra simulación/) });

    const board = hostWith({ 'main.py': 'simulate("sim.py", Unlocks)', 'sim.py': 'leaderboard_run(Leaderboards.Hay, "sim.py")' });
    run(board);
    expect(board.errors()[0]).toMatchObject({ file: 'sim.py', error: expect.stringMatching(/leaderboard_run\(\) no está disponible dentro de una simulación/) });

    const typed = hostWith({ 'main.py': 'simulate("sim.py", None, [Items.Hay])', 'sim.py': 'pass' });
    run(typed);
    expect(typed.errors()[0]).toMatchObject({ error: expect.stringMatching(/^TypeError: simulate\(\) espera un diccionario \{Items\.X: cantidad\}/) });
  });

  it('detener durante la simulación la corta y también la ejecución que la pidió', () => {
    const h = hostWith({ 'main.py': 'simulate("sim.py")\nquick_print("no llega")', 'sim.py': 'while True:\n    move(North)' });
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(2000);
    flush(h);
    expect(h.lastSnapshot().simulation).not.toBeNull();
    h.host.handleMessage({ type: 'STOP_ALL' });
    expect(h.host.currentWorld).toBe(h.host.homeWorld);
    expect(h.host.currentScheduler.hasActiveDrones()).toBe(false);
    expect(h.lastSnapshot().simulation).toBeNull();
    expect(h.consoleLines()).toContain('✖ Simulación de sim.py interrumpida.');
    h.host.runTicks(1000);
    flush(h);
    expect(h.consoleLines()).not.toContain('no llega');
  });

  it('con varios drones las simulaciones van en cola y cada uno recibe la suya', () => {
    const h = hostWith({
      'main.py': [
        'def job():',
        '    return simulate("sim.py", None, None, {"n": 2})',
        'd = spawn_drone(job)',
        'mine = simulate("sim.py", None, None, {"n": 1})',
        'quick_print(mine, wait_for(d))',
      ].join('\n'),
      'sim.py': 'for i in range(n):\n    move(North)',
    });
    h.host.currentWorld.unlocks.Megafarm = 1;
    run(h);
    expect(h.errors()).toEqual([]);
    // range() 1 tick + por vuelta 1 tick y un move() de 200: n = 1 → 202 ticks, n = 2 → 403 ticks.
    expect(h.consoleLines()).toContain('0.505 1.0075');
  });
});
