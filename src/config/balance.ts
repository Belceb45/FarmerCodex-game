import raw from './balance.json';

/** Parámetros de una entidad cultivable. Todos los valores salen de balance.json. */
export interface EntityBalance {
  /** Duración media de crecimiento en segundos simulados. */
  growthSec: number;
  /** Variación relativa (±) aplicada con el PRNG a cada instancia. */
  growthVariance: number;
  /** Ítems entregados al cosechar una instancia madura. */
  yield: Record<string, number>;
  /** Suelos sobre los que la entidad puede existir. */
  validGrounds: string[];
  /** Suelos sobre los que aparece sola cuando la casilla queda vacía. */
  autoSpawnOn: string[];
  /** Si rebrota en la misma casilla tras una cosecha madura. */
  regrowsAfterHarvest: boolean;
  /** Recursos que plant() descuenta del inventario. */
  plantCost: Record<string, number>;
  /** Ralentización por cada vecino ortogonal de la misma especie (solo Tree). */
  adjacentSlowdown?: number;
  /** false para entidades que no se siembran con plant() (setos, tesoro, manzana, cola…). */
  plantable?: boolean;
}

export interface BalanceConfig {
  ticks: {
    physicalActionSuccess: number;
    physicalActionFail: number;
    baseTicksPerSecond: number;
    /** Con Items.Power, cada dron trabaja este múltiplo de ticks por tick del mundo. */
    powerSpeedMultiplier: number;
    /** Power que gasta cada dron activo por tick mientras le quede energía. */
    powerCostPerDroneTick: number;
  };
  operations: {
    arithmetic: number;
    logic: number;
    comparison: number;
    subscript: number;
    functionCall: number;
    loopIteration: number;
  };
  /** Costo en ticks por builtin; `default` aplica a los que no aparecen y `method` a métodos de listas/dicts/sets. */
  builtinCosts: Record<string, number>;
  world: {
    minSize: number;
    maxSize: number;
    /** Lado mínimo que acepta set_world_size() (doc 02). */
    minSizeLimit: number;
    startWithMatureGrass: boolean;
  };
  water: {
    /** Cada cuántos segundos simulados se tira la evaporación. */
    evaporationIntervalSec: number;
    /** Probabilidad (PRNG) de que una casilla húmeda pierda humedad en cada intervalo. */
    evaporationChance: number;
    evaporationAmount: number;
    /** Humedad mínima en todas las casillas para el logro Mud Farm. */
    mudFarmThreshold: number;
    /** Humedad que añade cada unidad de agua. */
    amountPerUse: number;
    /** Aceleración del crecimiento con humedad 1.0 (multiplicador = 1 + humedad · bonus). */
    growthBonusAtFull: number;
    tankCapacityPerLevel: number;
    refillPerSecPerLevel: number;
  };
  fertilizer: {
    growthReductionSec: number;
    infectedWeirdSubstanceRatio: number;
    capacityPerLevel: number;
    refillPerSecPerLevel: number;
  };
  pumpkin: {
    /** Probabilidad de que una calabaza muera al madurar. */
    deathRate: number;
    /** Lado máximo con rendimiento cúbico en el modo capped_cubic. */
    maxCubicMergeSize: number;
    formulaMode: 'capped_cubic' | 'pure_cubic';
  };
  sunflower: {
    minPetals: number;
    maxPetals: number;
    /** Girasoles necesarios en la granja para la bonificación. */
    minCountForBonus: number;
    powerMultiplier: number;
    /** Cosechar uno que no es el máximo deja la siguiente cosecha a potencia normal. */
    earlyHarvestResetToNormal: boolean;
  };
  cactus: {
    minSize: number;
    maxSize: number;
    growthDurationSec: number;
    formulaMode: 'quadratic' | 'sqrt_scaled';
  };
  polyculture: {
    baseMultiplier: number;
    maxMultiplier: number;
    /** Distancia Manhattan máxima del compañero. */
    companionRadius: number;
  };
  maze: {
    maxRecycleCount: number;
    relocateTicks: number;
    /** Weird_Substance mínima por casilla de lado para crear o reciclar el laberinto. */
    substancePerSide: number;
    goldPerSide: number;
  };
  dinosaur: {
    tailSegmentGrowthSec: number;
    /** Huesos por cada unidad de largo² de la cola. */
    bonePerSquare: number;
  };
  entities: Record<string, EntityBalance>;
}

export const DEFAULT_BALANCE: BalanceConfig = raw as BalanceConfig;

/** Copia profunda del balance, útil para pruebas que alteran parámetros sin tocar el JSON. */
export function cloneBalance(base: BalanceConfig = DEFAULT_BALANCE): BalanceConfig {
  return JSON.parse(JSON.stringify(base)) as BalanceConfig;
}

export function builtinCost(balance: BalanceConfig, name: string): number {
  const costs = balance.builtinCosts;
  const value = costs[name];
  return value !== undefined ? value : (costs['default'] ?? 1);
}
