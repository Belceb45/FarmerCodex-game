import type { BinOpKind } from './ast';
import type { BuiltinContext, PENDING } from './builtins';
import type { CodeObject } from './compiler';
import { PyError } from './errors';

/** Tamaño máximo de colecciones creadas por repetición o conversión (evita agotar la memoria del Worker). */
export const MAX_COLLECTION_SIZE = 1_000_000;

export class PyTuple {
  readonly items: readonly RuntimeValue[];
  constructor(items: readonly RuntimeValue[]) {
    this.items = items;
  }
}

/** Diccionario con claves hasheables (números, cadenas, tuplas, enums...). Conserva el orden de inserción. */
export class PyDict {
  readonly map = new Map<string, [RuntimeValue, RuntimeValue]>();

  get size(): number {
    return this.map.size;
  }

  get(key: RuntimeValue): RuntimeValue | undefined {
    const entry = this.map.get(hashKey(key));
    return entry ? entry[1] : undefined;
  }

  set(key: RuntimeValue, value: RuntimeValue): void {
    const h = hashKey(key);
    const entry = this.map.get(h);
    if (entry) entry[1] = value;
    else this.map.set(h, [key, value]);
  }

  has(key: RuntimeValue): boolean {
    return this.map.has(hashKey(key));
  }

  delete(key: RuntimeValue): boolean {
    return this.map.delete(hashKey(key));
  }

  keys(): RuntimeValue[] {
    return Array.from(this.map.values(), (e) => e[0]);
  }

  values(): RuntimeValue[] {
    return Array.from(this.map.values(), (e) => e[1]);
  }

  entries(): [RuntimeValue, RuntimeValue][] {
    return Array.from(this.map.values(), (e) => [e[0], e[1]]);
  }
}

export class PySet {
  readonly map = new Map<string, RuntimeValue>();

  get size(): number {
    return this.map.size;
  }

  add(value: RuntimeValue): void {
    const h = hashKey(value);
    if (!this.map.has(h)) this.map.set(h, value);
  }

  has(value: RuntimeValue): boolean {
    return this.map.has(hashKey(value));
  }

  delete(value: RuntimeValue): boolean {
    return this.map.delete(hashKey(value));
  }

  values(): RuntimeValue[] {
    return Array.from(this.map.values());
  }
}

export class PyRange {
  readonly start: number;
  readonly stop: number;
  readonly step: number;

  constructor(start: number, stop: number, step: number) {
    this.start = start;
    this.stop = stop;
    this.step = step;
  }

  get length(): number {
    const span = this.step > 0 ? this.stop - this.start : this.start - this.stop;
    return span <= 0 ? 0 : Math.ceil(span / Math.abs(this.step));
  }

  at(i: number): number {
    return this.start + this.step * i;
  }

  contains(value: RuntimeValue): boolean {
    const n = toNumberOrNull(value);
    if (n === null || !Number.isInteger(n)) return false;
    const offset = n - this.start;
    if (offset % this.step !== 0) return false;
    const i = offset / this.step;
    return i >= 0 && i < this.length;
  }
}

export class PySlice {
  readonly start: RuntimeValue;
  readonly stop: RuntimeValue;
  readonly step: RuntimeValue;

  constructor(start: RuntimeValue, stop: RuntimeValue, step: RuntimeValue) {
    this.start = start;
    this.stop = stop;
    this.step = step;
  }
}

export const ITER_DONE: unique symbol = Symbol('ITER_DONE');

export class PyIterator {
  private readonly nextFn: () => RuntimeValue | typeof ITER_DONE;

  constructor(nextFn: () => RuntimeValue | typeof ITER_DONE) {
    this.nextFn = nextFn;
  }

  next(): RuntimeValue | typeof ITER_DONE {
    return this.nextFn();
  }
}

export class FunctionObject {
  readonly name: string;
  readonly code: CodeObject;
  readonly defaults: RuntimeValue[];
  readonly globals: Map<string, RuntimeValue>;
  /** Ámbitos locales de las funciones que la envuelven (el más cercano primero). */
  readonly closure: Map<string, RuntimeValue>[];

  constructor(
    code: CodeObject,
    defaults: RuntimeValue[],
    globals: Map<string, RuntimeValue>,
    closure: Map<string, RuntimeValue>[],
  ) {
    this.name = code.name;
    this.code = code;
    this.defaults = defaults;
    this.globals = globals;
    this.closure = closure;
  }
}

