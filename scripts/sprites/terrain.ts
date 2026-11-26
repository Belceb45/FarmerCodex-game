import type { MeshBuilder } from '../../src/renderer/iso3d';
import { EARTH, GLOW, METAL, NO_SHADOW, RUST, THIN, type SpriteDef, type V3 } from './iso';
import { C, mix, rnd, shade } from './palette';
import { rivet, tube } from './shapes';

/**
 * Terrenos (doc 06 §2): placas de hierro oxidado (`Grassland`), tierra labrada en marco de chapa
 * (`Soil`), capa de humedad, y la base y los bordes de la plataforma suspendida.
 */

/** Sprite de casilla estándar: 128 × 128 con el centro de la cara superior en (64, 96) = anclaje (0.5, 0.75). */
export function tileSprite(name: string, build: (mb: MeshBuilder) => void, extra?: SpriteDef['extra']): SpriteDef {
  return { name, w: 128, h: 128, ax: 64, ay: 96, outline: 0.8, build, extra };
}

/** Raya fina sobre una superficie horizontal (rayones, juntas). */
function scratch(mb: MeshBuilder, a: [number, number], b: [number, number], z: number, w: number, color: number): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w;
  const ny = (dx / l) * w;
  mb.face(
    [
      [a[0] + nx, a[1] + ny, z],
      [b[0] + nx, b[1] + ny, z],
      [b[0] - nx, b[1] - ny, z],
      [a[0] - nx, a[1] - ny, z],
    ],
    color,
    THIN | NO_SHADOW,
    1,
    undefined,
    0.004,
  );
}

const HALF = 0.44;

function grassland(mb: MeshBuilder): void {
  // Dos chapas remachadas con una junta en medio, rayones y óxido.
  const plates: [number, number, number][] = [
    [-HALF, -0.012, 0.98],
    [0.012, HALF, 1.05],
  ];
  for (const [y0, y1, k] of plates) {
    mb.box(-HALF, y0, -0.04, HALF, y1, 0, shade(C.iron, k), { flags: METAL | RUST, top: shade(C.iron, k) });
  }
  scratch(mb, [-0.3, -0.25], [0.12, -0.33], 0.0015, 0.006, shade(C.iron, 1.25));
  scratch(mb, [0.05, 0.2], [0.36, 0.06], 0.0015, 0.005, shade(C.iron, 1.2));
  scratch(mb, [-0.36, 0.3], [-0.1, 0.12], 0.0015, 0.005, shade(C.ironDark, 0.9));
  const r = 0.028;
  for (const [x, y] of [
    [-0.37, -0.37],
    [0.37, -0.37],
    [-0.37, -0.08],
    [0.37, -0.08],
    [-0.37, 0.08],
    [0.37, 0.08],
    [-0.37, 0.37],
    [0.37, 0.37],
  ]) {
    rivet(mb, x, y, 0, r, mix(C.iron, C.ironRust, 0.35), METAL | NO_SHADOW);
  }
}

