import type { MeshBuilder } from '../../src/renderer/iso3d';
import { DOUBLE, GLOW, METAL, NO_SHADOW, RUST, type SpriteDef, type V3 } from './iso';
import { C, mix, rnd, shade } from './palette';
import { lathe, rivet, tube } from './shapes';

/**
 * «El Chatarrero» (doc 06 §1): cuerpo esférico remachado con parches de óxido y dos lentes
 * desparejadas, dos hélices laterales (fotograma sólido y borroso), brazo articulado con pinza y
 * la mascota: perro-alcancía volador de latón y cobre oxidado.
 */

const BODY_R = 0.3;
/** Dirección hacia el espectador (Sur-Oeste) en planta. */
const FRONT = -Math.PI * 0.75;

function onSphere(r: number, az: number, el: number): V3 {
  return [Math.cos(el) * Math.cos(az) * r, Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r];
}

function lens(mb: MeshBuilder, az: number, el: number, r: number, depth: number, glass: number, glow: number): void {
  const p = onSphere(BODY_R * 0.96, az, el);
  mb.save();
  mb.translate(p[0], p[1], p[2]);
  mb.rotateZ(az);
  mb.rotateY(Math.PI / 2 - el);
  lathe(mb, 10, [[r * 1.18, 0], [r * 1.12, depth], [r, depth + 0.006]], C.copper, { top: glass, flags: METAL, rot: 0, side: (k) => (k % 2 ? C.copper : C.copperDark) });
  // Reflejo y brillo de la lente.
  mb.save();
  mb.translate(r * 0.3, -r * 0.25, depth + 0.008);
  mb.disc(8, r * 0.32, 0, glow, GLOW | NO_SHADOW, 0.95, 0.01);
  mb.restore();
  mb.restore();
}

function body(mb: MeshBuilder): void {
  const tones = [C.copper, mix(C.copper, C.iron, 0.5), mix(C.copperDark, C.ironRust, 0.4), shade(C.copper, 1.12)];
  mb.sphere(BODY_R, 14, 9, C.copper, {
    flags: METAL | RUST,
    // Parches de chapa de distintos tonos.
    color: (i, j) => tones[Math.floor(rnd(Math.floor(i / 3), Math.floor(j / 3)) * tones.length)],
  });
  // Costuras remachadas: ecuador y un meridiano.
  for (let k = 0; k < 16; k++) {
    const az = (k / 16) * Math.PI * 2;
    const p = onSphere(BODY_R * 1.0, az, 0);
    rivet(mb, p[0], p[1], p[2], 0.016, C.copperLight, METAL | NO_SHADOW);
  }
  for (let k = 1; k < 8; k++) {
    const el = -Math.PI / 2 + (k / 8) * Math.PI;
    const p = onSphere(BODY_R * 1.0, FRONT + 0.9, el);
    rivet(mb, p[0], p[1], p[2], 0.015, C.copperLight, METAL | NO_SHADOW);
  }
  // Parche remachado de chapa oxidada.
  const pc = onSphere(BODY_R * 0.99, FRONT - 0.9, 0.35);
  mb.save();
  mb.translate(pc[0], pc[1], pc[2]);
  mb.rotateZ(FRONT - 0.9);
  mb.rotateY(Math.PI / 2 - 0.35);
  mb.box(-0.07, -0.06, 0, 0.07, 0.06, 0.012, mix(C.iron, C.ironRust, 0.5), { flags: METAL | RUST });
  for (const [x, y] of [
    [-0.055, -0.045],
    [0.055, -0.045],
    [-0.055, 0.045],
    [0.055, 0.045],
  ]) {
    rivet(mb, x, y, 0.012, 0.009, C.copperLight, METAL | NO_SHADOW);
  }
  mb.restore();
  // Dos lentes de cámara desparejadas al frente.
  lens(mb, FRONT + 0.28, 0.12, 0.085, 0.05, C.lens, C.lensGlow);
  lens(mb, FRONT - 0.42, 0.3, 0.05, 0.035, 0x2a1d14, C.amber);
  // Antenas y cables detrás.
  const back = FRONT + Math.PI;
  const a0 = onSphere(BODY_R * 0.9, back - 0.3, 0.6);
  tube(mb, [a0, [a0[0] + 0.03, a0[1] + 0.03, a0[2] + 0.18], [a0[0] + 0.07, a0[1] + 0.04, a0[2] + 0.3]], [0.008, 0.007, 0.006], 4, 0x3d3833, { flags: METAL, cap: null });
  mb.save();
  mb.translate(a0[0] + 0.07, a0[1] + 0.04, a0[2] + 0.31);
  mb.sphere(0.02, 6, 3, C.alert, { flags: GLOW });
  mb.restore();
  const a1 = onSphere(BODY_R * 0.92, back + 0.4, 0.45);
  tube(mb, [a1, [a1[0] + 0.05, a1[1] + 0.02, a1[2] + 0.12], [a1[0] + 0.12, a1[1] + 0.05, a1[2] + 0.16]], [0.006, 0.006, 0.005], 4, 0x3d3833, { flags: METAL, cap: C.copperLight });
  const c0 = onSphere(BODY_R * 0.95, back, -0.1);
  tube(mb, [c0, [c0[0] + 0.1, c0[1] + 0.1, c0[2] - 0.08], [c0[0] + 0.06, c0[1] + 0.12, c0[2] - 0.2], onSphere(BODY_R * 0.9, back + 0.6, -0.5)], [0.012, 0.012, 0.012, 0.012], 5, 0x2b2622, { flags: NO_SHADOW, cap: null });
}

