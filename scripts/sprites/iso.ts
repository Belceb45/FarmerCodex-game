import { DOUBLE, GLOW, MeshBuilder, NO_SHADOW, SOFT, type Face, type V3 } from '../../src/renderer/iso3d';

/**
 * «Horno» de sprites: construye mallas con el MeshBuilder del juego, las proyecta en isometría 2:1
 * (doc 05 §3: casilla de 128 × 64 px) con la luz cálida desde arriba a la izquierda ya calculada,
 * y las convierte en SVG con texturas de ruido (óxido, grano, moteado orgánico), sombra proyectada,
 * oclusión de contacto y contorno oscuro suave (doc 06 §2). El resultado se rasteriza a PNG-32.
 */

export { DOUBLE, GLOW, NO_SHADOW, SOFT };
export type { V3 };

// Banderas de material propias del horno (bits libres de Face.f; el renderizador del juego las ignora).
/** Grano metálico fino (chapas, hierro). */
export const METAL = 16;
/** Manchas de óxido. */
export const RUST = 32;
/** Moteado orgánico (hojas, frutos). */
export const ORGANIC = 64;
/** Tierra granulada. */
export const EARTH = 128;
/** Vetas de madera. */
export const WOOD = 256;
/** Cara sin trazo de unión (detalles finos que no deben engordar). */
export const THIN = 512;

/** Píxeles por casilla a escala 1 (doc 05: tileW = 128, tileH = 64). */
export const TILE_W = 128;
const KX = 64;
const KY = 32;
/** Píxeles por unidad de altura en la proyección 2:1 (cámara a 30° de elevación). */
const KZ = 78.38;

