import type { MeshBuilder } from '../../src/renderer/iso3d';
import { DOUBLE, GLOW, METAL, NO_SHADOW, ORGANIC, RUST, SOFT, THIN, WOOD, type SpriteDef, type V3 } from './iso';
import { C, mix, rnd, shade } from './palette';
import { cactusColumn, carrotRoot, pumpkinBody, pumpkinStem } from './crops';
import { lathe, tube } from './shapes';

/**
 * Íconos de recursos (doc 06 §3: 64 × 64) en el mismo estilo del atlas: el HUD los muestra a
 * 28 × 28 y vuelan hacia el inventario al cosechar.
 */

function item(name: string, scale: number, build: (mb: MeshBuilder) => void, ay = 40): SpriteDef {
  return { name, w: 64, h: 64, ax: 32, ay, anchor: [0.5, 0.5], scale, outline: 1, contact: undefined, build };
}

/** Cilindro tumbado a lo largo del eje que apunta en planta al ángulo `yaw`. */
function lyingCylinder(mb: MeshBuilder, r: number, len: number, yaw: number, side: number, cap: number, flags: number, z = r): void {
  mb.save();
  mb.translate(-Math.cos(yaw) * len * 0.5, -Math.sin(yaw) * len * 0.5, z);
  mb.rotateZ(yaw);
  mb.rotateY(Math.PI / 2);
  lathe(mb, 12, [[r, 0], [r, len]], side, { top: cap, flags, rot: 0, side: (k) => (k % 3 === 0 ? shade(side, 0.82) : side) });
  mb.restore();
}

function hay(mb: MeshBuilder): void {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 0.05 + rnd(i, 1) * 0.04;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const color = i % 3 === 0 ? C.straw : i % 3 === 1 ? C.grassLight : C.grass;
    tube(mb, [[x * 2.2, y * 2.2, 0], [x, y, 0.22], [x * 2.4, y * 2.4, 0.5 + rnd(i, 2) * 0.06]], [0.014, 0.012, 0.01], 4, color, { flags: SOFT, joints: false });
  }
  mb.save();
  mb.translate(0, 0, 0.2);
  lathe(mb, 12, [[0.105, 0], [0.105, 0.05]], C.copperDark, { top: null });
  mb.restore();
}

function wood(mb: MeshBuilder): void {
  lyingCylinder(mb, 0.14, 0.5, -Math.PI / 4 + 0.4, mix(C.trunkLight, C.plank, 0.5), mix(C.trunkLight, C.straw, 0.45), WOOD);
  // Anillos en la cara del corte.
  const yaw = -Math.PI / 4 + 0.4;
  mb.save();
  mb.translate(Math.cos(yaw) * 0.25, Math.sin(yaw) * 0.25, 0.14);
  mb.rotateZ(yaw);
  mb.rotateY(Math.PI / 2);
  for (const [r, c] of [
    [0.1, mix(C.trunkLight, C.straw, 0.3)],
    [0.06, C.trunkLight],
    [0.025, C.trunk],
  ] as [number, number][]) {
    mb.disc(14, r, 0.002 + (0.1 - r) * 0.02, c, DOUBLE | THIN, 1, 0.01 + (0.1 - r));
  }
  mb.restore();
  // Rama cortada.
  tube(mb, [[-0.02, -0.04, 0.24], [-0.06, -0.1, 0.32]], [0.03, 0.025], 6, C.trunk, { cap: C.trunkLight });
}

function water(mb: MeshBuilder): void {
  lathe(
    mb,
    16,
    [
      [0, 0],
      [0.12, 0.05],
      [0.16, 0.14],
      [0.13, 0.26],
      [0.06, 0.38],
      [0, 0.47],
    ],
    C.water,
    { flags: SOFT, side: (k, ring) => (ring >= 3 && k % 4 === 0 ? mix(C.water, 0xffffff, 0.35) : C.water) },
  );
  mb.save();
  mb.translate(-0.07, -0.08, 0.2);
  mb.scale(0.5, 0.5, 1.4);
  mb.sphere(0.04, 6, 3, 0xe8fbff, { flags: GLOW | NO_SHADOW });
  mb.restore();
}

function fertilizer(mb: MeshBuilder): void {
  const sack = 0x8a7656;
  lathe(
    mb,
    12,
    [
      [0.13, 0],
      [0.19, 0.08],
      [0.2, 0.22],
      [0.15, 0.34],
      [0.06, 0.4],
      [0.08, 0.46],
    ],
    sack,
    { flags: ORGANIC, side: (k, ring) => (rnd(k, ring) > 0.8 ? shade(sack, 0.8) : sack), top: shade(sack, 0.85) },
  );
  mb.save();
  mb.translate(0, 0, 0.39);
  lathe(mb, 10, [[0.075, 0], [0.075, 0.025]], C.copperDark, { top: null });
  mb.restore();
  // Hoja estampada en el saco.
  mb.save();
  mb.rotateZ(-Math.PI * 0.75);
  mb.translate(0.2, 0, 0.2);
  mb.rotateY(Math.PI / 2);
  mb.face([[0, -0.05, 0.01], [0.06, 0, 0.01], [0, 0.05, 0.01], [-0.06, 0, 0.01]], C.foliage, THIN | NO_SHADOW, 1, undefined, 0.02);
  mb.restore();
}

