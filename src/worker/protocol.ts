/** Protocolo de mensajería Hilo principal <-> Web Worker (uniones discriminadas). */
import type { DroneActionVisual, SimEvent } from '../engine/types';
import type { SerializedWorldState } from '../engine/world';

export type { SerializedWorldState };

export type RunState = 'idle' | 'running' | 'paused' | 'finished' | 'error';

export interface TileArrays {
  /** Código de suelo por casilla (ver GROUND_CODE). Índice = y * N + x. */
  ground: Uint8Array;
  /** Código de entidad (0 = vacía; ver entityCode). */
  entity: Uint8Array;
  /** Progreso de crecimiento 0..1. */
  growth: Float32Array;
  /** Humedad 0..1. */
  water: Float32Array;
  /** Bits de estado: 1 = infectada, 2 = cactus mal ordenado (se tiñe de marrón). */
  flags: Uint8Array;
  /** Pétalos (Sunflower) o tamaño (Cactus); 0 en el resto. */
  meta: Uint8Array;
  /** Muros del laberinto (N=1, E=2, S=4, W=8). */
  walls: Uint8Array;
  /** Megacalabaza: lado en su esquina Sur-Oeste, MEGA_MEMBER en el resto de sus casillas, 0 si no hay. */
  mega: Uint8Array;
  /** Policultivo: código de la entidad compañera (0 = sin compañero) y su casilla. */
  compEntity: Uint8Array;
  compX: Uint8Array;
  compY: Uint8Array;
}

/** Bits de TileArrays.flags. */
export const TILE_FLAG_INFECTED = 1;
export const TILE_FLAG_UNSORTED = 2;
/** Valor de TileArrays.mega en las casillas de una megacalabaza que no son su esquina. */
export const MEGA_MEMBER = 255;

export interface DroneSnapshot {
  id: number;
  x: number;
  y: number;
  status: 'IDLE' | 'RUNNING' | 'WAITING' | 'FINISHED' | 'ERROR';
  file: string | null;
  line: number | null;
  action: DroneActionVisual | null;
  /** Sombrero equipado (nombre de Hats). */
  hat: string;
}

/** Intento de marcador en curso (la granja mostrada es la aislada del intento). */
export interface LeaderboardStatus {
  boardId: string;
  name: string;
  file: string;
  goalItem: string;
  goalAmount: number;
  /** Recursos de la meta conseguidos hasta ahora en el intento. */
  progress: number;
}

/** simulate() en curso: la granja mostrada es la aislada de la simulación. */
export interface SimulationStatus {
  file: string;
  seed: number;
  speedup: number;
  ticks: number;
  /** Segundos simulados hasta ahora (lo que devolverá simulate() si termina en este tick). */
  simTime: number;
}

/** Resultado de un intento (o de Fastest_Reset), medido en ticks simulados. */
export interface LeaderboardResult {
  boardId: string;
  file: string;
  success: boolean;
  ticks: number;
  simTime: number;
  reason?: string;
}

export interface RenderSnapshot {
  seq: number;
  tick: number;
  simTime: number;
  /** Lado mayor de la granja (get_world_size()). */
  worldSize: number;
  width: number;
  height: number;
  /** Ritmo actual de ticks por segundo real (0 si el mundo está congelado). */
  ticksPerSecond: number;
  speedMultiplier: number;
  /** Los drones van acelerados por Items.Power. */
  powered: boolean;
  /** Modo Dinosaurio: segmentos de la cola en orden (del más cercano a la cabeza al último). */
  dino: { droneId: number; tail: [number, number][] } | null;
  runState: RunState;
  /** Intento de marcador en curso, o null en la partida principal. */
  leaderboard: LeaderboardStatus | null;
  /** simulate() en curso, o null. */
  simulation: SimulationStatus | null;
  tiles: TileArrays;
  drones: DroneSnapshot[];
  inventory: Record<string, number>;
  /** Nivel de cada tecnología del árbol (siempre los de la partida principal). */
  unlocks: Record<string, number>;
  /** Logros de la partida principal. */
  achievements: string[];
  events: SimEvent[];
}

export interface ConsoleLine {
  droneId: number;
  message: string;
  tick: number;
}

export type MainToWorkerMessage =
  | { type: 'INIT_GAME'; seed: number; savedState?: SerializedWorldState; worldSize?: number }
  | { type: 'SYNC_FILES'; files: Record<string, string> }
  | { type: 'RUN_SCRIPT'; entryFile: string; startPaused?: boolean }
  | { type: 'STOP_ALL' }
  | { type: 'PAUSE'; paused: boolean }
  | { type: 'STEP_TICK'; ticks?: number }
  | { type: 'SET_SPEED_MULTIPLIER'; multiplier: number }
  | { type: 'SET_WORLD_SIZE'; size: number }
  | { type: 'UNLOCK_TECH'; techId: string }
  | { type: 'START_LEADERBOARD'; boardId: string; file: string; speedup?: number };

export type WorkerToMainMessage =
  | { type: 'READY' }
  | { type: 'STATE_SNAPSHOT'; snapshot: RenderSnapshot }
  | { type: 'CONSOLE_LOG'; droneId: number; message: string; tick: number }
  | { type: 'CONSOLE_BATCH'; lines: ConsoleLine[]; dropped: number }
  | { type: 'RUNTIME_ERROR'; droneId: number; file: string; line: number; error: string }
  | { type: 'ACHIEVEMENT_UNLOCKED'; achievementId: string }
  | { type: 'LEADERBOARD_RESULT'; result: LeaderboardResult }
  | { type: 'SAVE_REQUIRED'; state: SerializedWorldState };

/** droneId reservado para los mensajes del sistema en la consola. */
export const SYSTEM_DRONE_ID = -1;
