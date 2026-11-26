import { DEFAULT_BALANCE, type BalanceConfig } from '../config/balance';
import { goalReached, LEADERBOARD_DEFS, LEADERBOARD_MAX_TICKS, type LeaderboardDef } from '../engine/leaderboards';
import { findTech, speedMultiplier, techLevel } from '../engine/tech';
import { isCactusSorted } from '../engine/subsystems/cactus';
import { entityCode, GROUND_CODE } from '../engine/types';
import { World } from '../engine/world';
import { createBuiltins, type ExecEnv, type SimulationRequest, type SimulationTicket } from '../vm/builtins';
import { compileSource, type CodeObject } from '../vm/compiler';
import { DroneVM } from '../vm/droneVm';
import { PyError } from '../vm/errors';
import { DroneFleet } from '../vm/fleet';
import { Scheduler } from '../vm/scheduler';
import type { RuntimeValue } from '../vm/values';
import {
  MEGA_MEMBER,
  SYSTEM_DRONE_ID,
  TILE_FLAG_INFECTED,
  TILE_FLAG_UNSORTED,
  type ConsoleLine,
  type DroneSnapshot,
  type LeaderboardStatus,
  type MainToWorkerMessage,
  type RenderSnapshot,
  type RunState,
  type SimulationStatus,
  type WorkerToMainMessage,
} from './protocol';

export interface HostOptions {
  post: (message: WorkerToMainMessage, transfer?: ArrayBuffer[]) => void;
  /** Reloj en milisegundos (performance.now() en el Worker; falso en las pruebas). */
  now: () => number;
  balance?: BalanceConfig;
  seed?: number;
  snapshotIntervalMs?: number;
  sliceBudgetMs?: number;
  /** Tamaño inicial (pruebas); sin él, el del nivel 0 de Expand. */
  worldSize?: number;
  /** Marcadores disponibles (pruebas); por defecto los de `src/config/leaderboards.json`. */
  leaderboards?: readonly LeaderboardDef[];
}

const DEFAULT_SNAPSHOT_INTERVAL_MS = 33;
/** Autoguardado periódico mientras corre un script (además de al detener y al desbloquear). */
const AUTOSAVE_INTERVAL_MS = 5000;
const DEFAULT_SLICE_BUDGET_MS = 8;
/** Retraso máximo acumulable: si el Worker no da abasto, se descartan ticks en vez de entrar en espiral. */
const MAX_BACKLOG_SECONDS = 0.25;
const MAX_STEP_TICKS = 200_000;
const MAX_CONSOLE_LINES_PER_FLUSH = 500;
const MIN_SPEED = 0.05;
const MAX_SPEED = 1000;

function clampSpeed(value: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number.isFinite(value) && value > 0 ? value : 1));
}

/** Intento de marcador en curso: la partida principal queda congelada aparte hasta que termine. */
interface RunSession {
  board: LeaderboardDef & { goal: { item: string; amount: number } };
  file: string;
  home: World;
  prevSpeed: number;
}

/**
 * simulate() en curso: la ejecución de la granja principal (mundo, drones y flota) queda aparcada
 * tal cual y se reanuda cuando termina la granja aislada; el dron que llamó recibe la duración.
 */
interface SimSession {
  ticket: SimulationTicket;
  world: World;
  scheduler: Scheduler;
  fleet: DroneFleet;
  speedMultiplier: number;
  speedCap: number | null;
  outcome: 'idle' | 'finished' | 'error';
  /** Error del dron principal simulado (archivo, línea y mensaje), si lo hubo. */
  failure: string | null;
  /** Ticks del mundo simulado cuando paró su último dron (antes de cerrar ese tick). */
  endTicks: number | null;
}

/**
 * Núcleo de la simulación, independiente del entorno (Worker o Node/Vitest).
 * Regla No-Idle: los ticks, el reloj simulado y el crecimiento solo avanzan
 * si hay al menos un dron activo y la simulación no está en pausa.
 */
