import { describe, expect, it } from 'vitest';
import type { Expr, Stmt } from '../src/vm/ast';
import { PyError } from '../src/vm/errors';
import { parse } from '../src/vm/parser';

/** Representación compacta de una expresión para comparar estructuras. */
function show(e: Expr): string {
  switch (e.kind) {
    case 'Name':
      return e.id;
    case 'Constant':
      return JSON.stringify(e.value);
    case 'BinOp':
      return `(${show(e.left)} ${e.op} ${show(e.right)})`;
    case 'UnaryOp':
      return `(${e.op} ${show(e.operand)})`;
    case 'BoolOp':
      return `(${e.values.map(show).join(` ${e.op} `)})`;
    case 'Compare':
      return `(${show(e.left)} ${e.ops.map((op, i) => `${op} ${show(e.comparators[i])}`).join(' ')})`;
    case 'Call':
      return `${show(e.func)}(${[...e.args.map(show), ...e.keywords.map((k) => `${k.name}=${show(k.value)}`)].join(', ')})`;
    case 'Attribute':
      return `${show(e.value)}.${e.attr}`;
    case 'Subscript':
      return `${show(e.value)}[${show(e.index)}]`;
    case 'Slice':
      return `${e.lower ? show(e.lower) : ''}:${e.upper ? show(e.upper) : ''}${e.step ? ':' + show(e.step) : ''}`;
    case 'List':
      return `[${e.elts.map(show).join(', ')}]`;
    case 'Tuple':
      return `tuple(${e.elts.map(show).join(', ')})`;
    case 'Set':
      return `set(${e.elts.map(show).join(', ')})`;
    case 'Dict':
      return `{${e.keys.map((k, i) => `${show(k)}: ${show(e.values[i])}`).join(', ')}}`;
    case 'IfExp':
      return `(${show(e.body)} if ${show(e.test)} else ${show(e.orelse)})`;
  }
}

function expr(src: string): string {
  const stmt = parse(src).body[0];
  if (stmt.kind !== 'Expr') throw new Error('no es una expresión');
  return show(stmt.value);
}

function first(src: string): Stmt {
  return parse(src).body[0];
}

function syntaxErrorOf(src: string): PyError {
  try {
    parse(src);
  } catch (err) {
    if (err instanceof PyError) return err;
    throw err;
  }
  throw new Error('se esperaba un error de sintaxis');
}

describe('Parser: precedencia y expresiones', () => {
  it.each([
    ['1 + 2 * 3', '(1 + (2 * 3))'],
    ['(1 + 2) * 3', '((1 + 2) * 3)'],
    ['10 - 2 - 3', '((10 - 2) - 3)'],
    ['2 ** 3 ** 2', '(2 ** (3 ** 2))'],
    ['-2 ** 2', '(neg (2 ** 2))'],
    ['a // b % c', '((a // b) % c)'],
    ['not a == b', '(not (a == b))'],
    ['a or b and c', '(a or (b and c))'],
    ['0 <= x < size', '(0 <= x < size)'],
    ['x not in xs', '(x not in xs)'],
    ['y is not None', '(y is not null)'],
    ['a if c else b', '(a if c else b)'],
    ['f(1, b=2)', 'f(1, b=2)'],
    ['Items.Hay', 'Items.Hay'],
    ['grid[x][y]', 'grid[x][y]'],
    ['xs[1:3]', 'xs[1:3]'],
    ['xs[::-1]', 'xs[::(neg 1)]'],
    ['d[x, y]', 'd[tuple(x, y)]'],
    ['[1, 2, 3]', '[1, 2, 3]'],
    ['(1,)', 'tuple(1)'],
    ['()', 'tuple()'],
    ['{}', '{}'],
    ['{"a": 1, "b": 2}', '{"a": 1, "b": 2}'],
    ['{1, 2}', 'set(1, 2)'],
    ['"ab" "cd"', '"abcd"'],
    ['lst.append(x)', 'lst.append(x)'],
  ])('%s', (src, expected) => {
    expect(expr(src)).toBe(expected);
  });
});

