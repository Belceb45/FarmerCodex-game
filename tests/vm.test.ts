import { describe, expect, it } from 'vitest';
import { cloneBalance } from '../src/config/balance';
import { compileSource } from '../src/vm/compiler';
import { PyError } from '../src/vm/errors';
import { evaluate, runProgram } from './helpers';

const lines = (...src: string[]) => src.join('\n');

describe('VM: expresiones y tipos', () => {
  it.each([
    ['7 / 2', '3.5'],
    ['7 // 2', '3'],
    ['-7 // 2', '-4'],
    ['-7 % 3', '2'],
    ['7 % -3', '-2'],
    ['2 ** 10', '1024'],
    ['2 ** 3 ** 2', '512'],
    ['-2 ** 2', '-4'],
    ['1 + 2 * 3', '7'],
    ['10 - 2 - 3', '5'],
    ['0.1 + 0.2', '0.30000000000000004'],
    ['"ab" + "cd"', 'abcd'],
    ['"ab" * 3', 'ababab'],
    ['[1, 2] + [3]', '[1, 2, 3]'],
    ['[0] * 3', '[0, 0, 0]'],
    ['(1, 2) + (3,)', '(1, 2, 3)'],
    ['True + 1', '2'],
    ['not 0', 'True'],
    ['1 == 1.0', 'True'],
    ['1 == True', 'True'],
    ['[1, [2]] == [1, [2]]', 'True'],
    ['(1, 2) == [1, 2]', 'False'],
    ['0 <= 5 < 10', 'True'],
    ['3 < 2 < 1', 'False'],
    ['1 < 2 > 0', 'True'],
    ['"abc" < "abd"', 'True'],
    ['(1, 2) < (1, 3)', 'True'],
    ['2 in [1, 2, 3]', 'True'],
    ['"b" in "abc"', 'True'],
    ['4 not in range(4)', 'True'],
    ['None is None', 'True'],
    ['0 or "x"', 'x'],
    ['1 and 0', '0'],
    ['[] or [1]', '[1]'],
    ['"si" if 3 > 2 else "no"', 'si'],
    ['len([1, 2, 3])', '3'],
    ['len("hola")', '4'],
    ['min(3, 1, 2)', '1'],
    ['max([4, 9, 2])', '9'],
    ['abs(-5)', '5'],
    ['int("42") + 1', '43'],
    ['int(-3.9)', '-3'],
    ['float("2.5")', '2.5'],
    ['str(12) + "!"', '12!'],
    ['bool([])', 'False'],
    ['list(range(3))', '[0, 1, 2]'],
    ['list(range(10, 0, -3))', '[10, 7, 4, 1]'],
    ['[1, 2, 3, 4][1:3]', '[2, 3]'],
    ['[1, 2, 3][-1]', '3'],
    ['"hola"[::-1]', 'aloh'],
    ['{"a": 1}["a"]', '1'],
    ['{(1, 2): "x"}[(1, 2)]', 'x'],
    ['len({1, 2, 2, 3})', '3'],
    ['{1: "a", True: "b"}', "{1: 'b'}"],
    ['[1, "a", None, True, 2.5]', "[1, 'a', None, True, 2.5]"],
    ['(1,)', '(1,)'],
    ['set()', 'set()'],
    ['North', 'North'],
    ['Items.Hay', 'Items.Hay'],
    ['Entities.Grass == Entities.Grass', 'True'],
    ['Directions.North == North', 'True'],
  ])('%s → %s', (src, expected) => {
    expect(evaluate(src)).toBe(expected);
  });

  it('print une argumentos con espacios y usa str()', () => {
    const r = runProgram('quick_print("a", 1, 2.5, None, [1])');
    expect(r.output).toEqual(['a 1 2.5 None [1]']);
  });
});