/** Hélice lateral izquierda; el brazo corto apunta hacia la derecha de la pantalla (hacia el cuerpo). */
function rotor(mb: MeshBuilder, blurred: boolean): void {
  // Brazo hacia el cuerpo: derecha de la pantalla = Sur-Este en el mundo.
  const dir: V3 = [Math.SQRT1_2, -Math.SQRT1_2, 0];
  tube(mb, [[0, 0, -0.03], [dir[0] * 0.2, dir[1] * 0.2, -0.06]], [0.024, 0.02], 6, mix(C.iron, C.copperDark, 0.5), { flags: METAL | RUST, cap: null });
  // Motor.
  mb.save();
  mb.translate(0, 0, -0.08);
  lathe(mb, 10, [[0.045, 0], [0.05, 0.06], [0.03, 0.09]], 0x4a453f, { flags: METAL, top: 0x6a645c, side: (k) => (k % 2 ? 0x4a453f : 0x5a554e) });
  mb.restore();
  if (blurred) {
    mb.save();
    mb.translate(0, 0, 0.02);
    mb.disc(22, 0.3, 0, 0xd9cfbd, DOUBLE | GLOW | NO_SHADOW, 0.32, 0.01);
    mb.disc(22, 0.17, 0.002, 0xe8dfcd, DOUBLE | GLOW | NO_SHADOW, 0.22, 0.012);
    for (let k = 0; k < 2; k++) {
      mb.save();
      mb.rotateZ(1.2 + k * Math.PI);
      mb.face([[0.03, -0.014, 0.004], [0.29, -0.04, 0.004], [0.29, 0.04, 0.004], [0.03, 0.014, 0.004]], 0x3a352f, DOUBLE | NO_SHADOW, 0.35, undefined, 0.014);
      mb.restore();
    }
    mb.restore();
  } else {
    mb.save();
    mb.translate(0, 0, 0.02);
    for (let k = 0; k < 3; k++) {
      mb.save();
      mb.rotateZ(0.35 + (k * Math.PI * 2) / 3);
      mb.rotateX(0.18);
      mb.face([[0.02, -0.022, 0], [0.29, -0.046, 0.006], [0.3, 0.016, 0.006], [0.02, 0.022, 0]], mix(C.copper, C.iron, 0.4), DOUBLE | METAL);
      mb.restore();
    }
    mb.restore();
  }
  mb.save();
  mb.translate(0, 0, 0.02);
  mb.sphere(0.022, 6, 3, C.copperLight, { flags: METAL });
  mb.restore();
}

/** Brazo articulado colgando del cuerpo, con pinza; el hombro está en el origen. */
function arm(mb: MeshBuilder): void {
  const steel = mix(C.iron, 0x7a746a, 0.4);
  mb.sphere(0.04, 8, 4, C.copperDark, { flags: METAL });
  const elbow: V3 = [-0.06, -0.06, -0.2];
  const wrist: V3 = [-0.02, -0.03, -0.38];
  tube(mb, [[0, 0, 0], elbow], [0.026, 0.022], 6, steel, { flags: METAL | RUST, joints: false });
  mb.save();
  mb.translate(elbow[0], elbow[1], elbow[2]);
  mb.sphere(0.032, 8, 4, C.copper, { flags: METAL });
  mb.restore();
  tube(mb, [elbow, wrist], [0.02, 0.018], 6, steel, { flags: METAL | RUST, joints: false });
  // Pistón paralelo.
  tube(mb, [[0.02, -0.02, -0.04], [elbow[0] + 0.03, elbow[1], elbow[2] + 0.04]], [0.008, 0.008], 4, 0xb8b2a4, { flags: METAL, joints: false });
  // Pinza de dos dedos.
  mb.save();
  mb.translate(wrist[0], wrist[1], wrist[2]);
  mb.sphere(0.026, 6, 3, 0x4a453f, { flags: METAL });
  for (const s of [-1, 1]) {
    tube(mb, [[0, 0, 0], [s * 0.04, -s * 0.01, -0.05], [s * 0.015, 0, -0.09]], [0.012, 0.01, 0.006], 4, 0x5a554e, { flags: METAL, cap: 0x8a867c });
  }
  mb.restore();
}

