import { builtinCost, type BalanceConfig } from '../config/balance';
import type { BinOpKind, CmpOpKind, UnaryOpKind } from './ast';
import { PENDING, type BuiltinContext, type ExecEnv, type PendingAction } from './builtins';
import { Op, type CallArg, type CodeObject, type DerefArg, type Instruction } from './compiler';
import { PyError, type PyErrorType } from './errors';
import {
  binaryOp,
  BoundMethod,
  BuiltinFunction,
  FunctionObject,
  getAttr,
  Isolator,
  getItem,
  getIterator,
  isTruthy,
  ITER_DONE,
  iterateAll,
  ModuleObject,
  pyContains,
  PyDict,
  pyEquals,
  pyIs,
  PyIterator,
  pyOrder,
  PySet,
  PySlice,
  PyTuple,
  setItem,
  typeName,
  unaryOp,
  type RuntimeValue,
} from './values';

export type DroneStatus = 'RUNNING' | 'WAITING' | 'FINISHED' | 'ERROR';

export interface StackFrame {
  file: string;
  functionName: string;
  code: CodeObject;
  /** Instruction Pointer: índice de la próxima instrucción a ejecutar. */
  ip: number;
  /** `null` en el marco del módulo (usa el ámbito global). */
  localScope: Map<string, RuntimeValue> | null;
  globals: Map<string, RuntimeValue>;
  closure: Map<string, RuntimeValue>[];
  /** Pila de operandos del marco. */
  stack: RuntimeValue[];
  /** Si el marco ejecuta un módulo importado: el módulo que recibe el importador al terminar. */
  module?: ModuleObject;
}

/** Devuelve el código compilado del archivo `<nombre>.py`; lanza PyError si no existe o no compila. */
export type ModuleResolver = (name: string) => CodeObject;

export interface RuntimeErrorInfo {
  file: string;
  line: number;
  functionName: string;
  pyType: PyErrorType;
  message: string;
}

export interface RunResult {
  /** Ticks consumidos durante esta llamada. */
  spent: number;
  /** `true` si se detuvo al llegar al inicio de una sentencia (modo Paso). */
  stoppedAtStatement: boolean;
}

export interface DroneVMOptions {
  id: number;
  /** Código del módulo principal (se ignora si se da `entry`). */
  code?: CodeObject;
  /** Dron hijo (spawn_drone): empieza llamando a `fn(*args)` en lugar de ejecutar un módulo. */
  entry?: { fn: FunctionObject; args: RuntimeValue[] };
  /** Módulos ya importados que hereda (copiados) un dron hijo. */
  modules?: Map<string, ModuleObject>;
  builtins: ReadonlyMap<string, RuntimeValue>;
  balance: BalanceConfig;
  maxCallDepth?: number;
  /** Resuelve `import nombre` contra los archivos del jugador. */
  resolveModule?: ModuleResolver;
  /** Variables globales con las que arranca el módulo principal (sim_globals de simulate()). */
  initialGlobals?: ReadonlyMap<string, RuntimeValue>;
}

export const DEFAULT_MAX_CALL_DEPTH = 500;
/** Red de seguridad: instrucciones máximas por llamada a run() aunque no consuman ticks. */
const MAX_INSTRUCTIONS_PER_RUN = 100_000;

class Context implements BuiltinContext {
  readonly drone: DroneVM;
  env: ExecEnv;
  cost = 0;

  constructor(drone: DroneVM, env: ExecEnv) {
    this.drone = drone;
    this.env = env;
  }

  beginAction(action: PendingAction): typeof PENDING {
    this.drone.pendingAction = action;
    return PENDING;
  }
}

function compareOp(op: CmpOpKind, a: RuntimeValue, b: RuntimeValue): boolean {
  switch (op) {
    case '==':
      return pyEquals(a, b);
    case '!=':
      return !pyEquals(a, b);
    case '<':
    case '<=':
    case '>':
    case '>=':
      return pyOrder(op, a, b);
    case 'in':
      return pyContains(b, a);
    case 'not in':
      return !pyContains(b, a);
    case 'is':
      return pyIs(a, b);
    case 'is not':
      return !pyIs(a, b);
  }
}