function soil(mb: MeshBuilder): void {
  const o = 0.45;
  const i = 0.35;
  const frame = mix(C.iron, C.ironRust, 0.25);
  const fz0 = -0.04;
  const fz1 = 0.045;
  // Marco de chapa oxidada (cuatro barras).
  mb.box(-o, -o, fz0, o, -i, fz1, frame, { flags: METAL | RUST });
  mb.box(-o, i, fz0, o, o, fz1, frame, { flags: METAL | RUST });
  mb.box(-o, -i, fz0, -i, i, fz1, shade(frame, 0.95), { flags: METAL | RUST });
  mb.box(i, -i, fz0, o, i, fz1, shade(frame, 1.04), { flags: METAL | RUST });
  // Tierra oscura con surcos (crestas a lo largo de x).
  mb.box(-i, -i, fz0, i, i, 0.0, C.soilDark, { flags: EARTH });
  const ridges = 4;
  const step = (2 * i) / ridges;
  for (let k = 0; k < ridges; k++) {
    const y0 = -i + k * step;
    const y1 = y0 + step;
    const ym = (y0 + y1) / 2;
    const h = 0.05 + rnd(k, 3) * 0.015;
    const wob = (x: number) => (rnd(k, Math.round(x * 10)) - 0.5) * 0.012;
    const xs = [-i, -i / 3, i / 3, i];
    for (let s = 0; s < xs.length - 1; s++) {
      const xa = xs[s];
      const xb = xs[s + 1];
      const back: V3[] = [
        [xa, y1, 0],
        [xb, y1, 0],
        [xb, ym + wob(xb), h + wob(xb)],
        [xa, ym + wob(xa), h + wob(xa)],
      ];
      const front: V3[] = [
        [xa, ym + wob(xa), h + wob(xa)],
        [xb, ym + wob(xb), h + wob(xb)],
        [xb, y0, 0],
        [xa, y0, 0],
      ];
      mb.face(back, shade(C.soil, 0.85), EARTH);
      mb.face(front, shade(C.soilLight, 1.18), EARTH);
    }
  }
  // Remaches en las esquinas del marco.
  for (const [x, y] of [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ]) {
    rivet(mb, x, y, fz1, 0.022, shade(frame, 1.2), METAL | NO_SHADOW);
  }
  // Cables rotos asomando por el borde, con la punta de cobre deshilachada.
  tube(
    mb,
    [
      [0.42, -0.2, fz1],
      [0.5, -0.24, 0.07],
      [0.55, -0.18, 0.03],
    ],
    [0.012, 0.012, 0.011],
    5,
    0x2b2622,
    { flags: NO_SHADOW, cap: C.copperLight },
  );
  tube(
    mb,
    [
      [-0.24, 0.42, fz1],
      [-0.28, 0.5, 0.08],
      [-0.2, 0.55, 0.05],
    ],
    [0.011, 0.011, 0.01],
    5,
    0x4a2c22,
    { flags: NO_SHADOW, cap: C.copperLight },
  );
}

/** Capa de humedad: oscurece y deja un reflejo azulado; el renderizador regula su alpha con waterLevel. */
function waterOverlay(mb: MeshBuilder): void {
  const h = 0.45;
  mb.face(
    [
      [-h, -h, 0.002],
      [h, -h, 0.002],
      [h, h, 0.002],
      [-h, h, 0.002],
    ],
    C.wet,
    GLOW | THIN | NO_SHADOW,
    0.62,
  );
  // Charcos con reflejo del cielo.
  const puddles: [number, number, number, number][] = [
    [-0.12, -0.1, 0.16, 0.1],
    [0.18, 0.16, 0.1, 0.07],
    [-0.22, 0.24, 0.08, 0.05],
  ];
  puddles.forEach(([cx, cy, rx, ry], k) => {
    const pts: V3[] = [];
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2;
      const wob = 0.85 + rnd(k, j) * 0.3;
      pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob, 0.004]);
    }
    mb.face(pts, C.wetSheen, GLOW | THIN | NO_SHADOW, 0.5, undefined, 0.002);
  });
}

/** Base oscura bajo cada casilla: rejilla de hierro que asoma en las juntas entre placas. */
function base(mb: MeshBuilder): void {
  mb.face(
    [
      [-0.5, -0.5, 0],
      [0.5, -0.5, 0],
      [0.5, 0.5, 0],
      [-0.5, 0.5, 0],
    ],
    C.ironDark,
    GLOW | THIN | NO_SHADOW,
  );
  for (let k = -2; k <= 2; k++) {
    scratch(mb, [-0.5, k * 0.2], [0.5, k * 0.2], 0.001, 0.012, 0x2a201b);
    scratch(mb, [k * 0.2, -0.5], [k * 0.2, 0.5], 0.001, 0.012, 0x2a201b);
  }
}

const DEPTH = 0.68;