export class SimulationHost {
  readonly balance: BalanceConfig;
  private readonly post: HostOptions['post'];
  private readonly now: () => number;
  private readonly snapshotIntervalMs: number;
  private readonly sliceBudgetMs: number;
  private world: World;
  /** Planificador y flota de la ejecución en curso (durante simulate(), los de la granja aislada). */
  private scheduler = new Scheduler();
  /** Megafarm: drones hijos de spawn_drone() y resultados para wait_for(). */
  private fleet: DroneFleet;
  private readonly builtins: Map<string, RuntimeValue>;
  private readonly env: ExecEnv;
  private readonly boards: readonly LeaderboardDef[];
  private files: Record<string, string> = {};
  private paused = false;
  private speedMultiplier = 1;
  /** Tope de set_execution_speed() para esta ejecución (null = la velocidad desbloqueada). */
  private speedCap: number | null = null;
  private runSession: RunSession | null = null;
  /** leaderboard_run() pedido desde un script: arranca al terminar el tick en curso. */
  private pendingRun: { boardId: string; file: string; speedup: number } | null = null;
  private simSession: SimSession | null = null;
  /** simulate() cuya espera terminó: arranca al terminar el tick en curso (una a la vez). */
  private pendingSim: SimulationTicket | null = null;
  /** La partida principal ya tenía el sombrero de copa (Fastest_Reset se registra una vez). */
  private topHatSeen = false;
  /** El último tick se aceleró con Items.Power. */
  private powered = false;
  private outcome: 'idle' | 'finished' | 'error' = 'idle';
  private tickAccumulator = 0;
  private lastPumpAt: number;
  private lastSnapshotAt = -Infinity;
  private snapshotDirty = true;
  private seq = 0;
  private saveDirty = false;
  private lastSaveAt = 0;
  private consoleQueue: ConsoleLine[] = [];
  private consoleDropped = 0;
  private readonly reported = new WeakSet<DroneVM>();

  constructor(options: HostOptions) {
    this.post = options.post;
    this.now = options.now;
    this.balance = options.balance ?? DEFAULT_BALANCE;
    this.snapshotIntervalMs = options.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS;
    this.sliceBudgetMs = options.sliceBudgetMs ?? DEFAULT_SLICE_BUDGET_MS;
    this.world = new World({ seed: options.seed ?? 1, balance: this.balance, size: options.worldSize });
    this.topHatSeen = this.hasTopHat();
    this.boards = options.leaderboards ?? LEADERBOARD_DEFS;
    this.builtins = createBuiltins();
    this.fleet = new DroneFleet(this.scheduler, () => this.world);
    this.lastPumpAt = this.now();
    const host = this;
    this.env = {
      get world(): World {
        return host.world;
      },
      get fleet(): DroneFleet {
        return host.fleet;
      },
      get mode(): 'home' | 'leaderboard' | 'simulation' {
        return host.runSession ? 'leaderboard' : host.simSession ? 'simulation' : 'home';
      },
      log: (droneId, message) => host.log(droneId, message),
      setSpeedCap: (speed) => {
        host.speedCap = speed > 0 ? Math.max(MIN_SPEED, speed) : null;
        host.snapshotDirty = true;
      },
      startLeaderboard: (boardId, file, speedup) => host.requestRun(boardId, file, speedup),
      requestSimulation: (request) => host.requestSimulation(request),
      pollSimulation: (ticket) => host.pollSimulation(ticket),
      cancelSimulation: (ticket) => host.cancelSimulation(ticket),
    };
  }

  // ---------------------------------------------------------------- consultas

  get currentWorld(): World {
    return this.world;
  }

  get currentScheduler(): Scheduler {
    return this.scheduler;
  }

  get currentFleet(): DroneFleet {
    return this.fleet;
  }

  /** La partida principal (durante un intento o una simulación, `currentWorld` es la granja aislada). */
  get homeWorld(): World {
    if (this.runSession) return this.runSession.home;
    return this.simSession ? this.simSession.world : this.world;
  }

  get simulationStatus(): SimulationStatus | null {
    const sim = this.simSession;
    if (!sim) return null;
    const { file, seed } = sim.ticket.request;
    return { file, seed, speedup: this.speedMultiplier, ticks: this.world.totalTicks, simTime: this.world.simTime };
  }

  get leaderboardStatus(): LeaderboardStatus | null {
    const run = this.runSession;
    if (!run) return null;
    return {
      boardId: run.board.id,
      name: run.board.name,
      file: run.file,
      goalItem: run.board.goal.item,
      goalAmount: run.board.goal.amount,
      progress: this.world.stats.items[run.board.goal.item] ?? 0,
    };
  }

  isTicking(): boolean {
    return !this.paused && this.scheduler.hasActiveDrones();
  }

  /** Indica al bucle del Worker si conviene volver a bombear pronto. */
  isBusy(): boolean {
    return this.isTicking() || this.snapshotDirty || this.consoleQueue.length > 0;
  }

  /** Multiplicador de la mejora Speed del árbol, limitado por set_execution_speed(). */
  techSpeed(): number {
    const unlocked = speedMultiplier(this.world.techTree, this.world.unlocks);
    return this.speedCap !== null ? Math.min(unlocked, this.speedCap) : unlocked;
  }

