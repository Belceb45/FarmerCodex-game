import { describe, expect, it } from 'vitest';
import { PyError } from '../src/vm/errors';
import { tokenize, type Token } from '../src/vm/lexer';

const kinds = (tokens: Token[]) => tokens.map((t) => (t.type === 'OP' || t.type === 'KEYWORD' ? t.value : t.type));

describe('Lexer', () => {
  it('tokeniza una sentencia simple', () => {
    const tokens = tokenize('x = 1 + 2.5');
    expect(kinds(tokens)).toEqual(['NAME', '=', 'NUMBER', '+', 'NUMBER', 'NEWLINE', 'EOF']);
    expect(tokens[2].num).toBe(1);
    expect(tokens[4].num).toBe(2.5);
  });

  it('genera INDENT y DEDENT según la sangría', () => {
    const src = ['while True:', '    if can_harvest():', '        harvest()', '    move(North)', 'x = 1'].join('\n');
    const types = tokenize(src).map((t) => t.type);
    expect(types.filter((t) => t === 'INDENT')).toHaveLength(2);
    expect(types.filter((t) => t === 'DEDENT')).toHaveLength(2);
    expect(kinds(tokenize(src))).toEqual([
      'while', 'True', ':', 'NEWLINE',
      'INDENT', 'if', 'NAME', '(', ')', ':', 'NEWLINE',
      'INDENT', 'NAME', '(', ')', 'NEWLINE',
      'DEDENT', 'NAME', '(', 'NAME', ')', 'NEWLINE',
      'DEDENT', 'NAME', '=', 'NUMBER', 'NEWLINE',
      'EOF',
    ]);
  });

  it('cierra todos los bloques abiertos al final del archivo', () => {
    const types = tokenize('def f():\n    if x:\n        pass').map((t) => t.type);
    expect(types.slice(-3)).toEqual(['DEDENT', 'DEDENT', 'EOF']);
  });

  it('ignora líneas en blanco y comentarios al calcular la sangría', () => {
    const src = 'if x:\n    a = 1\n\n        # comentario desalineado\n    b = 2\n';
    const types = tokenize(src).map((t) => t.type);
    expect(types.filter((t) => t === 'INDENT')).toHaveLength(1);
    expect(types.filter((t) => t === 'DEDENT')).toHaveLength(1);
  });

  it('une líneas dentro de paréntesis y con barra invertida', () => {
    const tokens = tokenize('x = (1 +\n     2)\ny = 3 + \\\n    4');
    expect(tokens.filter((t) => t.type === 'NEWLINE')).toHaveLength(2);
    expect(tokens.filter((t) => t.type === 'INDENT')).toHaveLength(0);
  });

  it('decodifica cadenas con escapes, comillas triples y raw', () => {
    const tokens = tokenize(`a = "uno\\ndos"\nb = 'it\\'s'\nc = """multi\nlínea"""\nd = r"\\n"`);
    const strings = tokens.filter((t) => t.type === 'STRING').map((t) => t.value);
    expect(strings).toEqual(['uno\ndos', "it's", 'multi\nlínea', '\\n']);
    const d = tokens.find((t) => t.value === 'd');
    expect(d?.line).toBe(5);
  });

  it('reconoce números en distintas notaciones', () => {
    const nums = tokenize('a = 1_000 + 0x1F + 0b101 + 1e3 + .5')
      .filter((t) => t.type === 'NUMBER')
      .map((t) => t.num);
    expect(nums).toEqual([1000, 31, 5, 1000, 0.5]);
  });

  it('reconoce operadores compuestos con prioridad al más largo', () => {
    const ops = tokenize('a **= b // c != d <= e -> f').filter((t) => t.type === 'OP').map((t) => t.value);
    expect(ops).toEqual(['**=', '//', '!=', '<=', '->']);
  });

  it('acepta identificadores con acentos y ñ', () => {
    const tokens = tokenize('año = 1\ncosecha_útil = año');
    expect(tokens.filter((t) => t.type === 'NAME').map((t) => t.value)).toEqual(['año', 'cosecha_útil', 'año']);
  });

  it('distingue palabras reservadas', () => {
    const tokens = tokenize('if x and not y: pass');
    expect(tokens.filter((t) => t.type === 'KEYWORD').map((t) => t.value)).toEqual(['if', 'and', 'not', 'pass']);
  });

  it('informa líneas y columnas', () => {
    const tokens = tokenize('a = 1\n  \nb = 22');
    const b = tokens.find((t) => t.value === 'b');
    expect(b).toMatchObject({ line: 3, col: 0 });
    const n = tokens.find((t) => t.value === '22');
    expect(n).toMatchObject({ line: 3, col: 4 });
  });

  it.each([
    ['if x:\n        a = 1\n    b = 2', 'IndentationError', 3],
    ['x = (1, 2', 'SyntaxError', 1],
    ['x = 1)', 'SyntaxError', 1],
    ['s = "sin cerrar', 'SyntaxError', 1],
    ['x = $', 'SyntaxError', 1],
    ['x = f"hola {y}"', 'SyntaxError', 1],
  ])('rechaza código inválido: %j', (src, type, line) => {
    try {
      tokenize(src);
      expect.unreachable('debería lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(PyError);
      expect((err as PyError).pyType).toBe(type);
      expect((err as PyError).line).toBe(line);
    }
  });
});