describe('VM: control de flujo', () => {
  it('if / elif / else', () => {
    const r = runProgram(
      lines(
        'for n in [5, 0, -3]:',
        '    if n > 0:',
        '        quick_print("positivo")',
        '    elif n == 0:',
        '        quick_print("cero")',
        '    else:',
        '        quick_print("negativo")',
      ),
    );
    expect(r.output).toEqual(['positivo', 'cero', 'negativo']);
  });

  it('while con break y continue', () => {
    const r = runProgram(
      lines(
        'i = 0',
        'total = 0',
        'while True:',
        '    i += 1',
        '    if i % 2 == 0:',
        '        continue',
        '    if i > 9:',
        '        break',
        '    total += i',
        'quick_print(total)',
      ),
    );
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['25']);
  });

  it('break solo sale del bucle interior y libera su iterador', () => {
    const r = runProgram(
      lines(
        'pares = []',
        'for a in range(3):',
        '    for b in range(3):',
        '        if b > a:',
        '            break',
        '        pares.append((a, b))',
        'quick_print(len(pares), pares[-1])',
      ),
    );
    expect(r.output).toEqual(['6 (2, 2)']);
  });

  it('for sobre listas, cadenas, diccionarios e items()', () => {
    const r = runProgram(
      lines(
        'd = {"x": 1, "y": 2}',
        'out = []',
        'for k in d:',
        '    out.append(k)',
        'for k, v in d.items():',
        '    out.append(v * 10)',
        'for c in "ab":',
        '    out.append(c)',
        'quick_print(out)',
      ),
    );
    expect(r.output).toEqual(["['x', 'y', 10, 20, 'a', 'b']"]);
  });

  it('bloques de una línea', () => {
    const r = runProgram(lines('x = 0', 'while x < 3: x += 1', 'if x == 3: quick_print("ok"); quick_print(x)'));
    expect(r.output).toEqual(['ok', '3']);
  });
});

describe('VM: funciones y ámbitos', () => {
  it('recursión', () => {
    const r = runProgram(
      lines('def fib(n):', '    if n < 2:', '        return n', '    return fib(n - 1) + fib(n - 2)', 'quick_print(fib(12))'),
    );
    expect(r.output).toEqual(['144']);
  });

  it('valores por defecto, argumentos con nombre y return implícito', () => {
    const r = runProgram(
      lines(
        'def f(a, b=10, c=100):',
        '    return a + b + c',
        'def nada():',
        '    x = 1',
        'quick_print(f(1), f(1, 2), f(1, c=3), f(a=5, b=5, c=5), nada())',
      ),
    );
    expect(r.output).toEqual(['111 103 14 15 None']);
  });

  it('funciones de orden superior', () => {
    const r = runProgram(
      lines(
        'def aplicar(fn, valores):',
        '    out = []',
        '    for v in valores:',
        '        out.append(fn(v))',
        '    return out',
        'def doble(x):',
        '    return x * 2',
        'quick_print(aplicar(doble, [1, 2, 3]))',
      ),
    );
    expect(r.output).toEqual(['[2, 4, 6]']);
  });

  it('cierres: una función anidada lee variables de la función contenedora', () => {
    const r = runProgram(
      lines(
        'def crear_sumador(n):',
        '    def sumar(x):',
        '        return x + n',
        '    return sumar',
        'suma5 = crear_sumador(5)',
        'quick_print(suma5(10))',
      ),
    );
    expect(r.output).toEqual(['15']);
  });

  it('global permite modificar variables del módulo', () => {
    const r = runProgram(
      lines('contador = 0', 'def inc():', '    global contador', '    contador += 1', 'inc()', 'inc()', 'quick_print(contador)'),
    );
    expect(r.output).toEqual(['2']);
  });

  it('sin global, asignar dentro de la función produce UnboundLocalError (como en Python)', () => {
    const r = runProgram(lines('contador = 0', 'def inc():', '    contador += 1', 'inc()'));
    expect(r.error).toMatch(/^UnboundLocalError/);
    expect(r.error).toContain('global contador');
    expect(r.errorLine).toBe(3);
  });

  it('las variables locales no se filtran al ámbito global', () => {
    const r = runProgram(lines('def f():', '    secreto = 1', 'f()', 'quick_print(secreto)'));
    expect(r.error).toMatch(/^NameError/);
    expect(r.errorLine).toBe(4);
  });

  it('los argumentos por defecto mutables se comparten (semántica de Python)', () => {
    const r = runProgram(lines('def f(xs=[]):', '    xs.append(1)', '    return len(xs)', 'f()', 'quick_print(f())'));
    expect(r.output).toEqual(['2']);
  });

  it('las anotaciones de tipo se aceptan y se ignoran', () => {
    const r = runProgram(lines('def mover(x: int, y: int = 2) -> int:', '    return x + y', 'z: int = mover(1)', 'quick_print(z)'));
    expect(r.output).toEqual(['3']);
  });
});

