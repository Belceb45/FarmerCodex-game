import data from '../config/leaderboards.json';
import type { Unlocks } from './tech';

/**
 * Los 16 marcadores locales (doc 02 §4, doc 04 Fase 4) como datos en `src/config/leaderboards.json`:
 * cada intento corre el archivo del jugador en una granja aislada con semilla fija y mide los ticks
 * simulados hasta la meta. `Fastest_Reset` mide la partida principal hasta el sombrero de copa.
 */
export interface LeaderboardDef {
  id: string;
  name: string;
  description: string;
  /** Con Megafarm (varios drones) o de un solo dron. */
  multi?: boolean;
  size?: [number, number];
  seed?: number;
  unlocks?: Unlocks;
  items?: Record<string, number>;
  goal?: { item: string; amount: number };
  /** `reset`: se mide en la partida principal (Fastest_Reset). */
  special?: 'reset';
}

const config = data as { maxTicks: number; boards: LeaderboardDef[] };

export const LEADERBOARD_DEFS: readonly LeaderboardDef[] = config.boards;
/** Límite de ticks de un intento antes de darlo por no completado. */
export const LEADERBOARD_MAX_TICKS = config.maxTicks;

export function findLeaderboard(id: string): LeaderboardDef | undefined {
  return LEADERBOARD_DEFS.find((b) => b.id === id);
}

/** ¿Se completó la meta con estas estadísticas de recursos? */
export function goalReached(board: LeaderboardDef, items: Record<string, number>): boolean {
  return board.goal !== undefined && (items[board.goal.item] ?? 0) >= board.goal.amount;
}