function weirdSubstance(mb: MeshBuilder): void {
  // Charco químico morado, brillante.
  const pts: V3[] = [];
  for (let j = 0; j < 14; j++) {
    const a = (j / 14) * Math.PI * 2;
    const r = 0.28 * (0.75 + rnd(j, 3) * 0.4);
    pts.push([0.05 + Math.cos(a) * r, -0.05 + Math.sin(a) * r * 0.85, 0.002]);
  }
  mb.face(pts, C.weird, GLOW | THIN | NO_SHADOW);
  const inner = pts.map((p): V3 => [0.05 + (p[0] - 0.05) * 0.55, -0.05 + (p[1] + 0.05) * 0.55, 0.004]);
  mb.face(inner, C.weirdLight, GLOW | THIN | NO_SHADOW, 1, undefined, 0.01);
  // Lata oxidada volcada.
  lyingCylinder(mb, 0.11, 0.3, Math.PI * 0.55, mix(C.iron, C.ironRust, 0.4), 0x2a1d24, METAL | RUST, 0.11);
}

function power(mb: MeshBuilder): void {
  lathe(mb, 14, [[0.15, 0], [0.15, 0.36]], mix(C.iron, C.copperDark, 0.4), { flags: METAL | RUST, top: 0x3a3530, side: (k) => (k % 4 === 0 ? 0x4a453f : mix(C.iron, C.copperDark, 0.4)) });
  mb.save();
  mb.translate(0, 0, 0.36);
  lathe(mb, 10, [[0.06, 0], [0.06, 0.05]], C.copperLight, { flags: METAL });
  mb.restore();
  // Rayo ámbar encendido en el frente.
  mb.save();
  mb.rotateZ(-Math.PI * 0.75);
  mb.translate(0.152, 0, 0.18);
  mb.rotateY(Math.PI / 2);
  mb.face(
    [
      [-0.1, 0.02, 0],
      [0.0, -0.05, 0],
      [-0.01, -0.005, 0],
      [0.1, -0.03, 0],
      [0.0, 0.05, 0],
      [0.01, 0.005, 0],
    ],
    C.amber,
    GLOW | THIN | NO_SHADOW,
    1,
    undefined,
    0.02,
  );
  mb.restore();
}

function gold(mb: MeshBuilder): void {
  for (let k = 0; k < 4; k++) {
    mb.save();
    mb.translate(-0.06 + (k % 2) * 0.04, 0.04 - k * 0.02, k * 0.06);
    lathe(mb, 14, [[0.17, 0], [0.17, 0.055]], C.brass, { flags: METAL, top: 0xffe066, side: (j) => (j % 2 ? C.brass : shade(C.brass, 0.75)) });
    mb.restore();
  }
  mb.save();
  mb.translate(0.16, -0.12, 0.05);
  mb.sphere(0.07, 6, 3, C.brass, { flags: METAL, jitter: (i, j) => 0.8 + rnd(i, j) * 0.4 });
  mb.restore();
}

function bone(mb: MeshBuilder): void {
  const yaw = Math.PI * 0.2;
  const dx = Math.cos(yaw);
  const dy = Math.sin(yaw);
  tube(mb, [[-dx * 0.22, -dy * 0.22, 0.07], [dx * 0.22, dy * 0.22, 0.07]], [0.045, 0.045], 8, C.bone, { flags: SOFT, joints: false });
  for (const s of [-1, 1]) {
    for (const o of [-1, 1]) {
      mb.save();
      mb.translate(s * dx * 0.25 - o * dy * 0.05, s * dy * 0.25 + o * dx * 0.05, 0.075);
      mb.sphere(0.065, 8, 4, C.bone, { flags: SOFT, color: (i) => (i >= 3 ? C.boneDark : C.bone) });
      mb.restore();
    }
  }
}

export const ITEMS: SpriteDef[] = [
  item('item_hay', 100, hay, 54),
  item('item_wood', 100, wood, 42),
  item('item_carrot', 112, (mb) => {
    mb.save();
    mb.rotateY(1.25);
    mb.translate(-0.06, 0, -0.18);
    carrotRoot(mb, 0, 0, 0, 0.6, 1.6, 4);
    mb.restore();
  }),
  item('item_water', 104, water, 52),
  item('item_fertilizer', 100, fertilizer, 52),
  item('item_weird_substance', 100, weirdSubstance, 38),
  item('item_pumpkin', 104, (mb) => {
    pumpkinBody(mb, 0.26, 0.32, 3);
    pumpkinStem(mb, 0.32, 0.9);
  }, 48),
  item('item_power', 100, power, 50),
  item('item_cactus', 92, (mb) => cactusColumn(mb, [[0, 0, 0], [0.0, 0.0, 0.3], [0.0, 0.0, 0.46]], 0.11, 6), 56),
  item('item_gold', 104, gold, 44),
  item('item_bone', 110, bone, 38),
];
