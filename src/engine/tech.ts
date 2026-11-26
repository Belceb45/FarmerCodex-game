import raw from '../config/techTree.json';

/** Árbol tecnológico definido en src/config/techTree.json. TypeScript puro: sin DOM. */

export interface TechLevel {
  cost: Record<string, number>;
  /** Texto del efecto del nivel (para la interfaz). */
  effect: string;
  /** Valor numérico del nivel (multiplicador de velocidad, número de depósitos…). */
  value?: number;
  /** Tamaño de la granja que da el nivel (solo Expand). */
  size?: [number, number];
}

export interface TechGrants {
  entities: string[];
  functions: string[];
  items: string[];
  hats?: string[];
}

export interface TechNode {
  id: string;
  name: string;
  icon: string;
  /** Posición en la cuadrícula de la vista del árbol. */
  pos: [number, number];
  requires: string[];
  description: string;
  /** Nivel con el que empieza la partida (por defecto 0). */
  startLevel?: number;
  /** Tamaño de la granja sin ningún nivel de Expand. */
  baseSize?: [number, number];
  grants: TechGrants;
  levels: TechLevel[];
}

export interface TechTree {
  nodes: TechNode[];
}

export const DEFAULT_TECH_TREE: TechTree = raw as unknown as TechTree;

export type Unlocks = Record<string, number>;

export function findTech(tree: TechTree, id: string): TechNode | undefined {
  return tree.nodes.find((n) => n.id === id);
}

export function initialUnlocks(tree: TechTree): Unlocks {
  const out: Unlocks = {};
  for (const node of tree.nodes) out[node.id] = node.startLevel ?? 0;
  return out;
}

export function techLevel(unlocks: Unlocks, id: string): number {
  return unlocks[id] ?? 0;
}

/** Costo del siguiente nivel, o null si el nodo no existe o ya está al máximo. */
export function nextLevel(tree: TechTree, unlocks: Unlocks, id: string): TechLevel | null {
  const node = findTech(tree, id);
  if (!node) return null;
  return node.levels[techLevel(unlocks, id)] ?? null;
}

export type UnlockCheck =
  | { ok: true; node: TechNode; level: TechLevel }
  | { ok: false; reason: 'unknown' | 'maxed' | 'requires' | 'cost'; message: string };

/** Comprueba si se puede comprar el siguiente nivel de `id` con el inventario dado. */
export function checkUnlock(
  tree: TechTree,
  unlocks: Unlocks,
  hasItems: (cost: Record<string, number>) => boolean,
  id: string,
): UnlockCheck {
  const node = findTech(tree, id);
  if (!node) return { ok: false, reason: 'unknown', message: `no existe la tecnología '${id}'` };
  const level = node.levels[techLevel(unlocks, id)];
  if (!level) return { ok: false, reason: 'maxed', message: `${node.name} ya está al nivel máximo` };
  const missing = node.requires.filter((req) => techLevel(unlocks, req) < 1);
  if (missing.length > 0) {
    const names = missing.map((m) => findTech(tree, m)?.name ?? m).join(', ');
    return { ok: false, reason: 'requires', message: `${node.name} requiere antes: ${names}` };
  }
  if (!hasItems(level.cost)) return { ok: false, reason: 'cost', message: `faltan recursos para ${node.name}` };
  return { ok: true, node, level };
}

/** Multiplicador de ticks por segundo que da el nivel de Speed. */
export function speedMultiplier(tree: TechTree, unlocks: Unlocks): number {
  const node = findTech(tree, 'Speed');
  const level = techLevel(unlocks, 'Speed');
  if (!node || level === 0) return 1;
  return node.levels[Math.min(level, node.levels.length) - 1].value ?? 1;
}

/** Tamaño (ancho, alto) de la granja según el nivel de Expand. */
export function farmSize(tree: TechTree, unlocks: Unlocks): [number, number] {
  const node = findTech(tree, 'Expand');
  if (!node) return [3, 3];
  const level = techLevel(unlocks, 'Expand');
  if (level === 0) return node.baseSize ?? [1, 1];
  return node.levels[Math.min(level, node.levels.length) - 1].size ?? node.baseSize ?? [1, 1];
}

/** Nodo que habilita una entidad, una función o el uso de un ítem (o undefined si no hace falta ninguno). */
export function techGranting(tree: TechTree, kind: keyof TechGrants, name: string): TechNode | undefined {
  return tree.nodes.find((n) => n.grants[kind]?.includes(name));
}

/** ¿Está habilitado `name` (entidad, función o ítem) con los desbloqueos actuales? */
export function isGranted(tree: TechTree, unlocks: Unlocks, kind: keyof TechGrants, name: string): boolean {
  const node = techGranting(tree, kind, name);
  return node === undefined || techLevel(unlocks, node.id) >= 1;
}

/** Multiplicador del policultivo: de baseMultiplier (nivel 1) a maxMultiplier (nivel máximo). */
export function polycultureMultiplier(tree: TechTree, unlocks: Unlocks, base: number, max: number): number {
  const node = findTech(tree, 'Polyculture');
  const level = techLevel(unlocks, 'Polyculture');
  if (!node || level < 1) return 1;
  const levels = node.levels.length;
  if (levels <= 1) return max;
  return base + ((max - base) * (Math.min(level, levels) - 1)) / (levels - 1);
}

/** Valor del nivel actual de un nodo (por ejemplo, el multiplicador de oro de Mazes). */
export function levelValue(tree: TechTree, unlocks: Unlocks, id: string, fallback = 1): number {
  const node = findTech(tree, id);
  const level = techLevel(unlocks, id);
  if (!node || level < 1) return fallback;
  return node.levels[Math.min(level, node.levels.length) - 1].value ?? fallback;
}
