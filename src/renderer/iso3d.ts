import type { Graphics } from 'pixi.js';

/**
 * Mini motor 3D low-poly para PixiJS (doc 05: estética facetada 2.5D sin motor 3D pesado).
 * Cámara ortográfica inclinada mirando al norte, sombreado plano por cara con una luz
 * direccional desde arriba a la izquierda, orden del pintor y sombras proyectadas al suelo.
 *
 * Unidades del mundo: 1 = una casilla. x = este, y = norte, z = arriba.
 */

export type V3 = [number, number, number];

/** Lado de una casilla en píxeles lógicos antes del zoom de la cámara (doc 06: 64×64). */
export const TILE = 64;
/** Elevación de la cámara sobre el horizonte: bastante inclinada para que los objetos tengan volumen. */
export const ELEVATION_DEG = 50;
const ELEV = (ELEVATION_DEG * Math.PI) / 180;
export const SIN_E = Math.sin(ELEV);
export const COS_E = Math.cos(ELEV);
/** Dirección hacia la cámara (descarte de caras traseras y luz de relleno). */
const TO_CAM: V3 = [0, -COS_E, SIN_E];

function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Luz direccional única desde arriba a la izquierda (noroeste y arriba, ~315° en pantalla). */
const LIGHT = normalize([-1, 0.85, 1.7]);
/** Desplazamiento de una sombra en el suelo por unidad de altura: hacia abajo a la derecha. */
export const SHADOW_DX = -LIGHT[0] / LIGHT[2];
export const SHADOW_DY = -LIGHT[1] / LIGHT[2];
export const SHADOW_COLOR = 0x1e1a14;
export const SHADOW_ALPHA = 0.28;

/** Cara visible por ambos lados (hojas, alas, alas de sombrero). */
export const DOUBLE = 1;
/** Sin sombreado (luces, ojos, piezas emisivas). */
export const GLOW = 2;
/** Sombreado suave para follaje y tela. */
export const SOFT = 4;
/** No proyecta sombra. */
export const NO_SHADOW = 8;

export interface Face {
  p: V3[];
  /** Color base. */
  c: number;
  /** Banderas DOUBLE | GLOW | SOFT | NO_SHADOW. */
  f: number;
  /** Opacidad. */
  a: number;
  /** Sesgo de profundidad: valores positivos se dibujan después (calcomanías sobre otra cara). */
  b: number;
  /** Profundidad calculada al dibujar. */
  d: number;
  /** Color sombreado calculado al dibujar. */
  s: number;
}

export function screenX(x: number): number {
  return x * TILE;
}

export function screenY(y: number, z: number): number {
  return -(y * SIN_E + z * COS_E) * TILE;
}

/** Profundidad a lo largo de la vista: mayor = más lejos. */
export function viewDepth(y: number, z: number): number {
  return y * COS_E - z * SIN_E;
}

/** Punto del suelo (z = 0) bajo una posición de pantalla. */
export function groundFromScreen(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / TILE, y: -sy / (TILE * SIN_E) };
}

/** Normal de un polígono plano (método de Newell): sentido antihorario = normal hacia el observador. */
function newell(p: readonly V3[]): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

export function scaleColor(color: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * f)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
}

function shade(nx: number, ny: number, nz: number, color: number, flags: number): number {
  if (flags & GLOW) return color;
  const dl = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const dc = Math.max(0, ny * TO_CAM[1] + nz * TO_CAM[2]);
  const f = flags & SOFT ? 0.84 + 0.17 * dl + 0.05 * dc : 0.68 + 0.3 * dl + 0.1 * dc;
  return scaleColor(color, f);
}

type Mat = number[];

const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export interface PrismOptions {
  /** Ángulo del primer vértice; por defecto una cara plana mira al sur (−y). */
  rot?: number;
  /** Color de la tapa superior; null = sin tapa. */
  top?: number | null;
  /** Color de la tapa inferior; null = sin tapa. */
  bottom?: number | null;
  /** Color de cada cara lateral según el ángulo de su centro y su índice. */
  side?: (angle: number, index: number) => number;
  flags?: number;
  topFlags?: number;
  alpha?: number;
}

/**
 * Constructor de mallas con pila de transformaciones (como un canvas 2D, pero en 3D).
 * Las primitivas cerradas orientan sus caras hacia fuera automáticamente.
 */
export class MeshBuilder {
  readonly faces: Face[] = [];
  private m: Mat = [...IDENTITY];
  private readonly stack: Mat[] = [];

  clear(): this {
    this.faces.length = 0;
    this.m = [...IDENTITY];
    this.stack.length = 0;
    return this;
  }

  save(): this {
    this.stack.push(this.m.slice());
    return this;
  }

  restore(): this {
    const m = this.stack.pop();
    if (m) this.m = m;
    return this;
  }