function bindArguments(
  fn: FunctionObject,
  args: RuntimeValue[],
  kwnames: readonly string[] | null,
  kwvalues: RuntimeValue[] | null,
): Map<string, RuntimeValue> {
  const params = fn.code.params;
  if (args.length > params.length) {
    throw new PyError(
      'TypeError',
      `${fn.name}() acepta ${params.length} argumento(s) posicional(es) pero recibió ${args.length}`,
    );
  }
  const locals = new Map<string, RuntimeValue>();
  for (let i = 0; i < args.length; i++) locals.set(params[i], args[i]);
  if (kwnames && kwvalues) {
    kwnames.forEach((name, i) => {
      if (!params.includes(name)) throw new PyError('TypeError', `${fn.name}() recibió un argumento inesperado '${name}'`);
      if (locals.has(name)) throw new PyError('TypeError', `${fn.name}() recibió varios valores para '${name}'`);
      locals.set(name, kwvalues[i]);
    });
  }
  const firstDefault = params.length - fn.defaults.length;
  for (let i = 0; i < params.length; i++) {
    if (locals.has(params[i])) continue;
    if (i >= firstDefault) locals.set(params[i], fn.defaults[i - firstDefault]);
    else throw new PyError('TypeError', `${fn.name}() requiere el argumento '${params[i]}'`);
  }
  return locals;
}

function pop(stack: RuntimeValue[]): RuntimeValue {
  return stack.pop() as RuntimeValue;
}

/**
 * Máquina virtual iterativa de un dron: pila de marcos explícita, sin recursión de JavaScript
 * ni eval(). Se puede pausar en cualquier instrucción y reanudar en el siguiente tick.
 */
export class DroneVM {
  readonly id: number;
  status: DroneStatus = 'RUNNING';
  readonly callStack: StackFrame[] = [];
  /** Memoria global aislada de este dron. */
  readonly globalScope: Map<string, RuntimeValue>;
  /** Ticks restantes de la acción física en curso. */
  waitTicks = 0;
  /** Espera fija inmune a la velocidad y a Items.Power (do_a_flip): el planificador la descuenta una vez por tick. */
  fixedWaitMs = 0;
  /** Dron al que espera con wait_for(). */
  waitingForDroneId: number | null = null;
  returnValue: RuntimeValue = null;
  pendingAction: PendingAction | null = null;
  error: RuntimeErrorInfo | null = null;
  /** Ticks consumidos en total por el script de este dron. */
  ticksUsed = 0;

  private readonly builtins: ReadonlyMap<string, RuntimeValue>;
  private readonly balance: BalanceConfig;
  private readonly maxCallDepth: number;
  private readonly resolveModule: ModuleResolver | null;
  /** Módulos ya importados en esta ejecución (cada uno se ejecuta una sola vez). */
  private readonly modules = new Map<string, ModuleObject>();
  private ctx: Context | null = null;
  /** Modo Paso: ya se ejecutó al menos una instrucción desde beginStep() (persiste entre ticks). */
  private stepProgress = false;

  constructor(options: DroneVMOptions) {
    this.id = options.id;
    this.builtins = options.builtins;
    this.balance = options.balance;
    this.maxCallDepth = options.maxCallDepth ?? DEFAULT_MAX_CALL_DEPTH;
    this.resolveModule = options.resolveModule ?? null;
    if (options.modules) for (const [name, module] of options.modules) this.modules.set(name, module);
    if (options.entry) {
      const { fn, args } = options.entry;
      this.globalScope = fn.globals;
      this.callStack.push({
        file: fn.code.file,
        functionName: fn.name,
        code: fn.code,
        ip: 0,
        localScope: bindArguments(fn, args, null, null),
        globals: fn.globals,
        closure: fn.closure,
        stack: [],
      });
      return;
    }
    if (!options.code) throw new Error('DroneVM necesita código o una función de entrada');
    this.globalScope = new Map(options.initialGlobals ?? []);
    this.callStack.push({
      file: options.code.file,
      functionName: options.code.name,
      code: options.code,
      ip: 0,
      localScope: null,
      globals: this.globalScope,
      closure: [],
      stack: [],
    });
  }

