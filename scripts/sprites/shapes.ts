import type { MeshBuilder } from '../../src/renderer/iso3d';
import { type V3 } from './iso';
import { rnd } from './palette';

/** Superficie de revolución: anillos [radio, z]; `side(k, anillo)` colorea cada gajo y `jitter` los deforma. */
export function lathe(
  mb: MeshBuilder,
  sides: number,
  profile: readonly [number, number][],
  color: number,
  opt: { side?: (k: number, ring: number) => number; top?: number | null; flags?: number; jitter?: (k: number, ring: number) => number; rot?: number } = {},
): void {
  const rot = opt.rot ?? -Math.PI / 2 + Math.PI / sides;
  const rings: V3[][] = profile.map(([r, z], ri) => {
    const out: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + (k * 2 * Math.PI) / sides;
      const rr = r * (opt.jitter ? opt.jitter(k, ri) : 1);
      out.push([Math.cos(a) * rr, Math.sin(a) * rr, z]);
    }
    return out;
  });
  const center: V3 = [0, 0, (profile[0][1] + profile[profile.length - 1][1]) / 2];
  const flags = opt.flags ?? 0;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      const a = rings[ri];
      const b = rings[ri + 1];
      const col = opt.side ? opt.side(k, ri) : color;
      if (profile[ri][0] < 1e-6) mb.face([a[k], b[j], b[k]], col, flags, 1, center);
      else if (profile[ri + 1][0] < 1e-6) mb.face([a[k], a[j], b[k]], col, flags, 1, center);
      else mb.face([a[k], a[j], b[j], b[k]], col, flags, 1, center);
    }
  }
  const last = profile[profile.length - 1];
  if (opt.top !== null && last[0] > 1e-6) mb.face(rings[rings.length - 1], opt.top ?? color, flags, 1, center);
}

/** Esfera irregular (silueta orgánica): `amount` es la deformación relativa del radio. */
export function blob(
  mb: MeshBuilder,
  r: number,
  color: number,
  opt: { segs?: number; rings?: number; amount?: number; seed?: number; flags?: number; color?: (i: number, j: number) => number } = {},
): void {
  const amount = opt.amount ?? 0.18;
  const seed = opt.seed ?? 1;
  mb.sphere(r, opt.segs ?? 9, opt.rings ?? 5, color, {
    flags: opt.flags,
    jitter: (i, j) => 1 - amount + 2 * amount * rnd(seed, i, j),
    color: opt.color,
  });
}

/**
 * Tubo por una polilínea (troncos retorcidos, tallos, cables): prismas orientados entre puntos
 * con esferas en las uniones. `radii[i]` es el radio en cada punto.
 */
export function tube(
  mb: MeshBuilder,
  pts: readonly V3[],
  radii: readonly number[],
  sides: number,
  color: number,
  opt: { flags?: number; side?: (angle: number, k: number) => number; joints?: boolean; cap?: number | null } = {},
): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    mb.save();
    mb.translate(a[0], a[1], a[2]);
    mb.rotateZ(Math.atan2(dy, dx));
    mb.rotateY(Math.acos(Math.max(-1, Math.min(1, dz / len))));
    const last = i === pts.length - 2;
    mb.prism(sides, radii[i], radii[i + 1], 0, len, color, {
      flags: opt.flags,
      side: opt.side,
      bottom: null,
      top: last ? (opt.cap === undefined ? color : opt.cap) : null,
    });
    mb.restore();
    if (opt.joints !== false && i > 0) {
      mb.save();
      mb.translate(a[0], a[1], a[2]);
      mb.sphere(radii[i] * 1.02, sides, 3, color, { flags: opt.flags });
      mb.restore();
    }
  }
}

/** Remache: cabeza abombada pequeña. */
export function rivet(mb: MeshBuilder, x: number, y: number, z: number, r: number, color: number, flags = 0): void {
  mb.save();
  mb.translate(x, y, z);
  mb.scale(1, 1, 0.55);
  mb.sphere(r, 6, 3, color, { flags });
  mb.restore();
}

/** Tabla o chapa: caja de `length` × `thick` × `height` girada `yaw` en planta e inclinada `lean`. */
export function plank(
  mb: MeshBuilder,
  cx: number,
  cy: number,
  z0: number,
  length: number,
  thick: number,
  height: number,
  color: number,
  opt: { yaw?: number; lean?: number; flags?: number; top?: number; front?: number } = {},
): void {
  mb.save();
  mb.translate(cx, cy, z0);
  mb.rotateZ(opt.yaw ?? 0);
  mb.rotateX(opt.lean ?? 0);
  mb.box(-length / 2, -thick / 2, 0, length / 2, thick / 2, height, color, { flags: opt.flags, top: opt.top, front: opt.front });
  mb.restore();
}

/** Hoja plana con nervio (dos triángulos) apuntando en el ángulo `a`, con caída `droop`. */
export function leaf(mb: MeshBuilder, base: V3, a: number, len: number, wid: number, droop: number, color: number, flags: number, curl = 0): void {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const px = -sa * wid;
  const py = ca * wid;
  const mid: V3 = [base[0] + ca * len * 0.5, base[1] + sa * len * 0.5, base[2] + len * (0.18 - droop * 0.3)];
  const tip: V3 = [base[0] + ca * len, base[1] + sa * len, base[2] + len * (0.1 - droop) + curl];
  mb.face([base, [mid[0] + px, mid[1] + py, mid[2]], tip, mid], color, flags);
  mb.face([base, mid, tip, [mid[0] - px, mid[1] - py, mid[2] - wid * 0.2]], color, flags);
}