function dog(mb: MeshBuilder): void {
  const brass = C.copperLight;
  const patina = mix(C.copper, 0x5f8a7a, 0.45);
  mb.save();
  // Mira hacia la izquierda de la pantalla (Nor-Oeste no: Sur-Oeste ligeramente).
  mb.rotateZ(Math.PI * 0.85);
  // Cuerpo de alcancía: tonel horizontal.
  mb.save();
  mb.translate(-0.2, 0, 0);
  mb.rotateY(Math.PI / 2);
  lathe(
    mb,
    14,
    [
      [0.1, 0],
      [0.16, 0.06],
      [0.18, 0.2],
      [0.16, 0.34],
      [0.1, 0.4],
    ],
    brass,
    { flags: METAL | RUST, top: shade(brass, 0.9), side: (k, ring) => (rnd(k, ring) > 0.78 ? patina : k % 2 ? brass : C.copper), rot: 0 },
  );
  mb.restore();
  // Bandas remachadas y ranura para monedas.
  for (const x of [-0.12, 0.12]) {
    mb.save();
    mb.translate(x - 0.015, 0, 0);
    mb.rotateY(Math.PI / 2);
    lathe(mb, 14, [[0.185, 0], [0.185, 0.03]], C.copperDark, { flags: METAL, top: C.copperDark, rot: 0 });
    mb.restore();
  }
  mb.box(-0.06, -0.012, 0.176, 0.06, 0.012, 0.19, 0x1c1410, { flags: NO_SHADOW });
  // Patas cortas.
  for (const [x, y] of [
    [-0.11, -0.09],
    [0.11, -0.09],
    [-0.11, 0.09],
    [0.11, 0.09],
  ]) {
    tube(mb, [[x, y, -0.1], [x, y, -0.2]], [0.035, 0.03], 7, C.copper, { flags: METAL, cap: C.copperDark });
  }
  // Cabeza con hocico, ojos, orejas de chapa y collar.
  mb.save();
  mb.translate(0.27, 0, 0.08);
  mb.sphere(0.12, 10, 6, brass, { flags: METAL | RUST, color: (i, j) => (rnd(i, j, 4) > 0.82 ? patina : brass) });
  mb.save();
  mb.translate(0.1, 0, -0.03);
  mb.rotateY(Math.PI / 2);
  lathe(mb, 10, [[0.06, 0], [0.055, 0.07], [0.04, 0.09]], C.copper, { flags: METAL, top: 0x2a1d14, rot: 0 });
  mb.restore();
  for (const y of [-0.06, 0.06]) {
    mb.save();
    mb.translate(0.09, y, 0.05);
    mb.sphere(0.022, 6, 3, 0x1a1412, { flags: METAL });
    mb.restore();
    mb.save();
    mb.translate(0.0, y * 1.5, 0.08);
    mb.rotateX(Math.sign(y) * 0.9);
    mb.box(-0.05, -0.015, -0.12, 0.04, 0.015, 0, C.copperDark, { flags: METAL | RUST });
    mb.restore();
  }
  mb.restore();
  mb.save();
  mb.translate(0.18, 0, 0.0);
  mb.rotateY(Math.PI / 2);
  lathe(mb, 12, [[0.13, 0], [0.13, 0.035]], C.alert, { top: C.alert, rot: 0 });
  mb.restore();
  rivet(mb, 0.22, 0, -0.12, 0.022, C.brass, METAL);
  // Hélice en el lomo y cola de alambre rizada.
  tube(mb, [[-0.02, 0, 0.18], [-0.02, 0, 0.27]], [0.012, 0.01], 5, 0x4a453f, { flags: METAL });
  for (let k = 0; k < 2; k++) {
    mb.save();
    mb.translate(-0.02, 0, 0.27);
    mb.rotateZ(0.5 + k * Math.PI);
    mb.face([[0.01, -0.015, 0], [0.16, -0.03, 0.01], [0.16, 0.02, 0.01], [0.01, 0.015, 0]], brass, DOUBLE | METAL);
    mb.restore();
  }
  const tail: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = i * 0.9;
    tail.push([-0.2 - i * 0.016, Math.cos(a) * 0.035, 0.06 + Math.sin(a) * 0.035 + i * 0.01]);
  }
  tube(mb, tail, tail.map(() => 0.007), 4, C.copperDark, { flags: METAL | NO_SHADOW, joints: false });
  mb.restore();
}

export const DRONE: SpriteDef[] = [
  { name: 'drone_body', w: 112, h: 112, ax: 56, ay: 60, anchor: [0.5, 0.5], outline: 1.2, build: body },
  { name: 'drone_rotor_a', w: 112, h: 80, ax: 52, ay: 44, outline: 1, build: (mb) => rotor(mb, false) },
  { name: 'drone_rotor_b', w: 112, h: 80, ax: 52, ay: 44, outline: 0.6, build: (mb) => rotor(mb, true) },
  { name: 'drone_arm', w: 64, h: 96, ax: 32, ay: 14, outline: 1, build: arm },
  { name: 'pet_dog', w: 128, h: 112, ax: 64, ay: 60, anchor: [0.5, 0.5], outline: 1.2, build: dog },
];