  /** Ticks por segundo real: base × mejora Speed (con su tope) × ritmo elegido por el jugador. */
  ticksPerRealSecond(): number {
    return this.balance.ticks.baseTicksPerSecond * this.techSpeed() * this.speedMultiplier;
  }

  runState(): RunState {
    if (this.scheduler.hasActiveDrones()) return this.paused ? 'paused' : 'running';
    return this.outcome;
  }

  // ---------------------------------------------------------------- mensajes

  handleMessage(msg: MainToWorkerMessage): void {
    switch (msg.type) {
      case 'INIT_GAME':
        this.initGame(msg.seed, msg);
        break;
      case 'SYNC_FILES':
        this.files = { ...msg.files };
        return;
      case 'RUN_SCRIPT':
        this.runScript(msg.entryFile, msg.startPaused === true);
        break;
      case 'STOP_ALL':
        this.stopAll(true);
        break;
      case 'PAUSE':
        this.paused = msg.paused;
        this.tickAccumulator = 0;
        this.lastPumpAt = this.now();
        this.markDirty();
        break;
      case 'STEP_TICK':
        this.step(msg.ticks);
        break;
      case 'SET_SPEED_MULTIPLIER':
        if (this.runSession) this.runSession.prevSpeed = clampSpeed(msg.multiplier);
        else if (this.simSession) this.simSession.speedMultiplier = clampSpeed(msg.multiplier);
        else this.speedMultiplier = clampSpeed(msg.multiplier);
        this.markDirty();
        break;
      case 'SET_WORLD_SIZE':
        if (this.scheduler.hasActiveDrones()) {
          this.log(SYSTEM_DRONE_ID, 'No se puede cambiar el tamaño de la granja mientras un script se ejecuta.');
        } else {
          this.world.resize(msg.size);
          this.markDirty();
        }
        break;
      case 'START_LEADERBOARD': {
        const error = this.validateRun(msg.boardId, msg.file);
        if (error) this.log(SYSTEM_DRONE_ID, `✖ No se pudo iniciar el intento: ${error}.`);
        else this.startRun(msg.boardId, msg.file, msg.speedup ?? 1);
        break;
      }
      case 'UNLOCK_TECH': {
        if (this.runSession || this.simSession) {
          const during = this.runSession ? 'un intento de marcador' : 'una simulación';
          this.log(SYSTEM_DRONE_ID, `No se puede desbloquear tecnología durante ${during}.`);
          break;
        }
        const result = this.world.unlock(msg.techId);
        const name = findTech(this.world.techTree, msg.techId)?.name ?? msg.techId;
        if (result.ok) {
          this.log(SYSTEM_DRONE_ID, `✔ Desbloqueado: ${name} (nivel ${result.level})`);
          this.checkTopHat();
          this.requestSave(true);
        } else {
          this.log(SYSTEM_DRONE_ID, `✖ No se pudo desbloquear: ${result.message}`);
        }
        this.markDirty();
        break;
      }
    }
    this.flushNow();
  }

  private initGame(seed: number, msg: Extract<MainToWorkerMessage, { type: 'INIT_GAME' }>): void {
    this.abortSimulation();
    if (this.runSession) {
      this.speedMultiplier = this.runSession.prevSpeed;
      this.runSession = null;
    }
    this.pendingRun = null;
    this.resetExecution();
    this.world = msg.savedState
      ? World.deserialize(msg.savedState, this.balance)
      : new World({ seed, size: msg.worldSize, balance: this.balance });
    this.topHatSeen = this.hasTopHat();
    this.saveDirty = false;
    this.paused = false;
    this.outcome = 'idle';
    this.tickAccumulator = 0;
    this.markDirty();
  }

  private runScript(entryFile: string, startPaused: boolean): void {
    if (this.runSession) this.finishRun(false, 'interrumpido por otra ejecución');
    this.stopAll(false);
    this.launch(entryFile, startPaused);
  }

