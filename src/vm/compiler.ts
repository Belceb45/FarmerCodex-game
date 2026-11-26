import type {
  AugAssignStmt,
  BoolOpExpr,
  CompareExpr,
  Expr,
  ForStmt,
  FunctionDefStmt,
  IfStmt,
  Module,
  Stmt,
  WhileStmt,
} from './ast';
import { PyError, syntaxError } from './errors';
import { parse } from './parser';

/**
 * Compilador AST -> bytecode de pila. Cada instrucción conserva su línea de origen
 * y `stmt = true` marca el inicio de una sentencia (para "Paso" y el resaltado de línea).
 */
export const Op = {
  NOP: 0,
  LOAD_CONST: 1,
  LOAD_GLOBAL: 2,
  LOAD_FAST: 3,
  LOAD_DEREF: 4,
  STORE_GLOBAL: 5,
  STORE_FAST: 6,
  POP_TOP: 7,
  DUP_TOP: 8,
  DUP_TOP_TWO: 9,
  ROT_TWO: 10,
  ROT_THREE: 11,
  BINARY_OP: 12,
  INPLACE_OP: 13,
  UNARY_OP: 14,
  COMPARE_OP: 15,
  JUMP: 16,
  JUMP_BACK: 17,
  POP_JUMP_IF_FALSE: 18,
  POP_JUMP_IF_TRUE: 19,
  JUMP_IF_FALSE_OR_POP: 20,
  JUMP_IF_TRUE_OR_POP: 21,
  GET_ITER: 22,
  FOR_ITER: 23,
  BUILD_LIST: 24,
  BUILD_TUPLE: 25,
  BUILD_SET: 26,
  BUILD_MAP: 27,
  BUILD_SLICE: 28,
  BINARY_SUBSCR: 29,
  STORE_SUBSCR: 30,
  LOAD_ATTR: 31,
  CALL: 32,
  RETURN_VALUE: 33,
  MAKE_FUNCTION: 34,
  UNPACK_SEQUENCE: 35,
  /** Importa (o toma de la caché) el módulo `arg` y lo deja en la pila. */
  IMPORT_NAME: 36,
  /** Con el módulo en la cima, apila su atributo `arg`. */
  IMPORT_FROM: 37,
  /** Saca el módulo y copia sus nombres públicos al ámbito global (`from m import *`). */
  IMPORT_STAR: 38,
} as const;

export type OpCode = (typeof Op)[keyof typeof Op];

export const OP_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(Op).map(([name, code]) => [code, name]),
);

export interface DerefArg {
  depth: number;
  name: string;
}

export interface CallArg {
  argc: number;
  kwnames: readonly string[] | null;
}

export type InstrArg = number | string | boolean | null | DerefArg | CallArg | CodeObject;

export interface Instruction {
  op: OpCode;
  arg: InstrArg;
  line: number;
  stmt: boolean;
}

export interface CodeObject {
  name: string;
  file: string;
  kind: 'module' | 'function';
  params: readonly string[];
  numDefaults: number;
  instructions: Instruction[];
  firstLine: number;
}

/** Características del lenguaje usadas por el script (base para el bloqueo progresivo por tecnologías). */
export type LanguageFeature =
  | 'while'
  | 'for'
  | 'def'
  | 'list'
  | 'tuple'
  | 'dict'
  | 'set'
  | 'subscript'
  | 'arithmetic'
  | 'comparison'
  | 'logic'
  | 'global'
  | 'import';

export interface CompileResult {
  code: CodeObject;
  features: Set<LanguageFeature>;
}

export function compileSource(source: string, file = 'main.py'): CompileResult {
  try {
    return compileModule(parse(source, file));
  } catch (err) {
    if (err instanceof PyError) err.file = file;
    throw err;
  }
}

