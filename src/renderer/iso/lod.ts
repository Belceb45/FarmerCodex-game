/** Degradación elegante (doc 05 §4 y doc 08 §6). */
export type LodLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export function getLodLevel(activeDrones: number, effectiveSpeed: number): LodLevel {
  if (activeDrones > 16 || effectiveSpeed > 25) return 'LOW';
  if (activeDrones > 8 || effectiveSpeed > 10) return 'MEDIUM';
  return 'HIGH';
}

/** Tope estricto de partículas activas (doc 05 §4). */
export const MAX_PARTICLES = 150;
