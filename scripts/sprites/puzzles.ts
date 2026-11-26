import type { MeshBuilder } from '../../src/renderer/iso3d';
import { DOUBLE, GLOW, METAL, NO_SHADOW, RUST, WOOD, type SpriteDef, type V3 } from './iso';
import { C, mix, rnd, shade } from './palette';
import { lathe, plank, rivet, tube } from './shapes';

/**
 * Puzles y modos especiales en chatarra retro-industrial (doc 06 §2): barricadas `Hedge`,
 * cofre `Treasure` y el reptil mecánico del modo Dinosaurio.
 */

// ------------------------------------------------------------------ barricadas

const WALL_H = 0.5;
const WALL_T = 0.16;

/** Tramo de barricada a lo largo del eje x local (de −0.5 − T/2 a 0.5 + T/2), centrado en y = 0. */
function barricade(mb: MeshBuilder, seed: number): void {
  const ext = 0.5 + WALL_T / 2;
  // Postes de madera en los extremos.
  for (const x of [-0.46, 0.46]) {
    mb.box(x - 0.045, -0.05, 0, x + 0.045, 0.05, WALL_H + 0.06, mix(C.plank, C.trunkDark, 0.3), { flags: WOOD, top: shade(C.plank, 1.1) });
  }
  // Chapa oxidada de fondo (ondulada: tiras alternas).
  const strips = 8;
  for (let i = 0; i < strips; i++) {
    const x0 = -ext + (i * 2 * ext) / strips;
    const x1 = x0 + (2 * ext) / strips;
    const dy = i % 2 ? 0.012 : -0.012;
    mb.box(x0, -0.02 + dy, 0, x1, 0.02 + dy, WALL_H * (0.86 + rnd(seed, i) * 0.1), mix(C.iron, C.ironRust, 0.35 + rnd(seed, i, 2) * 0.3), { flags: METAL | RUST });
  }
  // Tablas viejas clavadas por delante, algo torcidas.
  const boards = 3;
  for (let k = 0; k < boards; k++) {
    const z = 0.06 + k * 0.15 + rnd(seed, k, 3) * 0.03;
    plank(mb, (rnd(seed, k, 4) - 0.5) * 0.12, -0.05, z, 1.02 + rnd(seed, k, 5) * 0.1, 0.03, 0.09, shade(C.plank, 0.85 + rnd(seed, k, 6) * 0.3), {
      lean: (rnd(seed, k, 7) - 0.5) * 0.06,
      yaw: (rnd(seed, k, 8) - 0.5) * 0.05,
      flags: WOOD,
      top: shade(C.plank, 1.15),
    });
  }
  // Clavos.
  for (let k = 0; k < 4; k++) rivet(mb, -0.4 + k * 0.27, -0.068, 0.1 + (k % 3) * 0.15, 0.012, 0x8a8a84, METAL | NO_SHADOW);
  // Alambre de púas enrollado arriba (hélice) con púas.
  const pts: V3[] = [];
  const loops = 3.2;
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * loops * Math.PI * 2;
    pts.push([-ext + t * 2 * ext, Math.cos(a) * 0.055, WALL_H + 0.07 + Math.sin(a) * 0.055]);
  }
  tube(mb, pts, pts.map(() => 0.006), 4, 0x5c5a55, { flags: NO_SHADOW | METAL, joints: false, cap: null });
  for (let i = 3; i < steps; i += 6) {
    const p = pts[i];
    mb.save();
    mb.translate(p[0], p[1], p[2]);
    mb.rotateZ(i);
    mb.box(-0.02, -0.003, -0.003, 0.02, 0.003, 0.003, 0x77746c, { flags: NO_SHADOW });
    mb.restore();
  }
}

/** Muro en el lado indicado de la casilla (N, E, S u O), en un sprite anclado al centro de la casilla. */
function hedge(mb: MeshBuilder, side: 'n' | 'e' | 's' | 'w'): void {
  mb.save();
  if (side === 'n') mb.translate(0, 0.5, 0);
  if (side === 's') mb.translate(0, -0.5, 0);
  if (side === 'e') {
    mb.translate(0.5, 0, 0);
    mb.rotateZ(Math.PI / 2);
  }
  if (side === 'w') {
    mb.translate(-0.5, 0, 0);
    mb.rotateZ(Math.PI / 2);
  }
  barricade(mb, side.charCodeAt(0));
  mb.restore();
}

// ------------------------------------------------------------------ cofre

