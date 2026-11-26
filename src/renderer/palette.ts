/**
 * Paleta de la granja. Terreno, cultivos, sombras e interfaz según el doc 05; la isla usa
 * colores propios (arcilla rojiza y piedra pizarra) y el dron, el perro y los sombreros son diseño propio.
 */
export const PALETTE = {
  glow: 0xffffff,

  // Isla flotante (colores cambiados respecto al doc 05).
  islandLip: 0x5b681b,
  islandLipLight: 0x6f7f22,
  dirtTop: 0xa95c3b,
  dirtMid: 0x8d4a2e,
  dirtDeep: 0x6c3824,
  rock: 0x75838f,
  rockDark: 0x56616c,
  rockLight: 0x9ba8b4,
  /** Separadores oscuros entre casillas (doc 05: #3D2914). */
  slot: 0x3d2914,

  // Suelos (doc 05).
  grassland: 0x7e8e28,
  soil: 0xa6672b,
  soilRidge: 0xb57437,
  soilWet: 0x6e3f18,

  /** Grassland empapado: se oscurece con la humedad igual que Soil. */
  grasslandWet: 0x4e5a16,

  // Cultivos de la Fase 2 (doc 05/06).
  bush: 0x7e992b,
  foliage: 0x8ca632,
  foliageLight: 0xa8c443,
  foliageDark: 0x5b701c,
  berry: 0xe8e2b8,
  trunk: 0x4d2b12,
  trunkLight: 0x693d1c,
  carrot: 0xe68526,
  carrotLight: 0xf29a3c,
  carrotDark: 0xb85f12,
  carrotLeaf: 0x6e8f2e,
  carrotLeafLight: 0x8cb03a,
  sproutStem: 0x7a5a2c,
  sproutLeaf: 0x8cb03a,
  weird: 0x9b4a8b,
  weirdLight: 0xc76bb5,
  weirdDark: 0x6e2d61,
  waterDrop: 0x8fd3ff,

  // Calabazas (doc 05): #F7BC4A / #D98C26 / #FFD470; muerta #5E3C1E / #3B2410 / #8C6239.
  pumpkin: 0xf7bc4a,
  pumpkinDark: 0xd98c26,
  pumpkinLight: 0xffd470,
  pumpkinStem: 0x6b7f2a,
  deadPumpkin: 0x5e3c1e,
  deadPumpkinDark: 0x3b2410,
  deadPumpkinLight: 0x8c6239,

  // Girasol: tallo verde, disco marrón y pétalos amarillos brillantes (doc 06).
  sunStem: 0x5f8f2e,
  sunLeaf: 0x77a83a,
  sunPetal: 0xf6c431,
  sunPetalLight: 0xffdc5a,
  sunDisc: 0x5a3416,
  sunDiscLight: 0x7a4a22,

  // Cactus verde esmeralda; marrón #8B6239 cuando está mal ordenado (doc 06).
  cactus: 0x2f9a5c,
  cactusDark: 0x23784a,
  cactusLight: 0x49b877,
  cactusUnsorted: 0x8b6239,
  cactusUnsortedDark: 0x6e4b2a,
  cactusUnsortedLight: 0xa57a4c,
  cactusFlower: 0xf08fb0,

  // Laberinto: seto verde oscuro y cofre dorado/marrón.
  hedge: 0x3e6a2a,
  hedgeDark: 0x2e5220,
  hedgeLight: 0x56873a,
  chestWood: 0x8a5a2b,
  chestWoodDark: 0x5e3b1b,
  chestGold: 0xe9b949,
  chestGoldLight: 0xf8dc7a,

  // Modo Dinosaurio: manzana roja facetada y cola con los colores del Dinosaur_Hat.
  apple: 0xd6362f,
  appleDark: 0xa82620,
  appleLight: 0xef5a4c,
  appleStem: 0x5b3a1e,
  appleLeaf: 0x6e9a35,
  dino: 0x5f9e4a,
  dinoDark: 0x4a8139,
  dinoLight: 0x74b45c,
  dinoBelly: 0xd9d48c,
  dinoSpike: 0xe5843a,

  // Pasto: brota verde (follaje #8CA632) y madura dorado (#D8AA3C / #A67B20 / #ECC45A).
  bladeYoung: 0x8ca632,
  bladeGrown: 0xd8aa3c,
  bladeShade: 0xa67b20,
  bladeTip: 0xecc45a,

  // Dron en X (marfil y verde azulado, no marrón).
  droneShell: 0xebe4d0,
  droneBelly: 0xc9c0aa,
  droneArm: 0x2e7a74,
  droneMotor: 0x3a4044,
  droneMotorTop: 0x50585d,
  droneBlade: 0x2a2f33,
  droneBlur: 0xdfe5e7,
  droneVisor: 0x1d3638,
  droneEyeRun: 0x7fe6c8,
  droneEyeIdle: 0xa7b5b1,
  droneEyePaused: 0xf2c552,
  droneEyeError: 0xf2785b,

  // Perro alcancía volador (cerámica tipo beagle).
  dogCream: 0xf2e4c7,
  dogBrown: 0xa0602f,
  dogEar: 0x7d4626,
  dogMuzzle: 0xfbf3e2,
  dogNose: 0x2a211c,
  dogEye: 0x241c18,
  dogCollar: 0xc63b2b,
  dogTag: 0xe9b949,
  dogSlot: 0x3a2a20,
  dogPaw: 0xd8c6a5,

  // Efectos.
  spark: 0xecc45a,
  sparkWhite: 0xffffff,
  leafBit: 0x8ca632,
  dust: 0x8c5622,
  heart: 0xe5536b,
  heartLight: 0xf59ab0,
  puff: 0xf4f1ea,
  bubble: 0xf2f4f5,
  bubbleText: 0x242424,
} as const;

/** Variación tonal determinista por casilla (±pct de brillo). */
export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(((a >> 16) & 0xff) * (1 - k) + ((b >> 16) & 0xff) * k);
  const g = Math.round(((a >> 8) & 0xff) * (1 - k) + ((b >> 8) & 0xff) * k);
  const bl = Math.round((a & 0xff) * (1 - k) + (b & 0xff) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Hash entero estable para variaciones visuales (no afecta a la simulación). */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