  /**
   * Crea un dron hijo que ejecutará `fn(*args)` con memoria propia (doc 02 §3): la función, su
   * ámbito global, sus cierres, los módulos importados y los argumentos se copian en profundidad,
   * así ningún dron puede leer ni modificar las variables o listas de otro.
   */
  spawnChild(id: number, fn: FunctionObject, args: RuntimeValue[]): DroneVM {
    const iso = new Isolator();
    const entryFn = iso.clone(fn) as FunctionObject;
    const entryArgs = args.map((a) => iso.clone(a));
    const modules = new Map<string, ModuleObject>();
    for (const [name, module] of this.modules) modules.set(name, iso.clone(module) as ModuleObject);
    return new DroneVM({
      id,
      entry: { fn: entryFn, args: entryArgs },
      modules,
      builtins: this.builtins,
      balance: this.balance,
      maxCallDepth: this.maxCallDepth,
      resolveModule: this.resolveModule ?? undefined,
    });
  }

  /** Comprueba los argumentos de spawn_drone() antes de crear el dron (el error es del padre). */
  static checkEntryArgs(fn: FunctionObject, args: RuntimeValue[]): void {
    bindArguments(fn, args, null, null);
  }

  get isActive(): boolean {
    return this.status === 'RUNNING' || this.status === 'WAITING';
  }

  /** Línea que se está ejecutando (o la próxima, si está detenido en una frontera de sentencia). */
  get currentLine(): number | null {
    if (this.status === 'ERROR') return this.error?.line ?? null;
    if (this.status === 'FINISHED') return null;
    const frame = this.callStack[this.callStack.length - 1];
    if (!frame) return null;
    const index = this.pendingAction ? frame.ip - 1 : frame.ip;
    const instr = frame.code.instructions[Math.max(0, Math.min(index, frame.code.instructions.length - 1))];
    return instr ? instr.line : null;
  }

  get currentFile(): string | null {
    const frame = this.callStack[this.callStack.length - 1];
    return frame ? frame.file : (this.error?.file ?? null);
  }

  /**
   * Ejecuta instrucciones hasta gastar `budget` ticks, iniciar una acción física o terminar.
   * El exceso de costo se acumula en `waitTicks` y se descuenta en los ticks siguientes.
   */
  run(budget: number, env: ExecEnv, stopAtStatement = false): RunResult {
    if (this.status !== 'RUNNING' || this.pendingAction !== null || this.waitTicks > 0) {
      return { spent: 0, stoppedAtStatement: false };
    }
    if (this.ctx === null) this.ctx = new Context(this, env);
    else this.ctx.env = env;

    let spent = 0;
    let executed = 0;
    let stopped = false;
    try {
      while (spent < budget) {
        const frame = this.callStack[this.callStack.length - 1];
        const instr = frame.code.instructions[frame.ip];
        if (stopAtStatement && instr.stmt && this.stepProgress) {
          stopped = true;
          break;
        }
        frame.ip++;
        executed++;
        this.stepProgress = true;
        spent += this.execute(frame, instr);
        if (this.status !== 'RUNNING' || this.pendingAction !== null) break;
        if (executed >= MAX_INSTRUCTIONS_PER_RUN) {
          spent = Math.max(spent, budget);
          break;
        }
      }
    } catch (err) {
      this.fail(err);
    }
    this.ticksUsed += spent;
    if (spent > budget) this.waitTicks += spent - budget;
    if (this.pendingAction !== null && this.waitTicks === 0) this.finishOrBlock();
    return { spent, stoppedAtStatement: stopped };
  }

  /** Al agotarse la espera en ticks: termina la acción o, si es bloqueante y no está lista, pasa a WAITING. */
  private finishOrBlock(): void {
    const action = this.pendingAction;
    if (action?.ready && !action.ready()) {
      this.status = 'WAITING';
      return;
    }
    this.completePendingAction();
  }

  /**
   * Un tick de un dron bloqueado (WAITING): descuenta la espera fija y, si la acción ya está lista,
   * la completa y el dron vuelve a RUNNING. Devuelve true si se desbloqueó.
   */
  tickBlocked(fixedMsPerTick: number): boolean {
    if (this.status !== 'WAITING') return false;
    if (this.fixedWaitMs > 0) this.fixedWaitMs = Math.max(0, this.fixedWaitMs - fixedMsPerTick);
    const action = this.pendingAction;
    if (action?.ready && !action.ready()) return false;
    this.status = 'RUNNING';
    this.waitingForDroneId = null;
    this.completePendingAction();
    return true;
  }

  /** Inicia un "Paso": run(..., stopAtStatement) se detendrá en la próxima frontera de sentencia. */
  beginStep(): void {
    this.stepProgress = false;
  }