export function compileModule(module: Module): CompileResult {
  const features = new Set<LanguageFeature>();
  const scope = new Scope('module', null);
  const compiler = new FunctionCompiler(scope, module.file, features);
  compiler.compileBody(module.body);
  const lastLine = compiler.lastLine(1);
  compiler.emit(Op.LOAD_CONST, null, lastLine);
  compiler.emit(Op.RETURN_VALUE, null, lastLine);
  return {
    code: {
      name: '<módulo>',
      file: module.file,
      kind: 'module',
      params: [],
      numDefaults: 0,
      instructions: compiler.code,
      firstLine: 1,
    },
    features,
  };
}

/** Los módulos son los archivos `.py` del jugador: nombres simples, sin paquetes. */
function moduleName(name: string, line: number, col: number): string {
  if (name.includes('.')) {
    throw new PyError('ImportError', `los archivos del jugador no forman paquetes: usa 'import ${name.split('.').pop() ?? name}'`, line, col);
  }
  return name;
}

// ------------------------------------------------------------------ análisis de ámbitos

class Scope {
  readonly kind: 'module' | 'function';
  readonly parent: Scope | null;
  readonly locals = new Set<string>();
  readonly globals = new Set<string>();

  constructor(kind: 'module' | 'function', parent: Scope | null) {
    this.kind = kind;
    this.parent = parent;
  }
}

function collectTargetNames(target: Expr, out: Set<string>): void {
  if (target.kind === 'Name') out.add(target.id);
  else if (target.kind === 'Tuple' || target.kind === 'List') {
    for (const elt of target.elts) collectTargetNames(elt, out);
  }
}

/** Nombres asignados en un cuerpo de función (sin entrar en funciones anidadas). */
function collectAssigned(body: Stmt[], out: Set<string>): void {
  for (const s of body) {
    switch (s.kind) {
      case 'Assign':
        for (const t of s.targets) collectTargetNames(t, out);
        break;
      case 'AugAssign':
      case 'AnnAssign':
        collectTargetNames(s.target, out);
        break;
      case 'For':
        collectTargetNames(s.target, out);
        collectAssigned(s.body, out);
        break;
      case 'While':
        collectAssigned(s.body, out);
        break;
      case 'If':
        collectAssigned(s.body, out);
        collectAssigned(s.orelse, out);
        break;
      case 'FunctionDef':
        out.add(s.name);
        break;
      case 'Import':
        for (const a of s.names) out.add(a.asname ?? a.name);
        break;
      case 'ImportFrom':
        if (s.names) for (const a of s.names) out.add(a.asname ?? a.name);
        break;
      default:
        break;
    }
  }
}

function collectGlobals(body: Stmt[], out: Set<string>): void {
  for (const s of body) {
    if (s.kind === 'Global') for (const n of s.names) out.add(n);
    else if (s.kind === 'If') {
      collectGlobals(s.body, out);
      collectGlobals(s.orelse, out);
    } else if (s.kind === 'While' || s.kind === 'For') collectGlobals(s.body, out);
  }
}

function analyzeFunction(def: FunctionDefStmt, parent: Scope): Scope {
  const scope = new Scope('function', parent);
  collectGlobals(def.body, scope.globals);
  for (const p of def.params) {
    if (scope.globals.has(p.name)) {
      throw syntaxError(`el nombre '${p.name}' es un parámetro y también se declara global`, def.line, def.col);
    }
    scope.locals.add(p.name);
  }
  collectAssigned(def.body, scope.locals);
  for (const g of scope.globals) scope.locals.delete(g);
  return scope;
}

/** Profundidad del ámbito de función contenedor donde `name` es local (0 = no está en ninguno). */
function enclosingDepth(scope: Scope, name: string): number {
  let depth = 1;
  let s = scope.parent;
  while (s !== null && s.kind === 'function') {
    if (s.globals.has(name)) return 0;
    if (s.locals.has(name)) return depth;
    s = s.parent;
    depth++;
  }
  return 0;
}

// ------------------------------------------------------------------ generación de código

interface LoopContext {
  isFor: boolean;
  continueTarget: number;
  breakJumps: number[];
}

