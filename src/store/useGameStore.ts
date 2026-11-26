import { create } from 'zustand';
import type { WorldStats } from '../engine/achievements';
import { findLeaderboard } from '../engine/leaderboards';
import {
  AUTOSAVE_SLOT,
  createIdbBackend,
  createMemoryBackend,
  FileSync,
  type LeaderboardEntry,
  type PersistenceBackend,
  type SaveSlot,
  type StoredFile,
} from '../persistence/db';
import { nextScriptName, type Viewport } from '../ui/windows/layout';
import { soundManager } from '../audio/SoundManager';
import {
  SYSTEM_DRONE_ID,
  type LeaderboardResult,
  type LeaderboardStatus,
  type RunState,
  type SimulationStatus,
  type WorkerToMainMessage,
} from '../worker/protocol';
import { consoleBuffer } from './consoleBuffer';
import { liveSnapshot, pushSceneEvents } from './liveSnapshot';
import { formatTicks, mergeRecord } from './records';
import { SimulationClient } from './simulationClient';
import { clearSavedLayout, loadSavedLayout, useWindowStore } from './useWindowStore';

export const DEFAULT_FILE = 'main.py';

export const DEFAULT_SCRIPT = `# Cosecha el pasto maduro de la columna.
# ▶ ejecutar · ▷ paso a paso · Ctrl+Enter

while True:
    if can_harvest():
        harvest()
    move(North)
`;

/** Tope de velocidad elegido por el jugador; la velocidad máxima la da la mejora Speed del árbol. */
export const SPEED_OPTIONS = [0.25, 0.5, 1] as const;

/** Temas del editor (doc 07): Terminal Industrial Ámbar (por defecto), Oscuro Clásico y Claro. */
export type EditorTheme = 'amber' | 'dark' | 'light';
export const EDITOR_THEMES: readonly EditorTheme[] = ['amber', 'dark', 'light'];

const PREFS_KEY = 'farmercodex:prefs';

interface Prefs {
  speed: number;
  highlightActiveLine: boolean;
  theme: EditorTheme;
  /** Volumen de los efectos de sonido (0 = silencio). */
  volume: number;
  /** Versión de las preferencias: la 2 estrena el tema ámbar como predeterminado. */
  version?: number;
}

const PREFS_VERSION = 2;
const DEFAULT_PREFS: Prefs = { speed: 1, highlightActiveLine: true, theme: 'amber', volume: 0.5, version: PREFS_VERSION };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      speed: typeof parsed.speed === 'number' ? Math.min(1, Math.max(0.25, parsed.speed)) : DEFAULT_PREFS.speed,
      highlightActiveLine:
        typeof parsed.highlightActiveLine === 'boolean' ? parsed.highlightActiveLine : DEFAULT_PREFS.highlightActiveLine,
      // Las preferencias anteriores al tema ámbar guardaban el antiguo predeterminado: pasan al nuevo.
      theme:
        (parsed.version ?? 1) < PREFS_VERSION || !parsed.theme || !EDITOR_THEMES.includes(parsed.theme) ? DEFAULT_PREFS.theme : parsed.theme,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_PREFS.volume,
      version: PREFS_VERSION,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Almacenamiento no disponible: las preferencias solo duran esta sesión.
  }
}

