import type { MeshBuilder } from '../../src/renderer/iso3d';
import { DOUBLE, NO_SHADOW, ORGANIC, SOFT, type SpriteDef, type V3 } from './iso';
import { C, mix, rnd } from './palette';
import { blob, lathe, leaf, tube } from './shapes';

/**
 * Cultivos 100 % orgánicos en paleta opaca postapocalíptica (doc 05 §1, doc 06 §2): siluetas
 * irregulares, sin engranajes ni cables. Origen = centro de la casilla sobre el suelo.
 */

const LEAFY = DOUBLE | SOFT | ORGANIC;

function crop(name: string, build: (mb: MeshBuilder) => void, opts: Partial<SpriteDef> = {}): SpriteDef {
  return { name, w: 128, h: 128, ax: 64, ay: 96, outline: 1, castShadow: true, contact: [0.3, 0.3, 0.32], build, ...opts };
}

/** Sprites grandes (árbol maduro, megacalabaza): 256 × 256 con el origen en (128, 192). */
function bigCrop(name: string, build: (mb: MeshBuilder) => void, opts: Partial<SpriteDef> = {}): SpriteDef {
  return crop(name, build, { w: 256, h: 256, ax: 128, ay: 192, ...opts });
}

// ------------------------------------------------------------------ pasto

/** Brizna curva de dos tramos que se abre hacia fuera. */
function blade(mb: MeshBuilder, x: number, y: number, h: number, a: number, lean: number, w: number, base: number, tip: number): void {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const px = -sa * w;
  const py = ca * w;
  const m: V3 = [x + ca * lean * 0.35, y + sa * lean * 0.35, h * 0.55];
  const t: V3 = [x + ca * lean, y + sa * lean, h];
  mb.face([[x - px, y - py, 0], [x + px, y + py, 0], [m[0] + px * 0.6, m[1] + py * 0.6, m[2]], [m[0] - px * 0.6, m[1] - py * 0.6, m[2]]], base, DOUBLE | SOFT);
  mb.face([[m[0] - px * 0.6, m[1] - py * 0.6, m[2]], [m[0] + px * 0.6, m[1] + py * 0.6, m[2]], t], tip, DOUBLE | SOFT);
}

function grass(mb: MeshBuilder, mature: boolean): void {
  const n = mature ? 30 : 10;
  const hMax = mature ? 0.5 : 0.18;
  for (let i = 0; i < n; i++) {
    const a = rnd(i, 1) * Math.PI * 2;
    const r = Math.sqrt(rnd(i, 2)) * (mature ? 0.24 : 0.14);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.9;
    const h = hMax * (0.55 + rnd(i, 3) * 0.5);
    const tone = rnd(i, 4);
    const base = mix(C.grassDark, C.grass, 0.35 + tone * 0.4);
    const tip = mix(C.grass, C.grassLight, tone);
    blade(mb, x, y, h, a + (rnd(i, 5) - 0.5) * 0.8, h * (0.25 + rnd(i, 6) * 0.45), 0.02, base, mature && tone > 0.75 ? C.straw : tip);
  }
  if (mature) {
    // Espigas secas y dos hojas anchas de maleza.
    for (let i = 0; i < 5; i++) {
      const a = rnd(i, 9) * Math.PI * 2;
      const x = Math.cos(a) * 0.1;
      const y = Math.sin(a) * 0.08;
      const h = 0.5 + rnd(i, 10) * 0.12;
      tube(mb, [[x, y, 0], [x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, h * 0.6], [x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, h]], [0.006, 0.005, 0.004], 4, C.grassDark, { flags: NO_SHADOW, joints: false });
      mb.save();
      mb.translate(x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, h + 0.03);
      mb.scale(0.7, 0.7, 1.6);
      mb.sphere(0.022, 5, 3, C.straw, { flags: SOFT });
      mb.restore();
    }
    leaf(mb, [0.04, -0.06, 0.01], -0.9, 0.2, 0.05, 0.25, mix(C.foliageDark, C.grass, 0.5), LEAFY);
    leaf(mb, [-0.05, 0.02, 0.01], 2.4, 0.17, 0.045, 0.3, mix(C.foliage, C.grass, 0.4), LEAFY);
  }
}

// ------------------------------------------------------------------ arbusto

