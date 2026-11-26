import type { LeaderboardEntry } from '../persistence/db';
import type { LeaderboardResult } from '../worker/protocol';

/** Resultado de comparar un intento con la mejor marca guardada. */
export interface RecordOutcome {
  entry: LeaderboardEntry;
  /** Es nueva mejor marca (o la primera). */
  improved: boolean;
  previous: number | null;
}

/**
 * Combina un intento con la marca guardada del marcador: menos ticks simulados es mejor. Los
 * intentos fallidos no cuentan. `seed` es la semilla del marcador (o la de la partida en Fastest_Reset).
 */
export function mergeRecord(
  prev: LeaderboardEntry | undefined,
  result: LeaderboardResult,
  now: number,
  seed: number,
): RecordOutcome | null {
  if (!result.success) return null;
  const runs = (prev?.runs ?? 0) + 1;
  const improved = !prev || result.ticks < prev.bestTicks;
  const entry: LeaderboardEntry = improved
    ? { boardId: result.boardId, bestTicks: result.ticks, seed, achievedAt: now, file: result.file, runs }
    : { ...prev, runs };
  return { entry, improved, previous: prev ? prev.bestTicks : null };
}

/** Ticks simulados como texto: «12 345 ticks · 30.86 s». */
export function formatTicks(ticks: number, ticksPerSecond = 400): string {
  const grouped = Math.round(ticks)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ticks · ${(ticks / ticksPerSecond).toFixed(2)} s`;
}