describe('VM: colecciones', () => {
  it('métodos de listas', () => {
    const r = runProgram(
      lines(
        'xs = [3, 1]',
        'xs.append(4)',
        'xs.insert(0, 9)',
        'xs.remove(1)',
        'ultimo = xs.pop()',
        'quick_print(xs, ultimo, xs.index(3), xs.count(9))',
      ),
    );
    expect(r.output).toEqual(['[9, 3] 4 1 1']);
  });

  it('métodos de diccionarios y conjuntos', () => {
    const r = runProgram(
      lines(
        'd = {}',
        'd["a"] = 1',
        'd["b"] = d.get("b", 0) + 5',
        'v = d.pop("a")',
        's = set()',
        's.add((1, 2))',
        's.add((1, 2))',
        's.discard(99)',
        'quick_print(d, v, list(d.keys()), d.items(), len(s), (1, 2) in s)',
      ),
    );
    expect(r.output).toEqual(["{'b': 5} 1 ['b'] [('b', 5)] 1 True"]);
  });

  it('asignación aumentada sobre índices y desempaquetado', () => {
    const r = runProgram(lines('a = [1, 2]', 'a[0] += 5', 'x, y = a', 'x, y = y, x', 'p = q = 7', 'quick_print(a, x, y, p, q)'));
    expect(r.output).toEqual(['[6, 2] 2 6 7 7']);
  });

  it('+= sobre listas modifica la misma lista', () => {
    const r = runProgram(lines('a = [1]', 'b = a', 'a += [2]', 'quick_print(b)'));
    expect(r.output).toEqual(['[1, 2]']);
  });

  it('una lista que se contiene a sí misma se imprime sin recursión infinita', () => {
    const r = runProgram(lines('a = [1]', 'a.append(a)', 'quick_print(a)'));
    expect(r.output).toEqual(['[1, [...]]']);
  });
});

describe('VM: errores en tiempo de ejecución', () => {
  it.each([
    ['x = 1\ny = z + 1', 'NameError', 2],
    ['x = 1 / 0', 'ZeroDivisionError', 1],
    ['x = "a" + 1', 'TypeError', 1],
    ['x = [1, 2][5]', 'IndexError', 1],
    ['x = {"a": 1}["b"]', 'KeyError', 1],
    ['x = [1, 2]\nx.nope()', 'AttributeError', 2],
    ['x = 5\nx()', 'TypeError', 2],
    ['a, b = [1, 2, 3]', 'ValueError', 1],
    ['move("Norte")', 'TypeError', 1],
    ['d = {[1]: 2}', 'TypeError', 1],
    ['def f(a):\n    return a\nf()', 'TypeError', 3],
    ['def f():\n    return f()\nf()', 'RecursionError', 2],
  ])('%j → %s en la línea %i', (src, type, line) => {
    const r = runProgram(src);
    expect(r.vm.status).toBe('ERROR');
    expect(r.error?.startsWith(type)).toBe(true);
    expect(r.errorLine).toBe(line);
  });

  it('los errores de compilación indican la línea', () => {
    try {
      compileSource('x = 1\nif x\n    pass');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PyError);
      expect((err as PyError).line).toBe(2);
    }
  });

  it.each([
    ["return 1", "'return' fuera"],
    ['break', "'break' fuera"],
    ['import a.b', 'paquetes'],
    ['def f():\n    from m import *', "'from ... import *'"],
  ])('compilación rechaza %j', (src, fragment) => {
    expect(() => compileSource(src)).toThrow(fragment);
  });
});

