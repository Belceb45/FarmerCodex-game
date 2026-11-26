import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../src/config/balance';
import { World } from '../src/engine/world';
import { createHost, runProgram } from './helpers';

/** Granja con Megafarm al nivel indicado (nivel 1 = 2 drones … nivel 5 = 32). */
function megaWorld(level: number, size = 4): World {
  return new World({ seed: 9, size, unlocks: { Megafarm: level } });
}

const SPAWN = DEFAULT_BALANCE.ticks.physicalActionSuccess;

describe('Megafarm: spawn_drone, wait_for, has_finished', () => {
  it('sin la tecnología lanza UnlockError', () => {
    const r = runProgram('def f():\n    pass\nspawn_drone(f)');
    expect(r.error).toMatch(/^UnlockError: spawn_drone\(\) requiere desbloquear «Megagranja» \(Unlocks\.Megafarm\)/);
  });

  it('el hijo ejecuta la función con sus argumentos y wait_for devuelve su resultado', () => {
    const r = runProgram(
      [
        'def work(n, extra=0):',
        '    total = extra',
        '    for i in range(n):',
        '        total += i',
        '    return total',
        'd = spawn_drone(work, 10, 5)',
        'quick_print(d != None, has_finished(d))',
        'quick_print(wait_for(d))',
        'quick_print(has_finished(d), num_drones(), max_drones())',
      ].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['True False', '50', 'True 1 2']);
  });

  it('spawn_drone cuesta 200 ticks y el hijo aparece en la casilla del padre', () => {
    const r = runProgram(
      [
        'def stay():',
        '    return get_pos_x() * 10 + get_pos_y()',
        'move(East)',
        'move(North)',
        't = get_tick_count()',
        'd = spawn_drone(stay)',
        'quick_print(get_tick_count() - t)',
        'quick_print(wait_for(d))',
      ].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual([String(SPAWN), '11']);
    expect(r.world.drainEvents().some((e) => e.kind === "spawn" && e.droneId === 1 && e.x === 1 && e.y === 1)).toBe(true);
  });

  it('en el límite de max_drones() devuelve None, no lanza error y cuesta 1 tick', () => {
    const r = runProgram(
      [
        'def idle():',
        '    for i in range(500):',
        '        pass',
        'a = spawn_drone(idle)',
        't = get_tick_count()',
        'b = spawn_drone(idle)',
        'dt = get_tick_count() - t',
        'quick_print(b == None, dt)',
        'quick_print(num_drones(), max_drones())',
      ].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['True 1', '2 2']);
  });

  it('valida la función y sus argumentos en el dron padre', () => {
    const world = () => megaWorld(1);
    expect(runProgram('spawn_drone(5)', { world: world() }).error).toMatch(/^TypeError: spawn_drone\(\) necesita una función/);
    expect(runProgram('spawn_drone(print)', { world: world() }).error).toMatch(/^TypeError: spawn_drone\(\) necesita una función/);
    expect(runProgram('def f(a):\n    pass\nspawn_drone(f)', { world: world() }).error).toMatch(/^TypeError/);
    expect(runProgram('wait_for(3)', { world: world() }).error).toMatch(/^TypeError: wait_for\(\) espera un dron/);
  });

  it('un error en un hijo no detiene al padre y wait_for devuelve None', () => {
    const r = runProgram(
      ['def bad():', '    return 1 / 0', 'd = spawn_drone(bad)', 'quick_print(wait_for(d))', 'quick_print("sigo")'].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['None', 'sigo']);
  });

  it('los hijos terminados se retiran del planificador y del mundo', () => {
    const r = runProgram(
      ['def quick():', '    return 1', 'd = spawn_drone(quick)', 'wait_for(d)', 'quick_print(len(str(d)) > 0)'].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    expect(r.scheduler.all.map((vm) => vm.id)).toEqual([0]);
    expect(r.world.drones.map((d) => d.id)).toEqual([0]);
  });
});

describe('Megafarm: aislamiento de memoria (doc 02 §3)', () => {
  it('ningún dron puede mutar las variables globales ni las listas de otro', () => {
    const r = runProgram(
      [
        'data = [1, 2, 3]',
        'counter = 0',
        'def mutate(lst):',
        '    global counter',
        '    counter += 100',
        '    lst.append(99)',
        '    data.append(42)',
        '    return len(lst), len(data), counter',
        'd = spawn_drone(mutate, data)',
        'quick_print(wait_for(d))',
        'quick_print(data, counter)',
      ].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    // En el hijo `lst` y `data` siguen siendo la misma lista (copia con identidades), pero no la del padre.
    expect(r.output).toEqual(['(5, 5, 100)', '[1, 2, 3] 0']);
  });

  it('lo que el padre cambia después de crear al hijo no le llega', () => {
    const r = runProgram(
      [
        'shared = [0]',
        'def reader():',
        '    for i in range(50):',
        '        pass',
        '    return shared[0]',
        'd = spawn_drone(reader)',
        'shared[0] = 7',
        'quick_print(wait_for(d), shared[0])',
      ].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.output).toEqual(['0 7']);
  });

  it('wait_for entrega una copia propia del valor devuelto', () => {
    const r = runProgram(
      ['def make():', '    return [1, 2]', 'd = spawn_drone(make)', 'a = wait_for(d)', 'a.append(3)', 'quick_print(a, wait_for(d))'].join(
        '\n',
      ),
      { world: megaWorld(1) },
    );
    expect(r.output).toEqual(['[1, 2, 3] [1, 2]']);
  });

  it('los cierres y los módulos importados también se copian', () => {
    const r = runProgram(
      [
        'import helper',
        'helper.push(1)',
        'def make_counter():',
        '    count = [0]',
        '    def inc():',
        '        count[0] += 1',
        '        return count[0]',
        '    return inc',
        'inc = make_counter()',
        'inc()',
        'def child():',
        '    for i in range(5):',
        '        inc()',
        '    return inc(), helper.push(2)',
        'd = spawn_drone(child)',
        'quick_print(wait_for(d), inc(), len(helper.values))',
      ].join('\n'),
      { world: megaWorld(1), files: { 'helper.py': 'values = []\ndef push(x):\n    values.append(x)\n    return len(values)\n' } },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['(7, 2) 2 1']);
  });

  it('copia estructuras con ciclos y funciones recursivas', () => {
    const r = runProgram(
      [
        'a = [1]',
        'a.append(a)',
        'def fact(n):',
        '    if n <= 1:',
        '        return 1',
        '    return n * fact(n - 1)',
        'def child(x):',
        '    x[0] = 5',
        '    return x[1] is x, fact(5)',
        'd = spawn_drone(child, a)',
        'quick_print(wait_for(d), a[0])',
      ].join('\n'),
      { world: megaWorld(1) },
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['(True, 120) 1']);
  });
});

describe('Megafarm: 32 drones en Round-Robin', () => {
  const SWARM = [
    'def spin():',
    '    for i in range(30000):',
    '        pass',
    '    return get_pos_x()',
    'handles = []',
    'while True:',
    '    h = spawn_drone(spin)',
    '    if h == None:',
    '        break',
    '    handles.append(h)',
    '    move(East)',
    'quick_print(len(handles), num_drones(), max_drones())',
    'total = 0',
    'for h in handles:',
    '    total += wait_for(h)',
    'quick_print(total, num_drones())',
  ].join('\n');

  it('llega a 32 drones a la vez (logro Enjambre) y todos terminan', { timeout: 30_000 }, () => {
    const r = runProgram(SWARM, { world: megaWorld(5, 8), maxTicks: 200_000 });
    expect(r.error).toBeNull();
    // Los hijos nacen en x = 0..7 envolviendo la granja de 8 × 8: 31 hijos → suma de (i mod 8).
    let expected = 0;
    for (let i = 0; i < 31; i++) expected += i % 8;
    expect(r.output).toEqual(['31 32 32', `${expected} 1`]);
    expect(r.world.stats.maxActiveDrones).toBe(32);
    expect(r.world.achievements.has('Swarm')).toBe(true);
    expect(r.world.drones).toHaveLength(1);
  });

  it('es determinista: dos ejecuciones dejan exactamente el mismo mundo', { timeout: 30_000 }, () => {
    const a = runProgram(SWARM, { world: megaWorld(5, 8), maxTicks: 200_000 });
    const b = runProgram(SWARM, { world: megaWorld(5, 8), maxTicks: 200_000 });
    expect(a.ticks).toBe(b.ticks);
    expect(JSON.stringify(a.world.serialize())).toBe(JSON.stringify(b.world.serialize()));
  });
});

describe('do_a_flip()', () => {
  it('dura 1 segundo fijo (400 ticks) y no se acelera con Items.Power', () => {
    const plain = runProgram('t = get_tick_count()\ndo_a_flip()\nquick_print(get_tick_count() - t)');
    expect(plain.error).toBeNull();
    expect(plain.output).toEqual([String(DEFAULT_BALANCE.ticks.baseTicksPerSecond)]);

    const world = new World({ seed: 3, size: 3 });
    world.inventory.add('Power', 1000);
    const powered = runProgram(
      't = get_tick_count()\ndo_a_flip()\nquick_print(get_tick_count() - t)\nt = get_tick_count()\nmove(East)\nquick_print(get_tick_count() - t)',
      { world },
    );
    expect(powered.output).toEqual([String(DEFAULT_BALANCE.ticks.baseTicksPerSecond), String(SPAWN / 2)]);
    expect(powered.world.stats.flips).toBe(1);
    expect(powered.world.achievements.has('Barrel Roll')).toBe(true);
  });
});

describe('Megafarm en el host de simulación', () => {
  it('los hijos aparecen en el snapshot y STOP_ALL los retira', () => {
    const h = createHost();
    h.host.currentWorld.unlocks.Megafarm = 2;
    h.load(['def spin():', '    while True:', '        pass', 'for i in range(3):', '    spawn_drone(spin)', 'spin()'].join('\n'));
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(SPAWN * 3 + 10);
    h.host.handleMessage({ type: 'STEP_TICK', ticks: 1 });
    expect(h.lastSnapshot().drones.map((d) => d.id)).toEqual([0, 1, 2, 3]);
    expect(h.host.currentScheduler.activeCount()).toBe(4);
    h.host.handleMessage({ type: 'STOP_ALL' });
    expect(h.lastSnapshot().drones.map((d) => d.id)).toEqual([0]);
    expect(h.host.currentScheduler.all).toHaveLength(0);
  });

  it('set_execution_speed() limita la velocidad y ≤ 0 la restaura', () => {
    const h = createHost();
    h.host.currentWorld.unlocks.Speed = 3;
    const full = h.host.ticksPerRealSecond();
    h.load('set_execution_speed(1)\nwhile True:\n    pass');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(SPAWN + 5);
    expect(h.host.ticksPerRealSecond()).toBe(DEFAULT_BALANCE.ticks.baseTicksPerSecond);
    expect(full).toBeGreaterThan(DEFAULT_BALANCE.ticks.baseTicksPerSecond);
    h.load('set_execution_speed(0)\nwhile True:\n    pass');
    h.host.handleMessage({ type: 'RUN_SCRIPT', entryFile: 'main.py' });
    h.host.runTicks(SPAWN + 5);
    expect(h.host.ticksPerRealSecond()).toBe(full);
  });
});