function chest(mb: MeshBuilder, open: boolean): void {
  mb.save();
  // El frente del cofre (−y local) mira al espectador (Sur-Oeste).
  mb.rotateZ(-Math.PI / 4);
  const w = 0.27;
  const d = 0.18;
  const h = 0.22;
  const iron = mix(C.iron, C.ironDark, 0.25);
  const band = mix(C.copperDark, 0x4f6b5c, 0.35);
  mb.box(-w, -d, 0, w, d, h, iron, { flags: METAL | RUST, top: shade(iron, 0.9) });
  // Bandas de cobre oxidado y remaches.
  for (const x of [-w * 0.62, w * 0.62]) {
    mb.box(x - 0.03, -d - 0.008, -0.002, x + 0.03, d + 0.008, h + 0.004, band, { flags: METAL | RUST });
    for (const z of [0.05, 0.16]) rivet(mb, x, -d - 0.01, z, 0.012, C.copperLight, METAL | NO_SHADOW);
  }
  mb.box(-w - 0.006, -d - 0.006, 0, w + 0.006, d + 0.006, 0.035, shade(iron, 0.8), { flags: METAL });
  if (open) {
    // Montón de oro dentro, emisivo.
    mb.save();
    mb.translate(0, 0, h - 0.01);
    mb.scale(1, 0.62, 0.4);
    mb.sphere(w * 0.92, 10, 4, C.brass, { color: (i, j) => ((i + j) % 3 === 0 ? 0xffe066 : C.brass) });
    mb.restore();
    for (let k = 0; k < 7; k++) {
      mb.save();
      mb.translate((rnd(k, 1) - 0.5) * w * 1.4, (rnd(k, 2) - 0.5) * d * 1.1, h + 0.05 + rnd(k, 3) * 0.04);
      mb.rotateX(0.4 + rnd(k, 4));
      mb.rotateZ(rnd(k, 5) * 3);
      mb.disc(8, 0.032, 0, k % 2 ? 0xffe066 : C.brass, DOUBLE | GLOW, 1, 0.01);
      mb.restore();
    }
    // Tapa abierta hacia atrás.
    mb.save();
    mb.translate(0, d, h);
    mb.rotateX(-2.0);
    mb.box(-w, -2 * d, 0, w, 0, 0.07, iron, { flags: METAL | RUST, top: shade(iron, 0.85) });
    for (const x of [-w * 0.62, w * 0.62]) mb.box(x - 0.03, -2 * d - 0.006, -0.004, x + 0.03, 0.006, 0.076, band, { flags: METAL | RUST });
    mb.restore();
  } else {
    // Tapa abombada (medio cilindro a lo largo de x).
    mb.save();
    mb.translate(-w, 0, h);
    mb.rotateY(Math.PI / 2);
    lathe(
      mb,
      12,
      [
        [d, 0],
        [d, 2 * w],
      ],
      iron,
      { flags: METAL | RUST, top: shade(iron, 0.85), rot: 0, side: (k) => (k < 6 ? iron : shade(iron, 0.9)) },
    );
    mb.restore();
    // El medio cilindro inferior queda dentro del cuerpo; las bandas siguen por la tapa.
    for (const x of [-w * 0.62, w * 0.62]) {
      mb.save();
      mb.translate(x - 0.03, 0, h);
      mb.rotateY(Math.PI / 2);
      lathe(mb, 12, [[d + 0.01, 0], [d + 0.01, 0.06]], band, { flags: METAL | RUST, top: band, rot: 0 });
      mb.restore();
    }
    // Candado metálico al frente.
    mb.box(-0.045, -d - 0.035, h - 0.08, 0.045, -d - 0.005, h + 0.0, 0x6d6a62, { flags: METAL, front: 0x8a867c });
    mb.save();
    mb.translate(0, -d - 0.02, h);
    mb.rotateX(Math.PI / 2);
    lathe(mb, 8, [[0.03, 0], [0.03, 0.012]], 0x5c5953, { flags: METAL, top: null });
    mb.restore();
    rivet(mb, 0, -d - 0.037, h - 0.045, 0.01, 0x1a1714, NO_SHADOW);
  }
  mb.restore();
}

// ------------------------------------------------------------------ reptil mecánico

const SCRAP = mix(C.iron, C.copperDark, 0.35);

function plateShell(mb: MeshBuilder, len: number, wid: number, hgt: number, seed: number): void {
  // Caparazón de placas: tres planchas solapadas formando un lomo.
  for (let k = 0; k < 3; k++) {
    const x = -len / 2 + (k + 0.5) * (len / 3);
    const tone = shade(k % 2 ? SCRAP : mix(SCRAP, C.ironRust, 0.4), 0.9 + rnd(seed, k) * 0.2);
    mb.save();
    mb.translate(x, 0, hgt * 0.42);
    mb.rotateY(Math.PI / 2);
    lathe(
      mb,
      10,
      [
        [wid * 0.98, -len / 6 - 0.012],
        [wid, len / 6 + 0.012],
      ],
      tone,
      { flags: METAL | RUST, top: shade(tone, 0.9), rot: 0, side: (j) => (j < 5 ? tone : shade(tone, 0.7)) },
    );
    mb.restore();
    rivet(mb, x, -wid * 0.75, hgt * 0.42 + wid * 0.62, 0.014, C.copperLight, METAL | NO_SHADOW);
  }
}