export interface GameState {
  ready: boolean;
  runState: RunState;
  files: Record<string, string>;
  /** Archivo de entrada de la ejecución en curso (o de la última). */
  entryFile: string | null;
  speed: number;
  worldSize: number;
  inventory: Record<string, number>;
  /** Nivel de cada tecnología (árbol tecnológico). */
  unlocks: Record<string, number>;
  /** Último logro conseguido (para el aviso en pantalla). */
  achievement: { id: string; at: number } | null;
  /** Logros de la partida principal. */
  achievements: string[];
  /** Estadísticas de por vida (progreso de los logros), del último guardado. */
  stats: WorldStats | null;
  /** Intento de marcador en curso. */
  leaderboard: LeaderboardStatus | null;
  /** simulate() en curso (la granja mostrada es la simulada). */
  simulation: SimulationStatus | null;
  /** Mejores marcas guardadas en IndexedDB, por marcador. */
  records: Record<string, LeaderboardEntry>;
  /** Último intento terminado (para el aviso en pantalla). */
  lastResult: (LeaderboardResult & { improved: boolean; previous: number | null; at: number }) | null;
  /** Items.Power está acelerando a los drones. */
  powered: boolean;
  tick: number;
  simTime: number;
  /** Archivo y línea que ejecuta el dron principal (solo corriendo o en pausa). */
  execFile: string | null;
  execLine: number | null;
  errorFile: string | null;
  errorLine: number | null;
  /** Último error del script (se muestra en su ventana). */
  errorMessage: string | null;
  consoleVersion: number;
  highlightActiveLine: boolean;
  editorTheme: EditorTheme;
  volume: number;
  fps: number;
  setFileContent: (name: string, content: string) => void;
  dismissError: () => void;
  createFile: () => string;
  deleteFile: (name: string) => void;
  renameFile: (from: string, to: string) => void;
  /** ▶: ejecuta el archivo (o lo reanuda si es el que está en pausa). */
  run: (file: string) => void;
  /** ▷: avanza una sentencia; si el archivo no está en marcha, lo arranca en pausa. */
  step: (file: string) => void;
  /** Ctrl+Enter: ejecutar / pausar / continuar. */
  togglePause: (file: string) => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (multiplier: number) => void;
  setHighlightActiveLine: (enabled: boolean) => void;
  setEditorTheme: (theme: EditorTheme) => void;
  setVolume: (volume: number) => void;
  /** Intento cronometrado de un marcador con `file` (leaderboard_run desde la interfaz). */
  startLeaderboard: (boardId: string, file: string, speedup: number) => void;
  clearConsole: () => void;
  setFps: (fps: number) => void;
}

let client: SimulationClient | null = null;

function shallowEqualRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

const prefs = loadPrefs();

/** El script del archivo sigue vivo (corriendo o en pausa). */
export function isFileActive(state: Pick<GameState, 'runState' | 'entryFile'>, file: string): boolean {
  return state.entryFile === file && (state.runState === 'running' || state.runState === 'paused');
}