function bush(mb: MeshBuilder, mature: boolean): void {
  if (!mature) {
    tube(mb, [[0, 0, 0], [0.02, 0.01, 0.08], [-0.01, 0.02, 0.16]], [0.016, 0.012, 0.008], 5, C.trunk, { flags: NO_SHADOW });
    leaf(mb, [0.01, 0.01, 0.1], -0.6, 0.12, 0.04, 0.2, C.foliage, LEAFY);
    leaf(mb, [0, 0.02, 0.14], 2.2, 0.11, 0.035, 0.15, C.foliageLight, LEAFY);
    leaf(mb, [-0.01, 0.02, 0.16], 1.0, 0.08, 0.03, 0.1, C.foliageDark, LEAFY);
    return;
  }
  // Ramas leñosas asomando entre el follaje (detrás).
  const twigs: [number, number, number][] = [
    [0.7, 0.32, 0.3],
    [2.3, 0.3, 0.34],
    [4.1, 0.28, 0.26],
  ];
  twigs.forEach(([a, r, h], k) => {
    tube(mb, [[0, 0, 0.05], [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, h * 0.7], [Math.cos(a) * r, Math.sin(a) * r, h + rnd(k, 1) * 0.06]], [0.016, 0.01, 0.005], 4, C.trunkDark, { flags: NO_SHADOW, cap: null });
  });
  const blobs: [number, number, number, number][] = [
    [-0.11, 0.06, 0.15, 0.17],
    [0.12, 0.07, 0.14, 0.15],
    [0.02, -0.08, 0.15, 0.16],
    [0.0, 0.12, 0.25, 0.13],
    [-0.08, -0.04, 0.27, 0.11],
    [0.1, -0.02, 0.26, 0.1],
  ];
  blobs.forEach(([x, y, z, r], k) => {
    mb.save();
    mb.translate(x, y, z);
    blob(mb, r, C.foliage, {
      seed: 40 + k,
      amount: 0.24,
      segs: 9,
      rings: 5,
      flags: SOFT | ORGANIC,
      color: (i, j) => {
        const t = rnd(k, i, j);
        return i <= 1 ? (t < 0.6 ? C.foliageLight : C.foliage) : t < 0.55 ? C.foliage : C.foliageDark;
      },
    });
    mb.restore();
  });
  // Espinas: conos diminutos hacia fuera.
  for (let i = 0; i < 9; i++) {
    const a = rnd(i, 21) * Math.PI * 2;
    const z = 0.12 + rnd(i, 22) * 0.2;
    const r = 0.2 + rnd(i, 23) * 0.06;
    mb.save();
    mb.translate(Math.cos(a) * r, Math.sin(a) * r * 0.9, z);
    mb.rotateZ(a);
    mb.rotateY(Math.PI / 2 - 0.3);
    mb.prism(3, 0.008, 0, 0, 0.035, C.straw, { flags: NO_SHADOW });
    mb.restore();
  }
}

// ------------------------------------------------------------------ árbol

function gnarledTrunk(mb: MeshBuilder, height: number, thick: number, seed: number): V3[] {
  const pts: V3[] = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sway = Math.sin(t * 3.2 + seed) * 0.06 * height;
    pts.push([sway + (rnd(seed, i) - 0.5) * 0.03, Math.cos(t * 2.6 + seed) * 0.04 * height, t * height]);
  }
  const radii = pts.map((_, i) => thick * (1.25 - (i / steps) * 0.55));
  tube(mb, pts, radii, 7, C.trunk, { side: (_a, k) => (k % 3 === 0 ? C.trunkLight : k % 3 === 1 ? C.trunk : C.trunkDark), cap: C.trunkLight });
  // Raíces que se agarran al suelo.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + seed;
    tube(mb, [[0, 0, thick * 0.6], [Math.cos(a) * thick * 1.6, Math.sin(a) * thick * 1.6, thick * 0.15], [Math.cos(a) * thick * 2.6, Math.sin(a) * thick * 2.6, 0]], [thick * 0.5, thick * 0.35, thick * 0.15], 5, C.trunkDark, { flags: NO_SHADOW, cap: null });
  }
  return pts;
}