  /** Crea el dron principal con `entryFile` en el mundo actual (sin detener nada antes). Devuelve el error, si lo hubo. */
  private launch(entryFile: string, startPaused: boolean, globals?: ReadonlyMap<string, RuntimeValue>): string | null {
    this.paused = startPaused;
    // Cada ejecución empieza con el dron en (0, 0) de la granja.
    this.world.resetMainDrone();
    const source = this.files[entryFile];
    if (source === undefined) {
      this.outcome = 'error';
      const error = `ImportError: no existe el archivo '${entryFile}'`;
      this.post({ type: 'RUNTIME_ERROR', droneId: 0, file: entryFile, line: 0, error });
      return error;
    }
    let failure: string | null = null;
    try {
      const { code } = compileSource(source, entryFile);
      this.scheduler.add(
        new DroneVM({
          id: 0,
          code,
          builtins: this.builtins,
          balance: this.balance,
          resolveModule: this.moduleResolver(),
          initialGlobals: globals,
        }),
      );
      this.outcome = 'idle';
    } catch (err) {
      this.outcome = 'error';
      const error = err instanceof PyError ? err.format() : `InternalError: ${String(err)}`;
      const line = err instanceof PyError ? (err.line ?? 0) : 0;
      this.post({ type: 'RUNTIME_ERROR', droneId: 0, file: entryFile, line, error });
      failure = line > 0 ? `${entryFile}, línea ${line}: ${error}` : error;
    }
    this.tickAccumulator = 0;
    this.lastPumpAt = this.now();
    this.markDirty();
    return failure;
  }

  /** Resuelve `import nombre` contra los archivos `.py` sincronizados (compilados una vez por ejecución). */
  private moduleResolver(): (name: string) => CodeObject {
    const files = this.files;
    const cache = new Map<string, CodeObject>();
    return (name) => {
      const file = `${name}.py`;
      const cached = cache.get(file);
      if (cached) return cached;
      const source = files[file];
      if (source === undefined) throw new PyError('ImportError', `no existe el archivo '${file}'`);
      const { code } = compileSource(source, file);
      cache.set(file, code);
      return code;
    };
  }

  private stopAll(byUser: boolean): void {
    // Detener durante simulate() corta la simulación y también la ejecución que la pidió.
    this.abortSimulation();
    if (this.runSession) {
      this.finishRun(false, byUser ? 'detenido por el jugador' : 'interrumpido');
      return;
    }
    this.pendingRun = null;
    const wasActive = this.scheduler.hasActiveDrones();
    this.resetExecution();
    if (byUser && wasActive) this.log(SYSTEM_DRONE_ID, `■ Ejecución detenida en el tick ${this.world.totalTicks}.`);
    if (wasActive) this.requestSave(true);
    this.markDirty();
  }

  /** Descarta todos los drones (hijos incluidos) y sus acciones pendientes en el mundo actual. */
  private resetExecution(): void {
    this.pendingSim = null;
    this.fleet.reset();
    this.scheduler.stopAll();
    for (const body of this.world.drones) body.action = null;
    // set_world_size() solo dura lo que la ejecución.
    if (this.world.clearSizeLimit()) this.markDirty();
    this.paused = false;
    this.powered = false;
    this.speedCap = null;
    this.outcome = 'idle';
    this.tickAccumulator = 0;
  }

  // ---------------------------------------------------------------- marcadores

  private validateRun(boardId: string, file: string): string | null {
    const board = this.boards.find((b) => b.id === boardId);
    if (!board || board.special || !board.goal) return `el marcador '${boardId}' no admite intentos cronometrados`;
    if (this.runSession || this.pendingRun) return 'ya hay un intento en curso';
    if (this.simSession) return 'hay una simulación en curso';
    if (this.files[file] === undefined) return `no existe el archivo '${file}'`;
    return null;
  }

  /** leaderboard_run() desde un script: valida ahora y arranca al terminar el tick (nunca a mitad). */
  private requestRun(boardId: string, file: string, speedup: number): string | null {
    const error = this.validateRun(boardId, file);
    if (error) return error;
    this.pendingRun = { boardId, file, speedup };
    return null;
  }

  /**
   * Intento cronometrado: congela la partida principal, crea una granja aislada con la semilla,
   * tamaño, tecnologías y recursos del marcador, y ejecuta `file` midiendo ticks simulados.
   */
  private startRun(boardId: string, file: string, speedup: number): void {
    const board = this.boards.find((b) => b.id === boardId);
    if (!board?.goal) return;
    const wasActive = this.scheduler.hasActiveDrones();
    this.resetExecution();
    if (wasActive) this.requestSave(true);
    const home = this.world;
    const run = new World({
      seed: board.seed ?? 1,
      width: board.size?.[0],
      height: board.size?.[1],
      unlocks: board.unlocks,
      balance: this.balance,
    });
    run.achievementsEnabled = false;
    for (const [item, amount] of Object.entries(board.items ?? {})) run.inventory.add(item, amount);
    this.runSession = { board: { ...board, goal: board.goal }, file, home, prevSpeed: this.speedMultiplier };
    this.world = run;
    this.speedMultiplier = clampSpeed(speedup);
    this.log(
      SYSTEM_DRONE_ID,
      `⏱ Intento «${board.name}» con ${file}: meta ${board.goal.amount} × ${board.goal.item} (×${this.speedMultiplier}).`,
    );
    this.launch(file, false);
    if (!this.scheduler.hasActiveDrones()) this.finishRun(false, 'el archivo no se pudo ejecutar');
    this.markDirty();
  }

