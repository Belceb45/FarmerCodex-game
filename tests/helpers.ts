import { DEFAULT_BALANCE, type BalanceConfig } from '../src/config/balance';
import { World } from '../src/engine/world';
import { createBuiltins, type ExecEnv } from '../src/vm/builtins';
import { compileSource } from '../src/vm/compiler';
import { DroneVM } from '../src/vm/droneVm';
import { PyError } from '../src/vm/errors';
import { DroneFleet } from '../src/vm/fleet';
import { Scheduler } from '../src/vm/scheduler';
import type { LeaderboardDef } from '../src/engine/leaderboards';
import type { LeaderboardResult, WorkerToMainMessage } from '../src/worker/protocol';
import { SimulationHost } from '../src/worker/simulationHost';

export interface ProgramResult {
  output: string[];
  error: string | null;
  errorLine: number | null;
  vm: DroneVM;
  world: World;
  scheduler: Scheduler;
  fleet: DroneFleet;
  /** Salida de print/quick_print con el id del dron que la produjo. */
  lines: { droneId: number; message: string }[];
  /** Ticks del motor transcurridos hasta que el dron terminó. */
  ticks: number;
}

/** Ejecuta un programa en un mundo nuevo, tick a tick, hasta que termina o se agota `maxTicks`. */
export function runProgram(
  source: string,
  options: { maxTicks?: number; balance?: BalanceConfig; world?: World; seed?: number; files?: Record<string, string> } = {},
): ProgramResult {
  const balance = options.balance ?? DEFAULT_BALANCE;
  const world = options.world ?? new World({ seed: options.seed ?? 42, balance, size: 3 });
  const output: string[] = [];
  const lines: { droneId: number; message: string }[] = [];
  const scheduler = new Scheduler();
  const fleet = new DroneFleet(scheduler, () => world);
  const env: ExecEnv = {
    world,
    fleet,
    log: (droneId, message) => {
      output.push(message);
      lines.push({ droneId, message });
    },
  };
  const { code } = compileSource(source, 'main.py');
  const files = options.files ?? {};
  const resolveModule = (name: string) => {
    const file = `${name}.py`;
    if (files[file] === undefined) throw new PyError('ImportError', `no existe el archivo '${file}'`);
    return compileSource(files[file], file).code;
  };
  const vm = new DroneVM({ id: 0, code, builtins: createBuiltins(), balance, resolveModule });
  scheduler.add(vm);
  const maxTicks = options.maxTicks ?? 2_000_000;
  let ticks = 0;
  while (scheduler.hasActiveDrones() && ticks < maxTicks) {
    scheduler.tick(env, { speed: world.consumePower(scheduler.activeCount()) });
    world.advanceTick();
    fleet.collect();
    ticks++;
  }
  return {
    output,
    lines,
    vm,
    world,
    scheduler,
    fleet,
    ticks,
    error: vm.error ? `${vm.error.pyType}: ${vm.error.message}` : null,
    errorLine: vm.error ? vm.error.line : null,
  };
}

/** Evalúa una expresión y devuelve lo que imprimiría `quick_print(expr)`. */
export function evaluate(expr: string): string {
  const result = runProgram(`quick_print(${expr})`);
  if (result.error) throw new Error(result.error);
  return result.output[0];
}

/** Host de simulación con reloj falso y registro de mensajes enviados al hilo principal. */
export function createHost(
  options: { seed?: number; balance?: BalanceConfig; worldSize?: number; leaderboards?: LeaderboardDef[] } = {},
) {
  let clock = 0;
  const messages: WorkerToMainMessage[] = [];
  const host = new SimulationHost({
    post: (message) => messages.push(message),
    now: () => clock,
    seed: options.seed ?? 7,
    balance: options.balance,
    worldSize: options.worldSize ?? 3,
    leaderboards: options.leaderboards,
  });
  return {
    host,
    messages,
    advance(ms: number, stepMs = 4) {
      for (let t = 0; t < ms; t += stepMs) {
        clock += Math.min(stepMs, ms - t);
        host.pump();
      }
    },
    load(source: string, file = 'main.py') {
      host.handleMessage({ type: 'SYNC_FILES', files: { [file]: source } });
    },
    lastSnapshot() {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type === 'STATE_SNAPSHOT') return m.snapshot;
      }
      throw new Error('no se emitió ningún snapshot');
    },
    consoleLines(): string[] {
      const lines: string[] = [];
      for (const m of messages) {
        if (m.type === 'CONSOLE_LOG') lines.push(m.message);
        else if (m.type === 'CONSOLE_BATCH') lines.push(...m.lines.map((l) => l.message));
      }
      return lines;
    },
    errors() {
      return messages.filter((m) => m.type === 'RUNTIME_ERROR');
    },
    results(): LeaderboardResult[] {
      const out: LeaderboardResult[] = [];
      for (const m of messages) if (m.type === 'LEADERBOARD_RESULT') out.push(m.result);
      return out;
    },
  };
}