function canopy(mb: MeshBuilder, center: V3, r: number, count: number, seed: number): void {
  for (let k = 0; k < count; k++) {
    const a = rnd(seed, k) * Math.PI * 2;
    const d = (k === 0 ? 0 : 0.45 + rnd(seed, k, 2) * 0.35) * r;
    const rr = r * (k === 0 ? 0.8 : 0.45 + rnd(seed, k, 3) * 0.25);
    mb.save();
    mb.translate(center[0] + Math.cos(a) * d, center[1] + Math.sin(a) * d * 0.9, center[2] + (rnd(seed, k, 4) - 0.35) * r * 0.6);
    blob(mb, rr, C.foliage, {
      seed: seed * 7 + k,
      amount: 0.26,
      segs: 10,
      rings: 6,
      flags: SOFT | ORGANIC,
      color: (i, j) => {
        const t = rnd(seed, k, i, j);
        if (i <= 1) return t < 0.5 ? C.foliageLight : mix(C.foliageLight, C.grassLight, 0.4);
        return t < 0.45 ? C.foliage : t < 0.85 ? C.foliageDark : mix(C.foliage, C.grass, 0.6);
      },
    });
    mb.restore();
  }
}

function tree(mb: MeshBuilder, stage: 'sprout' | 'mid' | 'mature'): void {
  if (stage === 'sprout') {
    tube(mb, [[0, 0, 0], [0.02, 0, 0.1], [-0.01, 0.02, 0.2]], [0.022, 0.016, 0.01], 5, C.trunk, { flags: NO_SHADOW });
    leaf(mb, [0.0, 0.0, 0.12], -0.4, 0.13, 0.045, 0.2, C.foliage, LEAFY);
    leaf(mb, [-0.01, 0.02, 0.18], 2.3, 0.12, 0.04, 0.15, C.foliageLight, LEAFY);
    leaf(mb, [-0.01, 0.02, 0.2], 1.1, 0.09, 0.035, 0.05, C.foliageDark, LEAFY);
    return;
  }
  if (stage === 'mid') {
    const pts = gnarledTrunk(mb, 0.42, 0.045, 1.3);
    const top = pts[pts.length - 1];
    tube(mb, [pts[3], [pts[3][0] + 0.12, pts[3][1] - 0.02, pts[3][2] + 0.1]], [0.025, 0.012], 5, C.trunk, { flags: NO_SHADOW });
    canopy(mb, [top[0], top[1], top[2] + 0.12], 0.2, 4, 3);
    return;
  }
  const pts = gnarledTrunk(mb, 1.05, 0.085, 2.1);
  const top = pts[pts.length - 1];
  // Ramas retorcidas con su propia copa.
  const branches: [number, number, number, number][] = [
    [2, -0.9, 0.36, 0.28],
    [3, 2.2, 0.32, 0.22],
    [4, 0.6, 0.28, 0.18],
  ];
  for (const [i, a, len, rise] of branches) {
    const p = pts[i];
    const end: V3 = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len, p[2] + rise];
    tube(mb, [p, [p[0] + Math.cos(a) * len * 0.5, p[1] + Math.sin(a) * len * 0.5, p[2] + rise * 0.7], end], [0.045, 0.032, 0.02], 6, C.trunk, { side: (_a, k) => (k % 2 ? C.trunk : C.trunkDark), cap: C.trunkLight });
    canopy(mb, [end[0], end[1], end[2] + 0.1], 0.24, 3, 10 + i);
  }
  canopy(mb, [top[0], top[1], top[2] + 0.18], 0.42, 6, 7);
  // Ramitas secas sin hojas.
  tube(mb, [[top[0], top[1], top[2]], [top[0] - 0.1, top[1] + 0.05, top[2] + 0.55]], [0.02, 0.006], 4, C.trunkDark, { flags: NO_SHADOW, cap: null });
}

// ------------------------------------------------------------------ zanahoria

