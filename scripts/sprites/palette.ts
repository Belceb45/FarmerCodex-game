/**
 * Paleta oficial del doc 05 (Chatarra Postapocalíptica). Los tonos marcados como «derivado» no
 * están en la tabla y se obtienen de los oficiales para piezas que el doc describe sin color.
 */
export const C = {
  // Entorno y suelos.
  void: 0x2a3d45,
  voidDark: 0x1c2a30,
  voidLight: 0x46616e,
  iron: 0x6b584c,
  ironDark: 0x3d2f28,
  ironRust: 0x8c4a2f,
  soil: 0x4a3a2e,
  soilDark: 0x2b211a,
  soilLight: 0x634e3e,
  wet: 0x2e231b,
  wetDark: 0x1a130e,
  wetSheen: 0x4a6670,
  copper: 0xa67c52,
  copperDark: 0x5e432b,
  copperLight: 0xc9a47b,

  // Cultivos orgánicos (tonos opacos).
  grass: 0x7a7348,
  grassDark: 0x423e25,
  grassLight: 0x968e5c,
  foliage: 0x63693b,
  foliageDark: 0x34381e,
  foliageLight: 0x7d854c,
  trunk: 0x54473a,
  trunkDark: 0x2e261e,
  trunkLight: 0x6e5e4e,
  carrot: 0xb86228,
  carrotDark: 0x6e3714,
  carrotLeaf: 0x6d6639,
  pumpkin: 0xbf6e2c,
  pumpkinDark: 0x733e16,
  pumpkinLight: 0xd48a48,
  dead: 0x594d41,
  deadDark: 0x2e2720,
  deadLight: 0x736557,
  petal: 0xba9434,
  petalDark: 0x6e5419,
  disc: 0x3d3228,
  cactus: 0x546e45,
  cactusDark: 0x2d3d24,
  cactusLight: 0x718f5e,
  apple: 0x8a3636,
  appleDark: 0x4d1b1b,
  appleLight: 0xa84c4c,
  weird: 0x9b3bd1,
  weirdDark: 0x591d7d,
  weirdLight: 0xc76bff,

  // UI y acentos (doc 05/07).
  crt: 0x1e1916,
  frame: 0x574b44,
  frameDark: 0x3d2f28,
  bevel: 0x7a6354,
  amber: 0xff941a,
  brass: 0xd4a34a,
  copperBright: 0xc97834,
  copperDim: 0x8c5327,
  green: 0x4d8c57,
  alert: 0xd95b26,

  // Derivados.
  /** Madera vieja de tablas (barricadas, cofres). */
  plank: 0x6e5a44,
  plankDark: 0x3f3226,
  /** Lentes de cámara del dron. */
  lens: 0x1d2a2e,
  lensGlow: 0x7fd4c4,
  /** Hueso. */
  bone: 0xd9ccb0,
  boneDark: 0x9c8d70,
  /** Agua. */
  water: 0x4ac6e8,
  /** Raíz seca / tallos. */
  stem: 0x5e5a36,
  straw: 0xa89a62,
} as const;

/** Mezcla lineal de dos colores. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - k) + ((b >> s) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Aclara (> 1) u oscurece (< 1) un color. */
export function shade(color: number, f: number): number {
  const ch = (s: number) => Math.min(255, Math.max(0, Math.round(((color >> s) & 0xff) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Desatura un color hacia su gris (0 = igual, 1 = gris). */
export function desaturate(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const l = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
  return mix(color, (l << 16) | (l << 8) | l, t);
}

/** Hash determinista en [0, 1) para variaciones de forma (el horno no usa Math.random). */
export function rnd(...k: number[]): number {
  let h = 0x9e3779b9;
  for (const v of k) {
    h = Math.imul(h ^ Math.floor(v * 1000 + 0.5), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