  /** Avanza un tick de la acción física en curso; al llegar a 0 aplica su efecto. */
  tickWait(amount = 1): void {
    if (this.waitTicks <= 0) return;
    this.waitTicks -= amount;
    if (this.waitTicks <= 0) {
      this.waitTicks = 0;
      this.finishOrBlock();
    }
  }

  completePendingAction(): void {
    const action = this.pendingAction;
    if (action === null) return;
    this.pendingAction = null;
    try {
      const value = action.complete();
      const frame = this.callStack[this.callStack.length - 1];
      if (frame) frame.stack.push(value);
    } catch (err) {
      this.fail(err);
    }
  }

  /** Detiene el dron descartando la acción pendiente (su efecto no se aplica). */
  cancel(): void {
    if (this.pendingAction !== null) {
      this.pendingAction.cancel?.();
      this.pendingAction = null;
    }
    this.waitTicks = 0;
    this.fixedWaitMs = 0;
    this.waitingForDroneId = null;
    if (this.isActive) this.status = 'FINISHED';
  }

  private fail(err: unknown): void {
    const frame = this.callStack[this.callStack.length - 1];
    const instr = frame ? frame.code.instructions[Math.max(0, frame.ip - 1)] : undefined;
    let pyType: PyErrorType = 'InternalError';
    let message = String(err);
    let line = instr?.line ?? 0;
    if (err instanceof PyError) {
      pyType = err.pyType;
      message = err.message;
      if (err.line !== null) line = err.line;
    } else if (err instanceof RangeError) {
      pyType = 'RecursionError';
      message = 'estructura demasiado profunda o recursiva para procesarla';
    }
    this.error = {
      file: err instanceof PyError && err.file ? err.file : (frame?.file ?? ''),
      line,
      functionName: frame?.functionName ?? '',
      pyType,
      message,
    };
    this.status = 'ERROR';
    if (this.pendingAction !== null) {
      this.pendingAction.cancel?.();
      this.pendingAction = null;
    }
    this.waitTicks = 0;
    this.fixedWaitMs = 0;
    this.waitingForDroneId = null;
  }