export function carrotRoot(mb: MeshBuilder, x: number, y: number, tilt: number, a: number, size: number, k: number, buried = false): void {
  mb.save();
  mb.translate(x, y, 0);
  mb.rotateZ(a);
  mb.rotateY(tilt);
  // Enterrada solo asoma el hombro; arrancada se ve la raíz nudosa entera.
  const profile: [number, number][] = buried
    ? [
        [0.05 * size, -0.01 * size],
        [0.056 * size, 0.035 * size],
        [0.036 * size, 0.06 * size],
      ]
    : [
        [0, -0.16 * size],
        [0.03 * size, -0.1 * size],
        [0.05 * size, 0.0],
        [0.055 * size, 0.04 * size],
        [0.035 * size, 0.06 * size],
      ];
  lathe(mb, 8, profile, C.carrot, {
    side: (j, ring) => (ring === profile.length - 2 ? mix(C.carrot, C.soilLight, 0.25) : (j + k) % 3 === 0 ? C.carrotDark : C.carrot),
    top: mix(C.carrot, C.carrotLeaf, 0.3),
    flags: ORGANIC,
    jitter: (j, ring) => (ring === 0 && !buried ? 1 : 0.85 + rnd(k, j, ring) * 0.3),
  });
  // Penacho de hojas marchitas.
  for (let l = 0; l < 5; l++) {
    const la = (l / 5) * Math.PI * 2 + k;
    leaf(mb, [0, 0, 0.055 * size], la, (0.13 + rnd(k, l) * 0.06) * size, 0.024 * size, 0.3 + rnd(k, l, 2) * 0.3, l % 2 ? C.carrotLeaf : mix(C.carrotLeaf, C.straw, 0.35), LEAFY, 0.03);
  }
  mb.restore();
}

function carrot(mb: MeshBuilder, mature: boolean): void {
  if (!mature) {
    for (let l = 0; l < 5; l++) {
      const a = (l / 5) * Math.PI * 2 + 0.4;
      leaf(mb, [0, 0, 0.0], a, 0.1 + rnd(l, 1) * 0.04, 0.02, 0.15, l % 2 ? C.carrotLeaf : mix(C.carrotLeaf, C.foliage, 0.4), LEAFY, 0.05);
    }
    return;
  }
  carrotRoot(mb, -0.13, 0.1, 0.08, 0.4, 1.1, 1, true);
  carrotRoot(mb, 0.13, 0.08, -0.06, 2.2, 1.0, 2, true);
  // Una ya arrancada, tumbada sobre la tierra.
  mb.save();
  mb.translate(-0.02, -0.14, 0.05);
  mb.rotateZ(-0.5);
  mb.rotateY(1.45);
  carrotRoot(mb, 0, 0, 0, 0, 1.15, 3);
  mb.restore();
}

// ------------------------------------------------------------------ calabazas

export function pumpkinBody(mb: MeshBuilder, r: number, h: number, seed: number, ribs = 10): void {
  lathe(
    mb,
    ribs * 2,
    [
      [r * 0.45, 0],
      [r * 0.85, h * 0.14],
      [r, h * 0.4],
      [r * 0.95, h * 0.66],
      [r * 0.7, h * 0.88],
      [r * 0.25, h],
    ],
    C.pumpkin,
    {
      // Gajos: surcos más oscuros cada dos caras y algunas cicatrices terrosas.
      side: (k, ring) => {
        const scar = rnd(seed, k, ring) > 0.9;
        if (scar) return mix(C.pumpkinDark, C.soilLight, 0.4);
        if (k % 2 === 0) return ring >= 3 ? C.pumpkin : mix(C.pumpkin, C.pumpkinDark, 0.55);
        return ring >= 3 ? C.pumpkinLight : C.pumpkin;
      },
      top: mix(C.pumpkin, C.pumpkinDark, 0.4),
      flags: ORGANIC,
      jitter: (k, ring) => (k % 2 === 0 ? 0.93 : 1.0) * (0.96 + rnd(seed, k, ring, 3) * 0.08),
    },
  );
}

export function pumpkinStem(mb: MeshBuilder, h: number, size: number): void {
  tube(mb, [[0, 0, h - 0.01], [0.02 * size, 0.01 * size, h + 0.05 * size], [0.06 * size, -0.01 * size, h + 0.08 * size]], [0.026 * size, 0.02 * size, 0.012 * size], 6, C.stem, { cap: C.straw });
}

function dryLeaves(mb: MeshBuilder, r: number, n: number, seed: number, color: number = C.carrotLeaf): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    leaf(mb, [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 0.01], a, r * (0.55 + rnd(seed, i) * 0.3), r * 0.22, 0.05, i % 2 ? color : mix(color, C.straw, 0.4), LEAFY);
  }
}