export type BuiltinImpl = (ctx: BuiltinContext, args: RuntimeValue[]) => RuntimeValue | typeof PENDING;

export class BuiltinFunction {
  readonly name: string;
  readonly impl: BuiltinImpl;

  constructor(name: string, impl: BuiltinImpl) {
    this.name = name;
    this.impl = impl;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada tabla de métodos fija su propio tipo de `self`
export type MethodImpl = (self: any, args: RuntimeValue[]) => RuntimeValue;

export class BoundMethod {
  readonly self: RuntimeValue;
  readonly name: string;
  readonly impl: MethodImpl;

  constructor(self: RuntimeValue, name: string, impl: MethodImpl) {
    this.self = self;
    this.name = name;
    this.impl = impl;
  }
}

export class EnumValue {
  readonly enumName: string;
  readonly name: string;
  readonly repr: string;

  constructor(enumName: string, name: string, repr: string) {
    this.enumName = enumName;
    this.name = name;
    this.repr = repr;
  }
}

export class EnumNamespace {
  readonly name: string;
  readonly members: ReadonlyMap<string, EnumValue>;

  constructor(name: string, members: ReadonlyMap<string, EnumValue>) {
    this.name = name;
    this.members = members;
  }
}

/** Módulo importado desde otro archivo `.py` del jugador: su propio ámbito global. */
export class ModuleObject {
  readonly name: string;
  readonly globals: Map<string, RuntimeValue>;
  constructor(name: string, globals: Map<string, RuntimeValue> = new Map()) {
    this.name = name;
    this.globals = globals;
  }
}

/** Referencia a un dron hijo devuelta por spawn_drone() (inmutable: se comparte entre drones). */
export class DroneHandleObject {
  readonly droneId: number;
  constructor(droneId: number) {
    this.droneId = droneId;
  }
}

export type RuntimeValue =
  | number
  | boolean
  | string
  | null
  | RuntimeValue[]
  | PyTuple
  | PyDict
  | PySet
  | PyRange
  | PySlice
  | PyIterator
  | FunctionObject
  | BuiltinFunction
  | BoundMethod
  | EnumValue
  | EnumNamespace
  | ModuleObject
  | DroneHandleObject;

// ------------------------------------------------------------------ tipos y conversión

export function typeName(v: RuntimeValue): string {
  if (v === null) return 'NoneType';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return 'list';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PySet) return 'set';
  if (v instanceof PyRange) return 'range';
  if (v instanceof PySlice) return 'slice';
  if (v instanceof PyIterator) return 'iterator';
  if (v instanceof FunctionObject) return 'function';
  if (v instanceof BuiltinFunction) return 'builtin_function';
  if (v instanceof BoundMethod) return 'method';
  if (v instanceof EnumValue) return v.enumName;
  if (v instanceof EnumNamespace) return 'enum';
  if (v instanceof ModuleObject) return 'module';
  return 'drone';
}

export function toNumberOrNull(v: RuntimeValue): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

export function isTruthy(v: RuntimeValue): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
  if (v instanceof PyRange) return v.length > 0;
  return true;
}

export function isCallable(v: RuntimeValue): boolean {
  return v instanceof FunctionObject || v instanceof BuiltinFunction || v instanceof BoundMethod;
}

export function formatNumber(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (Object.is(n, -0)) return '0';
  return String(n);
}

function quoteString(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    if (ch === '\\') out += '\\\\';
    else if (ch === q) out += '\\' + q;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else out += ch;
  }
  return out + q;
}

/** Representación de `str(v)` (lo que muestra print). */
export function pyStr(v: RuntimeValue): string {
  return typeof v === 'string' ? v : pyRepr(v);
}