  /** Cierra el intento, publica el resultado y devuelve la partida principal tal como estaba. */
  private finishRun(success: boolean, reason?: string): void {
    const run = this.runSession;
    if (!run) return;
    const ticks = this.world.totalTicks;
    const simTime = this.world.simTime;
    const hadError = this.outcome === 'error';
    this.resetExecution();
    this.world = run.home;
    this.speedMultiplier = run.prevSpeed;
    this.runSession = null;
    this.pendingRun = null;
    this.outcome = success ? 'finished' : hadError ? 'error' : 'idle';
    if (success) {
      this.world.record('leaderboardRuns');
      this.world.checkAchievements();
      this.requestSave(true);
      this.log(SYSTEM_DRONE_ID, `🏁 «${run.board.name}» completado en ${ticks} ticks (${simTime.toFixed(2)} s simulados).`);
    } else {
      this.log(SYSTEM_DRONE_ID, `✖ Intento «${run.board.name}» no completado: ${reason ?? 'sin meta'}.`);
    }
    this.post({ type: 'LEADERBOARD_RESULT', result: { boardId: run.board.id, file: run.file, success, ticks, simTime, reason } });
    this.markDirty();
  }

  // ---------------------------------------------------------------- simulate()

  /** Nombre del archivo tal como lo escribió el jugador, con o sin «.py». */
  private resolveFile(name: string): string | null {
    if (this.files[name] !== undefined) return name;
    const withExt = `${name}.py`;
    return this.files[withExt] !== undefined ? withExt : null;
  }

  private requestSimulation(request: SimulationRequest): SimulationTicket | string {
    const file = this.resolveFile(request.file);
    if (file === null) return `no existe el archivo '${request.file}'`;
    return { request: { ...request, file }, state: 'queued', result: null, error: null };
  }

  /** La espera de 200 ticks del dron terminó: si no hay otra simulación, la suya arranca al cerrar el tick. */
  private pollSimulation(ticket: SimulationTicket): boolean {
    if (ticket.state === 'done' || ticket.state === 'cancelled') return true;
    if (ticket.state === 'queued' && !this.simSession && this.pendingSim === null) this.pendingSim = ticket;
    return false;
  }

  private cancelSimulation(ticket: SimulationTicket): void {
    if (this.pendingSim === ticket) this.pendingSim = null;
    if (ticket.state === 'queued') ticket.state = 'cancelled';
  }

  /**
   * Aparca la ejecución principal y corre `file` en una granja nueva con la semilla, los
   * desbloqueos, los recursos y las variables globales pedidos. No concede logros ni recursos.
   */
  private startSimulation(ticket: SimulationTicket): void {
    if (ticket.state !== 'queued' || this.simSession || this.runSession) return;
    const req = ticket.request;
    const world = new World({ seed: req.seed, unlocks: req.unlocks, balance: this.balance });
    world.achievementsEnabled = false;
    for (const [item, amount] of Object.entries(req.items)) world.inventory.add(item, amount);
    this.simSession = {
      ticket,
      world: this.world,
      scheduler: this.scheduler,
      fleet: this.fleet,
      speedMultiplier: this.speedMultiplier,
      speedCap: this.speedCap,
      outcome: this.outcome,
      failure: null,
      endTicks: null,
    };
    ticket.state = 'running';
    this.world = world;
    this.scheduler = new Scheduler();
    this.fleet = new DroneFleet(this.scheduler, () => this.world);
    this.speedMultiplier = clampSpeed(req.speedup);
    this.speedCap = null;
    this.powered = false;
    this.log(SYSTEM_DRONE_ID, `🧪 Simulación de ${req.file} (semilla ${req.seed}, ×${this.speedMultiplier}).`);
    const failure = this.launch(req.file, false, req.globals);
    if (!this.scheduler.hasActiveDrones()) this.finishSimulation(failure ?? `${req.file} no se pudo ejecutar`);
    this.markDirty();
  }

  /** Cierra la simulación, devuelve la ejecución principal tal como estaba y entrega el resultado. */
  private finishSimulation(error?: string): void {
    const sim = this.restoreFromSimulation();
    if (!sim) return;
    const { ticket } = sim;
    ticket.state = 'done';
    const failure = error ?? sim.failure;
    const file = ticket.request.file;
    if (failure) {
      ticket.error = failure.startsWith(file) ? failure : `${file}: ${failure}`;
      this.log(SYSTEM_DRONE_ID, `✖ La simulación de ${file} terminó con un error.`);
    } else {
      this.log(SYSTEM_DRONE_ID, `🧪 Simulación de ${file}: ${(ticket.result ?? 0).toFixed(2)} s simulados.`);
    }
  }