function pumpkin(mb: MeshBuilder, stage: 'sprout' | 'mature'): void {
  if (stage === 'sprout') {
    tube(mb, [[-0.08, -0.02, 0.0], [0.0, 0.0, 0.04], [0.1, 0.03, 0.02]], [0.012, 0.012, 0.01], 5, C.foliage, { flags: NO_SHADOW });
    leaf(mb, [0.0, 0.0, 0.04], 0.9, 0.14, 0.06, 0.1, C.foliage, LEAFY);
    leaf(mb, [-0.02, 0.0, 0.04], 3.4, 0.12, 0.05, 0.15, C.foliageLight, LEAFY);
    mb.save();
    mb.translate(0.1, 0.02, 0.04);
    blob(mb, 0.045, mix(C.pumpkin, C.foliage, 0.5), { seed: 3, amount: 0.1, segs: 8, rings: 4, flags: ORGANIC });
    mb.restore();
    return;
  }
  dryLeaves(mb, 0.36, 5, 0.6);
  mb.save();
  mb.rotateZ(0.3);
  pumpkinBody(mb, 0.33, 0.4, 5);
  pumpkinStem(mb, 0.4, 1);
  mb.restore();
}

/** Megacalabaza diseñada para un bloque de 2 × 2 (el renderizador la escala a N / 2). */
function pumpkinMega(mb: MeshBuilder): void {
  dryLeaves(mb, 0.95, 7, 1.7);
  mb.save();
  mb.rotateZ(0.2);
  pumpkinBody(mb, 0.92, 1.05, 9, 12);
  pumpkinStem(mb, 1.05, 2.4);
  mb.restore();
}

function deadPumpkin(mb: MeshBuilder): void {
  dryLeaves(mb, 0.36, 6, 2.2, mix(C.carrotLeaf, C.dead, 0.5));
  mb.save();
  mb.rotateZ(1.1);
  lathe(
    mb,
    14,
    [
      [0.17, 0],
      [0.31, 0.07],
      [0.33, 0.14],
      [0.26, 0.21],
      [0.14, 0.24],
      [0.05, 0.22],
    ],
    C.dead,
    {
      side: (k, ring) => (rnd(7, k, ring) > 0.85 ? C.deadDark : k % 2 ? C.dead : mix(C.dead, C.deadDark, 0.4)),
      top: C.deadDark,
      flags: ORGANIC,
      // Hundida y arrugada.
      jitter: (k, ring) => (ring === 0 ? 1 : 0.78 + rnd(11, k, ring) * 0.34),
    },
  );
  // Tallo seco quebrado.
  tube(mb, [[0.0, 0.0, 0.21], [0.05, 0.02, 0.26], [0.12, 0.0, 0.25]], [0.018, 0.014, 0.01], 5, C.deadLight, { cap: C.deadDark });
  mb.restore();
}

// ------------------------------------------------------------------ girasol

function sunflower(mb: MeshBuilder, mature: boolean): void {
  if (!mature) {
    tube(mb, [[0, 0, 0], [0.01, 0.0, 0.12], [0.03, 0.01, 0.24]], [0.016, 0.014, 0.012], 5, C.stem, { flags: NO_SHADOW });
    leaf(mb, [0.0, 0.0, 0.08], -0.5, 0.12, 0.05, 0.2, C.foliage, LEAFY);
    leaf(mb, [0.01, 0.0, 0.13], 2.4, 0.11, 0.045, 0.2, C.foliageLight, LEAFY);
    mb.save();
    mb.translate(0.03, 0.01, 0.26);
    mb.sphere(0.035, 7, 4, mix(C.foliage, C.petal, 0.3), { flags: SOFT | ORGANIC });
    mb.restore();
    return;
  }
  // Tallo curvo con hojas grandes.
  const stem: V3[] = [
    [0, 0, 0],
    [0.02, 0.0, 0.2],
    [0.0, 0.02, 0.42],
    [-0.05, 0.03, 0.58],
    [-0.1, 0.02, 0.66],
  ];
  tube(mb, stem, [0.024, 0.02, 0.018, 0.016, 0.014], 6, C.stem, { flags: NO_SHADOW });
  leaf(mb, [0.02, 0.0, 0.16], -0.7, 0.2, 0.07, 0.25, C.foliage, LEAFY);
  leaf(mb, [0.01, 0.01, 0.3], 2.5, 0.18, 0.065, 0.3, C.foliageLight, LEAFY);
  leaf(mb, [0.0, 0.02, 0.44], 0.2, 0.14, 0.05, 0.3, C.foliageDark, LEAFY);
  // Cabeza inclinada hacia el espectador (Sur-Oeste) y algo caída.
  mb.save();
  mb.translate(-0.12, 0.0, 0.68);
  mb.rotateZ(-Math.PI / 4);
  mb.rotateX(1.05);
  const disc = 0.1;
  mb.prism(14, disc * 0.85, disc * 1.05, -0.04, 0, C.stem, { top: null, flags: ORGANIC });
  const petals = 16;
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2 + rnd(k, 1) * 0.12;
    const len = 0.1 + rnd(k, 2) * 0.03;
    const w = 0.026;
    mb.save();
    mb.rotateZ(a);
    mb.translate(disc * 0.85, 0, 0.004);
    mb.rotateY(-0.15 - rnd(k, 3) * 0.3);
    mb.face(
      [
        [0, -w, 0],
        [len * 0.55, -w * 0.95, 0.005],
        [len, (rnd(k, 4) - 0.5) * 0.01, 0.012],
        [len * 0.55, w * 0.95, 0.005],
        [0, w, 0],
      ],
      k % 2 ? C.petal : mix(C.petal, C.petalDark, 0.35),
      DOUBLE | SOFT | ORGANIC,
      1,
      undefined,
      0.004,
    );
    mb.restore();
  }
  // Disco central oscuro, abultado y con pipas.
  mb.save();
  mb.translate(0, 0, 0.004);
  mb.scale(1, 1, 0.35);
  blob(mb, disc, C.disc, { seed: 5, amount: 0.05, segs: 14, rings: 4, flags: ORGANIC, color: (i, j) => ((i + j) % 3 === 0 ? mix(C.disc, C.petalDark, 0.4) : C.disc) });
  mb.restore();
  mb.restore();
}