/** Representación de `repr(v)`: las cadenas aparecen entre comillas. */
export function pyRepr(v: RuntimeValue, seen: Set<object> = new Set()): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return quoteString(v);
  if (Array.isArray(v) || v instanceof PyTuple || v instanceof PyDict || v instanceof PySet) {
    if (seen.has(v)) return Array.isArray(v) ? '[...]' : '{...}';
    seen.add(v);
    let out: string;
    if (Array.isArray(v)) {
      out = '[' + v.map((x) => pyRepr(x, seen)).join(', ') + ']';
    } else if (v instanceof PyTuple) {
      const inner = v.items.map((x) => pyRepr(x, seen));
      out = inner.length === 1 ? `(${inner[0]},)` : `(${inner.join(', ')})`;
    } else if (v instanceof PyDict) {
      out = '{' + v.entries().map(([k, val]) => `${pyRepr(k, seen)}: ${pyRepr(val, seen)}`).join(', ') + '}';
    } else {
      out = v.size === 0 ? 'set()' : '{' + v.values().map((x) => pyRepr(x, seen)).join(', ') + '}';
    }
    seen.delete(v);
    return out;
  }
  if (v instanceof PyRange) {
    return v.step === 1 ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  }
  if (v instanceof PySlice) return `slice(${pyRepr(v.start)}, ${pyRepr(v.stop)}, ${pyRepr(v.step)})`;
  if (v instanceof PyIterator) return '<iterador>';
  if (v instanceof FunctionObject) return `<función ${v.name}>`;
  if (v instanceof BuiltinFunction) return `<función integrada ${v.name}>`;
  if (v instanceof BoundMethod) return `<método ${v.name} de ${typeName(v.self)}>`;
  if (v instanceof EnumValue) return v.repr;
  if (v instanceof EnumNamespace) return v.name;
  if (v instanceof ModuleObject) return `<módulo ${v.name}>`;
  return `<dron ${v.droneId}>`;
}

// ------------------------------------------------------------------ hash e igualdad

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function objectId(o: object): number {
  let id = objectIds.get(o);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(o, id);
  }
  return id;
}

/** Clave canónica para diccionarios y conjuntos. Cada forma se autodelimita para evitar colisiones. */
export function hashKey(v: RuntimeValue): string {
  if (v === null) return 'N';
  if (typeof v === 'boolean') return v ? 'n1' : 'n0';
  if (typeof v === 'number') return 'n' + (Object.is(v, -0) ? 0 : v);
  if (typeof v === 'string') return 's' + JSON.stringify(v);
  if (v instanceof PyTuple) return 't[' + v.items.map(hashKey).join(',') + ']';
  if (v instanceof EnumValue) return 'e' + JSON.stringify(v.enumName + '.' + v.name);
  if (v instanceof DroneHandleObject) return 'd' + v.droneId;
  if (Array.isArray(v) || v instanceof PyDict || v instanceof PySet) {
    throw new PyError('TypeError', `tipo no hashable: '${typeName(v)}'`);
  }
  return 'o' + objectId(v);
}

function seqEquals(a: readonly RuntimeValue[], b: readonly RuntimeValue[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!pyEquals(a[i], b[i])) return false;
  return true;
}

export function pyEquals(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a === b) return typeof a !== 'number' || !Number.isNaN(a);
  const na = toNumberOrNull(a);
  const nb = toNumberOrNull(b);
  if (na !== null || nb !== null) return na !== null && nb !== null && na === nb;
  if (a === null || b === null || typeof a === 'string' || typeof b === 'string') return false;
  if (Array.isArray(a)) return Array.isArray(b) && seqEquals(a, b);
  if (a instanceof PyTuple) return b instanceof PyTuple && seqEquals(a.items, b.items);
  if (a instanceof PyDict) {
    if (!(b instanceof PyDict) || a.size !== b.size) return false;
    for (const [h, entry] of a.map) {
      const other = b.map.get(h);
      if (!other || !pyEquals(entry[1], other[1])) return false;
    }
    return true;
  }
  if (a instanceof PySet) {
    if (!(b instanceof PySet) || a.size !== b.size) return false;
    for (const h of a.map.keys()) if (!b.map.has(h)) return false;
    return true;
  }
  if (a instanceof DroneHandleObject) return b instanceof DroneHandleObject && a.droneId === b.droneId;
  if (a instanceof PyRange && b instanceof PyRange) {
    const len = a.length;
    if (len !== b.length) return false;
    return len === 0 || (a.start === b.start && (len === 1 || a.step === b.step));
  }
  return false;
}

/** Identidad (`is`): los valores primitivos se comparan por valor, los objetos por referencia. */
export function pyIs(a: RuntimeValue, b: RuntimeValue): boolean {
  return a === b;
}

