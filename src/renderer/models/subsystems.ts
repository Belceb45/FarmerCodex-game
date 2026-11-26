import { DOUBLE, GLOW, MeshBuilder, NO_SHADOW, SOFT, type V3 } from '../iso3d';
import { hash2, PALETTE, shade } from '../palette';
import { buildSprout, infectionSpots, SPROUT_UNTIL } from './crops';

/**
 * Entidades de la Fase 3 en low-poly (doc 06): calabaza y megacalabaza, calabaza muerta, girasol,
 * cactus (marrón si está mal ordenado), setos y cofre del laberinto, manzana y cola del dinosaurio.
 * Coordenadas absolutas del mundo.
 */

interface LatheOptions {
  side?: (k: number, ring: number) => number;
  /** Color de la tapa superior; null = abierta. */
  top?: number | null;
  flags?: number;
  /** Deformación del radio por gajo y anillo (arrugas). */
  jitter?: (k: number, ring: number) => number;
}

/** Superficie de revolución facetada: anillos [radio, z] unidos por caras (un gajo por lado). */
function lathe(mb: MeshBuilder, sides: number, profile: readonly [number, number][], color: number, opt: LatheOptions = {}): void {
  const rot = -Math.PI / 2 + Math.PI / sides;
  const rings: V3[][] = profile.map(([r, z], ri) => {
    const ring: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + (k * 2 * Math.PI) / sides;
      const rr = r * (opt.jitter ? opt.jitter(k, ri) : 1);
      ring.push([Math.cos(a) * rr, Math.sin(a) * rr, z]);
    }
    return ring;
  });
  const center: V3 = [0, 0, (profile[0][1] + profile[profile.length - 1][1]) / 2];
  const flags = opt.flags ?? 0;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      mb.face([rings[ri][k], rings[ri][j], rings[ri + 1][j], rings[ri + 1][k]], opt.side ? opt.side(k, ri) : color, flags, 1, center);
    }
  }
  if (opt.top !== null) mb.face(rings[rings.length - 1], opt.top ?? color, flags, 1, center);
}

function sprout(mb: MeshBuilder, x: number, y: number, growth: number, infected: boolean): boolean {
  if (growth >= SPROUT_UNTIL) return false;
  buildSprout(mb, x, y, growth);
  if (infected) infectionSpots(mb, x, y);
  return true;
}

// ------------------------------------------------------------------ calabazas

/** Calabaza 1×1: esfera achatada de 8 gajos con tallo; crece del 15 % al 85 % de la casilla. */
export function buildPumpkin(mb: MeshBuilder, x: number, y: number, growth: number, infected: boolean): void {
  if (sprout(mb, x, y, growth, infected)) return;
  const g = Math.min(1, growth);
  const r = (0.15 + 0.7 * g) / 2;
  const h = r * 1.15;
  mb.save();
  mb.translate(x + 0.5, y + 0.5, 0);
  mb.rotateZ(hash2(x, y) * 0.7);
  lathe(
    mb,
    8,
    [
      [0.5 * r, 0],
      [0.9 * r, 0.16 * h],
      [r, 0.42 * h],
      [0.93 * r, 0.7 * h],
      [0.62 * r, 0.92 * h],
      [0.2 * r, h],
    ],
    PALETTE.pumpkin,
    {
      side: (k, ring) => (ring >= 3 ? (k % 2 ? PALETTE.pumpkinLight : PALETTE.pumpkin) : k % 2 ? PALETTE.pumpkin : PALETTE.pumpkinDark),
      top: PALETTE.pumpkinLight,
    },
  );
  mb.save();
  mb.translate(0, 0, h - 0.008);
  mb.rotateY(0.35);
  mb.prism(5, 0.026 * (0.5 + 0.5 * g), 0.016 * (0.5 + 0.5 * g), 0, 0.05 + 0.04 * g, PALETTE.pumpkinStem, { bottom: null });
  mb.restore();
  if (growth >= 1) {
    mb.face(
      [
        [0.01, 0, h + 0.01],
        [0.06, -0.035, h + 0.03],
        [0.12, -0.01, h + 0.02],
        [0.07, 0.025, h + 0.005],
      ],
      PALETTE.carrotLeaf,
      DOUBLE | SOFT,
    );
  }
  mb.restore();
  if (infected) infectionSpots(mb, x, y);
}