  /** Detener o reiniciar durante una simulación: se descarta sin resultado. */
  private abortSimulation(): void {
    const sim = this.restoreFromSimulation();
    if (!sim) return;
    sim.ticket.state = 'cancelled';
    this.log(SYSTEM_DRONE_ID, `✖ Simulación de ${sim.ticket.request.file} interrumpida.`);
  }

  private restoreFromSimulation(): SimSession | null {
    const sim = this.simSession;
    if (!sim) return null;
    // Duración medida: hasta que paró el último dron simulado (el tick en que se detecta no cuenta).
    sim.ticket.result = (sim.endTicks ?? this.world.totalTicks) / this.balance.ticks.baseTicksPerSecond;
    this.fleet.reset();
    this.scheduler.stopAll();
    this.world = sim.world;
    this.scheduler = sim.scheduler;
    this.fleet = sim.fleet;
    this.speedMultiplier = sim.speedMultiplier;
    this.speedCap = sim.speedCap;
    this.outcome = sim.outcome;
    this.powered = false;
    this.paused = false;
    this.simSession = null;
    this.tickAccumulator = 0;
    this.markDirty();
    return sim;
  }

  private hasTopHat(): boolean {
    return techLevel(this.world.unlocks, 'Top_Hat') > 0;
  }

  /** Fastest_Reset: ticks simulados de la partida principal hasta desbloquear el sombrero de copa. */
  private checkTopHat(): void {
    if (this.topHatSeen || this.runSession || !this.hasTopHat()) return;
    this.topHatSeen = true;
    const world = this.world;
    this.post({
      type: 'LEADERBOARD_RESULT',
      result: { boardId: 'Fastest_Reset', file: '', success: true, ticks: world.totalTicks, simTime: world.simTime },
    });
  }

  /** Avanza `ticks` ticks exactos, o (sin argumento) hasta la siguiente sentencia del dron principal. */
  private step(ticks?: number): void {
    if (!this.scheduler.hasActiveDrones()) return;
    this.paused = true;
    if (ticks !== undefined) {
      this.runTicks(Math.min(Math.max(0, Math.floor(ticks)), MAX_STEP_TICKS));
    } else {
      const primary = this.scheduler.primary();
      if (!primary) return;
      primary.beginStep();
      for (let i = 0; i < MAX_STEP_TICKS; i++) {
        const stopped = this.runOneTick(primary.id);
        if (stopped || !primary.isActive) break;
      }
    }
    this.markDirty();
  }

  // ---------------------------------------------------------------- bucle de ticks

  /** Ejecuta hasta `count` ticks sin ritmo real (pruebas y STEP_TICK). Devuelve los ticks ejecutados. */
  runTicks(count: number): number {
    let ran = 0;
    while (ran < count && this.scheduler.hasActiveDrones()) {
      this.runOneTick();
      ran++;
    }
    if (ran > 0) this.markDirty(false);
    return ran;
  }

  private runOneTick(stepDroneId: number | null = null): boolean {
    const speed = this.world.consumePower(this.scheduler.activeCount());
    this.powered = speed > 1;
    // do_a_flip dura 1 s real a la velocidad desbloqueada: ms por tick sin Items.Power ni el ritmo del jugador.
    const fixedMsPerTick = 1000 / (this.balance.ticks.baseTicksPerSecond * this.techSpeed());
    const outcome = this.scheduler.tick(this.env, { stepDroneId, speed, fixedMsPerTick });
    if (this.simSession && this.simSession.endTicks === null && !this.scheduler.hasActiveDrones()) {
      this.simSession.endTicks = this.world.totalTicks;
    }
    this.world.advanceTick();
    if (!this.runSession && !this.simSession) this.saveDirty = true;
    this.checkTransitions();
    this.fleet.collect();
    this.afterTick();
    return outcome.stepStopped;
  }