describe('VM: costo en ticks', () => {
  it('asignaciones y literales no cuestan ticks; cada operación cuesta 1', () => {
    expect(runProgram('x = 1').vm.ticksUsed).toBe(0);
    expect(runProgram('x = 1 + 2').vm.ticksUsed).toBe(1);
    expect(runProgram('x = -1').vm.ticksUsed).toBe(0);
    expect(runProgram('x = 1 + 2 * 3 < 10').vm.ticksUsed).toBe(3);
  });

  it('cada iteración de un bucle cuesta al menos 1 tick', () => {
    // 10 iteraciones x (comparación + suma + salto) + comparación final = 31
    const r = runProgram(lines('i = 0', 'while i < 10:', '    i += 1'));
    expect(r.vm.ticksUsed).toBe(31);
  });

  it('las acciones físicas exitosas cuestan 200 ticks y las fallidas 1', () => {
    const move = runProgram('move(North)');
    expect(move.vm.ticksUsed).toBe(200);
    // El script mide exactamente 200 ticks de duración para la acción.
    const measured = runProgram(lines('inicio = get_tick_count()', 'move(North)', 'quick_print(get_tick_count() - inicio)'));
    expect(measured.output).toEqual(['200']);
    const fail = runProgram(lines('till()', 'r = harvest()', 'quick_print(r)'));
    expect(fail.output).toEqual(['False']);
    expect(fail.vm.ticksUsed).toBe(201);
  });

  it('print cuesta 200 ticks; quick_print, get_time y get_tick_count cuestan 0', () => {
    expect(runProgram('print("hola")').vm.ticksUsed).toBe(200);
    expect(runProgram('quick_print("hola")').vm.ticksUsed).toBe(0);
    expect(runProgram('t = get_time()\nn = get_tick_count()').vm.ticksUsed).toBe(0);
  });

  it('min/max cuestan una comparación por elemento', () => {
    expect(runProgram('m = max([1, 5, 3, 2])').vm.ticksUsed).toBe(3);
  });

  it('los costos se leen de balance.json (cambiarlos altera el cálculo sin tocar código)', () => {
    const balance = cloneBalance();
    balance.ticks.physicalActionSuccess = 50;
    balance.operations.arithmetic = 3;
    expect(runProgram('move(North)', { balance }).vm.ticksUsed).toBe(50);
    expect(runProgram('x = 1 + 1', { balance }).vm.ticksUsed).toBe(3);
  });

  it('get_tick_count y get_time reflejan el tiempo simulado', () => {
    const r = runProgram(lines('move(North)', 'quick_print(get_tick_count(), get_time())'));
    expect(r.output).toEqual(['200 0.5']);
  });

  it('random() es determinista con la misma semilla', () => {
    const a = runProgram('quick_print(random(), random())', { seed: 5 });
    const b = runProgram('quick_print(random(), random())', { seed: 5 });
    const c = runProgram('quick_print(random(), random())', { seed: 6 });
    expect(a.output).toEqual(b.output);
    expect(a.output).not.toEqual(c.output);
  });
});

describe('VM: API de la granja', () => {
  it('sensores de posición, tamaño, entidad y suelo', () => {
    const r = runProgram(
      lines(
        'quick_print(get_pos_x(), get_pos_y(), get_world_size())',
        'move(East)',
        'move(North)',
        'quick_print(get_pos_x(), get_pos_y(), get_entity_type(), get_ground_type())',
        'till()',
        'quick_print(get_entity_type(), get_ground_type())',
      ),
    );
    expect(r.output).toEqual(['0 0 3', '1 1 Entities.Grass Grounds.Grassland', 'None Grounds.Soil']);
  });

  it('move envuelve los bordes (toroidal)', () => {
    const r = runProgram(lines('move(West)', 'move(South)', 'quick_print(get_pos_x(), get_pos_y())'));
    expect(r.output).toEqual(['2 2']);
  });

  it('harvest suma heno y num_items lo reporta', () => {
    const r = runProgram(lines('if can_harvest():', '    harvest()', 'quick_print(num_items(Items.Hay), can_harvest())'));
    expect(r.output).toEqual(['1 False']);
  });
});