/** Contorno de un cuadrado redondeado centrado en (cx, cy), recorrido antihorario, con lados subdivididos. */
function roundedSquare(cx: number, cy: number, half: number, rc: number, z: number, perSide: number): V3[] {
  const pts: V3[] = [];
  const arc = 3;
  const corners: [number, number, number][] = [
    [1, -1, -Math.PI / 2],
    [1, 1, 0],
    [-1, 1, Math.PI / 2],
    [-1, -1, Math.PI],
  ];
  const inner = half - rc;
  corners.forEach(([sx, sy, start], c) => {
    const ox = cx + inner * sx;
    const oy = cy + inner * sy;
    for (let t = 0; t <= arc; t++) {
      const a = start + (t / arc) * (Math.PI / 2);
      pts.push([ox + Math.cos(a) * rc, oy + Math.sin(a) * rc, z]);
    }
    // Lado recto hasta la siguiente esquina, subdividido para los gajos.
    const [nsx, nsy, nstart] = corners[(c + 1) % 4];
    const nx = cx + inner * nsx + Math.cos(nstart) * rc;
    const ny = cy + inner * nsy + Math.sin(nstart) * rc;
    const last = pts[pts.length - 1];
    for (let k = 1; k < perSide; k++) {
      const t = k / perSide;
      pts.push([last[0] + (nx - last[0]) * t, last[1] + (ny - last[1]) * t, z]);
    }
  });
  return pts;
}

/**
 * Megacalabaza N×N: cojín cuadrado de esquinas redondeadas con gajos en los bordes, la superficie
 * superior acolchada con rombos suaves y un tallo central. (x0, y0) es la esquina Sur-Oeste.
 */
export function buildMegaPumpkin(mb: MeshBuilder, x0: number, y0: number, n: number): void {
  const cx = x0 + n / 2;
  const cy = y0 + n / 2;
  const half = n / 2 - 0.05;
  const h = Math.min(1.7, 0.28 + 0.12 * n);
  const rc = Math.min(0.45, 0.22 + 0.04 * n);
  const per = Math.max(2, n * 2);
  const profile: [number, number][] = [
    [0.12, 0],
    [0.03, 0.22 * h],
    [0, 0.5 * h],
    [0.05, 0.8 * h],
    [0.2, h],
  ];
  const rings = profile.map(([inset, z]) => roundedSquare(cx, cy, half - inset, Math.max(0.06, rc - inset * 0.6), z, per));
  const center: V3 = [cx, cy, h / 2];
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const a = rings[ri];
    const b = rings[ri + 1];
    for (let k = 0; k < a.length; k++) {
      const j = (k + 1) % a.length;
      const light = ri >= 2;
      const col = k % 2 ? (light ? PALETTE.pumpkinLight : PALETTE.pumpkin) : light ? PALETTE.pumpkin : PALETTE.pumpkinDark;
      mb.face([a[k], a[j], b[j], b[k]], col, 0, 1, center);
    }
  }
  mb.face(rings[rings.length - 1], PALETTE.pumpkinLight, 0, 1, center);
  // Acolchado: teselado de rombos en relieve (pirámides bajas) centrados en cada casilla, más claros,
  // y en sus esquinas interiores, más oscuros (#FFD470 / #F7BC4A).
  const inset = 0.25;
  const cell = (n - 2 * inset) / n;
  const ox = x0 + inset;
  const oy = y0 + inset;
  const z = h + 0.002;
  const diamond = (px: number, py: number, rise: number, color: number) => {
    const r = cell / 2;
    const quad: V3[] = [
      [px, py - r, z],
      [px + r, py, z],
      [px, py + r, z],
      [px - r, py, z],
    ];
    const apex: V3 = [px, py, z + rise];
    for (let k = 0; k < 4; k++) mb.face([quad[k], quad[(k + 1) % 4], apex], color, NO_SHADOW, 1, [px, py, z - 0.2], 0.002);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) diamond(ox + (i + 0.5) * cell, oy + (j + 0.5) * cell, 0.045, PALETTE.pumpkinLight);
  for (let j = 1; j < n; j++) for (let i = 1; i < n; i++) diamond(ox + i * cell, oy + j * cell, 0.03, PALETTE.pumpkin);
  mb.save();
  mb.translate(cx, cy, h + 0.02);
  mb.rotateY(0.25);
  const stem = 0.05 + 0.015 * n;
  mb.prism(6, stem, stem * 0.65, -0.02, 0.1 + 0.035 * n, PALETTE.pumpkinStem, { bottom: null, side: (_a, k) => (k % 2 ? PALETTE.pumpkinStem : shade(PALETTE.pumpkinStem, 0.85)) });
  mb.restore();
}