function dorsalPlates(mb: MeshBuilder, len: number, z: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const x = -len / 2 + ((k + 0.5) * len) / n;
    mb.save();
    mb.translate(x, 0, z);
    mb.prism(4, 0.06, 0, 0, 0.12 - Math.abs(k - (n - 1) / 2) * 0.02, mix(C.copper, C.ironRust, 0.3), { rot: 0, bottom: null, flags: METAL | RUST, side: (_a, j) => (j % 2 ? C.copper : C.copperDark) });
    mb.restore();
  }
}

function piston(mb: MeshBuilder, a: V3, b: V3): void {
  tube(mb, [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]], [0.025, 0.025], 6, 0x4e4a44, { flags: METAL, joints: false, cap: 0x6e6a62 });
  tube(mb, [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], [0.014, 0.014], 6, 0xb8b2a4, { flags: METAL, joints: false, cap: 0x8a867c });
}

/**
 * Segmento alineado con el eje x del mundo; el renderizador lo refleja para los tramos a lo largo
 * de y. La cola apunta su pincho hacia +x; la variante `front` lo apunta hacia −x (al espectador).
 */
function dinoSegment(mb: MeshBuilder, tail: boolean, front = false): void {
  mb.save();
  if (front) mb.rotateZ(Math.PI);
  const len = tail ? 0.5 : 0.62;
  const wid = tail ? 0.16 : 0.2;
  const hgt = tail ? 0.26 : 0.32;
  // Patas cortas de tubo.
  for (const [x, y] of [
    [-len * 0.3, -wid * 0.8],
    [len * 0.3, -wid * 0.8],
    [-len * 0.3, wid * 0.8],
    [len * 0.3, wid * 0.8],
  ]) {
    tube(mb, [[x, y * 0.7, hgt * 0.4], [x, y, 0.04], [x + 0.03, y, 0]], [0.026, 0.022, 0.02], 6, 0x3e3a35, { flags: METAL, cap: 0x2a2724 });
  }
  if (tail) {
    // Cola que se afina hasta un pincho.
    const pts: V3[] = [
      [-len * 0.5, 0, hgt * 0.45],
      [0, 0, hgt * 0.42],
      [len * 0.42, 0.02, hgt * 0.36],
      [len * 0.8, 0.03, hgt * 0.3],
    ];
    tube(mb, pts, [wid, wid * 0.8, wid * 0.5, 0.01], 9, SCRAP, { flags: METAL | RUST, side: (_a, k) => (k % 2 ? SCRAP : mix(SCRAP, C.ironRust, 0.45)) });
    dorsalPlates(mb, len * 0.9, hgt * 0.45 + wid * 0.8, 3);
  } else {
    plateShell(mb, len, wid, hgt, 3);
    dorsalPlates(mb, len, hgt * 0.42 + wid, 3);
    // Tubo flexible lateral y pistón.
    tube(
      mb,
      [
        [-len * 0.45, -wid * 0.9, hgt * 0.35],
        [-len * 0.1, -wid * 1.15, hgt * 0.2],
        [len * 0.25, -wid * 1.1, hgt * 0.32],
        [len * 0.45, -wid * 0.9, hgt * 0.4],
      ],
      [0.02, 0.02, 0.02, 0.02],
      6,
      0x2f3a3c,
      { flags: NO_SHADOW, cap: null },
    );
    piston(mb, [-len * 0.2, wid * 0.95, hgt * 0.2], [len * 0.25, wid * 0.95, hgt * 0.42]);
  }
  mb.restore();
}

/**
 * Cabeza mirando al Oeste (abajo a la izquierda); reflejada mira al Sur. La variante `back` mira
 * al Este (arriba a la derecha, de espaldas) y reflejada al Norte.
 */