describe('Parser: sentencias', () => {
  it('if / elif / else anidados', () => {
    const s = first('if a:\n    x = 1\nelif b:\n    x = 2\nelse:\n    x = 3');
    expect(s.kind).toBe('If');
    if (s.kind !== 'If') return;
    expect(s.body).toHaveLength(1);
    expect(s.orelse[0].kind).toBe('If');
    const elif = s.orelse[0];
    if (elif.kind !== 'If') return;
    expect(elif.line).toBe(3);
    expect(elif.orelse[0]).toMatchObject({ kind: 'Assign', line: 6 });
  });

  it('while y for con range', () => {
    const w = first('while x < 10:\n    x += 1');
    expect(w).toMatchObject({ kind: 'While' });
    const f = first('for i in range(5):\n    pass');
    expect(f.kind).toBe('For');
    if (f.kind === 'For') {
      expect(show(f.target)).toBe('i');
      expect(show(f.iter)).toBe('range(5)');
    }
  });

  it('for con desempaquetado', () => {
    const f = first('for k, v in d.items():\n    pass');
    if (f.kind !== 'For') throw new Error();
    expect(show(f.target)).toBe('tuple(k, v)');
  });

  it('def con valores por defecto y anotaciones de tipo ignoradas', () => {
    const d = first('def move_to(x: int, y: int = 0) -> bool:\n    return True');
    expect(d.kind).toBe('FunctionDef');
    if (d.kind !== 'FunctionDef') return;
    expect(d.name).toBe('move_to');
    expect(d.params.map((p) => p.name)).toEqual(['x', 'y']);
    expect(d.params[0].default).toBeNull();
    expect(d.params[1].default).toMatchObject({ kind: 'Constant', value: 0 });
    expect(d.body[0]).toMatchObject({ kind: 'Return' });
  });

  it('asignaciones encadenadas, aumentadas, anotadas y con tuplas', () => {
    expect(first('a = b = 0')).toMatchObject({ kind: 'Assign', targets: [{ id: 'a' }, { id: 'b' }] });
    expect(first('x += 2')).toMatchObject({ kind: 'AugAssign', op: '+' });
    expect(first('n: int = 5')).toMatchObject({ kind: 'AnnAssign', target: { id: 'n' } });
    const swap = first('a, b = b, a');
    if (swap.kind !== 'Assign') throw new Error();
    expect(show(swap.targets[0])).toBe('tuple(a, b)');
    expect(show(swap.value)).toBe('tuple(b, a)');
  });

  it('bloques en una sola línea y varias sentencias con ;', () => {
    const m = parse('if x: a = 1; b = 2\nwhile x: x -= 1');
    expect(m.body).toHaveLength(2);
    const s = m.body[0];
    if (s.kind !== 'If') throw new Error();
    expect(s.body).toHaveLength(2);
  });

  it('global, return vacío, break, continue y pass', () => {
    const d = first('def f():\n    global total\n    while True:\n        break\n    for i in xs:\n        continue\n    pass\n    return');
    if (d.kind !== 'FunctionDef') throw new Error();
    expect(d.body.map((s) => s.kind)).toEqual(['Global', 'While', 'For', 'Pass', 'Return']);
  });

  it('el programa de la Fase 1 se analiza correctamente', () => {
    const m = parse('while True:\n    if can_harvest():\n        harvest()\n    move(North)\n');
    expect(m.body).toHaveLength(1);
    const w = m.body[0];
    if (w.kind !== 'While') throw new Error();
    expect(w.body.map((s) => s.kind)).toEqual(['If', 'Expr']);
  });
});

describe('Parser: errores', () => {
  it.each([
    ['if x\n    pass', 'SyntaxError', 1, "':'"],
    ['if x:\npass', 'IndentationError', 2, 'sangría'],
    ['  x = 1', 'IndentationError', 1, 'sangría inesperada'],
    ['x = = 1', 'SyntaxError', 1, 'sintaxis'],
    ['f(a=1, 2)', 'SyntaxError', 1, 'posicional'],
    ['1 = x', 'SyntaxError', 1, 'literal'],
    ['f() = 3', 'SyntaxError', 1, 'llamada'],
    ['def f(a=1, b):\n    pass', 'SyntaxError', 1, 'por defecto'],
    ['else:\n    pass', 'SyntaxError', 1, "'else'"],
    ['while True: if x: pass', 'SyntaxError', 1, 'propia línea'],
    ['class A:\n    pass', 'SyntaxError', 1, 'clases'],
    ['f = lambda x: x', 'SyntaxError', 1, 'lambda'],
    ['xs = [x for x in y]', 'SyntaxError', 1, 'comprensiones'],
    ['try:\n    pass', 'SyntaxError', 1, 'try'],
    ['x = a | b', 'SyntaxError', 1, 'bits'],
  ])('%j → %s en la línea %i', (src, type, line, fragment) => {
    const err = syntaxErrorOf(src);
    expect(err.pyType).toBe(type);
    expect(err.line).toBe(line);
    expect(err.message).toContain(fragment);
  });
});