class FunctionCompiler {
  readonly code: Instruction[] = [];
  private readonly loops: LoopContext[] = [];
  private markStmt = false;
  private readonly scope: Scope;
  private readonly file: string;
  private readonly features: Set<LanguageFeature>;

  constructor(scope: Scope, file: string, features: Set<LanguageFeature>) {
    this.scope = scope;
    this.file = file;
    this.features = features;
  }

  emit(op: OpCode, arg: InstrArg, line: number): number {
    const stmt = this.markStmt;
    this.markStmt = false;
    this.code.push({ op, arg, line, stmt });
    return this.code.length - 1;
  }

  lastLine(fallback: number): number {
    const last = this.code[this.code.length - 1];
    return last ? last.line : fallback;
  }

  private here(): number {
    return this.code.length;
  }

  private patch(index: number, target: number): void {
    this.code[index].arg = target;
  }

  private beginStatement(): void {
    this.markStmt = true;
  }

  compileBody(body: Stmt[]): void {
    for (const s of body) this.compileStmt(s);
  }

  private compileStmt(s: Stmt): void {
    switch (s.kind) {
      case 'Expr':
        this.beginStatement();
        this.compileExpr(s.value);
        this.emit(Op.POP_TOP, null, s.line);
        return;
      case 'Assign':
        this.beginStatement();
        this.compileExpr(s.value);
        s.targets.forEach((target, i) => {
          if (i < s.targets.length - 1) this.emit(Op.DUP_TOP, null, s.line);
          this.compileStore(target);
        });
        return;
      case 'AugAssign':
        this.beginStatement();
        this.compileAugAssign(s);
        return;
      case 'AnnAssign':
        this.beginStatement();
        if (s.value) {
          this.compileExpr(s.value);
          this.compileStore(s.target);
        } else {
          this.emit(Op.NOP, null, s.line);
        }
        return;
      case 'If':
        this.compileIf(s);
        return;
      case 'While':
        this.compileWhile(s);
        return;
      case 'For':
        this.compileFor(s);
        return;
      case 'FunctionDef':
        this.compileFunctionDef(s);
        return;
      case 'Return':
        if (this.scope.kind !== 'function') throw syntaxError("'return' fuera de una función", s.line, s.col);
        this.beginStatement();
        if (s.value) this.compileExpr(s.value);
        else this.emit(Op.LOAD_CONST, null, s.line);
        this.emit(Op.RETURN_VALUE, null, s.line);
        return;
      case 'Break': {
        const loop = this.loops[this.loops.length - 1];
        if (!loop) throw syntaxError("'break' fuera de un bucle", s.line, s.col);
        this.beginStatement();
        // En un for, el iterador ocupa la cima de la pila: hay que retirarlo al salir.
        this.emit(loop.isFor ? Op.POP_TOP : Op.NOP, null, s.line);
        loop.breakJumps.push(this.emit(Op.JUMP, -1, s.line));
        return;
      }
      case 'Continue': {
        const loop = this.loops[this.loops.length - 1];
        if (!loop) throw syntaxError("'continue' fuera de un bucle", s.line, s.col);
        this.beginStatement();
        this.emit(Op.JUMP_BACK, loop.continueTarget, s.line);
        return;
      }
      case 'Pass':
        this.beginStatement();
        this.emit(Op.NOP, null, s.line);
        return;
      case 'Global':
        this.features.add('global');
        return;
      case 'Import':
        this.features.add('import');
        this.beginStatement();
        for (const alias of s.names) {
          this.emit(Op.IMPORT_NAME, moduleName(alias.name, s.line, s.col), s.line);
          this.compileStoreName(alias.asname ?? alias.name, s.line);
        }
        return;
      case 'ImportFrom':
        this.features.add('import');
        this.beginStatement();
        this.emit(Op.IMPORT_NAME, moduleName(s.module, s.line, s.col), s.line);
        if (s.names === null) {
          if (this.scope.kind !== 'module') {
            throw syntaxError("'from ... import *' solo se permite fuera de las funciones", s.line, s.col);
          }
          this.emit(Op.IMPORT_STAR, null, s.line);
          return;
        }
        for (const alias of s.names) {
          this.emit(Op.IMPORT_FROM, alias.name, s.line);
          this.compileStoreName(alias.asname ?? alias.name, s.line);
        }
        this.emit(Op.POP_TOP, null, s.line);
        return;
    }
  }