export const useGameStore = create<GameState>()((set, get) => {
  const send = (...messages: Parameters<SimulationClient['send']>[0][]): void => {
    if (!client) return;
    for (const m of messages) client.send(m);
  };

  const persist = (): void => {
    const s = get();
    savePrefs({ speed: s.speed, highlightActiveLine: s.highlightActiveLine, theme: s.editorTheme, volume: s.volume, version: PREFS_VERSION });
  };

  const start = (file: string, startPaused: boolean): void => {
    set({ entryFile: file, errorFile: null, errorLine: null, errorMessage: null });
    send({ type: 'SYNC_FILES', files: get().files }, { type: 'RUN_SCRIPT', entryFile: file, startPaused });
  };

  return {
    ready: false,
    runState: 'idle',
    files: { [DEFAULT_FILE]: DEFAULT_SCRIPT },
    entryFile: null,
    speed: prefs.speed,
    worldSize: 1,
    inventory: {},
    unlocks: {},
    powered: false,
    achievement: null,
    achievements: [],
    stats: null,
    leaderboard: null,
    simulation: null,
    records: {},
    lastResult: null,
    tick: 0,
    simTime: 0,
    execFile: null,
    execLine: null,
    errorFile: null,
    errorLine: null,
    errorMessage: null,
    consoleVersion: 0,
    highlightActiveLine: prefs.highlightActiveLine,
    editorTheme: prefs.theme,
    volume: prefs.volume,
    fps: 0,

    setFileContent: (name, content) => {
      set((s) => ({
        files: { ...s.files, [name]: content },
        ...(s.errorFile === name ? { errorFile: null, errorLine: null, errorMessage: null } : {}),
      }));
    },

    dismissError: () => set({ errorFile: null, errorLine: null, errorMessage: null }),

    createFile: () => {
      const name = nextScriptName(Object.keys(get().files));
      set((s) => ({ files: { ...s.files, [name]: '' } }));
      return name;
    },

    deleteFile: (name) => {
      const s = get();
      if (isFileActive(s, name)) send({ type: 'STOP_ALL' });
      const files = { ...s.files };
      delete files[name];
      set({
        files,
        ...(s.entryFile === name ? { entryFile: null } : {}),
        ...(s.errorFile === name ? { errorFile: null, errorLine: null, errorMessage: null } : {}),
      });
    },

    renameFile: (from, to) => {
      const s = get();
      if (from === to || !(from in s.files) || to in s.files) return;
      const files: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.files)) files[k === from ? to : k] = v;
      const swap = (f: string | null): string | null => (f === from ? to : f);
      set({ files, entryFile: swap(s.entryFile), errorFile: swap(s.errorFile), execFile: swap(s.execFile) });
    },

    run: (file) => {
      const s = get();
      if (s.entryFile === file && s.runState === 'paused') send({ type: 'PAUSE', paused: false });
      else if (!(s.entryFile === file && s.runState === 'running')) start(file, false);
    },

    step: (file) => {
      const s = get();
      if (s.entryFile === file && s.runState === 'paused') send({ type: 'STEP_TICK' });
      else if (s.entryFile === file && s.runState === 'running') send({ type: 'PAUSE', paused: true });
      else start(file, true);
    },

    togglePause: (file) => {
      const s = get();
      if (s.entryFile === file && s.runState === 'running') send({ type: 'PAUSE', paused: true });
      else get().run(file);
    },

    pause: () => send({ type: 'PAUSE', paused: true }),

    stop: () => send({ type: 'STOP_ALL' }),

    setSpeed: (multiplier) => {
      set({ speed: multiplier });
      persist();
      send({ type: 'SET_SPEED_MULTIPLIER', multiplier });
    },

    setHighlightActiveLine: (enabled) => {
      set({ highlightActiveLine: enabled });
      persist();
    },

    setEditorTheme: (theme) => {
      set({ editorTheme: theme });
      persist();
    },

    setVolume: (volume) => {
      const v = Math.min(1, Math.max(0, volume));
      set({ volume: v });
      soundManager.setVolume(v);
      persist();
    },

    startLeaderboard: (boardId, file, speedup) => {
      set({ entryFile: file, errorFile: null, errorLine: null, errorMessage: null });
      send({ type: 'SYNC_FILES', files: get().files }, { type: 'START_LEADERBOARD', boardId, file, speedup });
    },

    clearConsole: () => {
      consoleBuffer.clear();
      set((s) => ({ consoleVersion: s.consoleVersion + 1 }));
    },

    setFps: (fps) => {
      if (fps !== get().fps) set({ fps });
    },
  };
});

function pushConsole(droneId: number, text: string, tick: number, kind?: 'log' | 'system' | 'error'): void {
  consoleBuffer.push({ droneId, text, tick, kind: kind ?? (droneId === SYSTEM_DRONE_ID ? 'system' : 'log') });
}

let consoleFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** Las actualizaciones de la consola se agrupan (~10 Hz) para no saturar React. */
function scheduleConsoleRender(): void {
  if (consoleFlushTimer !== null) return;
  consoleFlushTimer = setTimeout(() => {
    consoleFlushTimer = null;
    useGameStore.setState((s) => ({ consoleVersion: s.consoleVersion + 1 }));
  }, 100);
}

