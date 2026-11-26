import type { HatKind } from '../../engine/types';
import { DOUBLE, GLOW, MeshBuilder, NO_SHADOW, SOFT, type V3 } from '../iso3d';
import { shade } from '../palette';

/**
 * Sombreros del dron, modelados con primitivas low-poly. Origen: centro de la cúpula del dron
 * (radio útil ≈ 0.1); el frente mira al sur (−y).
 */
type HatBuilder = (mb: MeshBuilder, time: number) => void;

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const isFront = (a: number, width = 0.9): boolean => Math.abs(angleDelta(a, -Math.PI / 2)) < width;
const alternate = (a: number, b: number) => (_angle: number, k: number) => (k % 2 ? a : b);

/** Visera de gorra: media corona hacia el frente, ligeramente caída. */
function capBrim(mb: MeshBuilder, rIn: number, rOut: number, z: number, droop: number, color: number): void {
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const a0 = Math.PI * (1.12 + (i / steps) * 0.76);
    const a1 = Math.PI * (1.12 + ((i + 1) / steps) * 0.76);
    mb.face(
      [
        [Math.cos(a0) * rIn, Math.sin(a0) * rIn, z],
        [Math.cos(a1) * rIn, Math.sin(a1) * rIn, z],
        [Math.cos(a1) * rOut, Math.sin(a1) * rOut, z - droop],
        [Math.cos(a0) * rOut, Math.sin(a0) * rOut, z - droop],
      ],
      color,
      DOUBLE,
    );
  }
}

/** Hoja plana pegada sobre una superficie vertical, en el ángulo `angle` y a distancia `r` del eje. */
function leafDecal(mb: MeshBuilder, angle: number, r: number, z: number, size: number, color: number): void {
  mb.save();
  mb.rotateZ(angle + Math.PI / 2);
  mb.face(
    [
      [0, -r, z + size],
      [-size * 0.62, -r, z],
      [0, -r, z - size],
      [size * 0.62, -r, z],
    ],
    color,
    NO_SHADOW,
    1,
    [0, 0, z],
    0.03,
  );
  mb.restore();
}

/** Estrella de cuatro puntas plana (frente del sombrero), emisiva. */
function starDecal(mb: MeshBuilder, x: number, y: number, z: number, s: number, color: number): void {
  const k = 0.32 * s;
  const pts: V3[] = [
    [x, y, z + s],
    [x + k, y, z + k],
    [x + s, y, z],
    [x + k, y, z - k],
    [x, y, z - s],
    [x - k, y, z - k],
    [x - s, y, z],
    [x - k, y, z + k],
  ];
  mb.face(pts, color, GLOW | NO_SHADOW, 1, [x, y + 1, z], 0.03);
}

/** Maceta pequeña con tierra (base de varios sombreros). */
function pot(mb: MeshBuilder, body: number, rim: number): number {
  mb.prism(8, 0.064, 0.08, 0, 0.064, body, { bottom: null, top: null });
  mb.prism(8, 0.088, 0.088, 0.064, 0.084, rim, { bottom: rim });
  mb.disc(8, 0.072, 0.0845, 0x4a2f1c, 0, 1, 0.01);
  return 0.0845;
}