  private compileIf(s: IfStmt): void {
    this.beginStatement();
    this.compileExpr(s.test);
    const jumpFalse = this.emit(Op.POP_JUMP_IF_FALSE, -1, s.line);
    this.compileBody(s.body);
    if (s.orelse.length > 0) {
      const jumpEnd = this.emit(Op.JUMP, -1, this.lastLine(s.line));
      this.patch(jumpFalse, this.here());
      this.compileBody(s.orelse);
      this.patch(jumpEnd, this.here());
    } else {
      this.patch(jumpFalse, this.here());
    }
  }

  private compileWhile(s: WhileStmt): void {
    this.features.add('while');
    const start = this.here();
    this.beginStatement();
    this.compileExpr(s.test);
    const jumpFalse = this.emit(Op.POP_JUMP_IF_FALSE, -1, s.line);
    const loop: LoopContext = { isFor: false, continueTarget: start, breakJumps: [] };
    this.loops.push(loop);
    this.compileBody(s.body);
    this.loops.pop();
    this.emit(Op.JUMP_BACK, start, s.line);
    const end = this.here();
    this.patch(jumpFalse, end);
    for (const j of loop.breakJumps) this.patch(j, end);
  }

  private compileFor(s: ForStmt): void {
    this.features.add('for');
    // La evaluación del iterable no es una parada de "Paso": solo lo es la cabecera de cada iteración.
    this.compileExpr(s.iter);
    this.emit(Op.GET_ITER, null, s.line);
    const start = this.here();
    this.beginStatement();
    const forIter = this.emit(Op.FOR_ITER, -1, s.line);
    this.compileStore(s.target);
    const loop: LoopContext = { isFor: true, continueTarget: start, breakJumps: [] };
    this.loops.push(loop);
    this.compileBody(s.body);
    this.loops.pop();
    this.emit(Op.JUMP_BACK, start, s.line);
    const end = this.here();
    this.patch(forIter, end);
    for (const j of loop.breakJumps) this.patch(j, end);
  }

  private compileFunctionDef(s: FunctionDefStmt): void {
    this.features.add('def');
    const child = new FunctionCompiler(analyzeFunction(s, this.scope), this.file, this.features);
    child.compileBody(s.body);
    const endLine = child.lastLine(s.line);
    child.emit(Op.LOAD_CONST, null, endLine);
    child.emit(Op.RETURN_VALUE, null, endLine);
    const code: CodeObject = {
      name: s.name,
      file: this.file,
      kind: 'function',
      params: s.params.map((p) => p.name),
      numDefaults: s.params.filter((p) => p.default !== null).length,
      instructions: child.code,
      firstLine: s.line,
    };
    this.beginStatement();
    for (const p of s.params) if (p.default !== null) this.compileExpr(p.default);
    this.emit(Op.MAKE_FUNCTION, code, s.line);
    this.compileStoreName(s.name, s.line);
  }

  private compileAugAssign(s: AugAssignStmt): void {
    this.features.add('arithmetic');
    const target = s.target;
    if (target.kind === 'Name') {
      this.compileLoadName(target.id, target.line);
      this.compileExpr(s.value);
      this.emit(Op.INPLACE_OP, s.op, s.line);
      this.compileStoreName(target.id, target.line);
    } else if (target.kind === 'Subscript') {
      this.features.add('subscript');
      this.compileExpr(target.value);
      this.compileExpr(target.index);
      this.emit(Op.DUP_TOP_TWO, null, s.line);
      this.emit(Op.BINARY_SUBSCR, null, s.line);
      this.compileExpr(s.value);
      this.emit(Op.INPLACE_OP, s.op, s.line);
      this.emit(Op.ROT_THREE, null, s.line);
      this.emit(Op.STORE_SUBSCR, null, s.line);
    } else {
      throw syntaxError('no se puede asignar a un atributo', target.line, target.col);
    }
  }