function handleWorkerMessage(msg: WorkerToMainMessage): void {
  const state = useGameStore.getState();
  switch (msg.type) {
    case 'READY':
      useGameStore.setState({ ready: true });
      return;
    case 'STATE_SNAPSHOT': {
      const snap = msg.snapshot;
      liveSnapshot.current = snap;
      liveSnapshot.receivedAt = performance.now();
      pushSceneEvents(snap.events);
      soundManager.onEvents(snap.events);
      const primary = snap.drones[0];
      const live = (snap.runState === 'running' || snap.runState === 'paused') && primary !== undefined;
      const execFile = live ? primary.file : null;
      const execLine = live ? primary.line : null;
      const patch: Partial<GameState> = {};
      if (snap.runState !== state.runState) patch.runState = snap.runState;
      if (snap.tick !== state.tick) patch.tick = snap.tick;
      if (snap.simTime !== state.simTime) patch.simTime = snap.simTime;
      if (snap.worldSize !== state.worldSize) patch.worldSize = snap.worldSize;
      if (snap.powered !== state.powered) patch.powered = snap.powered;
      if (!sameLeaderboard(snap.leaderboard, state.leaderboard)) patch.leaderboard = snap.leaderboard;
      if (!sameSimulation(snap.simulation, state.simulation)) patch.simulation = snap.simulation;
      if (snap.achievements.length !== state.achievements.length) patch.achievements = snap.achievements;
      if (execFile !== state.execFile) patch.execFile = execFile;
      if (execLine !== state.execLine) patch.execLine = execLine;
      if (!shallowEqualRecord(snap.inventory, state.inventory)) patch.inventory = snap.inventory;
      if (!shallowEqualRecord(snap.unlocks, state.unlocks)) patch.unlocks = snap.unlocks;
      if (Object.keys(patch).length > 0) useGameStore.setState(patch);
      return;
    }
    case 'CONSOLE_LOG':
      pushConsole(msg.droneId, msg.message, msg.tick);
      scheduleConsoleRender();
      return;
    case 'CONSOLE_BATCH':
      if (msg.dropped > 0) pushConsole(SYSTEM_DRONE_ID, `… ${msg.dropped} líneas omitidas por exceso de salida`, msg.lines[0]?.tick ?? 0);
      for (const line of msg.lines) pushConsole(line.droneId, line.message, line.tick);
      scheduleConsoleRender();
      return;
    case 'RUNTIME_ERROR': {
      soundManager.play('error');
      const where = msg.line > 0 ? `${msg.file}, línea ${msg.line}` : msg.file;
      const who = msg.droneId > 0 ? ` [dron ${msg.droneId}]` : '';
      pushConsole(msg.droneId, `✖ ${where}${who} · ${msg.error}`, liveSnapshot.current?.tick ?? 0, 'error');
      scheduleConsoleRender();
      useGameStore.setState({ errorFile: msg.file, errorLine: msg.line > 0 ? msg.line : null, errorMessage: msg.error });
      return;
    }
    case 'ACHIEVEMENT_UNLOCKED':
      pushConsole(SYSTEM_DRONE_ID, `★ Logro desbloqueado: ${msg.achievementId}`, liveSnapshot.current?.tick ?? 0);
      scheduleConsoleRender();
      useGameStore.setState({ achievement: { id: msg.achievementId, at: Date.now() } });
      return;
    case 'LEADERBOARD_RESULT':
      handleLeaderboardResult(msg.result);
      return;
    case 'SAVE_REQUIRED': {
      useGameStore.setState({ stats: msg.state.stats });
      const slot: SaveSlot = { slotId: AUTOSAVE_SLOT, seed: msg.state.seed, worldState: msg.state, updatedAt: Date.now() };
      void backend?.putSave(slot).catch((err: unknown) => console.warn('No se pudo guardar la partida', err));
      return;
    }
  }
}

function sameSimulation(a: SimulationStatus | null, b: SimulationStatus | null): boolean {
  if (a === null || b === null) return a === b;
  return a.file === b.file && a.ticks === b.ticks && a.speedup === b.speedup;
}

function sameLeaderboard(a: LeaderboardStatus | null, b: LeaderboardStatus | null): boolean {
  if (a === null || b === null) return a === b;
  return a.boardId === b.boardId && a.progress === b.progress && a.file === b.file;
}