/** Calabaza muerta: cáscara marchita, hueca y arrugada en marrón oscuro con el tallo seco caído. */
export function buildDeadPumpkin(mb: MeshBuilder, x: number, y: number): void {
  const r = 0.3;
  const h = 0.2;
  mb.save();
  mb.translate(x + 0.5, y + 0.5, 0);
  mb.rotateZ(hash2(x, y) * 2.4);
  lathe(
    mb,
    9,
    [
      [0.55 * r, 0],
      [0.95 * r, 0.22 * h],
      [r, 0.5 * h],
      [0.8 * r, 0.82 * h],
      [0.58 * r, h],
    ],
    PALETTE.deadPumpkin,
    {
      jitter: (k, ring) => (ring === 0 ? 1 : 0.8 + hash2(x * 7 + k, y * 5 + ring) * 0.32),
      side: (k, ring) => (ring === 3 && k % 3 === 0 ? PALETTE.deadPumpkinLight : k % 2 ? PALETTE.deadPumpkin : PALETTE.deadPumpkinDark),
      top: null,
    },
  );
  // Interior hueco.
  mb.disc(9, 0.5 * r, 0.62 * h, PALETTE.deadPumpkinDark, DOUBLE | NO_SHADOW, 1, 0.01);
  // Tallo seco doblado sobre el borde.
  mb.save();
  mb.translate(0.04, 0.02, h - 0.01);
  mb.rotateY(1.25);
  mb.prism(5, 0.018, 0.01, 0, 0.09, PALETTE.deadPumpkinLight, { bottom: null });
  mb.restore();
  mb.restore();
}

// ------------------------------------------------------------------ girasol

/** Girasol: tallo con hojas y cabeza mirando a la cámara con exactamente `petals` pétalos; abre al madurar. */
export function buildSunflower(mb: MeshBuilder, x: number, y: number, growth: number, petals: number, infected: boolean): void {
  if (sprout(mb, x, y, growth, infected)) return;
  const g = Math.min(1, growth);
  const mature = growth >= 1;
  const h = 0.18 + 0.58 * g;
  mb.save();
  mb.translate(x + 0.5, y + 0.55, 0);
  mb.rotateZ((hash2(x, y) - 0.5) * 0.5);
  mb.prism(5, 0.022, 0.016, 0, h, PALETTE.sunStem, { bottom: null, top: null });
  const leaves: [number, number, number][] = [
    [0.32, 0.25, 1],
    [0.56, Math.PI - 0.2, 0.85],
  ];
  for (const [t, a, k] of leaves) {
    const len = (0.07 + 0.08 * g) * k;
    mb.save();
    mb.translate(0, 0, t * h);
    mb.rotateZ(a);
    mb.face(
      [
        [0, 0, 0],
        [len * 0.45, -len * 0.28, len * 0.18],
        [len, 0, len * 0.38],
        [len * 0.45, len * 0.28, len * 0.22],
      ],
      PALETTE.sunLeaf,
      DOUBLE | SOFT,
    );
    mb.restore();
  }
  // Cabeza inclinada hacia el sur y hacia arriba (mira a la cámara).
  mb.translate(0, 0, h);
  mb.rotateX(0.8);
  const disc = 0.045 + 0.045 * g;
  const open = mature ? 1 : 0.2 + 0.45 * g;
  mb.prism(10, disc * 0.82, disc * 1.02, -0.03, 0, PALETTE.sunStem, { top: null });
  const count = Math.max(1, Math.round(petals)) || 11;
  const len = 0.045 + 0.06 * g;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2;
    const w = Math.min(0.03, (Math.PI * disc) / count + 0.006);
    mb.save();
    mb.rotateZ(a);
    mb.translate(disc * 0.78, 0, 0.002);
    mb.rotateY(-(1 - open) * 1.15);
    mb.face(
      [
        [0, -w, 0],
        [len * 0.55, -w * 0.9, 0.004],
        [len, 0, 0.008],
        [len * 0.55, w * 0.9, 0.004],
        [0, w, 0],
      ],
      k % 2 ? PALETTE.sunPetal : PALETTE.sunPetalLight,
      DOUBLE | SOFT,
      1,
      undefined,
      0.004,
    );
    mb.restore();
  }
  mb.disc(10, disc, 0.006, PALETTE.sunDisc, DOUBLE, 1, 0.01);
  mb.disc(10, disc * 0.55, 0.009, PALETTE.sunDiscLight, DOUBLE, 1, 0.02);
  mb.restore();
  if (infected) infectionSpots(mb, x, y);
}

// ------------------------------------------------------------------ cactus