// ------------------------------------------------------------------ cactus

/**
 * Tonos del cactus. La variante neutra (casi blanca) existe para el diagnóstico del doc 06: con
 * `tint = 0x8B6B4A` se vuelve exactamente la paleta «Cactus mal ordenado» del doc 05.
 */
interface CactusTone {
  base: number;
  dark: number;
  light: number;
  spine: number;
}
const CACTUS_GREEN: CactusTone = { base: C.cactus, dark: C.cactusDark, light: C.cactusLight, spine: 0xd8d0b0 };
const CACTUS_NEUTRAL: CactusTone = { base: 0xf2ece4, dark: 0x9c968e, light: 0xffffff, spine: 0xffffff };
let cactusTone: CactusTone = CACTUS_GREEN;

export function cactusColumn(mb: MeshBuilder, pts: V3[], r: number, seed: number): void {
  const tone = cactusTone;
  tube(mb, pts, pts.map((_, i) => r * (i === pts.length - 1 ? 0.75 : 1 - i * 0.04)), 10, tone.base, {
    side: (_a, k) => (k % 2 ? tone.base : mix(tone.base, tone.dark, 0.55)),
    cap: tone.light,
    flags: ORGANIC,
  });
  const top = pts[pts.length - 1];
  mb.save();
  mb.translate(top[0], top[1], top[2]);
  mb.scale(1, 1, 0.7);
  mb.sphere(r * 0.75, 10, 4, tone.light, { flags: ORGANIC, color: (_i, j) => (j % 2 ? tone.light : tone.base) });
  mb.restore();
  // Espinas naturales: puntitos claros en las aristas.
  for (let i = 0; i < 14; i++) {
    const t = rnd(seed, i);
    const seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
    const u = t * (pts.length - 1) - seg;
    const a = pts[seg];
    const b = pts[seg + 1];
    const p: V3 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const ang = rnd(seed, i, 2) * Math.PI * 2;
    mb.save();
    mb.translate(p[0] + Math.cos(ang) * r, p[1] + Math.sin(ang) * r, p[2]);
    mb.rotateZ(ang);
    mb.rotateY(Math.PI / 2);
    mb.prism(3, 0.004, 0, 0, 0.03, tone.spine, { flags: NO_SHADOW });
    mb.restore();
  }
}