/** Pared lateral de la plataforma bajo el borde Sur (y = −0.5) o el Oeste (x = −0.5) de una casilla. */
function edge(mb: MeshBuilder, side: 's' | 'w', seed: number): void {
  mb.save();
  if (side === 'w') {
    // El borde Oeste es el Sur girado 90° alrededor del centro de la casilla.
    mb.rotateZ(-Math.PI / 2);
  }
  const wall = mix(C.iron, C.ironRust, 0.3);
  // Panel principal con dos paneles de distinto tono.
  mb.box(-0.5, -0.56, -DEPTH, 0, -0.5, -0.045, shade(wall, 0.96 + rnd(seed, 1) * 0.08), { flags: METAL | RUST });
  mb.box(0, -0.56, -DEPTH, 0.5, -0.5, -0.045, shade(wall, 0.92 + rnd(seed, 2) * 0.1), { flags: METAL | RUST });
  // Viga superior y zócalo.
  mb.box(-0.5, -0.585, -0.13, 0.5, -0.5, -0.03, mix(C.ironDark, C.iron, 0.4), { flags: METAL | RUST });
  mb.box(-0.5, -0.58, -DEPTH, 0.5, -0.5, -DEPTH + 0.07, mix(C.ironDark, C.iron, 0.3), { flags: METAL | RUST });
  // Remaches en la viga.
  for (let k = 0; k < 4; k++) rivet(mb, -0.38 + k * 0.25, -0.59, -0.08, 0.018, shade(C.iron, 1.15), METAL | NO_SHADOW);
  // Tubería de cobre a lo largo de la pared, con abrazaderas.
  mb.save();
  mb.translate(-0.5, -0.62, -0.3);
  mb.rotateY(Math.PI / 2);
  mb.prism(8, 0.035, 0.035, 0, 1.0, C.copper, { bottom: null, top: null, side: (_a, k) => (k % 2 ? C.copper : C.copperLight) });
  mb.restore();
  for (const x of [-0.3, 0.2]) mb.box(x - 0.02, -0.665, -0.345, x + 0.02, -0.56, -0.255, C.ironDark, { flags: METAL });
  // Cables colgando bajo la plataforma.
  const sag = 0.18 + rnd(seed, 5) * 0.12;
  tube(
    mb,
    [
      [-0.35, -0.53, -DEPTH],
      [-0.2, -0.56, -DEPTH - sag],
      [0.05, -0.55, -DEPTH - sag * 0.8],
      [0.25, -0.53, -DEPTH],
    ],
    [0.012, 0.012, 0.012, 0.012],
    5,
    0x262220,
    { flags: NO_SHADOW, cap: null },
  );
  if (rnd(seed, 9) > 0.45) {
    tube(
      mb,
      [
        [0.32, -0.53, -DEPTH],
        [0.36, -0.55, -DEPTH - 0.14],
        [0.33, -0.56, -DEPTH - 0.2],
      ],
      [0.011, 0.011, 0.01],
      5,
      0x3a2a20,
      { flags: NO_SHADOW, cap: C.copperLight },
    );
  }
  mb.restore();
}

function corner(mb: MeshBuilder): void {
  // Poste de esquina Sur-Oeste que tapa la unión de las dos paredes.
  mb.box(-0.6, -0.6, -DEPTH - 0.04, -0.47, -0.47, 0.0, mix(C.ironDark, C.iron, 0.5), { flags: METAL | RUST });
  for (let k = 0; k < 3; k++) rivet(mb, -0.6, -0.535, -0.12 - k * 0.2, 0.018, shade(C.iron, 1.15), METAL | NO_SHADOW);
}

/** Bordes de plataforma: 160 × 160 con el centro de la casilla en (80, 40). */
function edgeSprite(name: string, build: (mb: MeshBuilder) => void): SpriteDef {
  return { name, w: 160, h: 160, ax: 80, ay: 40, outline: 0.8, build };
}

export const TERRAIN: SpriteDef[] = [
  tileSprite('tile_base', base),
  { ...tileSprite('tile_grassland', grassland), outline: 0 },
  { ...tileSprite('tile_soil', soil), outline: 0 },
  { ...tileSprite('tile_water_overlay', waterOverlay), outline: 0 },
  edgeSprite('platform_edge_s', (mb) => edge(mb, 's', 1)),
  edgeSprite('platform_edge_w', (mb) => edge(mb, 'w', 2)),
  edgeSprite('platform_corner', corner),
];