  /** Metas de los intentos de marcador, intentos y simulaciones pedidos por scripts, y Fastest_Reset. */
  private afterTick(): void {
    const run = this.runSession;
    if (run) {
      if (goalReached(run.board, this.world.stats.items)) this.finishRun(true);
      else if (!this.scheduler.hasActiveDrones()) this.finishRun(false, 'el script terminó antes de la meta');
      else if (this.world.totalTicks >= LEADERBOARD_MAX_TICKS) this.finishRun(false, 'se superó el máximo de ticks');
      return;
    }
    if (this.simSession) {
      // La simulación termina cuando acaban todos sus drones (el principal y sus hijos).
      if (!this.scheduler.hasActiveDrones()) this.finishSimulation();
      return;
    }
    if (!this.topHatSeen) this.checkTopHat();
    if (this.pendingRun) {
      const { boardId, file, speedup } = this.pendingRun;
      this.pendingRun = null;
      this.startRun(boardId, file, speedup);
    } else if (this.pendingSim) {
      const ticket = this.pendingSim;
      this.pendingSim = null;
      this.startSimulation(ticket);
    }
  }

  private checkTransitions(): void {
    for (const vm of this.scheduler.all) {
      if (vm.isActive || this.reported.has(vm)) continue;
      this.reported.add(vm);
      if (vm.status === 'ERROR' && vm.error) {
        if (vm.id === 0 && this.simSession) {
          this.simSession.failure = `${vm.error.file}, línea ${vm.error.line}: ${vm.error.pyType}: ${vm.error.message}`;
        } else if (vm.id === 0) {
          this.outcome = 'error';
        }
        this.flushConsole();
        const where = vm.error.functionName && vm.error.functionName !== '<módulo>' ? ` (en ${vm.error.functionName})` : '';
        this.post({
          type: 'RUNTIME_ERROR',
          droneId: vm.id,
          file: vm.error.file,
          line: vm.error.line,
          error: `${vm.error.pyType}: ${vm.error.message}${where}`,
        });
      } else if (vm.status === 'FINISHED' && vm.id === 0 && !this.simSession) {
        this.outcome = 'finished';
        this.log(SYSTEM_DRONE_ID, `✔ Script finalizado (${vm.ticksUsed} ticks de ejecución).`);
      }
      if (!this.scheduler.hasActiveDrones()) {
        // Fin de la ejecución: set_world_size() deja de aplicarse.
        if (!this.simSession) this.world.clearSizeLimit();
        this.requestSave(true);
      }
      this.markDirty();
    }
  }

  /**
   * Llamado repetidamente por el bucle del Worker. Ejecuta los ticks que corresponden al
   * tiempo real transcurrido (en ráfagas acotadas para poder atender STOP_ALL al instante)
   * y emite snapshots a ~30 Hz.
   */
  pump(): void {
    const now = this.now();
    const elapsed = Math.min(Math.max(now - this.lastPumpAt, 0), 1000);
    this.lastPumpAt = now;
    if (this.isTicking()) {
      const rate = this.ticksPerRealSecond();
      this.tickAccumulator = Math.min(this.tickAccumulator + (elapsed * rate) / 1000, rate * MAX_BACKLOG_SECONDS + 1);
      const deadline = now + this.sliceBudgetMs;
      let ran = 0;
      while (this.tickAccumulator >= 1) {
        this.runOneTick();
        this.tickAccumulator -= 1;
        ran++;
        if (!this.isTicking()) {
          this.tickAccumulator = 0;
          break;
        }
        if ((ran & 15) === 0 && this.now() >= deadline) break;
      }
      if (ran > 0) this.snapshotDirty = true;
    } else {
      this.tickAccumulator = 0;
    }
    this.flushConsole();
    if (this.snapshotDirty && now - this.lastSnapshotAt >= this.snapshotIntervalMs) this.emitSnapshot(now);
    if (this.saveDirty && now - this.lastSaveAt >= AUTOSAVE_INTERVAL_MS) this.emitSave(now);
  }

  // ---------------------------------------------------------------- guardado

  /** Marca la partida para guardar; con `soon` se guarda en el siguiente bombeo. */
  private requestSave(soon = false): void {
    this.saveDirty = true;
    if (soon) this.lastSaveAt = -Infinity;
  }

  private emitSave(now: number): void {
    this.saveDirty = false;
    this.lastSaveAt = now;
    // Durante un intento se guarda la partida principal, nunca la granja aislada del marcador.
    this.post({ type: 'SAVE_REQUIRED', state: this.homeWorld.serialize() });
  }

  // ---------------------------------------------------------------- salida

  private markDirty(immediate = true): void {
    this.snapshotDirty = true;
    if (immediate) this.lastSnapshotAt = -Infinity;
  }

  private flushNow(): void {
    this.flushConsole();
    if (this.snapshotDirty && this.lastSnapshotAt === -Infinity) this.emitSnapshot(this.now());
    if (this.saveDirty && this.lastSaveAt === -Infinity) this.emitSave(this.now());
  }