/** Cactus: columna facetada con brazos, alto según `size` (0..9); marrón si está mal ordenado. */
export function buildCactus(mb: MeshBuilder, x: number, y: number, growth: number, size: number, sorted: boolean, infected: boolean): void {
  const g = Math.min(1, growth);
  const base = sorted ? PALETTE.cactus : PALETTE.cactusUnsorted;
  const dark = sorted ? PALETTE.cactusDark : PALETTE.cactusUnsortedDark;
  const light = sorted ? PALETTE.cactusLight : PALETTE.cactusUnsortedLight;
  const ribs = (_a: number, k: number) => (k % 2 ? base : dark);
  const h = 0.2 + size * 0.065;
  const r = 0.08 + size * 0.004;
  mb.save();
  mb.translate(x + 0.5, y + 0.5, 0);
  mb.scale(0.35 + 0.65 * g);
  mb.rotateZ((hash2(x, y) - 0.5) * 0.9);
  mb.prism(8, r, r, 0, h - r * 0.7, base, { side: ribs, bottom: null, top: null });
  mb.prism(8, r, r * 0.42, h - r * 0.7, h, base, { side: ribs, top: light });
  const arm = (side: number, z: number, ar: number, len: number) => {
    mb.save();
    mb.translate(side * r * 0.7, 0, z);
    mb.save();
    mb.rotateY((side * Math.PI) / 2);
    mb.prism(6, ar, ar, 0, 0.085, base, { side: ribs, bottom: null, top: null });
    mb.restore();
    mb.translate(side * 0.085, 0, 0);
    mb.prism(6, ar, ar, -ar * 0.6, len - ar * 0.6, base, { side: ribs, bottom: null, top: null });
    mb.prism(6, ar, ar * 0.4, len - ar * 0.6, len, base, { side: ribs, top: light });
    mb.restore();
  };
  if (size >= 3) arm(1, h * 0.38, r * 0.6, h * 0.3);
  if (size >= 6) arm(-1, h * 0.56, r * 0.55, h * 0.24);
  if (growth >= 1 && sorted) {
    mb.save();
    mb.translate(0, 0, h + 0.012);
    mb.scale(1, 1, 0.7);
    mb.sphere(0.03, 6, 3, PALETTE.cactusFlower, { flags: SOFT });
    mb.restore();
  }
  mb.restore();
  if (infected) infectionSpots(mb, x, y);
}

// ------------------------------------------------------------------ laberinto

/** Esquinas de la casilla que necesitan un poste para que el seto sea continuo. */
export const CORNER_SW = 1;
export const CORNER_SE = 2;
export const CORNER_NE = 4;
export const CORNER_NW = 8;

const HEDGE_HALF = 0.11;
const HEDGE_HEIGHT = 0.4;

/**
 * Setos de una casilla del laberinto: medio muro por cada lado cerrado (el vecino pone la otra mitad)
 * y postes en las esquinas donde llega algún muro, así el seto queda continuo y sin huecos.
 */
export function buildHedge(mb: MeshBuilder, x: number, y: number, walls: number, corners: number): void {
  const t = HEDGE_HALF;
  const k = 0.94 + hash2(x * 3, y * 5) * 0.12;
  const side = shade(PALETTE.hedge, k);
  const top = shade(PALETTE.hedgeLight, k);
  const box = (x0: number, y0: number, x1: number, y1: number) => mb.box(x0, y0, 0, x1, y1, HEDGE_HEIGHT, side, { top, front: shade(PALETTE.hedgeDark, k) });
  if (walls & 4) box(x, y, x + 1, y + t);
  if (walls & 1) box(x, y + 1 - t, x + 1, y + 1);
  if (walls & 8) box(x, y, x + t, y + 1);
  if (walls & 2) box(x + 1 - t, y, x + 1, y + 1);
  if (corners & CORNER_SW) box(x, y, x + t, y + t);
  if (corners & CORNER_SE) box(x + 1 - t, y, x + 1, y + t);
  if (corners & CORNER_NE) box(x + 1 - t, y + 1 - t, x + 1, y + 1);
  if (corners & CORNER_NW) box(x, y + 1 - t, x + t, y + 1);
}

