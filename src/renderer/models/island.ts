import { DOUBLE, MeshBuilder, SOFT, type V3 } from '../iso3d';
import { hash2, mix, PALETTE, shade } from '../palette';

/** Borde de la isla alrededor de la cuadrícula (en casillas). */
export const ISLAND_MARGIN = 0.1;
/** Grosor del acantilado de tierra bajo la fila y = 0 (≈ 0.3 · tileSize). */
export const CLIFF_DEPTH = 0.32;
const CHAMFER = 0.16;
/** Media separación entre casillas: ranuras oscuras finas. */
const TILE_GAP = 0.008;

interface Rim {
  pts: [number, number][];
  /** Normal hacia fuera del tramo que empieza en cada punto. */
  out: [number, number][];
}

/** Perímetro del borde superior (antihorario visto desde arriba), con esquinas achaflanadas y subdividido. */
function rimOf(w: number, h: number, step: number): Rim {
  const m = ISLAND_MARGIN;
  const c = CHAMFER;
  const x0 = -m;
  const y0 = -m;
  const x1 = w + m;
  const y1 = h + m;
  const corners: [number, number][] = [
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ];
  const pts: [number, number][] = [];
  const out: [number, number][] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const segs = Math.max(1, Math.round(len / step));
    const nx = (b[1] - a[1]) / len;
    const ny = -(b[0] - a[0]) / len;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      out.push([nx, ny]);
    }
  }
  return { pts, out };
}

function rockColor(h: number): number {
  return h < 0.4 ? PALETTE.rock : h < 0.7 ? PALETTE.rockDark : PALETTE.rockLight;
}

/** Roca low-poly deformada, achatada en `squash` sobre el eje y (para incrustarla en una pared). */
function rock(mb: MeshBuilder, x: number, y: number, z: number, r: number, seed: number, squashY = 1): void {
  mb.save();
  mb.translate(x, y, z);
  mb.rotateZ(hash2(seed, 7) * Math.PI);
  mb.scale(1, squashY, 0.8 + hash2(seed, 3) * 0.3);
  mb.sphere(r, 6, 4, PALETTE.rock, {
    jitter: (i, j) => 0.78 + hash2(seed * 13 + i, j * 7 + seed) * 0.42,
    color: (i, j) => rockColor(hash2(seed + i * 5, j * 3)),
  });
  mb.restore();
}

/**
 * Isla flotante: borde de pasto, acantilado de arcilla en dos estratos, faldón rocoso que cuelga
 * bajo el frente y rocas de pizarra incrustadas. Todo es estático: se reconstruye al cambiar el tamaño.
 */