  private compileStore(target: Expr): void {
    switch (target.kind) {
      case 'Name':
        this.compileStoreName(target.id, target.line);
        return;
      case 'Subscript':
        this.features.add('subscript');
        this.compileExpr(target.value);
        this.compileExpr(target.index);
        this.emit(Op.STORE_SUBSCR, null, target.line);
        return;
      case 'Tuple':
      case 'List':
        this.emit(Op.UNPACK_SEQUENCE, target.elts.length, target.line);
        for (const elt of target.elts) this.compileStore(elt);
        return;
      case 'Attribute':
        throw syntaxError('no se puede asignar a un atributo', target.line, target.col);
      default:
        throw syntaxError('no se puede asignar a esta expresión', target.line, target.col);
    }
  }

  private compileLoadName(name: string, line: number): void {
    const s = this.scope;
    if (s.kind === 'module' || s.globals.has(name)) {
      this.emit(Op.LOAD_GLOBAL, name, line);
    } else if (s.locals.has(name)) {
      this.emit(Op.LOAD_FAST, name, line);
    } else {
      const depth = enclosingDepth(s, name);
      if (depth > 0) this.emit(Op.LOAD_DEREF, { depth, name }, line);
      else this.emit(Op.LOAD_GLOBAL, name, line);
    }
  }

  private compileStoreName(name: string, line: number): void {
    const s = this.scope;
    if (s.kind === 'module' || s.globals.has(name)) this.emit(Op.STORE_GLOBAL, name, line);
    else this.emit(Op.STORE_FAST, name, line);
  }

  private compileExpr(e: Expr): void {
    switch (e.kind) {
      case 'Constant':
        this.emit(Op.LOAD_CONST, e.value, e.line);
        return;
      case 'Name':
        this.compileLoadName(e.id, e.line);
        return;
      case 'BinOp':
        this.features.add('arithmetic');
        this.compileExpr(e.left);
        this.compileExpr(e.right);
        this.emit(Op.BINARY_OP, e.op, e.line);
        return;
      case 'UnaryOp':
        // Los literales negativos (-1, -0.5) se pliegan: no cuestan ticks de aritmética.
        if (e.op !== 'not' && e.operand.kind === 'Constant' && typeof e.operand.value === 'number') {
          this.emit(Op.LOAD_CONST, e.op === 'neg' ? -e.operand.value : e.operand.value, e.line);
          return;
        }
        this.features.add(e.op === 'not' ? 'logic' : 'arithmetic');
        this.compileExpr(e.operand);
        this.emit(Op.UNARY_OP, e.op, e.line);
        return;
      case 'BoolOp':
        this.compileBoolOp(e);
        return;
      case 'Compare':
        this.compileCompare(e);
        return;
      case 'Call':
        this.compileExpr(e.func);
        for (const a of e.args) this.compileExpr(a);
        for (const k of e.keywords) this.compileExpr(k.value);
        this.emit(
          Op.CALL,
          { argc: e.args.length, kwnames: e.keywords.length > 0 ? e.keywords.map((k) => k.name) : null },
          e.line,
        );
        return;
      case 'Attribute':
        this.compileExpr(e.value);
        this.emit(Op.LOAD_ATTR, e.attr, e.line);
        return;
      case 'Subscript':
        this.features.add('subscript');
        this.compileExpr(e.value);
        this.compileExpr(e.index);
        this.emit(Op.BINARY_SUBSCR, null, e.line);
        return;
      case 'Slice':
        for (const part of [e.lower, e.upper, e.step]) {
          if (part) this.compileExpr(part);
          else this.emit(Op.LOAD_CONST, null, e.line);
        }
        this.emit(Op.BUILD_SLICE, null, e.line);
        return;
      case 'List':
        this.features.add('list');
        for (const elt of e.elts) this.compileExpr(elt);
        this.emit(Op.BUILD_LIST, e.elts.length, e.line);
        return;
      case 'Tuple':
        this.features.add('tuple');
        for (const elt of e.elts) this.compileExpr(elt);
        this.emit(Op.BUILD_TUPLE, e.elts.length, e.line);
        return;
      case 'Set':
        this.features.add('set');
        for (const elt of e.elts) this.compileExpr(elt);
        this.emit(Op.BUILD_SET, e.elts.length, e.line);
        return;
      case 'Dict':
        this.features.add('dict');
        for (let i = 0; i < e.keys.length; i++) {
          this.compileExpr(e.keys[i]);
          this.compileExpr(e.values[i]);
        }
        this.emit(Op.BUILD_MAP, e.keys.length, e.line);
        return;
      case 'IfExp': {
        this.features.add('logic');
        this.compileExpr(e.test);
        const jumpFalse = this.emit(Op.POP_JUMP_IF_FALSE, -1, e.line);
        this.compileExpr(e.body);
        const jumpEnd = this.emit(Op.JUMP, -1, e.line);
        this.patch(jumpFalse, this.here());
        this.compileExpr(e.orelse);
        this.patch(jumpEnd, this.here());
        return;
      }
    }
  }