function compareValues(a: RuntimeValue, b: RuntimeValue, op: string): number {
  const na = toNumberOrNull(a);
  const nb = toNumberOrNull(b);
  if (na !== null && nb !== null) return na < nb ? -1 : na > nb ? 1 : na === nb ? 0 : NaN;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) return compareSeq(a, b, op);
  if (a instanceof PyTuple && b instanceof PyTuple) return compareSeq(a.items, b.items, op);
  throw new PyError('TypeError', `'${op}' no está soportado entre '${typeName(a)}' y '${typeName(b)}'`);
}

function compareSeq(a: readonly RuntimeValue[], b: readonly RuntimeValue[], op: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (!pyEquals(a[i], b[i])) return compareValues(a[i], b[i], op);
  }
  return a.length - b.length;
}

export function pyOrder(op: '<' | '<=' | '>' | '>=', a: RuntimeValue, b: RuntimeValue): boolean {
  const c = compareValues(a, b, op);
  switch (op) {
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
    case '>':
      return c > 0;
    default:
      return c >= 0;
  }
}

// ------------------------------------------------------------------ aritmética

function numericOp(op: BinOpKind, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) throw new PyError('ZeroDivisionError', 'división entre cero');
      return a / b;
    case '//':
      if (b === 0) throw new PyError('ZeroDivisionError', 'división entera entre cero');
      return Math.floor(a / b);
    case '%': {
      if (b === 0) throw new PyError('ZeroDivisionError', 'módulo entre cero');
      const r = a % b;
      return r !== 0 && r < 0 !== b < 0 ? r + b : r;
    }
    case '**': {
      if (a === 0 && b < 0) throw new PyError('ZeroDivisionError', '0 no puede elevarse a una potencia negativa');
      const r = a ** b;
      if (Number.isNaN(r) && !Number.isNaN(a) && !Number.isNaN(b)) {
        throw new PyError('ValueError', 'el resultado sería un número complejo (no soportado)');
      }
      return r;
    }
  }
}

function repeatCount(v: RuntimeValue): number | null {
  const n = toNumberOrNull(v);
  if (n === null) return null;
  if (!Number.isInteger(n)) {
    throw new PyError('TypeError', `no se puede multiplicar una secuencia por un valor de tipo '${typeName(v)}'`);
  }
  return Math.max(0, n);
}

function checkSize(size: number): void {
  if (size > MAX_COLLECTION_SIZE) {
    throw new PyError('ValueError', `el resultado es demasiado grande (más de ${MAX_COLLECTION_SIZE} elementos)`);
  }
}

function repeatSeq(seq: RuntimeValue, count: number): RuntimeValue | null {
  if (typeof seq === 'string') {
    checkSize(seq.length * count);
    return seq.repeat(count);
  }
  if (Array.isArray(seq) || seq instanceof PyTuple) {
    const items = Array.isArray(seq) ? seq : seq.items;
    checkSize(items.length * count);
    const out: RuntimeValue[] = [];
    for (let i = 0; i < count; i++) out.push(...items);
    return Array.isArray(seq) ? out : new PyTuple(out);
  }
  return null;
}

export function binaryOp(op: BinOpKind, a: RuntimeValue, b: RuntimeValue, inplace = false): RuntimeValue {
  const na = toNumberOrNull(a);
  const nb = toNumberOrNull(b);
  if (na !== null && nb !== null) return numericOp(op, na, nb);
  if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (Array.isArray(a)) {
      if (Array.isArray(b)) {
        if (inplace) {
          a.push(...b);
          return a;
        }
        return [...a, ...b];
      }
      if (inplace && b !== null && typeof b !== 'number' && typeof b !== 'boolean') {
        a.push(...iterateAll(b));
        return a;
      }
    }
    if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
  } else if (op === '-') {
    if (a instanceof PySet && b instanceof PySet) {
      const out = new PySet();
      for (const [h, v] of a.map) if (!b.map.has(h)) out.map.set(h, v);
      return out;
    }
  } else if (op === '*') {
    const countB = repeatCount(b);
    if (countB !== null) {
      const r = repeatSeq(a, countB);
      if (r !== null) return r;
    }
    const countA = repeatCount(a);
    if (countA !== null) {
      const r = repeatSeq(b, countA);
      if (r !== null) return r;
    }
  } else if (op === '%' && typeof a === 'string') {
    throw new PyError('TypeError', "el formato de cadenas con '%' no está soportado; usa str() y +");
  }
  throw new PyError('TypeError', `operación '${op}' no soportada entre '${typeName(a)}' y '${typeName(b)}'`);
}

