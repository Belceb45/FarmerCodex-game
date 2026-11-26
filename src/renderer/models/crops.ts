import { DOUBLE, MeshBuilder, NO_SHADOW, SOFT, type V3 } from '../iso3d';
import { hash2, mix, PALETTE, shade } from '../palette';

/**
 * Cultivos de la Fase 2 en low-poly (doc 06): arbusto de esferas facetadas, árbol de tronco
 * facetado y copa poliédrica, y zanahorias en cuadrícula 3×2. Coordenadas absolutas del mundo.
 */

export const SPROUT_UNTIL = 0.12;

/** Brote recién plantado: tallo corto con dos hojitas. */
export function buildSprout(mb: MeshBuilder, x: number, y: number, growth: number): void {
  const cx = x + 0.5;
  const cy = y + 0.48;
  const s = 0.6 + (growth / SPROUT_UNTIL) * 0.4;
  mb.save();
  mb.translate(cx, cy, 0);
  mb.scale(s);
  mb.prism(5, 0.012, 0.009, 0, 0.07, PALETTE.sproutStem, { bottom: null });
  mb.face([[0, 0, 0.06], [-0.04, -0.012, 0.085], [-0.075, 0, 0.08], [-0.035, 0.012, 0.058]], PALETTE.sproutLeaf, DOUBLE | SOFT);
  mb.face([[0, 0, 0.065], [0.035, 0.012, 0.092], [0.07, 0, 0.088], [0.034, -0.012, 0.064]], shade(PALETTE.sproutLeaf, 1.1), DOUBLE | SOFT);
  mb.restore();
}

/** Manchas moradas de infección en la base de la planta (fertilizante). */
export function infectionSpots(mb: MeshBuilder, x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    const a = hash2(x * 5 + i, y * 7 - i) * Math.PI * 2;
    const r = 0.12 + hash2(x + i * 3, y * 11 + i) * 0.16;
    mb.save();
    mb.translate(x + 0.5 + Math.cos(a) * r, y + 0.48 + Math.sin(a) * r * 0.8, 0.01);
    mb.scale(1, 1, 0.45);
    mb.sphere(0.035 + hash2(i, x + y) * 0.02, 5, 3, i % 2 ? PALETTE.weird : PALETTE.weirdLight, { flags: NO_SHADOW });
    mb.restore();
  }
}

/** Arbusto: 3 esferas facetadas agrupadas a ras de suelo; escala de 0.3 a 1.0. */
export function buildBush(mb: MeshBuilder, x: number, y: number, growth: number, infected: boolean): void {
  if (growth < SPROUT_UNTIL) {
    buildSprout(mb, x, y, growth);
    if (infected) infectionSpots(mb, x, y);
    return;
  }
  const s = 0.3 + 0.7 * Math.min(1, growth);
  const blobs: [number, number, number, number][] = [
    [-0.1, 0.04, 0.17, 0],
    [0.11, 0.06, 0.15, 1],
    [0.0, -0.07, 0.16, 2],
  ];
  for (const [ox, oy, r, k] of blobs) {
    const seed = x * 13 + y * 7 + k * 3;
    mb.save();
    mb.translate(x + 0.5 + ox * s, y + 0.48 + oy * s, r * s * 0.82);
    mb.sphere(r * s, 7, 4, PALETTE.bush, {
      jitter: (i, j) => 0.86 + hash2(seed + i, j * 5) * 0.26,
      color: (i, j) => {
        const h = hash2(seed + i * 3, j);
        return i <= 1 ? (h < 0.5 ? PALETTE.foliageLight : PALETTE.bush) : h < 0.6 ? PALETTE.bush : PALETTE.foliageDark;
      },
    });
    mb.restore();
  }
  if (growth >= 1) {
    // Bayas claras cuando está listo para cosechar.
    for (let i = 0; i < 4; i++) {
      const a = hash2(x * 3 + i, y * 5) * Math.PI * 2;
      mb.save();
      mb.translate(x + 0.5 + Math.cos(a) * 0.14, y + 0.48 + Math.sin(a) * 0.1, 0.2 + hash2(i, x) * 0.08);
      mb.sphere(0.022, 5, 3, PALETTE.berry, { flags: NO_SHADOW });
      mb.restore();
    }
  }
  if (infected) infectionSpots(mb, x, y);
}