  private mul(b: readonly number[]): this {
    const a = this.m;
    this.m = [
      a[0] * b[0] + a[1] * b[4] + a[2] * b[8],
      a[0] * b[1] + a[1] * b[5] + a[2] * b[9],
      a[0] * b[2] + a[1] * b[6] + a[2] * b[10],
      a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
      a[4] * b[0] + a[5] * b[4] + a[6] * b[8],
      a[4] * b[1] + a[5] * b[5] + a[6] * b[9],
      a[4] * b[2] + a[5] * b[6] + a[6] * b[10],
      a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
      a[8] * b[0] + a[9] * b[4] + a[10] * b[8],
      a[8] * b[1] + a[9] * b[5] + a[10] * b[9],
      a[8] * b[2] + a[9] * b[6] + a[10] * b[10],
      a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
    ];
    return this;
  }

  translate(x: number, y: number, z: number): this {
    return this.mul([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
  }

  scale(x: number, y = x, z = x): this {
    return this.mul([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]);
  }

  /** Giro alrededor de x: con a > 0 la parte de arriba se inclina hacia el sur (−y). */
  rotateX(a: number): this {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return this.mul([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
  }

  /** Giro alrededor de y: con a > 0 la parte de arriba se inclina hacia el este (+x). */
  rotateY(a: number): this {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return this.mul([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
  }

  /** Giro alrededor de z (rumbo), antihorario visto desde arriba. */
  rotateZ(a: number): this {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return this.mul([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]);
  }

  point(x: number, y: number, z: number): V3 {
    const m = this.m;
    return [
      m[0] * x + m[1] * y + m[2] * z + m[3],
      m[4] * x + m[5] * y + m[6] * z + m[7],
      m[8] * x + m[9] * y + m[10] * z + m[11],
    ];
  }

  /**
   * Añade una cara plana con puntos en coordenadas locales. Si se da `center` (local),
   * la cara se orienta para que su normal apunte en sentido contrario a ese punto.
   */
  face(pts: readonly V3[], color: number, flags = 0, alpha = 1, center?: V3, bias = 0): this {
    const p = pts.map((q) => this.point(q[0], q[1], q[2]));
    if (center) {
      const c = this.point(center[0], center[1], center[2]);
      const n = newell(p);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const q of p) {
        cx += q[0];
        cy += q[1];
        cz += q[2];
      }
      cx /= p.length;
      cy /= p.length;
      cz /= p.length;
      if (n[0] * (cx - c[0]) + n[1] * (cy - c[1]) + n[2] * (cz - c[2]) < 0) p.reverse();
    }
    this.faces.push({ p, c: color, f: flags, a: alpha, b: bias, d: 0, s: color });
    return this;
  }

  /** Tronco de prisma de `sides` lados a lo largo de z; r1 = 0 da un cono y r0 = 0 un cono invertido. */
  prism(sides: number, r0: number, r1: number, z0: number, z1: number, color: number, opt: PrismOptions = {}): this {
    const rot = opt.rot ?? -Math.PI / 2 + Math.PI / sides;
    const flags = opt.flags ?? 0;
    const alpha = opt.alpha ?? 1;
    const center: V3 = [0, 0, (z0 + z1) / 2];
    const ring = (r: number, z: number): V3[] => {
      const out: V3[] = [];
      for (let k = 0; k < sides; k++) {
        const a = rot + (k * 2 * Math.PI) / sides;
        out.push([Math.cos(a) * r, Math.sin(a) * r, z]);
      }
      return out;
    };
    const bot = ring(r0, z0);
    const top = ring(r1, z1);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      const mid = rot + ((k + 0.5) * 2 * Math.PI) / sides;
      const col = opt.side ? opt.side(mid, k) : color;
      if (r1 <= 1e-9) this.face([bot[k], bot[j], top[k]], col, flags, alpha, center);
      else if (r0 <= 1e-9) this.face([bot[k], top[j], top[k]], col, flags, alpha, center);
      else this.face([bot[k], bot[j], top[j], top[k]], col, flags, alpha, center);
    }
    if (opt.top !== null && r1 > 1e-9) this.face(top, opt.top ?? color, opt.topFlags ?? flags, alpha, center);
    if (opt.bottom !== null && r0 > 1e-9) this.face(bot, opt.bottom ?? color, flags, alpha, center);
    return this;
  }

  /** Caja alineada con los ejes locales. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: number,
    opt: { top?: number; front?: number; flags?: number; alpha?: number } = {},
  ): this {
    const c: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const f = opt.flags ?? 0;
    const a = opt.alpha ?? 1;
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], color, f, a, c);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], opt.top ?? color, f, a, c);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], opt.front ?? color, f, a, c);
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color, f, a, c);
    this.face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], color, f, a, c);
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], color, f, a, c);
    return this;
  }

  /** Esfera low-poly; `jitter(i, j)` deforma el radio (rocas). Con deformación usa solo triángulos. */
  sphere(
    r: number,
    segs: number,
    rings: number,
    color: number,
    opt: { flags?: number; jitter?: (i: number, j: number) => number; color?: (i: number, j: number) => number } = {},
  ): this {
    const flags = opt.flags ?? 0;
    const rows: V3[][] = [];
    for (let i = 0; i <= rings; i++) {
      const phi = (i / rings) * Math.PI;
      const row: V3[] = [];
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * 2 * Math.PI + (i % 2) * (Math.PI / segs);
        const k = i === 0 || i === rings ? 1 : opt.jitter ? opt.jitter(i, j) : 1;
        row.push([Math.sin(phi) * Math.cos(th) * r * k, Math.sin(phi) * Math.sin(th) * r * k, Math.cos(phi) * r * (i === 0 || i === rings ? (opt.jitter ? opt.jitter(i, 0) : 1) : k)]);
      }
      rows.push(row);
    }
    const center: V3 = [0, 0, 0];
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const jn = (j + 1) % segs;
        const col = opt.color ? opt.color(i, j) : color;
        const a = rows[i][j];
        const b = rows[i][jn];
        const c = rows[i + 1][jn];
        const d = rows[i + 1][j];
        if (i === 0) this.face([a, c, d], col, flags, 1, center);
        else if (i === rings - 1) this.face([a, b, d], col, flags, 1, center);
        else {
          // Triángulos: las filas alternas están desfasadas y dan el aspecto facetado.
          this.face([a, b, c], col, flags, 1, center);
          this.face([a, c, d], col, flags, 1, center);
        }
      }
    }
    return this;
  }

  /** Disco plano en z (visible por ambos lados salvo que se indiquen otras banderas). */
  disc(sides: number, r: number, z: number, color: number, flags = DOUBLE, alpha = 1, bias = 0): this {
    const pts: V3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k * 2 * Math.PI) / sides;
      pts.push([Math.cos(a) * r, Math.sin(a) * r, z]);
    }
    return this.face(pts, color, flags, alpha, undefined, bias);
  }
}