export function buildIsland(mb: MeshBuilder, w: number, h: number): void {
  const n = Math.max(w, h);
  const rim = rimOf(w, h, 0.34);
  const count = rim.pts.length;
  const cx = w / 2;
  const cy = h / 2;
  const depth = 0.8 + 0.12 * n;

  // Superficie superior: borde de pasto y, encima, la ranura oscura bajo las casillas.
  mb.face(
    rim.pts.map(([x, y]) => [x, y, 0] as V3),
    PALETTE.islandLip,
    0,
    1,
    [cx, cy, -1],
  );
  mb.face(
    [
      [0, 0, 0],
      [w, 0, 0],
      [w, h, 0],
      [0, h, 0],
    ],
    PALETTE.slot,
    0,
    1,
    [cx, cy, -1],
    0.01,
  );

  // Acantilado: estrato claro arriba y oscuro abajo, con el borde inferior irregular.
  const top: V3[] = [];
  const mid: V3[] = [];
  const bot: V3[] = [];
  for (let i = 0; i < count; i++) {
    const [x, y] = rim.pts[i];
    const [ox, oy] = rim.out[i];
    const h1 = hash2(i * 17, n * 31);
    const h2 = hash2(i * 29 + 5, n * 13);
    top.push([x, y, 0]);
    mid.push([x - ox * 0.004, y - oy * 0.004, -0.11 - h1 * 0.06]);
    bot.push([x - ox * 0.01 * h2, y - oy * 0.01 * h2, -CLIFF_DEPTH + (h2 - 0.5) * 0.08]);
  }
  const cliffCenter: V3 = [cx, cy, -CLIFF_DEPTH / 2];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const h = hash2(i * 7, n * 3);
    const upper = shade(PALETTE.dirtTop, 0.96 + h * 0.08);
    const lower = shade(PALETTE.dirtMid, 0.95 + hash2(i * 11, n) * 0.1);
    mb.face([top[i], top[j], mid[j]], upper, 0, 1, cliffCenter);
    mb.face([top[i], mid[j], mid[i]], shade(upper, 0.97), 0, 1, cliffCenter);
    mb.face([mid[i], mid[j], bot[j]], lower, 0, 1, cliffCenter);
    mb.face([mid[i], bot[j], bot[i]], shade(lower, 0.96), 0, 1, cliffCenter);
  }

  // Faldón inferior: anillos cada vez más estrechos que bajan hacia una punta desplazada al frente.
  const rings: { z: number; s: number; cy: number }[] = [
    { z: -0.66 * depth, s: 0.84, cy: cy - 0.05 * h },
    { z: -1.05 * depth, s: 0.58, cy: cy - 0.14 * h },
    { z: -1.42 * depth, s: 0.3, cy: cy - 0.2 * h },
  ];
  let prev = bot;
  let prevZ = -CLIFF_DEPTH;
  rings.forEach((ring, k) => {
    const next: V3[] = [];
    for (let i = 0; i < count; i++) {
      const [x, y] = rim.pts[i];
      const jr = 0.94 + hash2(i * 41 + k * 3, n * 7 + k) * 0.08;
      const jz = (hash2(i * 23 + k, n * 19 + k * 5) - 0.5) * 0.16;
      next.push([cx + (x - cx) * ring.s * jr, ring.cy + (y - cy) * ring.s * jr, ring.z + jz]);
    }
    const center: V3 = [cx, (ring.cy + cy) / 2, (ring.z + prevZ) / 2];
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const h = hash2(i * 3 + k * 101, n * 11);
      const color =
        k === 0
          ? h < 0.88
            ? shade(PALETTE.dirtDeep, 0.94 + h * 0.12)
            : PALETTE.rockDark
          : k === 1
            ? h < 0.45
              ? shade(PALETTE.dirtDeep, 0.9 + h * 0.2)
              : h < 0.8
                ? PALETTE.rock
                : PALETTE.rockDark
            : rockColor(h);
      mb.face([prev[i], prev[j], next[j]], color, 0, 1, center);
      mb.face([prev[i], next[j], next[i]], shade(color, 0.95), 0, 1, center);
    }
    prev = next;
    prevZ = ring.z;
  });
  const tip: V3 = [cx + (hash2(n, 5) - 0.5) * 0.3 * Math.min(1, w), cy - 0.24 * h, -1.75 * depth];
  const tipCenter: V3 = [cx, cy - 0.2 * h, (prevZ + tip[2]) / 2];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    mb.face([prev[i], prev[j], tip], rockColor(hash2(i * 5, n * 3 + 1)), 0, 1, tipCenter);
  }

  // Perfil del frente (y en función de z) para apoyar rocas y estalactitas sobre la superficie.
  const front = -ISLAND_MARGIN;
  const profile: [number, number][] = [
    [-CLIFF_DEPTH, front],
    ...rings.map((r): [number, number] => [r.z, r.cy + (front - cy) * r.s]),
  ];
  const frontY = (z: number): number => {
    for (let i = 1; i < profile.length; i++) {
      const [za, ya] = profile[i - 1];
      const [zb, yb] = profile[i];
      if (z >= zb) return ya + ((yb - ya) * (z - za)) / (zb - za);
    }
    return profile[profile.length - 1][1];
  };

  // Rocas incrustadas en el frente del acantilado y en el faldón.
  const cliffRocks = Math.round(1.6 * w + 1);
  for (let k = 0; k < cliffRocks; k++) {
    const x = 0.12 + hash2(k * 7, n * 3 + 1) * Math.max(0, w - 0.24);
    const z = -0.1 - hash2(k * 3, n + 9) * 0.18;
    rock(mb, x, front - 0.004, z, 0.05 + hash2(k, n * 5) * 0.035, k * 13 + n, 0.55);
  }
  const skirtRocks = Math.round(2 * w + 2);
  for (let k = 0; k < skirtRocks; k++) {
    const x = 0.1 + hash2(k * 11, n * 7 + 2) * Math.max(0, w - 0.2);
    const zTop = -CLIFF_DEPTH - 0.06;
    const zBottom = rings[1].z + 0.05;
    const z = zTop + hash2(k * 5, n * 3 + 4) * (zBottom - zTop);
    rock(mb, x, frontY(z) - 0.01, z, 0.07 + hash2(k * 3, n) * 0.06, k * 31 + n * 7, 0.6);
  }
  // Estalactitas de piedra que cuelgan del faldón, por fuera de su superficie.
  const spikes = Math.round(1.2 * w + 1);
  for (let k = 0; k < spikes; k++) {
    const x = 0.25 + hash2(k * 19, n * 11) * Math.max(0, w - 0.5);
    const z = rings[0].z + (rings[2].z - rings[0].z) * (0.25 + hash2(k, n * 4) * 0.55);
    const y = frontY(z) - 0.035;
    const len = (0.25 + hash2(k * 9, n) * 0.35) * depth;
    mb.save();
    mb.translate(x, y, z);
    mb.prism(5, 0, 0.05 + hash2(k * 2, n) * 0.04, -len, 0, rockColor(hash2(k, 3)), {
      rot: hash2(k, 9) * Math.PI,
      top: null,
      side: (_a, i) => rockColor(hash2(k * 7 + i, 5)),
    });
    mb.restore();
  }

  // Mechones de pasto que asoman sobre el borde del acantilado (frente y chaflanes).
  for (let i = 0; i < count; i++) {
    const [ox, oy] = rim.out[i];
    if (oy > -0.3) continue; // solo los tramos que miran al sur
    const [x0, y0] = rim.pts[i];
    const [x1, y1] = rim.pts[(i + 1) % count];
    const tufts = 4;
    for (let t = 0; t < tufts; t++) {
      const u0 = t / tufts;
      const u1 = (t + 1) / tufts;
      const h = hash2(i * 13 + t, n * 7);
      const ax = x0 + (x1 - x0) * u0 + ox * 0.004;
      const ay = y0 + (y1 - y0) * u0 + oy * 0.004;
      const bx = x0 + (x1 - x0) * u1 + ox * 0.004;
      const by = y0 + (y1 - y0) * u1 + oy * 0.004;
      const mx = (ax + bx) / 2 + ox * 0.012;
      const my = (ay + by) / 2 + oy * 0.012;
      mb.face(
        [
          [ax, ay, 0.004],
          [bx, by, 0.004],
          [mx, my, -0.035 - h * 0.05],
        ],
        h < 0.5 ? PALETTE.islandLip : PALETTE.islandLipLight,
        DOUBLE | SOFT,
        1,
        undefined,
        0.02,
      );
    }
  }
}

