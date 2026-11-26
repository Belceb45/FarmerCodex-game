import data from '../config/achievements.json';
import { findTech, techLevel, type TechTree, type Unlocks } from './tech';

/**
 * Logros (doc 04, Fase 4): 59 definidos como datos en `src/config/achievements.json`. El motor
 * acumula estadísticas de por vida en el mundo y un bus de eventos las evalúa: sin lógica de
 * logros repartida por el código salvo los dos que dependen de un instante (Mud Farm, Recycling).
 */

/** Estadísticas de por vida de la partida (se guardan con ella). */
export interface WorldStats {
  /** Recursos obtenidos (no se restan al gastarlos). */
  items: Record<string, number>;
  harvests: number;
  plants: number;
  tills: number;
  moves: number;
  swaps: number;
  waters: number;
  fertilizes: number;
  infectedHarvests: number;
  deadPumpkins: number;
  maxMega: number;
  sunflowerBonuses: number;
  poweredTicks: number;
  maxCactusChain: number;
  mazes: number;
  treasures: number;
  companionHarvests: number;
  dinoRuns: number;
  maxTail: number;
  dinoTrapped: number;
  spawns: number;
  maxActiveDrones: number;
  waitedValues: number;
  pets: number;
  flips: number;
  prints: number;
  unlocks: number;
  leaderboardRuns: number;
  /** Sombreros distintos que se ha puesto algún dron. */
  hats: string[];
}

export type NumericStat = Exclude<keyof WorldStats, 'items' | 'hats'>;

export function createStats(): WorldStats {
  return {
    items: {},
    harvests: 0,
    plants: 0,
    tills: 0,
    moves: 0,
    swaps: 0,
    waters: 0,
    fertilizes: 0,
    infectedHarvests: 0,
    deadPumpkins: 0,
    maxMega: 0,
    sunflowerBonuses: 0,
    poweredTicks: 0,
    maxCactusChain: 0,
    mazes: 0,
    treasures: 0,
    companionHarvests: 0,
    dinoRuns: 0,
    maxTail: 0,
    dinoTrapped: 0,
    spawns: 0,
    maxActiveDrones: 0,
    waitedValues: 0,
    pets: 0,
    flips: 0,
    prints: 0,
    unlocks: 0,
    leaderboardRuns: 0,
    hats: [],
  };
}

/** Restaura estadísticas guardadas (las claves que falten quedan en cero). */
export function restoreStats(saved: Partial<WorldStats> | undefined): WorldStats {
  const stats = createStats();
  if (!saved) return stats;
  for (const key of Object.keys(stats) as (keyof WorldStats)[]) {
    const v = saved[key];
    if (key === 'items' && v && typeof v === 'object') stats.items = { ...(v as Record<string, number>) };
    else if (key === 'hats' && Array.isArray(v)) stats.hats = [...(v as string[])];
    else if (typeof v === 'number') (stats as unknown as Record<string, number>)[key] = v;
  }
  return stats;
}

export interface AchievementCondition {
  /** Estadística numérica (o `hatsWorn`: sombreros distintos). */
  stat?: NumericStat | 'hatsWorn';
  /** Recurso obtenido en total. */
  item?: string;
  min?: number;
  /** Nivel de una tecnología ('max' = último nivel). */
  tech?: string;
  level?: number | 'max';
  /** Todas las tecnologías al nivel máximo. */
  allTech?: boolean;
  /** Lo concede el motor en un momento concreto (Mud Farm, Recycling). */
  manual?: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  condition: AchievementCondition;
  /** Sombrero cosmético que desbloquea. */
  reward?: { hat?: string };
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = (data as { achievements: AchievementDef[] }).achievements;

export function findAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((a) => a.id === id);
}

/** Logro que regala un sombrero (si lo hay): el sombrero queda bloqueado hasta conseguirlo. */
export function achievementForHat(hat: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((a) => a.reward?.hat === hat);
}

export function statValue(stats: WorldStats, stat: NumericStat | 'hatsWorn'): number {
  return stat === 'hatsWorn' ? stats.hats.length : stats[stat];
}

/** Progreso de un logro: valor actual y objetivo (para la interfaz). */
export function achievementProgress(def: AchievementDef, stats: WorldStats, tree: TechTree, unlocks: Unlocks): { value: number; target: number } | null {
  const c = def.condition;
  if (c.item) return { value: stats.items[c.item] ?? 0, target: c.min ?? 1 };
  if (c.stat) return { value: statValue(stats, c.stat), target: c.min ?? 1 };
  if (c.tech) {
    const node = findTech(tree, c.tech);
    const target = c.level === 'max' ? (node?.levels.length ?? 1) : (c.level ?? 1);
    return { value: techLevel(unlocks, c.tech), target };
  }
  if (c.allTech) {
    const done = tree.nodes.filter((n) => techLevel(unlocks, n.id) >= n.levels.length).length;
    return { value: done, target: tree.nodes.length };
  }
  return null;
}

export function isAchieved(def: AchievementDef, stats: WorldStats, tree: TechTree, unlocks: Unlocks): boolean {
  if (def.condition.manual) return false;
  const p = achievementProgress(def, stats, tree, unlocks);
  return p !== null && p.value >= p.target;
}