function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Hacia la cámara: mira desde el Sur-Oeste y desde arriba (lo más cercano es x + y pequeño). */
const TO_CAM: V3 = normalize([-0.6124, -0.6124, 0.5]);
/** Luz cálida desde arriba a la izquierda de la pantalla: ilumina las caras Oeste y deja en sombra las Sur. */
export const LIGHT: V3 = normalize([-0.22, 0.45, 0.86]);

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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hex(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

function pack(r: number, g: number, b: number): number {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}

/** Color horneado de una cara: luz difusa, tinte cálido en luz y frío en sombra, y oclusión cerca del suelo. */
function bake(n: V3, color: number, flags: number, zAvg: number): number {
  if (flags & GLOW) return color;
  const dl = Math.max(0, dot(n, LIGHT));
  let f = flags & SOFT ? 0.6 + 0.48 * dl : 0.5 + 0.6 * dl;
  if (Math.abs(n[2]) < 0.6) f *= 0.8 + 0.2 * clamp01(zAvg / 0.3);
  const warm = clamp01((dl - 0.35) / 0.6);
  const [r, g, b] = rgb(color);
  return pack(r * f * (1 + 0.07 * warm), g * f * (1 + 0.025 * warm), b * f * (0.96 + 0.08 * (1 - warm)));
}

export interface SpriteDef {
  /** Nombre del archivo (sin .png) y del frame en el atlas. */
  name: string;
  w: number;
  h: number;
  /** Píxel donde cae el origen del mundo (centro de la cara superior de la casilla, z = 0). */
  ax: number;
  ay: number;
  /** Anclaje normalizado para PixiJS (por defecto, el propio origen: ax / w, ay / h). */
  anchor?: [number, number];
  /** Píxeles por casilla (128 por defecto). */
  scale?: number;
  /** Radio del contorno oscuro en píxeles (0 = sin contorno). */
  outline?: number;
  /** Sombra proyectada al suelo siguiendo la luz. */
  castShadow?: boolean;
  /** Sombra de contacto horneada bajo el objeto: [radio x, radio y, opacidad] en casillas. */
  contact?: [number, number, number];
  build(mb: MeshBuilder): void;
  /** SVG adicional dibujado encima (brillos, detalles 2D) con la proyección del sprite. */
  extra?(p: Projector): string;
  /** `extra` usa coordenadas fijas del lienzo base (partículas 2D): se escala con el supermuestreo. */
  flat?: boolean;
}

export interface Projector {
  /** Mundo → píxel del sprite. */
  at(x: number, y: number, z: number): [number, number];
  /** Píxeles por casilla. */
  scale: number;
}

function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

function texDefs(w: number, h: number, seed: number, ss: number): string {
  const f = (v: number) => (v / ss).toFixed(4);
  const pat = (id: string, filter: string) =>
    `<filter id="f${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${filter}</filter>` +
    `<pattern id="p${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"><rect width="${w}" height="${h}" filter="url(#f${id})"/></pattern>`;
  return [
    // Grano metálico: motas oscuras finas.
    pat('Grain', `<feTurbulence type="fractalNoise" baseFrequency="${f(0.9)}" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.06 0 0 0 0 0.05 0 0 0 -2.1 1.18"/>`),
    // Óxido: manchas de bordes nítidos en tonos #8C4A2F.
    pat('Rust', `<feTurbulence type="fractalNoise" baseFrequency="${f(0.05)}" numOctaves="4" seed="${seed + 11}"/><feColorMatrix type="matrix" values="0 0 0 0 0.5 0 0 0 0 0.25 0 0 0 0 0.15 0 0 0 -8 3.35"/>`),
    // Moteado orgánico: manchas suaves oscuras.
    pat('Mottle', `<feTurbulence type="fractalNoise" baseFrequency="${f(0.16)}" numOctaves="3" seed="${seed + 23}"/><feColorMatrix type="matrix" values="0 0 0 0 0.12 0 0 0 0 0.1 0 0 0 0 0.04 0 0 0 -2.6 1.32"/>`),
    // Tierra granulada.
    pat('Earth', `<feTurbulence type="fractalNoise" baseFrequency="${f(1.3)}" numOctaves="2" seed="${seed + 37}"/><feColorMatrix type="matrix" values="0 0 0 0 0.09 0 0 0 0 0.06 0 0 0 0 0.04 0 0 0 -2.4 1.3"/>`),
    // Vetas de madera.
    pat('Wood', `<feTurbulence type="fractalNoise" baseFrequency="${f(0.03)} ${f(0.42)}" numOctaves="2" seed="${seed + 41}"/><feColorMatrix type="matrix" values="0 0 0 0 0.12 0 0 0 0 0.08 0 0 0 0 0.05 0 0 0 -2.8 1.45"/>`),
  ].join('');
}

const TEXTURES: [number, string, number][] = [
  [METAL, 'pGrain', 0.55],
  [EARTH, 'pEarth', 0.75],
  [ORGANIC, 'pMottle', 0.55],
  [WOOD, 'pWood', 0.7],
  [RUST, 'pRust', 0.62],
];

interface Visible {
  pts: [number, number][];
  color: number;
  alpha: number;
  depth: number;
  flags: number;
}

/**
 * Construye el SVG del sprite. `ss` es el supermuestreo: con 2 el PNG sale al doble de resolución
 * (doc 06 §3: «256 × 256 si se busca nitidez Retina 2×») y el atlas lo declara con `meta.scale`.
 */
export function spriteSvg(def: SpriteDef, ss = 1): { svg: string; overflow: string | null } {
  const mb = new MeshBuilder();
  def.build(mb);
  const s = ((def.scale ?? TILE_W) * ss) / TILE_W;
  const ax = def.ax * ss;
  const ay = def.ay * ss;
  const at = (x: number, y: number, z: number): [number, number] => [ax + (x - y) * KX * s, ay - (x + y) * KY * s - z * KZ * s];
  const projector: Projector = { at, scale: (def.scale ?? TILE_W) * ss };

  const visible: Visible[] = [];
  const shadows: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const face of mb.faces as Face[]) {
    const n0 = newell(face.p);
    const len = Math.hypot(n0[0], n0[1], n0[2]);
    if (len < 1e-12) continue;
    let n: V3 = [n0[0] / len, n0[1] / len, n0[2] / len];
    if (def.castShadow && !(face.f & NO_SHADOW) && face.a > 0.5) {
      const poly = face.p.map((q) => {
        const z = Math.max(0, q[2]);
        return at(q[0] - (z * LIGHT[0]) / LIGHT[2], q[1] - (z * LIGHT[1]) / LIGHT[2], 0);
      });
      shadows.push(`<polygon points="${poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}"/>`);
    }
    if (dot(n, TO_CAM) <= 1e-6) {
      if (!(face.f & DOUBLE)) continue;
      n = [-n[0], -n[1], -n[2]];
    }
    let depth = 0;
    let zSum = 0;
    for (const q of face.p) {
      depth += -dot(q, TO_CAM);
      zSum += q[2];
    }
    const pts = face.p.map((q) => at(q[0], q[1], q[2]));
    for (const [px, py] of pts) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    visible.push({
      pts,
      color: bake(n, face.c, face.f, zSum / face.p.length),
      alpha: face.a,
      depth: depth / face.p.length - face.b,
      flags: face.f,
    });
  }
  visible.sort((a, b) => b.depth - a.depth);

  const body: string[] = [];
  for (const v of visible) {
    const points = v.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    const fill = hex(v.color);
    const op = v.alpha < 1 ? ` fill-opacity="${v.alpha.toFixed(2)}"` : '';
    const stroke = v.flags & THIN || v.alpha < 1 ? '' : ` stroke="${fill}" stroke-width="${(0.55 * ss).toFixed(2)}" stroke-linejoin="round"`;
    body.push(`<polygon points="${points}" fill="${fill}"${op}${stroke}/>`);
    for (const [flag, pattern, opacity] of TEXTURES) {
      if (v.flags & flag) body.push(`<polygon points="${points}" fill="url(#${pattern})" opacity="${(opacity * v.alpha).toFixed(2)}"/>`);
    }
  }

  const w = def.w * ss;
  const h = def.h * ss;
  const seed = seedOf(def.name);
  const outline = (def.outline ?? 1.1) * ss;
  const defs = [
    texDefs(w, h, seed, ss),
    `<filter id="fOutline" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="${outline}" result="d"/><feGaussianBlur in="d" stdDeviation="${0.35 * ss}" result="b"/><feFlood flood-color="#17110d" flood-opacity="0.88"/><feComposite in2="b" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `<filter id="fSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${1.1 * ss}"/></filter>`,
    `<filter id="fContact" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${3 * ss}"/></filter>`,
  ].join('');

  const layers: string[] = [];
  if (def.contact) {
    const [rx, ry, alpha] = def.contact;
    const [cx, cy] = at(0, 0, 0);
    // Elipse en el plano del suelo: en 2:1 el eje x mide 64·√2 px por casilla y el y la mitad.
    layers.push(
      `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rx * KX * 1.41 * s).toFixed(1)}" ry="${(ry * KY * 1.41 * s).toFixed(1)}" fill="#120d0a" opacity="${alpha}" filter="url(#fContact)"/>`,
    );
  }
  if (shadows.length) layers.push(`<g fill="#1e1a14" opacity="0.3" filter="url(#fSoft)">${shadows.join('')}</g>`);
  layers.push(outline > 0 ? `<g filter="url(#fOutline)">${body.join('')}</g>` : `<g>${body.join('')}</g>`);
  if (def.extra) layers.push(def.flat ? `<g transform="scale(${ss})">${def.extra(projector)}</g>` : def.extra(projector));

  const margin = outline + 1;
  const overflow =
    minX < -margin || minY < -margin || maxX > w + margin || maxY > h + margin
      ? `sale del lienzo: x ${minX.toFixed(0)}..${maxX.toFixed(0)} / ${w}, y ${minY.toFixed(0)}..${maxY.toFixed(0)} / ${h}`
      : null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${layers.join('')}</svg>`;
  return { svg, overflow };
}