/** Casilla: dos facetas planas (doc 05) y, si es Soil, cuatro caballones de surco en relieve. */
export function buildGround(mb: MeshBuilder, x: number, y: number, ground: number, water: number): void {
  const g = TILE_GAP;
  const variation = 0.97 + hash2(x, y) * 0.06; // ±3 % de brillo
  const base = ground === 0 ? mix(PALETTE.grassland, PALETTE.grasslandWet, water * 0.7) : mix(PALETTE.soil, PALETTE.soilWet, water);
  const color = shade(base, variation);
  const x0 = x + g;
  const x1 = x + 1 - g;
  const y0 = y + g;
  const y1 = y + 1 - g;
  const below: V3 = [x + 0.5, y + 0.5, -1];
  mb.face(
    [
      [x0, y0, 0],
      [x1, y1, 0],
      [x0, y1, 0],
    ],
    shade(color, 1.03),
    0,
    1,
    below,
  );
  mb.face(
    [
      [x0, y0, 0],
      [x1, y0, 0],
      [x1, y1, 0],
    ],
    shade(color, 0.98),
    0,
    1,
    below,
  );
  if (ground === 1) {
    const ridge = mix(PALETTE.soilRidge, PALETTE.soilWet, water * 0.85);
    for (let k = 0; k < 4; k++) {
      const yy = y + 0.17 + k * 0.22;
      mb.box(x + 0.08, yy - 0.035, 0, x + 0.92, yy + 0.035, 0.04, ridge);
    }
  }
}

/**
 * Pasto: manojo de 14 espigas finas que crece en vertical de 0.2 a 1.0, verde al brotar y dorado
 * al madurar; las puntas claras indican que ya se puede cosechar.
 */
export function buildGrass(mb: MeshBuilder, x: number, y: number, growth: number): void {
  const cx = x + 0.5;
  const cy = y + 0.48;
  const g = Math.min(1, growth);
  const scale = 0.2 + 0.8 * g;
  const mature = growth >= 1;
  const front = mix(PALETTE.bladeYoung, PALETTE.bladeGrown, g);
  const back = mix(shade(PALETTE.bladeYoung, 0.85), PALETTE.bladeShade, g);
  const count = 18;
  for (let i = 0; i < count; i++) {
    const a = hash2(x * 97 + i * 13, y * 61 - i * 7) * Math.PI * 2;
    const r = Math.sqrt(hash2(x * 31 - i * 5, y * 43 + i * 11));
    const j = hash2(x * 11 + i, y * 19 + i * 3);
    const bx = cx + Math.cos(a) * r * 0.22;
    const by = cy + Math.sin(a) * r * 0.17;
    const h = 0.4 * scale * (0.72 + j * 0.5);
    const theta = hash2(i * 7 + x, y * 3 + i) * Math.PI;
    const w = 0.04;
    const tip: V3 = [
      bx + ((bx - cx) * 0.75 + (j - 0.5) * 0.08) * scale,
      by + ((by - cy) * 0.75 + (j - 0.5) * 0.05) * scale,
      h,
    ];
    const b1: V3 = [bx - Math.cos(theta) * w, by - Math.sin(theta) * w, 0];
    const b2: V3 = [bx + Math.cos(theta) * w, by + Math.sin(theta) * w, 0];
    const t = Math.min(1, Math.max(0, 1 - (by - (cy - 0.17)) / 0.34));
    mb.face([b1, b2, tip], shade(mix(back, front, t), 1.06), DOUBLE | SOFT);
    if (mature) {
      const k = 0.66;
      mb.face(
        [
          [b1[0] + (tip[0] - b1[0]) * k, b1[1] + (tip[1] - b1[1]) * k, b1[2] + (tip[2] - b1[2]) * k],
          [b2[0] + (tip[0] - b2[0]) * k, b2[1] + (tip[1] - b2[1]) * k, b2[2] + (tip[2] - b2[2]) * k],
          tip,
        ],
        PALETTE.bladeTip,
        DOUBLE | SOFT,
        1,
        undefined,
        0.001,
      );
    }
  }
}