/** Cofre del tesoro abierto, de madera con flejes dorados y lleno de monedas que brillan. */
export function buildTreasure(mb: MeshBuilder, x: number, y: number): void {
  const w = 0.2;
  const d = 0.13;
  const h = 0.15;
  mb.save();
  mb.translate(x + 0.5, y + 0.48, 0);
  mb.box(-w, -d, 0, w, d, h, PALETTE.chestWood, { top: PALETTE.chestWoodDark, front: PALETTE.chestWood });
  for (const bx of [-w * 0.62, w * 0.62]) mb.box(bx - 0.018, -d - 0.005, 0, bx + 0.018, d + 0.005, h + 0.003, PALETTE.chestGold);
  mb.box(-0.03, -d - 0.008, h * 0.45, 0.03, -d + 0.01, h * 0.85, PALETTE.chestGoldLight);
  // Monedas asomando.
  mb.box(-w + 0.02, -d + 0.02, h - 0.02, w - 0.02, d - 0.02, h + 0.025, PALETTE.chestGold, { top: PALETTE.chestGoldLight });
  for (let i = 0; i < 6; i++) {
    const cx = (hash2(x + i, y * 3) - 0.5) * w * 1.5;
    const cy = (hash2(x * 5, y + i) - 0.5) * d * 1.2;
    mb.save();
    mb.translate(cx, cy, h + 0.03 + hash2(i, x + y) * 0.02);
    mb.rotateX(0.5 + hash2(i * 3, x) * 0.6);
    mb.disc(7, 0.028, 0, i % 2 ? PALETTE.chestGoldLight : PALETTE.chestGold, DOUBLE | GLOW, 1, 0.01);
    mb.restore();
  }
  // Tapa abierta hacia atrás (bisagra en el borde norte).
  mb.save();
  mb.translate(0, d, h);
  mb.rotateX(-1.95);
  mb.box(-w, -2 * d, 0, w, 0, 0.05, PALETTE.chestWood, { top: PALETTE.chestWoodDark });
  for (const bx of [-w * 0.62, w * 0.62]) mb.box(bx - 0.018, -2 * d - 0.004, -0.003, bx + 0.018, 0.004, 0.054, PALETTE.chestGold);
  mb.restore();
  mb.restore();
}

// ------------------------------------------------------------------ modo Dinosaurio

/** Manzana roja facetada con tallo y hoja. */
export function buildApple(mb: MeshBuilder, x: number, y: number): void {
  const r = 0.135;
  mb.save();
  mb.translate(x + 0.5, y + 0.5, r * 0.92);
  mb.scale(1, 1, 0.9);
  mb.sphere(r, 8, 5, PALETTE.apple, {
    color: (i, j) => (i === 0 ? PALETTE.appleLight : i >= 3 ? PALETTE.appleDark : (j + i) % 2 ? PALETTE.apple : PALETTE.appleLight),
  });
  mb.restore();
  mb.save();
  mb.translate(x + 0.5, y + 0.5, r * 1.75);
  mb.rotateY(0.25);
  mb.prism(4, 0.012, 0.008, 0, 0.06, PALETTE.appleStem, { bottom: null });
  mb.face(
    [
      [0.008, 0, 0.04],
      [0.05, -0.022, 0.07],
      [0.105, 0, 0.066],
      [0.05, 0.022, 0.046],
    ],
    PALETTE.appleLeaf,
    DOUBLE | SOFT,
  );
  mb.restore();
}

/** Segmento de la cola del dinosaurio: bloque octogonal escamado con crestas naranjas. */
export function buildDinoSegment(mb: MeshBuilder, x: number, y: number, growth: number): void {
  const s = 0.45 + 0.55 * Math.min(1, growth);
  const scales = (_a: number, k: number) => (k % 2 ? PALETTE.dino : PALETTE.dinoDark);
  mb.save();
  mb.translate(x + 0.5, y + 0.5, 0);
  mb.scale(s);
  mb.prism(8, 0.29, 0.3, 0, 0.24, PALETTE.dino, { side: scales, bottom: null, top: null });
  mb.prism(8, 0.3, 0.21, 0.24, 0.33, PALETTE.dino, { side: scales, top: PALETTE.dinoLight });
  mb.box(-0.16, -0.305, 0.04, 0.16, -0.29, 0.17, PALETTE.dinoBelly);
  for (const [ox, oy] of [
    [-0.1, 0.08],
    [0.11, -0.06],
  ]) {
    mb.save();
    mb.translate(ox, oy, 0.331);
    mb.disc(6, 0.045, 0, PALETTE.dinoDark, DOUBLE | NO_SHADOW, 1, 0.01);
    mb.restore();
  }
  // Crestas: pirámides (se ven desde cualquier lado, sea cual sea el rumbo de la cola).
  for (const [oy, hh] of [
    [-0.12, 0.09],
    [0, 0.12],
    [0.12, 0.09],
  ]) {
    mb.save();
    mb.translate(0, oy, 0.33);
    mb.prism(4, 0.055, 0, 0, hh, PALETTE.dinoSpike, { rot: 0, bottom: null, side: (_a, k) => (k % 2 ? PALETTE.dinoSpike : shade(PALETTE.dinoSpike, 0.82)) });
    mb.restore();
  }
  mb.restore();
}