const HATS: Record<HatKind, HatBuilder> = {
  /** Gorra de granjero roja con panel frontal crema y una hoja bordada (sombrero por defecto). */
  Farmer_Cap(mb) {
    const red = 0xc8432b;
    const cream = 0xefe6d2;
    const panel = (a: number) => (isFront(a, 0.75) ? cream : red);
    mb.prism(8, 0.108, 0.103, 0, 0.038, red, { side: panel, bottom: null, top: null });
    mb.prism(8, 0.103, 0.072, 0.038, 0.078, red, { side: panel, bottom: null, top: null });
    mb.prism(8, 0.072, 0.028, 0.078, 0.098, red, { bottom: null });
    mb.save();
    mb.translate(0, 0, 0.1);
    mb.sphere(0.015, 6, 3, red);
    mb.restore();
    capBrim(mb, 0.1, 0.19, 0.012, 0.022, 0xa53421);
    leafDecal(mb, -Math.PI / 2, 0.0985, 0.02, 0.013, 0x5f8a2a);
  },

  /** Sombrero de pescador verde oliva con cinta de cuero. */
  Bucket_Hat(mb) {
    const olive = 0x6f7d3a;
    mb.prism(10, 0.094, 0.084, 0, 0.074, olive, { bottom: null, top: shade(olive, 1.04) });
    mb.prism(10, 0.097, 0.096, 0.004, 0.022, 0x8a5a2b, { bottom: null, top: null });
    mb.prism(10, 0.094, 0.168, 0.006, -0.032, 0x5b6830, { top: null, bottom: null, flags: DOUBLE });
  },

  /** Gorro de lana mostaza con puño acanalado y pompón. */
  Beanie(mb) {
    const knit = 0xd9a23a;
    const rib = alternate(knit, 0xc38f2f);
    mb.prism(12, 0.112, 0.11, 0, 0.034, 0xb57f27, { side: alternate(0xb57f27, 0xa47224), bottom: null, top: 0xb57f27 });
    mb.prism(12, 0.104, 0.096, 0.034, 0.062, knit, { side: rib, bottom: null, top: null });
    mb.prism(12, 0.096, 0.064, 0.062, 0.098, knit, { side: rib, bottom: null, top: null });
    mb.prism(12, 0.064, 0, 0.098, 0.118, knit, { side: rib });
    mb.save();
    mb.translate(0, 0, 0.13);
    mb.sphere(0.032, 7, 4, 0xf3e9d2, { flags: SOFT });
    mb.restore();
  },

  /** Gorro de gajos de colores con visera corta y hélice que gira sola. */
  Propeller_Beanie(mb, time) {
    const colors = [0xd8423a, 0xf2c230, 0x3f7fd0, 0x4f9a46];
    const panel = (_a: number, k: number) => colors[k % 4];
    mb.prism(8, 0.106, 0.098, 0, 0.04, colors[0], { side: panel, bottom: null, top: null });
    mb.prism(8, 0.098, 0.06, 0.04, 0.085, colors[0], { side: panel, bottom: null, top: null });
    mb.prism(8, 0.06, 0, 0.085, 0.1, colors[0], { side: panel });
    capBrim(mb, 0.095, 0.15, 0.012, 0.012, 0x2f6fb5);
    mb.box(-0.006, -0.006, 0.098, 0.006, 0.006, 0.134, 0x6b6f73);
    mb.save();
    mb.translate(0, 0, 0.136);
    mb.rotateZ(time * 7);
    mb.face([[0, 0, 0], [0.11, -0.024, 0.006], [0.11, 0.024, 0.006]], colors[0], DOUBLE);
    mb.face([[0, 0, 0], [-0.11, 0.024, 0.006], [-0.11, -0.024, 0.006]], colors[2], DOUBLE);
    mb.restore();
  },

  /** Corona de flores de tres colores sobre una guirnalda verde. */
  Flower_Crown(mb) {
    const petals = [0xe58ca8, 0xf5f1e8, 0xb79bd6];
    mb.prism(12, 0.104, 0.104, 0, 0.018, 0x5e8c3a, { bottom: null, top: null, flags: DOUBLE });
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 7;
      mb.save();
      mb.translate(Math.cos(a) * 0.104, Math.sin(a) * 0.104, 0.022);
      mb.rotateZ(a + Math.PI / 2);
      mb.rotateX(0.9);
      mb.disc(6, 0.03, 0, petals[k % 3], DOUBLE | SOFT);
      mb.disc(6, 0.011, 0.004, 0xf2c94c, DOUBLE, 1, 0.01);
      mb.restore();
    }
  },

  /** Maceta de barro con un brote que se mece. */
  Sprout_Pot(mb, time) {
    const top = pot(mb, 0xc2693e, 0xa9572f);
    mb.save();
    mb.rotateZ(Math.sin(time * 2) * 0.12);
    mb.box(-0.006, -0.006, top, 0.006, 0.006, 0.15, 0x6e9a35);
    mb.face([[0, 0, 0.148], [-0.035, -0.012, 0.176], [-0.077, 0, 0.17], [-0.04, 0.012, 0.146]], 0x8cbf4a, DOUBLE | SOFT);
    mb.face([[0, 0, 0.14], [0.03, 0.012, 0.166], [0.07, 0, 0.162], [0.036, -0.012, 0.138]], 0x7fb03f, DOUBLE | SOFT);
    mb.restore();
  },

  /** Mini paca de heno atada con dos cordeles. */
  Hay_Bale(mb) {
    const hay = 0xd8aa3c;
    mb.save();
    mb.rotateZ(0.35);
    mb.box(-0.105, -0.07, 0, 0.105, 0.07, 0.11, hay, { top: 0xecc45a });
    for (const xb of [-0.052, 0.052]) mb.box(xb - 0.008, -0.074, -0.002, xb + 0.008, 0.074, 0.114, 0x8c5622);
    mb.face([[-0.07, 0, 0.11], [-0.058, 0.01, 0.11], [-0.085, 0.02, 0.158]], 0xecc45a, DOUBLE);
    mb.face([[0.02, -0.03, 0.11], [0.032, -0.02, 0.11], [0.048, -0.046, 0.154]], hay, DOUBLE);
    mb.restore();
  },

  /** Casco de zanahoria con hojas al viento. */
  Carrot_Top(mb, time) {
    const orange = 0xe68526;
    const ribs = alternate(orange, 0xcf7420);
    mb.prism(8, 0.104, 0.098, 0, 0.032, orange, { side: ribs, bottom: null, top: null });
    mb.prism(8, 0.098, 0.06, 0.032, 0.07, orange, { side: ribs, bottom: null, top: null });
    mb.prism(8, 0.06, 0.034, 0.07, 0.082, 0xc96d1a, { bottom: null });
    for (let k = 0; k < 5; k++) {
      mb.save();
      mb.translate(0, 0, 0.08);
      mb.rotateZ((k * 2 * Math.PI) / 5 + 0.3);
      mb.rotateY(0.5 + Math.sin(time * 2.2 + k) * 0.08);
      mb.face(
        [
          [-0.01, 0, 0],
          [0.012, 0, 0.05],
          [0, 0, 0.12],
          [-0.022, 0, 0.06],
        ],
        k % 2 ? 0x6e8f2e : 0x8cb03a,
        DOUBLE | SOFT,
      );
      mb.restore();
    }
  },

  /** Casco de calabaza con cara tallada iluminada por dentro. */
  Pumpkin_Helmet(mb) {
    const ribs = alternate(0xd9862a, 0xf0a33a);
    mb.prism(10, 0.114, 0.112, 0, 0.03, 0xf0a33a, { side: ribs, bottom: null, top: null });
    mb.prism(10, 0.112, 0.086, 0.03, 0.076, 0xf0a33a, { side: ribs, bottom: null, top: null });
    mb.prism(10, 0.086, 0.03, 0.076, 0.102, 0xf0a33a, { side: ribs, bottom: null });
    mb.save();
    mb.translate(0.004, 0, 0.1);
    mb.rotateY(0.25);
    mb.prism(5, 0.017, 0.012, 0, 0.04, 0x5f7f2a);
    mb.restore();
    const lit = 0xffd46b;
    const yAt = (z: number) => -(0.112 - ((z - 0.03) / 0.046) * 0.026) * Math.cos(Math.PI / 10) - 0.003;
    for (const s of [-1, 1]) {
      mb.face(
        [
          [s * 0.05, yAt(0.038), 0.038],
          [s * 0.018, yAt(0.038), 0.038],
          [s * 0.034, yAt(0.058), 0.058],
        ],
        lit,
        GLOW | NO_SHADOW,
        1,
        [0, 0, 0.04],
        0.03,
      );
    }
    const ym = -0.112 * Math.cos(Math.PI / 10) - 0.003;
    mb.face(
      [
        [-0.05, ym, 0.024],
        [0.05, ym, 0.024],
        [0.03, ym, 0.008],
        [-0.03, ym, 0.008],
      ],
      lit,
      GLOW | NO_SHADOW,
      1,
      [0, 0, 0.016],
      0.03,
    );
  },

  /** Maceta esmaltada azul con un cactus florecido. */
  Cactus_Pot(mb) {
    const top = pot(mb, 0x4f7fa8, 0x3f6a90);
    const green = alternate(0x3f7a3a, 0x4f8f48);
    mb.prism(8, 0.036, 0.034, top, 0.18, 0x4f8f48, { side: green, top: null, bottom: null });
    mb.prism(8, 0.034, 0.012, 0.18, 0.2, 0x4f8f48, { side: green, bottom: null });
    mb.save();
    mb.translate(0.03, 0, 0.12);
    mb.rotateY(1.2);
    mb.prism(6, 0.017, 0.016, 0, 0.042, 0x4f8f48, { bottom: null, top: null });
    mb.translate(0, 0, 0.04);
    mb.rotateY(-1.2);
    mb.prism(6, 0.016, 0.009, 0, 0.042, 0x4f8f48, { bottom: null });
    mb.restore();
    mb.save();
    mb.translate(0, 0, 0.206);
    mb.sphere(0.017, 6, 3, 0xe86a9a, { flags: SOFT });
    mb.restore();
  },

  /** Corona dorada con puntas rematadas y un rubí al frente. */
  Gold_Crown(mb) {
    const gold = 0xe9b949;
    const sides = 10;
    const r = 0.1;
    const rot = -Math.PI / 2 + Math.PI / sides;
    mb.prism(sides, r, r, 0, 0.04, gold, { top: null, bottom: null, flags: DOUBLE, side: alternate(0xc99a2e, gold) });
    for (let k = 0; k < sides - 1; k += 2) {
      const a0 = rot + (k * 2 * Math.PI) / sides;
      const a1 = rot + ((k + 1) * 2 * Math.PI) / sides;
      const am = (a0 + a1) / 2;
      mb.face(
        [
          [Math.cos(a0) * r, Math.sin(a0) * r, 0.04],
          [Math.cos(a1) * r, Math.sin(a1) * r, 0.04],
          [Math.cos(am) * r * 0.97, Math.sin(am) * r * 0.97, 0.088],
        ],
        gold,
        DOUBLE,
      );
      mb.save();
      mb.translate(Math.cos(am) * r * 0.97, Math.sin(am) * r * 0.97, 0.093);
      mb.sphere(0.01, 5, 3, 0xf6d673);
      mb.restore();
    }
    mb.save();
    mb.translate(0, -r * Math.cos(Math.PI / sides) - 0.004, 0.02);
    mb.scale(1, 0.55, 1);
    mb.sphere(0.015, 6, 3, 0xd8423a);
    mb.restore();
  },

  /** Chistera negra con cinta roja y una hoja prendida. */
  Top_Hat(mb) {
    const black = 0x2c2a30;
    mb.prism(14, 0.158, 0.158, 0, 0.01, black);
    mb.prism(14, 0.078, 0.086, 0.01, 0.16, black, { top: shade(black, 1.15) });
    mb.prism(14, 0.081, 0.083, 0.014, 0.044, 0xc8432b, { top: null, bottom: null });
    leafDecal(mb, -Math.PI / 2 + 0.55, 0.0845, 0.03, 0.014, 0x6e8f2e);
  },

  /** Sombrero de mago con la punta doblada y estrellas que brillan. */
  Wizard_Hat(mb, time) {
    const purple = 0x5f4a9e;
    mb.prism(12, 0.165, 0.165, 0, 0.008, 0x4b3a80);
    mb.prism(10, 0.092, 0.056, 0.008, 0.12, purple, { bottom: null, top: null });
    mb.save();
    mb.translate(0, 0.012, 0.12);
    mb.rotateX(-0.5 - Math.sin(time * 1.5) * 0.05);
    mb.prism(10, 0.056, 0, 0, 0.11, purple);
    mb.restore();
    const rAt = (z: number) => (0.092 - ((z - 0.008) / 0.112) * 0.036) * Math.cos(Math.PI / 10) + 0.003;
    starDecal(mb, -0.008, -rAt(0.045), 0.045, 0.016, 0xf2d16b);
    starDecal(mb, 0.024, -rAt(0.088) + 0.01, 0.088, 0.011, 0xf7e3a1);
  },

  /** Casco de obra amarillo con linterna encendida. */
  Hard_Hat(mb) {
    const yellow = 0xf2c230;
    mb.prism(10, 0.108, 0.102, 0, 0.032, yellow, { bottom: null, top: null });
    mb.prism(10, 0.102, 0.068, 0.032, 0.078, yellow, { bottom: null, top: null });
    mb.prism(10, 0.068, 0, 0.078, 0.098, yellow);
    mb.prism(10, 0.106, 0.134, 0.004, 0, 0xd9a91f, { top: null, bottom: null, flags: DOUBLE });
    mb.save();
    mb.translate(0, -0.098, 0.05);
    mb.rotateX(Math.PI / 2);
    mb.prism(8, 0.022, 0.022, 0, 0.02, 0x5d6266, { top: 0xfff3c4, topFlags: GLOW });
    mb.restore();
  },

  /** Gorro de chef abullonado. */
  Chef_Hat(mb) {
    const white = 0xf6f4ef;
    mb.prism(10, 0.09, 0.093, 0, 0.046, 0xe2ddd2, { bottom: null, top: white });
    mb.save();
    mb.translate(0, 0.005, 0.1);
    mb.sphere(0.1, 9, 5, white, { flags: SOFT });
    mb.restore();
    mb.save();
    mb.translate(-0.055, -0.02, 0.125);
    mb.sphere(0.058, 7, 4, white, { flags: SOFT });
    mb.restore();
    mb.save();
    mb.translate(0.055, -0.015, 0.128);
    mb.sphere(0.056, 7, 4, white, { flags: SOFT });
    mb.restore();
  },

  /** Casco vikingo de acero con aro de bronce y cuernos curvos. */
  Viking_Helmet(mb) {
    const steel = alternate(0x808990, 0x9aa3aa);
    mb.prism(10, 0.108, 0.1, 0, 0.036, 0x9aa3aa, { side: steel, bottom: null, top: null });
    mb.prism(10, 0.1, 0.06, 0.036, 0.086, 0x9aa3aa, { side: steel, bottom: null, top: null });
    mb.prism(10, 0.06, 0, 0.086, 0.102, 0x9aa3aa, { side: steel });
    mb.prism(10, 0.112, 0.112, 0, 0.02, 0xa8743a, { top: null, bottom: null });
    for (const s of [-1, 1]) {
      mb.save();
      mb.translate(s * 0.094, 0, 0.05);
      mb.rotateY(s * 1.05);
      mb.prism(6, 0.03, 0.022, 0, 0.055, 0xefe3c6, { bottom: null, top: null });
      mb.translate(0, 0, 0.055);
      mb.rotateY(-s * 0.75);
      mb.prism(6, 0.022, 0, 0, 0.065, 0xcdbf9e);
      mb.restore();
    }
  },

  /** Cabeza de dinosaurio: hocico con dientes, ojos y crestas naranjas (activa el modo Dinosaurio). */
  Dinosaur_Hat(mb, time) {
    const green = 0x5f9e4a;
    const dark = 0x4a8139;
    const scales = alternate(green, dark);
    mb.prism(10, 0.112, 0.104, 0, 0.04, green, { side: scales, bottom: null, top: null });
    mb.prism(10, 0.104, 0.062, 0.04, 0.09, green, { side: scales, bottom: null, top: null });
    mb.prism(10, 0.062, 0, 0.09, 0.106, green, { side: scales });
    // Hocico hacia el frente (−y) y mandíbula clara que se abre y cierra despacio.
    mb.box(-0.064, -0.2, 0.012, 0.064, -0.07, 0.07, green, { top: shade(green, 1.08) });
    mb.save();
    mb.translate(0, -0.075, 0.012);
    mb.rotateX(-0.12 - Math.max(0, Math.sin(time * 1.6)) * 0.18);
    mb.box(-0.058, -0.118, -0.024, 0.058, 0, 0, 0xd9d48c);
    mb.restore();
    for (let k = 0; k < 4; k++) {
      const x = -0.045 + k * 0.03;
      mb.face(
        [
          [x - 0.009, -0.201, 0.016],
          [x + 0.009, -0.201, 0.016],
          [x, -0.201, 0.002],
        ],
        0xf6f2e4,
        DOUBLE | NO_SHADOW,
        1,
        [x, -0.21, 0.01],
        0.03,
      );
    }
    for (const s of [-1, 1]) {
      mb.save();
      mb.translate(s * 0.05, -0.088, 0.078);
      mb.sphere(0.021, 6, 3, 0xf6f2e4);
      mb.translate(0, -0.016, 0.003);
      mb.sphere(0.0095, 5, 3, 0x1e1a14);
      mb.restore();
      mb.face(
        [
          [s * 0.03, -0.2005, 0.058],
          [s * 0.042, -0.2005, 0.058],
          [s * 0.036, -0.2005, 0.05],
        ],
        0x2f4a24,
        DOUBLE | NO_SHADOW,
        1,
        [s * 0.036, -0.21, 0.055],
        0.03,
      );
    }
    // Crestas dorsales a lo largo de la cabeza.
    const crests: [number, number, number][] = [
      [-0.04, 0.104, 0.046],
      [0.012, 0.104, 0.056],
      [0.062, 0.084, 0.048],
      [0.102, 0.046, 0.038],
    ];
    for (const [y, z, h] of crests) {
      mb.save();
      mb.translate(0, y, z - 0.006);
      mb.prism(4, 0.022, 0, 0, h, 0xe5843a, { rot: 0, bottom: null, side: (_a, k) => (k % 2 ? 0xe5843a : 0xc96d2c) });
      mb.restore();
    }
  },

  /** Gorro de fiesta a rayas, ladeado, con pompón. */
  Party_Hat(mb) {
    mb.save();
    mb.rotateY(0.18);
    mb.prism(10, 0.086, 0, 0, 0.18, 0x4da3d9, { side: alternate(0xf2c230, 0x4da3d9) });
    mb.translate(0, 0, 0.188);
    mb.sphere(0.026, 6, 4, 0xe5584f, { flags: SOFT });
    mb.restore();
  },
};

export function buildHat(mb: MeshBuilder, hat: string, time: number): void {
  const builder = (HATS as Record<string, HatBuilder>)[hat] ?? HATS.Farmer_Cap;
  builder(mb, time);
}