function cactus(mb: MeshBuilder, mature: boolean, neutral = false): void {
  cactusTone = neutral ? CACTUS_NEUTRAL : CACTUS_GREEN;
  const tone = cactusTone;
  if (!mature) {
    mb.save();
    mb.scale(1, 1, 0.8);
    blob(mb, 0.1, tone.base, { seed: 2, amount: 0.06, segs: 10, rings: 5, flags: ORGANIC, color: (_i, j) => (j % 2 ? tone.base : mix(tone.base, tone.dark, 0.5)) });
    mb.restore();
    cactusTone = CACTUS_GREEN;
    return;
  }
  cactusColumn(
    mb,
    [
      [0, 0, 0],
      [0.01, 0.0, 0.3],
      [0.0, 0.01, 0.62],
      [-0.01, 0.01, 0.8],
    ],
    0.095,
    1,
  );
  // Brazos irregulares.
  cactusColumn(
    mb,
    [
      [0.08, 0.0, 0.3],
      [0.2, -0.02, 0.33],
      [0.22, -0.02, 0.5],
    ],
    0.055,
    2,
  );
  cactusColumn(
    mb,
    [
      [-0.07, 0.02, 0.44],
      [-0.17, 0.05, 0.47],
      [-0.19, 0.06, 0.6],
    ],
    0.048,
    3,
  );
  cactusTone = CACTUS_GREEN;
}

// ------------------------------------------------------------------ manzana

function apple(mb: MeshBuilder): void {
  mb.save();
  mb.translate(0, 0, 0.12);
  mb.scale(1, 1, 0.92);
  blob(mb, 0.13, C.apple, {
    seed: 8,
    amount: 0.05,
    segs: 12,
    rings: 7,
    flags: ORGANIC,
    color: (i, j) => (i <= 1 ? C.appleLight : i >= 5 ? C.appleDark : (j + i) % 4 === 0 ? mix(C.apple, C.appleLight, 0.5) : C.apple),
  });
  mb.restore();
  tube(mb, [[0, 0, 0.22], [0.01, 0.01, 0.27], [0.03, 0.0, 0.3]], [0.01, 0.008, 0.006], 4, C.trunk, { cap: C.trunkDark });
  leaf(mb, [0.02, 0.0, 0.27], -0.3, 0.1, 0.035, 0.25, mix(C.carrotLeaf, C.straw, 0.25), LEAFY, -0.02);
}

export const CROPS: SpriteDef[] = [
  crop('grass_sprout', (mb) => grass(mb, false), { contact: [0.18, 0.18, 0.25] }),
  crop('grass_mature', (mb) => grass(mb, true)),
  crop('bush_sprout', (mb) => bush(mb, false), { contact: [0.12, 0.12, 0.25] }),
  crop('bush_mature', (mb) => bush(mb, true), { contact: [0.34, 0.34, 0.38] }),
  crop('tree_sprout', (mb) => tree(mb, 'sprout'), { contact: [0.12, 0.12, 0.25] }),
  crop('tree_mid', (mb) => tree(mb, 'mid'), { contact: [0.25, 0.25, 0.32] }),
  bigCrop('tree_mature', (mb) => tree(mb, 'mature'), { contact: [0.42, 0.42, 0.38], outline: 1.2 }),
  crop('carrot_sprout', (mb) => carrot(mb, false), { contact: [0.14, 0.14, 0.22] }),
  crop('carrot_mature', (mb) => carrot(mb, true)),
  crop('pumpkin_sprout', (mb) => pumpkin(mb, 'sprout'), { contact: [0.16, 0.16, 0.22] }),
  crop('pumpkin_mature', (mb) => pumpkin(mb, 'mature'), { contact: [0.36, 0.36, 0.4] }),
  bigCrop('pumpkin_mega', pumpkinMega, { contact: [0.95, 0.95, 0.42], outline: 1.3 }),
  crop('dead_pumpkin', deadPumpkin, { contact: [0.34, 0.34, 0.35] }),
  crop('sunflower_sprout', (mb) => sunflower(mb, false), { contact: [0.14, 0.14, 0.22] }),
  crop('sunflower_mature', (mb) => sunflower(mb, true), { contact: [0.2, 0.2, 0.3] }),
  crop('cactus_sprout', (mb) => cactus(mb, false), { contact: [0.14, 0.14, 0.28] }),
  crop('cactus_mature', (mb) => cactus(mb, true), { contact: [0.2, 0.2, 0.32] }),
  // Variantes neutras para el tinte de diagnóstico (0x8B6B4A) del cactus mal ordenado.
  crop('cactus_sprout_neutral', (mb) => cactus(mb, false, true), { contact: [0.14, 0.14, 0.28] }),
  crop('cactus_mature_neutral', (mb) => cactus(mb, true, true), { contact: [0.2, 0.2, 0.32] }),
  crop('apple', apple, { contact: [0.16, 0.16, 0.35] }),
];

