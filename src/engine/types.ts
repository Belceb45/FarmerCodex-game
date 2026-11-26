/** Tipos base del motor. TypeScript puro: sin DOM. */

export enum GroundType {
  Grassland = 'Grassland',
  Soil = 'Soil',
}

/** Las 12 entidades del doc 02 (los subsistemas de la Fase 3 viven en engine/subsystems). */
export const ENTITY_KINDS = [
  'Grass',
  'Bush',
  'Tree',
  'Carrot',
  'Pumpkin',
  'Dead_Pumpkin',
  'Sunflower',
  'Cactus',
  'Hedge',
  'Treasure',
  'Apple',
  'Dinosaur',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ITEM_KINDS = [
  'Hay',
  'Wood',
  'Carrot',
  'Water',
  'Fertilizer',
  'Weird_Substance',
  'Pumpkin',
  'Power',
  'Cactus',
  'Gold',
  'Bone',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Tecnologías del árbol (enum Unlocks del DSL); sus costos y efectos están en techTree.json. */
export const UNLOCK_KINDS = [
  'Grass',
  'Speed',
  'Expand',
  'Plant',
  'Trees',
  'Carrots',
  'Watering',
  'Fertilizer',
  'Pumpkins',
  'Sunflowers',
  'Cactus',
  'Dinosaurs',
  'Mazes',
  'Polyculture',
  'Megafarm',
  'Leaderboard',
  'Top_Hat',
] as const;
export type UnlockKind = (typeof UNLOCK_KINDS)[number];

/** Los 16 marcadores locales (doc 02 §4: enum Leaderboards). */
export const LEADERBOARD_KINDS = [
  'Cactus',
  'Cactus_Single',
  'Carrots',
  'Carrots_Single',
  'Dinosaur',
  'Fastest_Reset',
  'Hay',
  'Hay_Single',
  'Maze',
  'Maze_Single',
  'Pumpkins',
  'Pumpkins_Single',
  'Sunflowers',
  'Sunflowers_Single',
  'Wood',
  'Wood_Single',
] as const;
export type LeaderboardKind = (typeof LEADERBOARD_KINDS)[number];

export const GROUND_KINDS = [GroundType.Grassland, GroundType.Soil] as const;

/** Sombreros cosméticos del dron (se cambian con change_hat). */
export const HAT_KINDS = [
  'Farmer_Cap',
  'Bucket_Hat',
  'Beanie',
  'Propeller_Beanie',
  'Flower_Crown',
  'Sprout_Pot',
  'Hay_Bale',
  'Carrot_Top',
  'Pumpkin_Helmet',
  'Cactus_Pot',
  'Gold_Crown',
  'Top_Hat',
  'Wizard_Hat',
  'Hard_Hat',
  'Chef_Hat',
  'Viking_Helmet',
  'Party_Hat',
  /** Activa el modo Dinosaurio (Fase 3). */
  'Dinosaur_Hat',
] as const;
export type HatKind = (typeof HAT_KINDS)[number];
/** Sombrero con el que empieza cada dron. */
export const DEFAULT_HAT: HatKind = 'Farmer_Cap';

export const DIRECTIONS = ['North', 'East', 'South', 'West'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Origen (0, 0) en la esquina Sur-Oeste: North = y + 1, East = x + 1. */
export const DIRECTION_DELTAS: Readonly<Record<Direction, { readonly dx: number; readonly dy: number }>> = {
  North: { dx: 0, dy: 1 },
  East: { dx: 1, dy: 0 },
  South: { dx: 0, dy: -1 },
  West: { dx: -1, dy: 0 },
};

export interface TileState {
  x: number;
  y: number;
  ground: GroundType;
  entity: EntityKind | null;
  /** 0.0 a 1.0 (1.0 = madura). */
  growthProgress: number;
  /** Segundos simulados requeridos para madurar esta instancia. */
  growthDuration: number;
  /** Humedad 0.0 a 1.0: acelera el crecimiento y se evapora con el tiempo simulado. */
  waterLevel: number;
  isInfected: boolean;
  /** Solo Sunflower: pétalos (7..15). */
  petals?: number;
  /** Solo Cactus: tamaño (0..9). */
  cactusSize?: number;
  /** Policultivo: planta que esta quiere en la casilla (x, y). */
  companion?: { entity: EntityKind; x: number; y: number };
  /** Laberinto: muros de la casilla (N=1, E=2, S=4, W=8). */
  mazeWalls?: number;
  /** Megacalabaza a la que pertenece: esquina Sur-Oeste y lado. */
  mega?: { x: number; y: number; size: number };
}

export type DroneActionKind =
  | 'move'
  | 'harvest'
  | 'till'
  | 'plant'
  | 'use'
  | 'unlock'
  | 'swap'
  | 'print'
  | 'hat'
  | 'pet'
  | 'spawn'
  | 'flip'
  | 'clear';

/** Acción física en curso, expuesta al renderizador para interpolar. Coordenadas destino sin envolver. */
export interface DroneActionVisual {
  kind: DroneActionKind;
  startTick: number;
  endTick: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  text?: string;
}

/** Cuerpo físico de un dron: persiste entre ejecuciones (sombrero incluido); cada Run recrea la VM y empieza en (0, 0). */
export interface DroneBody {
  id: number;
  x: number;
  y: number;
  action: DroneActionVisual | null;
  hat: HatKind;
}

export type SimEvent =
  | { kind: 'harvest'; tick: number; x: number; y: number; mature: boolean; items: Record<string, number> }
  | { kind: 'till'; tick: number; x: number; y: number; ground: GroundType }
  | { kind: 'print'; tick: number; droneId: number; x: number; y: number; text: string }
  | { kind: 'hat'; tick: number; droneId: number; x: number; y: number; hat: HatKind }
  | { kind: 'pet'; tick: number; droneId: number; x: number; y: number }
  | { kind: 'plant'; tick: number; x: number; y: number; entity: EntityKind }
  | { kind: 'water'; tick: number; x: number; y: number }
  | { kind: 'fertilize'; tick: number; x: number; y: number }
  | { kind: 'unlock'; tick: number; x: number; y: number; tech: string; level: number }
  | { kind: 'achievement'; tick: number; x: number; y: number; id: string }
  | { kind: 'swap'; tick: number; x: number; y: number; toX: number; toY: number }
  | { kind: 'pumpkin'; tick: number; x: number; y: number; dead: boolean; mega: number }
  | { kind: 'maze'; tick: number; x: number; y: number; phase: 'start' | 'recycle' | 'relocated' | 'end' }
  | { kind: 'dino'; tick: number; x: number; y: number; phase: 'start' | 'eat' | 'end'; length: number }
  | { kind: 'clear'; tick: number; x: number; y: number }
  | { kind: 'spawn'; tick: number; droneId: number; x: number; y: number }
  | { kind: 'flip'; tick: number; droneId: number; x: number; y: number };

/** Códigos numéricos compactos para los arreglos planos del snapshot. */
export const GROUND_CODE: Readonly<Record<GroundType, number>> = {
  [GroundType.Grassland]: 0,
  [GroundType.Soil]: 1,
};

export function entityCode(entity: EntityKind | null): number {
  return entity === null ? 0 : ENTITY_KINDS.indexOf(entity) + 1;
}

export function entityFromCode(code: number): EntityKind | null {
  return code === 0 ? null : (ENTITY_KINDS[code - 1] ?? null);
}

export function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

export function isHatKind(value: unknown): value is HatKind {
  return typeof value === 'string' && (HAT_KINDS as readonly string[]).includes(value);
}

export function isGroundType(value: string): value is GroundType {
  return value === GroundType.Grassland || value === GroundType.Soil;
}