/** Guarda la marca si mejora la anterior y muestra el aviso (los fallidos solo se avisan). */
function handleLeaderboardResult(result: LeaderboardResult): void {
  const state = useGameStore.getState();
  const board = findLeaderboard(result.boardId);
  const seed = board?.seed ?? 0;
  const outcome = mergeRecord(state.records[result.boardId], result, Date.now(), seed);
  if (outcome) {
    useGameStore.setState({ records: { ...state.records, [result.boardId]: outcome.entry } });
    void backend?.putLeaderboard(outcome.entry).catch((err: unknown) => console.warn('No se pudo guardar la marca', err));
    if (outcome.improved) {
      pushConsole(SYSTEM_DRONE_ID, `🏆 Nueva marca en «${board?.name ?? result.boardId}»: ${formatTicks(result.ticks)}`, liveSnapshot.current?.tick ?? 0);
      scheduleConsoleRender();
      soundManager.play('record');
    }
  }
  useGameStore.setState({
    lastResult: { ...result, improved: outcome?.improved ?? false, previous: outcome?.previous ?? null, at: Date.now() },
  });
}

// ------------------------------------------------------------------ arranque y guardado

let backend: PersistenceBackend | null = null;
let fileSync: FileSync | null = null;
let booting: Promise<void> | null = null;

/**
 * Arranca la partida: carga de IndexedDB los archivos `.py` y el autoguardado, crea las ventanas
 * (con la disposición guardada) e inicia el Worker con el estado restaurado.
 */
export function bootGame(viewport: Viewport): Promise<void> {
  booting ??= boot(viewport);
  return booting;
}

async function boot(viewport: Viewport): Promise<void> {
  let stored: StoredFile[] = [];
  let save: SaveSlot | undefined;
  let boards: LeaderboardEntry[] = [];
  try {
    backend = createIdbBackend();
    [stored, save, boards] = await Promise.all([backend.loadFiles(), backend.loadSave(AUTOSAVE_SLOT), backend.loadLeaderboards()]);
  } catch (err) {
    console.warn('IndexedDB no está disponible: la partida no se guardará entre sesiones.', err);
    backend = createMemoryBackend();
  }
  useGameStore.setState({
    records: Object.fromEntries(boards.map((b) => [b.boardId, b])),
    stats: save?.worldState.stats ?? null,
  });
  soundManager.setVolume(useGameStore.getState().volume);
  const files: Record<string, string> =
    stored.length > 0 ? Object.fromEntries(stored.map((f) => [f.name, f.content])) : { [DEFAULT_FILE]: DEFAULT_SCRIPT };
  useGameStore.setState({ files });

  fileSync = new FileSync(backend);
  if (stored.length > 0) fileSync.setBaseline(files);
  else fileSync.update(files);
  useGameStore.subscribe((next, prev) => {
    if (next.files !== prev.files) fileSync?.update(next.files);
  });
  window.addEventListener('pagehide', () => void fileSync?.flush());

  useWindowStore.getState().init(viewport, Object.keys(files), loadSavedLayout());

  client = new SimulationClient(handleWorkerMessage, (reason) => {
    pushConsole(SYSTEM_DRONE_ID, `✖ El simulador se detuvo inesperadamente: ${reason}`, 0, 'error');
    scheduleConsoleRender();
  });
  const seed = save?.seed ?? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  client.send({ type: 'INIT_GAME', seed, savedState: save?.worldState });
  client.send({ type: 'SET_SPEED_MULTIPLIER', multiplier: useGameStore.getState().speed });
  client.send({ type: 'SYNC_FILES', files });
  pushConsole(SYSTEM_DRONE_ID, save ? 'Partida restaurada.' : 'Partida nueva.', 0);
  scheduleConsoleRender();
}

/** Compra el siguiente nivel de una tecnología desde la vista del árbol. */
export function unlockTech(techId: string): void {
  client?.send({ type: 'UNLOCK_TECH', techId });
}

/** Borra archivos, partida y disposición guardados y recarga la página. */
export async function resetGame(): Promise<void> {
  client?.send({ type: 'STOP_ALL' });
  try {
    await backend?.clear();
  } finally {
    clearSavedLayout();
    window.location.reload();
  }
}