/** Árbol: tronco facetado y copa poliédrica de dos niveles; escala uniforme de 0.3 a 1.0. */
export function buildTree(mb: MeshBuilder, x: number, y: number, growth: number, infected: boolean): void {
  if (growth < SPROUT_UNTIL) {
    buildSprout(mb, x, y, growth);
    if (infected) infectionSpots(mb, x, y);
    return;
  }
  const s = 0.3 + 0.7 * Math.min(1, growth);
  const seed = x * 31 + y * 17;
  mb.save();
  mb.translate(x + 0.5, y + 0.5, 0);
  mb.scale(s);
  mb.prism(6, 0.075, 0.055, 0, 0.42, PALETTE.trunk, {
    rot: hash2(seed, 2),
    bottom: null,
    top: PALETTE.trunkLight,
    side: (_a, k) => (k % 2 ? PALETTE.trunk : PALETTE.trunkLight),
  });
  const foliage = (i: number, j: number) => {
    const h = hash2(seed + i * 7, j * 3);
    if (i === 0) return PALETTE.foliageLight;
    return h < 0.35 ? PALETTE.foliageLight : h < 0.75 ? PALETTE.foliage : PALETTE.foliageDark;
  };
  mb.save();
  mb.translate(0, 0, 0.56);
  mb.sphere(0.3, 8, 5, PALETTE.foliage, { jitter: (i, j) => 0.86 + hash2(seed + i * 5, j * 11) * 0.24, color: foliage });
  mb.restore();
  mb.save();
  mb.translate(0.04, 0.03, 0.82);
  mb.sphere(0.19, 7, 4, PALETTE.foliage, { jitter: (i, j) => 0.85 + hash2(seed + i * 13, j * 2) * 0.25, color: foliage });
  mb.restore();
  mb.restore();
  if (infected) infectionSpots(mb, x, y);
}

/** Zanahorias: cuadrícula 3×2 con la punta naranja asomando y tres hojas cada una. */
export function buildCarrot(mb: MeshBuilder, x: number, y: number, growth: number, infected: boolean): void {
  const g = Math.min(1, growth);
  const mature = growth >= 1;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 3; i++) {
      const cx = x + 0.22 + i * 0.28;
      const cy = y + 0.32 + j * 0.34;
      const seed = x * 11 + y * 13 + i * 3 + j * 7;
      // Raíz: apenas visible al principio, el hombro naranja asoma al madurar.
      const root = 0.02 + 0.05 * g;
      mb.save();
      mb.translate(cx, cy, 0);
      mb.prism(6, 0.022 + 0.026 * g, 0.012 + 0.02 * g, -0.01, root, PALETTE.carrot, {
        rot: hash2(seed, 1),
        top: PALETTE.carrotLight,
        bottom: null,
        side: (_a, k) => (k % 2 ? PALETTE.carrot : PALETTE.carrotDark),
      });
      const leafH = 0.08 + 0.22 * g;
      for (let l = 0; l < 3; l++) {
        const a = (l / 3) * Math.PI * 2 + hash2(seed, l) * 0.8;
        const lean = 0.35 + hash2(seed + l, 3) * 0.25;
        const tip: V3 = [Math.cos(a) * leafH * lean, Math.sin(a) * leafH * lean * 0.8, root + leafH];
        const w = 0.016 + 0.01 * g;
        const px = -Math.sin(a) * w;
        const py = Math.cos(a) * w;
        const color = l === 0 ? PALETTE.carrotLeafLight : PALETTE.carrotLeaf;
        mb.face(
          [
            [px, py, root],
            [-px, -py, root],
            [tip[0] * 0.55 - px * 1.6, tip[1] * 0.55 - py * 1.6, root + leafH * 0.6],
            tip,
            [tip[0] * 0.55 + px * 1.6, tip[1] * 0.55 + py * 1.6, root + leafH * 0.6],
          ],
          mature ? shade(color, 1.05) : mix(PALETTE.sproutLeaf, color, g),
          DOUBLE | SOFT,
        );
      }
      mb.restore();
    }
  }
  if (infected) infectionSpots(mb, x, y);
}