  private execute(frame: StackFrame, instr: Instruction): number {
    const stack = frame.stack;
    const ops = this.balance.operations;
    switch (instr.op) {
      case Op.NOP:
        return 0;
      case Op.LOAD_CONST:
        stack.push(instr.arg as RuntimeValue);
        return 0;
      case Op.LOAD_GLOBAL: {
        const name = instr.arg as string;
        let value = frame.globals.get(name);
        if (value === undefined) value = this.builtins.get(name);
        if (value === undefined) throw new PyError('NameError', `el nombre '${name}' no está definido`);
        stack.push(value);
        return 0;
      }
      case Op.LOAD_FAST: {
        const name = instr.arg as string;
        const value = frame.localScope?.get(name);
        if (value === undefined) {
          const hint = frame.globals.has(name)
            ? ` (para modificar la variable global escribe 'global ${name}' al inicio de la función)`
            : '';
          throw new PyError('UnboundLocalError', `la variable local '${name}' se usó antes de asignarle un valor${hint}`);
        }
        stack.push(value);
        return 0;
      }
      case Op.LOAD_DEREF: {
        const { depth, name } = instr.arg as DerefArg;
        const value = frame.closure[depth - 1]?.get(name);
        if (value === undefined) {
          throw new PyError('NameError', `la variable '${name}' de la función contenedora aún no tiene valor`);
        }
        stack.push(value);
        return 0;
      }
      case Op.STORE_GLOBAL:
        frame.globals.set(instr.arg as string, pop(stack));
        return 0;
      case Op.STORE_FAST:
        frame.localScope?.set(instr.arg as string, pop(stack));
        return 0;
      case Op.POP_TOP:
        stack.pop();
        return 0;
      case Op.DUP_TOP:
        stack.push(stack[stack.length - 1]);
        return 0;
      case Op.DUP_TOP_TWO: {
        const n = stack.length;
        stack.push(stack[n - 2], stack[n - 1]);
        return 0;
      }
      case Op.ROT_TWO: {
        const n = stack.length;
        const top = stack[n - 1];
        stack[n - 1] = stack[n - 2];
        stack[n - 2] = top;
        return 0;
      }
      case Op.ROT_THREE: {
        const n = stack.length;
        const top = stack[n - 1];
        stack[n - 1] = stack[n - 2];
        stack[n - 2] = stack[n - 3];
        stack[n - 3] = top;
        return 0;
      }
      case Op.BINARY_OP:
      case Op.INPLACE_OP: {
        const b = pop(stack);
        const a = pop(stack);
        stack.push(binaryOp(instr.arg as BinOpKind, a, b, instr.op === Op.INPLACE_OP));
        return ops.arithmetic;
      }
      case Op.UNARY_OP: {
        const op = instr.arg as UnaryOpKind;
        stack.push(unaryOp(op, pop(stack)));
        return op === 'not' ? ops.logic : ops.arithmetic;
      }
      case Op.COMPARE_OP: {
        const b = pop(stack);
        const a = pop(stack);
        stack.push(compareOp(instr.arg as CmpOpKind, a, b));
        return ops.comparison;
      }
      case Op.JUMP:
        frame.ip = instr.arg as number;
        return 0;
      case Op.JUMP_BACK:
        frame.ip = instr.arg as number;
        return ops.loopIteration;
      case Op.POP_JUMP_IF_FALSE:
        if (!isTruthy(pop(stack))) frame.ip = instr.arg as number;
        return 0;
      case Op.POP_JUMP_IF_TRUE:
        if (isTruthy(pop(stack))) frame.ip = instr.arg as number;
        return 0;
      case Op.JUMP_IF_FALSE_OR_POP:
        if (!isTruthy(stack[stack.length - 1])) frame.ip = instr.arg as number;
        else stack.pop();
        return ops.logic;
      case Op.JUMP_IF_TRUE_OR_POP:
        if (isTruthy(stack[stack.length - 1])) frame.ip = instr.arg as number;
        else stack.pop();
        return ops.logic;
      case Op.GET_ITER:
        stack.push(getIterator(pop(stack)));
        return 0;
      case Op.FOR_ITER: {
        const it = stack[stack.length - 1] as PyIterator;
        const value = it.next();
        if (value === ITER_DONE) {
          stack.pop();
          frame.ip = instr.arg as number;
        } else {
          stack.push(value);
        }
        return 0;
      }
      case Op.BUILD_LIST: {
        const n = instr.arg as number;
        stack.push(stack.splice(stack.length - n, n));
        return 0;
      }
      case Op.BUILD_TUPLE: {
        const n = instr.arg as number;
        stack.push(new PyTuple(stack.splice(stack.length - n, n)));
        return 0;
      }
      case Op.BUILD_SET: {
        const n = instr.arg as number;
        const set = new PySet();
        for (const item of stack.splice(stack.length - n, n)) set.add(item);
        stack.push(set);
        return 0;
      }
      case Op.BUILD_MAP: {
        const n = instr.arg as number;
        const flat = stack.splice(stack.length - 2 * n, 2 * n);
        const dict = new PyDict();
        for (let i = 0; i < n; i++) dict.set(flat[2 * i], flat[2 * i + 1]);
        stack.push(dict);
        return 0;
      }
      case Op.BUILD_SLICE: {
        const step = pop(stack);
        const stop = pop(stack);
        const start = pop(stack);
        stack.push(new PySlice(start, stop, step));
        return 0;
      }
      case Op.BINARY_SUBSCR: {
        const index = pop(stack);
        const obj = pop(stack);
        stack.push(getItem(obj, index));
        return ops.subscript;
      }
      case Op.STORE_SUBSCR: {
        const index = pop(stack);
        const obj = pop(stack);
        const value = pop(stack);
        setItem(obj, index, value);
        return ops.subscript;
      }
      case Op.LOAD_ATTR:
        stack.push(getAttr(pop(stack), instr.arg as string));
        return 0;
      case Op.CALL:
        return this.call(frame, instr.arg as CallArg);
      case Op.RETURN_VALUE: {
        const value = stack.length > 0 ? pop(stack) : null;
        this.callStack.pop();
        const caller = this.callStack[this.callStack.length - 1];
        if (caller) {
          caller.stack.push(frame.module ?? value);
        } else {
          this.returnValue = value;
          this.status = 'FINISHED';
        }
        return 0;
      }
      case Op.MAKE_FUNCTION: {
        const code = instr.arg as CodeObject;
        const defaults = code.numDefaults > 0 ? stack.splice(stack.length - code.numDefaults, code.numDefaults) : [];
        const closure = frame.localScope ? [frame.localScope, ...frame.closure] : [];
        stack.push(new FunctionObject(code, defaults, frame.globals, closure));
        return 0;
      }
      case Op.IMPORT_NAME:
        return this.importModule(instr.arg as string, stack);
      case Op.IMPORT_FROM: {
        const module = stack[stack.length - 1] as ModuleObject;
        const name = instr.arg as string;
        const value = module.globals.get(name);
        if (value === undefined) throw new PyError('ImportError', `no se puede importar '${name}' desde '${module.name}'`);
        stack.push(value);
        return 0;
      }
      case Op.IMPORT_STAR: {
        const module = pop(stack) as ModuleObject;
        for (const [name, value] of module.globals) if (!name.startsWith('_')) frame.globals.set(name, value);
        return 0;
      }
      case Op.UNPACK_SEQUENCE: {
        const n = instr.arg as number;
        const value = pop(stack);
        const items = Array.isArray(value) ? value : value instanceof PyTuple ? value.items : iterateAll(value);
        if (items.length !== n) {
          throw new PyError(
            'ValueError',
            items.length > n
              ? `demasiados valores para desempaquetar (se esperaban ${n})`
              : `no hay suficientes valores para desempaquetar (se esperaban ${n}, llegaron ${items.length})`,
          );
        }
        for (let i = n - 1; i >= 0; i--) stack.push(items[i]);
        return 0;
      }
    }
    throw new PyError('InternalError', `instrucción desconocida: ${String(instr.op)}`);
  }