  private log(droneId: number, message: string): void {
    this.consoleQueue.push({ droneId, message, tick: this.world.totalTicks });
    if (this.consoleQueue.length > MAX_CONSOLE_LINES_PER_FLUSH * 2) {
      const drop = this.consoleQueue.length - MAX_CONSOLE_LINES_PER_FLUSH;
      this.consoleQueue.splice(0, drop);
      this.consoleDropped += drop;
    }
  }

  private flushConsole(): void {
    if (this.consoleQueue.length === 0 && this.consoleDropped === 0) return;
    let lines = this.consoleQueue;
    let dropped = this.consoleDropped;
    if (lines.length > MAX_CONSOLE_LINES_PER_FLUSH) {
      dropped += lines.length - MAX_CONSOLE_LINES_PER_FLUSH;
      lines = lines.slice(lines.length - MAX_CONSOLE_LINES_PER_FLUSH);
    }
    this.consoleQueue = [];
    this.consoleDropped = 0;
    if (lines.length === 1 && dropped === 0) {
      this.post({ type: 'CONSOLE_LOG', ...lines[0] });
    } else {
      this.post({ type: 'CONSOLE_BATCH', lines, dropped });
    }
  }

  private emitSnapshot(now: number): void {
    const world = this.world;
    const tiles = world.grid.tiles;
    const n = tiles.length;
    const ground = new Uint8Array(n);
    const entity = new Uint8Array(n);
    const growth = new Float32Array(n);
    const water = new Float32Array(n);
    const flags = new Uint8Array(n);
    const meta = new Uint8Array(n);
    const walls = new Uint8Array(n);
    const mega = new Uint8Array(n);
    const compEntity = new Uint8Array(n);
    const compX = new Uint8Array(n);
    const compY = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = tiles[i];
      ground[i] = GROUND_CODE[t.ground];
      entity[i] = entityCode(t.entity);
      growth[i] = t.growthProgress;
      water[i] = t.waterLevel;
      let f = t.isInfected ? TILE_FLAG_INFECTED : 0;
      if (t.entity === 'Cactus') {
        meta[i] = t.cactusSize ?? 0;
        if (!isCactusSorted(world, t.x, t.y)) f |= TILE_FLAG_UNSORTED;
      } else if (t.entity === 'Sunflower') {
        meta[i] = t.petals ?? 0;
      }
      flags[i] = f;
      walls[i] = t.mazeWalls ?? 0;
      if (t.mega) mega[i] = t.mega.x === t.x && t.mega.y === t.y ? t.mega.size : MEGA_MEMBER;
      if (t.companion) {
        compEntity[i] = entityCode(t.companion.entity);
        compX[i] = t.companion.x;
        compY[i] = t.companion.y;
      }
    }
    const drones: DroneSnapshot[] = world.drones.map((body) => {
      const vm = this.scheduler.get(body.id);
      return {
        id: body.id,
        x: body.x,
        y: body.y,
        status: vm ? vm.status : 'IDLE',
        file: vm ? vm.currentFile : null,
        line: vm ? vm.currentLine : null,
        action: body.action ? { ...body.action } : null,
        hat: body.hat,
      };
    });
    const events = world.drainEvents();
    for (const e of events) if (e.kind === 'achievement') this.post({ type: 'ACHIEVEMENT_UNLOCKED', achievementId: e.id });
    const snapshot: RenderSnapshot = {
      seq: ++this.seq,
      tick: world.totalTicks,
      simTime: world.simTime,
      worldSize: world.size,
      width: world.width,
      height: world.height,
      ticksPerSecond: this.isTicking() ? this.ticksPerRealSecond() : 0,
      speedMultiplier: this.speedMultiplier,
      powered: this.powered && this.isTicking(),
      dino: world.dino ? { droneId: world.dino.droneId, tail: world.dino.tail.map((t): [number, number] => [t.x, t.y]) } : null,
      runState: this.runState(),
      leaderboard: this.leaderboardStatus,
      simulation: this.simulationStatus,
      tiles: { ground, entity, growth, water, flags, meta, walls, mega, compEntity, compX, compY },
      drones,
      inventory: world.inventory.toRecord(),
      unlocks: { ...this.homeWorld.unlocks },
      achievements: [...this.homeWorld.achievements],
      events,
    };
    const buffers = [ground, entity, growth, water, flags, meta, walls, mega, compEntity, compX, compY].map((a) => a.buffer as ArrayBuffer);
    this.post({ type: 'STATE_SNAPSHOT', snapshot }, buffers);
    this.lastSnapshotAt = now;
    this.snapshotDirty = false;
  }
}