function dinoHead(mb: MeshBuilder, back = false): void {
  mb.save();
  if (back) mb.rotateZ(Math.PI);
  // Cuello de tubo flexible hacia atrás.
  tube(mb, [[0.32, 0, 0.3], [0.18, 0, 0.36], [0.04, 0, 0.36]], [0.07, 0.08, 0.09], 8, 0x2f3a3c, { cap: null, side: (_a, k) => (k % 2 ? 0x2f3a3c : 0x3d4a4c) });
  // Cráneo de placas.
  mb.save();
  mb.translate(-0.04, 0, 0.36);
  mb.scale(1.25, 0.95, 0.85);
  mb.sphere(0.16, 10, 6, SCRAP, { flags: METAL | RUST, color: (i, j) => (i <= 1 ? shade(SCRAP, 1.1) : (i + j) % 4 === 0 ? mix(SCRAP, C.ironRust, 0.5) : SCRAP) });
  mb.restore();
  // Hocico (caja) y mandíbula inferior abierta con dientes.
  mb.box(-0.42, -0.1, 0.33, -0.12, 0.1, 0.46, mix(SCRAP, C.iron, 0.4), { flags: METAL | RUST, top: shade(SCRAP, 1.08) });
  mb.save();
  mb.translate(-0.14, 0, 0.32);
  mb.rotateY(0.28);
  mb.box(-0.27, -0.085, -0.06, 0, 0.085, 0, mix(C.copperDark, C.iron, 0.4), { flags: METAL | RUST });
  for (let k = 0; k < 4; k++) {
    mb.save();
    mb.translate(-0.25 + k * 0.06, -0.06, 0);
    mb.prism(3, 0.016, 0, 0, 0.04, 0xd8d2c0, { flags: NO_SHADOW });
    mb.restore();
    mb.save();
    mb.translate(-0.25 + k * 0.06, 0.06, 0);
    mb.prism(3, 0.016, 0, 0, 0.04, 0xd8d2c0, { flags: NO_SHADOW });
    mb.restore();
  }
  mb.restore();
  for (let k = 0; k < 4; k++) {
    mb.save();
    mb.translate(-0.39 + k * 0.07, -0.07, 0.33);
    mb.rotateX(Math.PI);
    mb.prism(3, 0.016, 0, 0, 0.035, 0xe0dac8, { flags: NO_SHADOW });
    mb.restore();
  }
  // Ojo: lente ámbar encendida, en una montura de cobre.
  for (const y of [-0.1, 0.1]) {
    mb.save();
    mb.translate(-0.13, y * 1.05, 0.44);
    mb.rotateX((Math.sign(y) * Math.PI) / 2);
    lathe(mb, 8, [[0.045, 0], [0.045, 0.03]], C.copper, { top: y < 0 ? C.amber : 0x6e4a20, flags: METAL, rot: 0 });
    mb.restore();
  }
  // Cresta de placas y pistones de la mandíbula.
  dorsalPlates(mb, 0.3, 0.5, 3);
  piston(mb, [0.02, -0.12, 0.42], [-0.18, -0.11, 0.3]);
  rivet(mb, -0.3, -0.105, 0.42, 0.012, C.copperLight, METAL | NO_SHADOW);
  rivet(mb, -0.22, -0.105, 0.42, 0.012, C.copperLight, METAL | NO_SHADOW);
  mb.restore();
}

function hedgeSprite(name: string, side: 'n' | 'e' | 's' | 'w'): SpriteDef {
  // Alto extra por abajo: los muros Sur y Oeste sobresalen del rombo de la casilla.
  return { name, w: 160, h: 176, ax: 80, ay: 112, outline: 1, castShadow: true, build: (mb) => hedge(mb, side) };
}

export const PUZZLES: SpriteDef[] = [
  hedgeSprite('hedge_n', 'n'),
  hedgeSprite('hedge_e', 'e'),
  hedgeSprite('hedge_s', 's'),
  hedgeSprite('hedge_w', 'w'),
  { name: 'treasure_closed', w: 128, h: 128, ax: 64, ay: 96, outline: 1.1, castShadow: true, contact: [0.36, 0.3, 0.4], build: (mb) => chest(mb, false) },
  { name: 'treasure_open', w: 128, h: 128, ax: 64, ay: 96, outline: 1.1, castShadow: true, contact: [0.36, 0.3, 0.4], build: (mb) => chest(mb, true) },
  { name: 'dino_head', w: 128, h: 128, ax: 64, ay: 100, outline: 1.1, castShadow: true, contact: [0.3, 0.3, 0.4], build: (mb) => dinoHead(mb) },
  { name: 'dino_head_back', w: 128, h: 128, ax: 64, ay: 100, outline: 1.1, castShadow: true, contact: [0.3, 0.3, 0.4], build: (mb) => dinoHead(mb, true) },
  { name: 'dino_segment', w: 128, h: 128, ax: 64, ay: 96, outline: 1.1, castShadow: true, contact: [0.34, 0.34, 0.4], build: (mb) => dinoSegment(mb, false) },
  { name: 'dino_tail', w: 128, h: 128, ax: 64, ay: 96, outline: 1.1, castShadow: true, contact: [0.3, 0.3, 0.38], build: (mb) => dinoSegment(mb, true) },
  { name: 'dino_tail_front', w: 128, h: 128, ax: 64, ay: 96, outline: 1.1, castShadow: true, contact: [0.3, 0.3, 0.38], build: (mb) => dinoSegment(mb, true, true) },
];