const visible: Face[] = [];

/** Dibuja caras en un Graphics: descarta las traseras, sombrea, ordena de lejos a cerca y rellena. */
export function drawFaces(g: Graphics, faces: readonly Face[], ox = 0, oy = 0): void {
  visible.length = 0;
  for (const face of faces) {
    const n = newell(face.p);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-12) continue;
    let nx = n[0] / len;
    let ny = n[1] / len;
    let nz = n[2] / len;
    if (ny * TO_CAM[1] + nz * TO_CAM[2] <= 1e-6) {
      if (!(face.f & DOUBLE)) continue;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    let d = 0;
    for (const q of face.p) d += q[1] * COS_E - q[2] * SIN_E;
    face.d = d / face.p.length - face.b;
    face.s = shade(nx, ny, nz, face.c, face.f);
    visible.push(face);
  }
  visible.sort((a, b) => b.d - a.d);
  for (const face of visible) {
    const pts: number[] = [];
    for (const q of face.p) pts.push(q[0] * TILE - ox, -(q[1] * SIN_E + q[2] * COS_E) * TILE - oy);
    g.poly(pts).fill({ color: face.s, alpha: face.a });
  }
  visible.length = 0;
}

export interface ClipRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type P2 = [number, number];

function clipEdge(poly: P2[], inside: (p: P2) => boolean, cut: (a: P2, b: P2) => P2): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cut(a, b));
  }
  return out;
}

/** Recorta un polígono del suelo a un rectángulo (Sutherland–Hodgman). */
function clipToRect(poly: P2[], r: ClipRect): P2[] {
  const atX = (x: number) => (a: P2, b: P2): P2 => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const atY = (y: number) => (a: P2, b: P2): P2 => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  let out = clipEdge(poly, (p) => p[0] >= r.x0, atX(r.x0));
  if (out.length) out = clipEdge(out, (p) => p[0] <= r.x1, atX(r.x1));
  if (out.length) out = clipEdge(out, (p) => p[1] >= r.y0, atY(r.y0));
  if (out.length) out = clipEdge(out, (p) => p[1] <= r.y1, atY(r.y1));
  return out;
}

/**
 * Proyecta las caras sobre el suelo (z = 0) siguiendo la luz y las rellena en color opaco.
 * La capa de sombras aplica la opacidad 0.28 de una vez para que los solapes no se oscurezcan.
 */
export function drawShadows(g: Graphics, faces: readonly Face[], clip: ClipRect | null, ox = 0, oy = 0): void {
  for (const face of faces) {
    if (face.f & NO_SHADOW || face.a < 0.5) continue;
    let poly: P2[] = face.p.map((q) => {
      const z = Math.max(0, q[2]);
      return [q[0] + z * SHADOW_DX, q[1] + z * SHADOW_DY];
    });
    if (clip) poly = clipToRect(poly, clip);
    if (poly.length < 3) continue;
    const pts: number[] = [];
    for (const [x, y] of poly) pts.push(x * TILE - ox, -y * SIN_E * TILE - oy);
    g.poly(pts).fill(SHADOW_COLOR);
  }
}

/** Sombra de contacto: octógono aplanado en el suelo, desplazado hacia abajo a la derecha. */
export function drawGroundBlob(g: Graphics, cx: number, cy: number, rx: number, ry: number, ox = 0, oy = 0): void {
  const pts: number[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    pts.push(x * TILE - ox, -y * SIN_E * TILE - oy);
  }
  g.poly(pts).fill(SHADOW_COLOR);
}