  private compileBoolOp(e: BoolOpExpr): void {
    this.features.add('logic');
    const jumps: number[] = [];
    e.values.forEach((value, i) => {
      this.compileExpr(value);
      if (i < e.values.length - 1) {
        jumps.push(this.emit(e.op === 'and' ? Op.JUMP_IF_FALSE_OR_POP : Op.JUMP_IF_TRUE_OR_POP, -1, e.line));
      }
    });
    const end = this.here();
    for (const j of jumps) this.patch(j, end);
  }

  /** `a < b < c` se evalúa como `a < b and b < c` evaluando `b` una sola vez. */
  private compileCompare(e: CompareExpr): void {
    this.features.add('comparison');
    this.compileExpr(e.left);
    if (e.ops.length === 1) {
      this.compileExpr(e.comparators[0]);
      this.emit(Op.COMPARE_OP, e.ops[0], e.line);
      return;
    }
    const cleanupJumps: number[] = [];
    e.ops.forEach((op, i) => {
      this.compileExpr(e.comparators[i]);
      if (i < e.ops.length - 1) {
        this.emit(Op.DUP_TOP, null, e.line);
        this.emit(Op.ROT_THREE, null, e.line);
        this.emit(Op.COMPARE_OP, op, e.line);
        cleanupJumps.push(this.emit(Op.JUMP_IF_FALSE_OR_POP, -1, e.line));
      } else {
        this.emit(Op.COMPARE_OP, op, e.line);
      }
    });
    const jumpEnd = this.emit(Op.JUMP, -1, e.line);
    const cleanup = this.here();
    for (const j of cleanupJumps) this.patch(j, cleanup);
    this.emit(Op.ROT_TWO, null, e.line);
    this.emit(Op.POP_TOP, null, e.line);
    this.patch(jumpEnd, this.here());
  }
}

/** Listado legible del bytecode (depuración y pruebas). */
export function disassemble(code: CodeObject): string {
  return code.instructions
    .map((ins, i) => {
      const arg =
        ins.arg === null || ins.arg === undefined
          ? ''
          : typeof ins.arg === 'object'
            ? 'instructions' in ins.arg
              ? `<código ${ins.arg.name}>`
              : JSON.stringify(ins.arg)
            : JSON.stringify(ins.arg);
      return `${String(i).padStart(3)} ${ins.stmt ? '>' : ' '} L${ins.line} ${OP_NAMES[ins.op]} ${arg}`.trimEnd();
    })
    .join('\n');
}