export function unaryOp(op: 'neg' | 'pos' | 'not', v: RuntimeValue): RuntimeValue {
  if (op === 'not') return !isTruthy(v);
  const n = toNumberOrNull(v);
  if (n === null) {
    throw new PyError('TypeError', `operando no válido para el '${op === 'neg' ? '-' : '+'}' unario: '${typeName(v)}'`);
  }
  return op === 'neg' ? -n : n;
}

export function pyContains(container: RuntimeValue, item: RuntimeValue): boolean {
  if (typeof container === 'string') {
    if (typeof item !== 'string') {
      throw new PyError('TypeError', `'in <str>' requiere una cadena a la izquierda, no '${typeName(item)}'`);
    }
    return container.includes(item);
  }
  if (Array.isArray(container)) return container.some((x) => pyEquals(x, item));
  if (container instanceof PyTuple) return container.items.some((x) => pyEquals(x, item));
  if (container instanceof PyDict || container instanceof PySet) return container.has(item);
  if (container instanceof PyRange) return container.contains(item);
  throw new PyError('TypeError', `el argumento de tipo '${typeName(container)}' no es iterable`);
}

// ------------------------------------------------------------------ índices y slices

export function toIndex(v: RuntimeValue): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  throw new PyError('TypeError', `los índices deben ser enteros, no '${typeName(v)}'`);
}

export function toInteger(v: RuntimeValue, what: string): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  throw new PyError('TypeError', `${what} debe ser un entero, no '${typeName(v)}'`);
}

function sliceBounds(len: number, slice: PySlice): { start: number; stop: number; step: number } {
  const step = slice.step === null ? 1 : toIndex(slice.step);
  if (step === 0) throw new PyError('ValueError', 'el paso de un slice no puede ser cero');
  const clamp = (raw: RuntimeValue, fallback: number): number => {
    if (raw === null) return fallback;
    let i = toIndex(raw);
    if (i < 0) {
      i += len;
      if (i < 0) i = step < 0 ? -1 : 0;
    } else if (i >= len) {
      i = step < 0 ? len - 1 : len;
    }
    return i;
  };
  const start = clamp(slice.start, step > 0 ? 0 : len - 1);
  const stop = clamp(slice.stop, step > 0 ? len : -1);
  return { start, stop, step };
}

