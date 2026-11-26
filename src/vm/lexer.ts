import { indentationError, syntaxError } from './errors';

export type TokenType = 'NAME' | 'KEYWORD' | 'NUMBER' | 'STRING' | 'OP' | 'NEWLINE' | 'INDENT' | 'DEDENT' | 'EOF';

export interface Token {
  type: TokenType;
  /** Texto del token (para STRING: contenido ya decodificado). */
  value: string;
  /** Línea 1-based. */
  line: number;
  /** Columna 0-based. */
  col: number;
  /** Valor numérico (solo NUMBER). */
  num?: number;
}

export const KEYWORDS: ReadonlySet<string> = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/** Ordenados de mayor a menor longitud para reconocer siempre el operador más largo. */
const OPERATORS = [
  '**=', '//=', '>>=', '<<=', '...',
  '->', ':=', '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=', '>>', '<<',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '@', '&', '|', '^', '~',
];

const CLOSING: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

const IDENT_START = /[\p{L}_]/u;
const IDENT_CHAR = /[\p{L}\p{N}_]/u;

function isIdentStart(c: string | undefined): boolean {
  return c !== undefined && IDENT_START.test(c);
}

function isIdentChar(c: string | undefined): boolean {
  return c !== undefined && IDENT_CHAR.test(c);
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

/**
 * Tokenizador con sangría significativa (INDENT / DEDENT) al estilo de Python:
 * - Las líneas vacías o solo con comentarios no afectan la sangría.
 * - Dentro de (), [] y {} los saltos de línea se ignoran (continuación implícita).
 * - `\` al final de línea une la siguiente.
 * - Un tabulador avanza hasta la siguiente columna múltiplo de 4.
 */
export function tokenize(source: string): Token[] {
  const src = source.replace(/\r\n?/g, '\n');
  const n = src.length;
  const tokens: Token[] = [];
  const indents: number[] = [0];
  const brackets: { ch: string; line: number; col: number }[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let atLineStart = true;

  const push = (type: TokenType, value: string, tLine: number, tCol: number, num?: number): void => {
    const token: Token = { type, value, line: tLine, col: tCol };
    if (num !== undefined) token.num = num;
    tokens.push(token);
  };

  while (i < n) {
    if (atLineStart) {
      atLineStart = false;
      if (brackets.length === 0) {
        let col = 0;
        let j = i;
        while (j < n) {
          const c = src[j];
          if (c === ' ') col++;
          else if (c === '\t') col = col + 4 - (col % 4);
          else if (c === '\f') col = 0;
          else break;
          j++;
        }
        if (j >= n) {
          i = j;
          break;
        }
        if (src[j] === '\n') {
          i = j + 1;
          line++;
          lineStart = i;
          atLineStart = true;
          continue;
        }
        if (src[j] === '#') {
          while (j < n && src[j] !== '\n') j++;
          if (j >= n) {
            i = j;
            break;
          }
          i = j + 1;
          line++;
          lineStart = i;
          atLineStart = true;
          continue;
        }
        i = j;
        const current = indents[indents.length - 1];
        if (col > current) {
          indents.push(col);
          push('INDENT', '', line, 0);
        } else if (col < current) {
          while (indents.length > 1 && col < indents[indents.length - 1]) {
            indents.pop();
            push('DEDENT', '', line, col);
          }
          if (col !== indents[indents.length - 1]) {
            throw indentationError('la sangría no coincide con ningún nivel exterior', line, col);
          }
        }
      }
      continue;
    }

    const c = src[i];
    const col = i - lineStart;

    if (c === '\n') {
      if (brackets.length === 0) {
        push('NEWLINE', '', line, col);
        atLineStart = true;
      }
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\f') {
      i++;
      continue;
    }
    if (c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\\') {
      if (src[i + 1] === '\n') {
        i += 2;
        line++;
        lineStart = i;
        continue;
      }
      throw syntaxError("carácter inesperado después de '\\' (continuación de línea)", line, col);
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(src[j])) j++;
      const word = src.slice(i, j);
      const quote = src[j];
      if ((quote === '"' || quote === "'") && /^[rRbBfFuU]{1,2}$/.test(word)) {
        const lower = word.toLowerCase();
        if (lower.includes('f')) {
          throw syntaxError('las f-strings no están soportadas; usa str() y el operador +', line, col);
        }
        if (lower.includes('b')) throw syntaxError('las cadenas de bytes no están soportadas', line, col);
        const res = readString(src, j, lower.includes('r'), line, lineStart);
        push('STRING', res.value, line, col);
        i = res.end;
        line = res.line;
        lineStart = res.lineStart;
        continue;
      }
      push(KEYWORDS.has(word) ? 'KEYWORD' : 'NAME', word, line, col);
      i = j;
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const res = readNumber(src, i, line, col);
      push('NUMBER', res.text, line, col, res.value);
      i = res.end;
      continue;
    }

    if (c === '"' || c === "'") {
      const res = readString(src, i, false, line, lineStart);
      push('STRING', res.value, line, col);
      i = res.end;
      line = res.line;
      lineStart = res.lineStart;
      continue;
    }

    let op: string | undefined;
    for (const candidate of OPERATORS) {
      if (src.startsWith(candidate, i)) {
        op = candidate;
        break;
      }
    }
    if (op === undefined) {
      if (c === '!') throw syntaxError("operador inválido '!'; para negar usa 'not'", line, col);
      throw syntaxError(`carácter no válido: '${c}'`, line, col);
    }
    if (op === '(' || op === '[' || op === '{') {
      brackets.push({ ch: op, line, col });
    } else if (op === ')' || op === ']' || op === '}') {
      const open = brackets.pop();
      if (!open) throw syntaxError(`'${op}' sin su apertura correspondiente`, line, col);
      if (open.ch !== CLOSING[op]) {
        throw syntaxError(`'${op}' no corresponde con '${open.ch}' abierto en la línea ${open.line}`, line, col);
      }
    }
    push('OP', op, line, col);
    i += op.length;
  }

  if (brackets.length > 0) {
    const open = brackets[brackets.length - 1];
    throw syntaxError(`'${open.ch}' nunca se cerró`, open.line, open.col);
  }
  const last = tokens[tokens.length - 1];
  if (last && last.type !== 'NEWLINE' && last.type !== 'INDENT' && last.type !== 'DEDENT') {
    push('NEWLINE', '', line, i - lineStart);
  }
  while (indents.length > 1) {
    indents.pop();
    push('DEDENT', '', line, 0);
  }
  push('EOF', '', line, i - lineStart);
  return tokens;
}

function readNumber(src: string, start: number, line: number, col: number): { text: string; value: number; end: number } {
  let i = start;
  let value: number;
  const prefix = src[i + 1];
  if (src[i] === '0' && prefix !== undefined && /[xXoObB]/.test(prefix)) {
    const kind = prefix.toLowerCase();
    const digitRe = kind === 'x' ? /[0-9a-fA-F_]/ : kind === 'o' ? /[0-7_]/ : /[01_]/;
    i += 2;
    const s = i;
    while (i < src.length && digitRe.test(src[i])) i++;
    const digits = src.slice(s, i).replace(/_/g, '');
    if (digits.length === 0) throw syntaxError('literal numérico inválido', line, col);
    value = parseInt(digits, kind === 'x' ? 16 : kind === 'o' ? 8 : 2);
  } else {
    while (i < src.length && (isDigit(src[i]) || src[i] === '_')) i++;
    if (src[i] === '.') {
      i++;
      while (i < src.length && (isDigit(src[i]) || src[i] === '_')) i++;
    }
    if (src[i] === 'e' || src[i] === 'E') {
      const sign = src[i + 1];
      const afterSign = sign === '+' || sign === '-' ? src[i + 2] : sign;
      if (isDigit(afterSign)) {
        i += sign === '+' || sign === '-' ? 2 : 1;
        while (i < src.length && isDigit(src[i])) i++;
      }
    }
    value = Number(src.slice(start, i).replace(/_/g, ''));
  }
  if (src[i] === 'j' || src[i] === 'J') throw syntaxError('los números complejos no están soportados', line, col);
  if (isIdentChar(src[i]) || Number.isNaN(value)) throw syntaxError('literal numérico inválido', line, col);
  return { text: src.slice(start, i), value, end: i };
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v',
};

function readString(
  src: string,
  start: number,
  raw: boolean,
  startLine: number,
  startLineStart: number,
): { value: string; end: number; line: number; lineStart: number } {
  const quote = src[start];
  const tripleQuote = quote.repeat(3);
  const triple = src.startsWith(tripleQuote, start);
  const startCol = start - startLineStart;
  let i = start + (triple ? 3 : 1);
  let line = startLine;
  let lineStart = startLineStart;
  let out = '';
  for (;;) {
    if (i >= src.length) {
      throw syntaxError(triple ? 'cadena de triple comilla sin cerrar' : 'cadena sin cerrar', startLine, startCol);
    }
    const c = src[i];
    if (triple) {
      if (src.startsWith(tripleQuote, i)) {
        i += 3;
        break;
      }
    } else {
      if (c === quote) {
        i++;
        break;
      }
      if (c === '\n') throw syntaxError('cadena sin cerrar (falta la comilla de cierre)', startLine, startCol);
    }
    if (c === '\\') {
      const next = src[i + 1];
      if (next === undefined) {
        i++;
        continue;
      }
      if (next === '\n') {
        i += 2;
        line++;
        lineStart = i;
        continue;
      }
      if (raw) {
        out += c + next;
        i += 2;
        continue;
      }
      const simple = SIMPLE_ESCAPES[next];
      if (simple !== undefined) {
        out += simple;
        i += 2;
        continue;
      }
      if (next === 'x' || next === 'u') {
        const len = next === 'x' ? 2 : 4;
        const hex = src.slice(i + 2, i + 2 + len);
        if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) {
          throw syntaxError(`secuencia de escape \\${next} inválida`, line, i - lineStart);
        }
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2 + len;
        continue;
      }
      out += c + next;
      i += 2;
      continue;
    }
    if (c === '\n') {
      line++;
      lineStart = i + 1;
    }
    out += c;
    i++;
  }
  return { value: out, end: i, line, lineStart };
}
