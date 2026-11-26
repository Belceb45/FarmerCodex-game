import type { SimEvent } from '../engine/types';

/**
 * Parte pura del sonido (sin Web Audio, se prueba en Vitest): qué suena con cada evento y el
 * *throttling* para altas velocidades (enfriamiento de 45–60 ms por categoría y 8 voces como máximo).
 */
export type SoundKind =
  | 'harvest'
  | 'thud'
  | 'plant'
  | 'till'
  | 'water'
  | 'fertilize'
  | 'swap'
  | 'spawn'
  | 'flip'
  | 'unlock'
  | 'treasure'
  | 'mega'
  | 'eat'
  | 'pet'
  | 'hat'
  | 'achievement'
  | 'record'
  | 'error';

/** Enfriamiento por categoría (ms): los sonidos repetidos a gran velocidad se descartan. */
const COOLDOWN_MS: Partial<Record<SoundKind, number>> = { harvest: 45, thud: 50, plant: 50, till: 55, water: 60, eat: 45 };
const DEFAULT_COOLDOWN_MS = 60;
/** Voces simultáneas como máximo. */
export const MAX_VOICES = 8;

/** Sonido de cada evento de la simulación (null = silencioso). */
export function soundForEvent(event: SimEvent): SoundKind | null {
  switch (event.kind) {
    case 'harvest':
      if ((event.items.Gold ?? 0) > 0) return 'treasure';
      return event.mature ? 'harvest' : 'thud';
    case 'plant':
      return 'plant';
    case 'till':
      return 'till';
    case 'water':
      return 'water';
    case 'fertilize':
      return 'fertilize';
    case 'swap':
      return 'swap';
    case 'spawn':
      return 'spawn';
    case 'flip':
      return 'flip';
    case 'unlock':
      return 'unlock';
    case 'achievement':
      return 'achievement';
    case 'pet':
      return 'pet';
    case 'hat':
      return 'hat';
    case 'pumpkin':
      return event.mega >= 2 ? 'mega' : null;
    case 'dino':
      return event.phase === 'eat' ? 'eat' : null;
    default:
      return null;
  }
}

/** Decide si una categoría puede sonar ahora (enfriamiento y tope de voces); sin dependencias de audio. */
export class SoundThrottle {
  private readonly last = new Map<SoundKind, number>();
  active = 0;

  allow(kind: SoundKind, nowMs: number, voices: number): boolean {
    const cooldown = COOLDOWN_MS[kind] ?? DEFAULT_COOLDOWN_MS;
    const prev = this.last.get(kind);
    if (prev !== undefined && nowMs - prev < cooldown) return false;
    if (this.active + voices > MAX_VOICES) return false;
    this.last.set(kind, nowMs);
    return true;
  }
}