function sliceIndices(len: number, slice: PySlice): number[] {
  const { start, stop, step } = sliceBounds(len, slice);
  const out: number[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(i);
  return out;
}

function sequenceItems(obj: RuntimeValue): readonly RuntimeValue[] | string | null {
  if (Array.isArray(obj)) return obj;
  if (obj instanceof PyTuple) return obj.items;
  if (typeof obj === 'string') return obj;
  return null;
}

export function getItem(obj: RuntimeValue, index: RuntimeValue): RuntimeValue {
  const seq = sequenceItems(obj);
  if (seq !== null) {
    if (index instanceof PySlice) {
      const idx = sliceIndices(seq.length, index);
      if (typeof seq === 'string') return idx.map((i) => seq[i]).join('');
      const items = idx.map((i) => seq[i]);
      return Array.isArray(obj) ? items : new PyTuple(items);
    }
    let i = toIndex(index);
    if (i < 0) i += seq.length;
    if (i < 0 || i >= seq.length) {
      const kind = Array.isArray(obj) ? 'de lista' : obj instanceof PyTuple ? 'de tupla' : 'de cadena';
      throw new PyError('IndexError', `índice ${kind} fuera de rango`);
    }
    return seq[i];
  }
  if (obj instanceof PyDict) {
    const value = obj.get(index);
    if (value === undefined) throw new PyError('KeyError', pyRepr(index));
    return value;
  }
  if (obj instanceof PyRange) {
    if (index instanceof PySlice) return sliceIndices(obj.length, index).map((i) => obj.at(i));
    let i = toIndex(index);
    if (i < 0) i += obj.length;
    if (i < 0 || i >= obj.length) throw new PyError('IndexError', 'índice de range fuera de rango');
    return obj.at(i);
  }
  throw new PyError('TypeError', `el objeto de tipo '${typeName(obj)}' no es subscriptable`);
}

export function setItem(obj: RuntimeValue, index: RuntimeValue, value: RuntimeValue): void {
  if (Array.isArray(obj)) {
    if (index instanceof PySlice) throw new PyError('TypeError', 'la asignación a slices no está soportada');
    let i = toIndex(index);
    if (i < 0) i += obj.length;
    if (i < 0 || i >= obj.length) throw new PyError('IndexError', 'índice de asignación de lista fuera de rango');
    obj[i] = value;
    return;
  }
  if (obj instanceof PyDict) {
    obj.set(index, value);
    return;
  }
  if (obj instanceof PyTuple || typeof obj === 'string') {
    throw new PyError('TypeError', `el objeto '${typeName(obj)}' no admite asignación de elementos`);
  }
  throw new PyError('TypeError', `el objeto de tipo '${typeName(obj)}' no admite asignación de elementos`);
}

// ------------------------------------------------------------------ iteración

function arrayIterator(items: readonly RuntimeValue[]): PyIterator {
  let i = 0;
  return new PyIterator(() => (i < items.length ? items[i++] : ITER_DONE));
}

export function getIterator(v: RuntimeValue): PyIterator {
  if (v instanceof PyIterator) return v;
  if (Array.isArray(v)) {
    let i = 0;
    return new PyIterator(() => (i < v.length ? v[i++] : ITER_DONE));
  }
  if (v instanceof PyTuple) return arrayIterator(v.items);
  if (typeof v === 'string') return arrayIterator(v.split(''));
  if (v instanceof PyRange) {
    let i = 0;
    const len = v.length;
    return new PyIterator(() => (i < len ? v.at(i++) : ITER_DONE));
  }
  if (v instanceof PyDict) return arrayIterator(v.keys());
  if (v instanceof PySet) return arrayIterator(v.values());
  throw new PyError('TypeError', `el objeto de tipo '${typeName(v)}' no es iterable`);
}

/** Materializa un iterable completo en un arreglo nuevo. */
export function iterateAll(v: RuntimeValue): RuntimeValue[] {
  if (Array.isArray(v)) return v.slice();
  if (v instanceof PyTuple) return v.items.slice();
  if (v instanceof PyRange) {
    checkSize(v.length);
    const out: RuntimeValue[] = [];
    for (let i = 0; i < v.length; i++) out.push(v.at(i));
    return out;
  }
  const it = getIterator(v);
  const out: RuntimeValue[] = [];
  for (let x = it.next(); x !== ITER_DONE; x = it.next()) {
    out.push(x);
    if (out.length > MAX_COLLECTION_SIZE) checkSize(out.length);
  }
  return out;
}

export function pyLen(v: RuntimeValue): number {
  if (typeof v === 'string') return v.length;
  if (Array.isArray(v)) return v.length;
  if (v instanceof PyTuple) return v.items.length;
  if (v instanceof PyDict || v instanceof PySet) return v.size;
  if (v instanceof PyRange) return v.length;
  throw new PyError('TypeError', `el objeto de tipo '${typeName(v)}' no tiene len()`);
}

// ------------------------------------------------------------------ métodos

function expectArgs(name: string, args: RuntimeValue[], min: number, max: number): void {
  if (args.length < min || args.length > max) {
    const expected = min === max ? `${min}` : `entre ${min} y ${max}`;
    throw new PyError('TypeError', `${name}() espera ${expected} argumento(s), recibió ${args.length}`);
  }
}

const LIST_METHODS: Readonly<Record<string, MethodImpl>> = {
  append(self: RuntimeValue[], args) {
    expectArgs('append', args, 1, 1);
    self.push(args[0]);
    return null;
  },
  extend(self: RuntimeValue[], args) {
    expectArgs('extend', args, 1, 1);
    self.push(...iterateAll(args[0]));
    return null;
  },
  insert(self: RuntimeValue[], args) {
    expectArgs('insert', args, 2, 2);
    let i = toIndex(args[0]);
    if (i < 0) i = Math.max(0, i + self.length);
    self.splice(Math.min(i, self.length), 0, args[1]);
    return null;
  },
  pop(self: RuntimeValue[], args) {
    expectArgs('pop', args, 0, 1);
    if (self.length === 0) throw new PyError('IndexError', 'pop de una lista vacía');
    let i = args.length ? toIndex(args[0]) : self.length - 1;
    if (i < 0) i += self.length;
    if (i < 0 || i >= self.length) throw new PyError('IndexError', 'índice de pop fuera de rango');
    return self.splice(i, 1)[0];
  },
  remove(self: RuntimeValue[], args) {
    expectArgs('remove', args, 1, 1);
    const i = self.findIndex((x) => pyEquals(x, args[0]));
    if (i < 0) throw new PyError('ValueError', `list.remove(x): ${pyRepr(args[0])} no está en la lista`);
    self.splice(i, 1);
    return null;
  },
  index(self: RuntimeValue[], args) {
    expectArgs('index', args, 1, 1);
    const i = self.findIndex((x) => pyEquals(x, args[0]));
    if (i < 0) throw new PyError('ValueError', `${pyRepr(args[0])} no está en la lista`);
    return i;
  },
  count(self: RuntimeValue[], args) {
    expectArgs('count', args, 1, 1);
    return self.filter((x) => pyEquals(x, args[0])).length;
  },
  copy(self: RuntimeValue[], args) {
    expectArgs('copy', args, 0, 0);
    return self.slice();
  },
  reverse(self: RuntimeValue[], args) {
    expectArgs('reverse', args, 0, 0);
    self.reverse();
    return null;
  },
  clear(self: RuntimeValue[], args) {
    expectArgs('clear', args, 0, 0);
    self.length = 0;
    return null;
  },
};

const DICT_METHODS: Readonly<Record<string, MethodImpl>> = {
  get(self: PyDict, args) {
    expectArgs('get', args, 1, 2);
    const v = self.get(args[0]);
    return v === undefined ? (args.length > 1 ? args[1] : null) : v;
  },
  keys(self: PyDict, args) {
    expectArgs('keys', args, 0, 0);
    return self.keys();
  },
  values(self: PyDict, args) {
    expectArgs('values', args, 0, 0);
    return self.values();
  },
  items(self: PyDict, args) {
    expectArgs('items', args, 0, 0);
    return self.entries().map(([k, v]) => new PyTuple([k, v]));
  },
  pop(self: PyDict, args) {
    expectArgs('pop', args, 1, 2);
    const v = self.get(args[0]);
    if (v === undefined) {
      if (args.length > 1) return args[1];
      throw new PyError('KeyError', pyRepr(args[0]));
    }
    self.delete(args[0]);
    return v;
  },
  copy(self: PyDict, args) {
    expectArgs('copy', args, 0, 0);
    const out = new PyDict();
    for (const [k, v] of self.entries()) out.set(k, v);
    return out;
  },
  clear(self: PyDict, args) {
    expectArgs('clear', args, 0, 0);
    self.map.clear();
    return null;
  },
};

const SET_METHODS: Readonly<Record<string, MethodImpl>> = {
  add(self: PySet, args) {
    expectArgs('add', args, 1, 1);
    self.add(args[0]);
    return null;
  },
  remove(self: PySet, args) {
    expectArgs('remove', args, 1, 1);
    if (!self.delete(args[0])) throw new PyError('KeyError', pyRepr(args[0]));
    return null;
  },
  discard(self: PySet, args) {
    expectArgs('discard', args, 1, 1);
    self.delete(args[0]);
    return null;
  },
  pop(self: PySet, args) {
    expectArgs('pop', args, 0, 0);
    const first = self.map.entries().next();
    if (first.done) throw new PyError('KeyError', 'pop de un conjunto vacío');
    self.map.delete(first.value[0]);
    return first.value[1];
  },
  copy(self: PySet, args) {
    expectArgs('copy', args, 0, 0);
    const out = new PySet();
    for (const [h, v] of self.map) out.map.set(h, v);
    return out;
  },
  clear(self: PySet, args) {
    expectArgs('clear', args, 0, 0);
    self.map.clear();
    return null;
  },
};

export function getAttr(obj: RuntimeValue, name: string): RuntimeValue {
  if (obj instanceof ModuleObject) {
    const value = obj.globals.get(name);
    if (value === undefined) throw new PyError('AttributeError', `el módulo '${obj.name}' no tiene el atributo '${name}'`);
    return value;
  }
  if (obj instanceof EnumNamespace) {
    const member = obj.members.get(name);
    if (member === undefined) throw new PyError('AttributeError', `'${obj.name}' no tiene el miembro '${name}'`);
    return member;
  }
  let table: Readonly<Record<string, MethodImpl>> | null = null;
  if (Array.isArray(obj)) table = LIST_METHODS;
  else if (obj instanceof PyDict) table = DICT_METHODS;
  else if (obj instanceof PySet) table = SET_METHODS;
  if (table !== null && Object.prototype.hasOwnProperty.call(table, name)) {
    return new BoundMethod(obj, name, table[name]);
  }
  throw new PyError('AttributeError', `el objeto de tipo '${typeName(obj)}' no tiene el atributo '${name}'`);
}

/** Lista de métodos disponibles por tipo (para el autocompletado). */
export const METHOD_NAMES = {
  list: Object.keys(LIST_METHODS),
  dict: Object.keys(DICT_METHODS),
  set: Object.keys(SET_METHODS),
} as const;

/** Copia profunda de estructuras mutables (listas, tuplas, diccionarios y conjuntos). */
export function deepClone(v: RuntimeValue, memo: Map<object, RuntimeValue> = new Map()): RuntimeValue {
  return new Isolator(memo as Map<object, unknown>).clone(v);
}

/**
 * Aislamiento de memoria entre drones (doc 02 §3): copia profunda que también duplica funciones
 * (con su ámbito global y sus cierres), módulos importados y métodos ligados, conservando
 * identidades y ciclos. Los valores inmutables (números, cadenas, enums, builtins, rangos,
 * referencias a drones) se comparten.
 */
export class Isolator {
  private readonly memo: Map<object, unknown>;
  private readonly pending: [Map<string, RuntimeValue>, Map<string, RuntimeValue>][] = [];

  constructor(memo: Map<object, unknown> = new Map()) {
    this.memo = memo;
  }

  /** Copia un valor y todo lo que alcanza. */
  clone(v: RuntimeValue): RuntimeValue {
    const out = this.copy(v);
    this.flush();
    return out;
  }

  /** Copia un ámbito (Map de variables) con la misma memoria compartida. */
  cloneScope(scope: Map<string, RuntimeValue>): Map<string, RuntimeValue> {
    const out = this.scope(scope);
    this.flush();
    return out;
  }

  private flush(): void {
    // Los ámbitos se rellenan después de crear las funciones que los usan: así una función
    // recursiva (que aparece en su propio ámbito global) conserva su identidad en la copia.
    while (this.pending.length > 0) {
      const [src, dst] = this.pending.pop() as [Map<string, RuntimeValue>, Map<string, RuntimeValue>];
      for (const [k, val] of src) dst.set(k, this.copy(val));
    }
  }

  private scope(src: Map<string, RuntimeValue>): Map<string, RuntimeValue> {
    const cached = this.memo.get(src) as Map<string, RuntimeValue> | undefined;
    if (cached) return cached;
    const dst = new Map<string, RuntimeValue>();
    this.memo.set(src, dst);
    this.pending.push([src, dst]);
    return dst;
  }

  private copy(v: RuntimeValue): RuntimeValue {
    if (v === null || typeof v !== 'object') return v;
    const cached = this.memo.get(v);
    if (cached !== undefined) return cached as RuntimeValue;
    if (Array.isArray(v)) {
      const out: RuntimeValue[] = [];
      this.memo.set(v, out);
      for (const x of v) out.push(this.copy(x));
      return out;
    }
    if (v instanceof PyTuple) {
      const out = new PyTuple(v.items.map((x) => this.copy(x)));
      this.memo.set(v, out);
      return out;
    }
    if (v instanceof PyDict) {
      const out = new PyDict();
      this.memo.set(v, out);
      for (const [k, val] of v.entries()) out.set(this.copy(k), this.copy(val));
      return out;
    }
    if (v instanceof PySet) {
      const out = new PySet();
      this.memo.set(v, out);
      for (const x of v.values()) out.add(this.copy(x));
      return out;
    }
    if (v instanceof FunctionObject) {
      const out = new FunctionObject(
        v.code,
        v.defaults.map((d) => this.copy(d)),
        this.scope(v.globals),
        v.closure.map((c) => this.scope(c)),
      );
      this.memo.set(v, out);
      return out;
    }
    if (v instanceof ModuleObject) {
      const out = new ModuleObject(v.name, this.scope(v.globals));
      this.memo.set(v, out);
      return out;
    }
    if (v instanceof BoundMethod) {
      const out = new BoundMethod(this.copy(v.self), v.name, v.impl);
      this.memo.set(v, out);
      return out;
    }
    return v;
  }
}