  /**
   * `import nombre`: si el módulo ya se importó en esta ejecución se reutiliza; si no, se ejecuta su
   * código en un marco propio con un ámbito global nuevo y el importador recibe el módulo al terminar.
   * El módulo se registra antes de ejecutarse para que las importaciones circulares no se repitan.
   */
  private importModule(name: string, stack: RuntimeValue[]): number {
    const cost = this.balance.operations.functionCall;
    const cached = this.modules.get(name);
    if (cached) {
      stack.push(cached);
      return cost;
    }
    if (!this.resolveModule) throw new PyError('ImportError', `no hay archivos que importar ('${name}')`);
    if (this.callStack.length >= this.maxCallDepth) {
      throw new PyError('RecursionError', `se superó la profundidad máxima de llamadas al importar '${name}'`);
    }
    const code = this.resolveModule(name);
    const module = new ModuleObject(name);
    this.modules.set(name, module);
    this.callStack.push({
      file: code.file,
      functionName: code.name,
      code,
      ip: 0,
      localScope: null,
      globals: module.globals,
      closure: [],
      stack: [],
      module,
    });
    return cost;
  }

  private call(frame: StackFrame, arg: CallArg): number {
    const stack = frame.stack;
    const nk = arg.kwnames ? arg.kwnames.length : 0;
    const base = stack.length - arg.argc - nk;
    const func = stack[base - 1];
    const args = stack.slice(base, base + arg.argc);
    const kwvalues = nk > 0 ? stack.slice(base + arg.argc) : null;
    stack.length = base - 1;

    if (func instanceof FunctionObject) {
      if (this.callStack.length >= this.maxCallDepth) {
        throw new PyError(
          'RecursionError',
          `se superó la profundidad máxima de recursión (${this.maxCallDepth} llamadas anidadas)`,
        );
      }
      const locals = bindArguments(func, args, arg.kwnames, kwvalues);
      this.callStack.push({
        file: func.code.file,
        functionName: func.name,
        code: func.code,
        ip: 0,
        localScope: locals,
        globals: func.globals,
        closure: func.closure,
        stack: [],
      });
      return this.balance.operations.functionCall;
    }
    if (func instanceof BuiltinFunction) {
      if (nk > 0) throw new PyError('TypeError', `${func.name}() no acepta argumentos con nombre`);
      const ctx = this.ctx as Context;
      ctx.cost = builtinCost(this.balance, func.name);
      const result = func.impl(ctx, args);
      if (result !== PENDING) stack.push(result);
      return ctx.cost;
    }
    if (func instanceof BoundMethod) {
      if (nk > 0) throw new PyError('TypeError', `${func.name}() no acepta argumentos con nombre`);
      stack.push(func.impl(func.self, args));
      return builtinCost(this.balance, 'method');
    }
    throw new PyError('TypeError', `el objeto de tipo '${typeName(func)}' no se puede llamar`);
  }
}
