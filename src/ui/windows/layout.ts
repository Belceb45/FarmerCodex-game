/**
 * Geometría del escritorio de ventanas flotantes (doc 07). Funciones puras, sin DOM,
 * para poder probarlas en Vitest.
 */

export type WindowKind = 'code' | 'console' | 'docs' | 'records';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Altura de la barra de título de cada ventana (doc 07: 28 px). */
export const TITLE_BAR_HEIGHT = 28;
/** Franja superior que ocupa el HUD (inventario y botones de sistema). */
export const HUD_SAFE_TOP = 58;
/** Por debajo de este ancho se usa la disposición compacta (móvil). */
export const COMPACT_WIDTH = 720;

export const MIN_SIZE: Readonly<Record<WindowKind, { w: number; h: number }>> = {
  code: { w: 260, h: 140 },
  console: { w: 220, h: 100 },
  docs: { w: 280, h: 200 },
  records: { w: 300, h: 220 },
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Mantiene la ventana dentro del viewport (si está minimizada basta con su barra de título). */
export function clampRect(rect: Rect, kind: WindowKind, vp: Viewport, minimized = false): Rect {
  const min = MIN_SIZE[kind];
  const w = Math.round(clamp(rect.w, Math.min(min.w, vp.width), Math.max(1, vp.width)));
  const h = Math.round(clamp(rect.h, Math.min(min.h, vp.height), Math.max(1, vp.height)));
  const visibleH = minimized ? TITLE_BAR_HEIGHT : h;
  return {
    x: Math.round(clamp(rect.x, 0, Math.max(0, vp.width - w))),
    y: Math.round(clamp(rect.y, 0, Math.max(0, vp.height - visibleH))),
    w,
    h,
  };
}

/** Arrastre por la barra de título. */
export function moveRect(start: Rect, dx: number, dy: number, kind: WindowKind, vp: Viewport, minimized = false): Rect {
  return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, kind, vp, minimized);
}

/** Redimensionado desde un borde o una esquina, respetando el tamaño mínimo y el viewport. */
export function resizeRect(start: Rect, dir: ResizeDir, dx: number, dy: number, kind: WindowKind, vp: Viewport): Rect {
  const min = MIN_SIZE[kind];
  let { x, y, w, h } = start;
  if (dir.includes('e')) w = clamp(start.w + dx, min.w, Math.max(min.w, vp.width - start.x));
  if (dir.includes('s')) h = clamp(start.h + dy, min.h, Math.max(min.h, vp.height - start.y));
  if (dir.includes('w')) {
    const right = start.x + start.w;
    x = clamp(start.x + dx, 0, right - min.w);
    w = right - x;
  }
  if (dir.includes('n')) {
    const bottom = start.y + start.h;
    y = clamp(start.y + dy, 0, bottom - min.h);
    h = bottom - y;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export interface DefaultLayout {
  code: Rect;
  console: Rect;
  docs: Rect;
  /** Logros y marcadores (misma zona que la documentación). */
  records: Rect;
  compact: boolean;
}

/** Disposición inicial: código y consola a la izquierda, la granja libre en el resto. */
export function defaultLayout(vp: Viewport): DefaultLayout {
  const compact = vp.width < COMPACT_WIDTH;
  if (compact) {
    const m = 8;
    const w = vp.width - 2 * m;
    const avail = vp.height - HUD_SAFE_TOP - m;
    const code: Rect = { x: m, y: HUD_SAFE_TOP, w, h: Math.round(Math.min(380, avail * 0.5)) };
    const consoleRect: Rect = { x: m, y: code.y + code.h + m, w, h: Math.round(Math.min(170, avail * 0.25)) };
    const docs: Rect = { x: m, y: HUD_SAFE_TOP, w, h: avail };
    return {
      compact,
      code: clampRect(code, 'code', vp),
      console: clampRect(consoleRect, 'console', vp),
      docs: clampRect(docs, 'docs', vp),
      records: clampRect(docs, 'records', vp),
    };
  }
  const m = 16;
  const top = HUD_SAFE_TOP + 6;
  const w = Math.round(clamp(vp.width * 0.36, 340, 500));
  const avail = vp.height - top - m;
  const gap = 12;
  const codeH = Math.round(Math.min(470, Math.max(MIN_SIZE.code.h, (avail - gap) * 0.64)));
  const consoleH = Math.round(Math.min(240, Math.max(MIN_SIZE.console.h, avail - codeH - gap)));
  const code: Rect = { x: m, y: top, w, h: codeH };
  const consoleRect: Rect = { x: m, y: top + codeH + gap, w, h: consoleH };
  const dw = Math.round(Math.min(540, vp.width - 2 * m));
  const docs: Rect = { x: vp.width - dw - m, y: top, w: dw, h: Math.round(Math.min(660, avail)) };
  return {
    compact,
    code: clampRect(code, 'code', vp),
    console: clampRect(consoleRect, 'console', vp),
    docs: clampRect(docs, 'docs', vp),
    records: clampRect(docs, 'records', vp),
  };
}

/** Posición en cascada para una ventana nueva: evita apilarla exactamente sobre otra. */
export function cascadeRect(existing: readonly Rect[], base: Rect, kind: WindowKind, vp: Viewport, step = 28): Rect {
  for (let k = 0; k < 16; k++) {
    const candidate = clampRect({ ...base, x: base.x + k * step, y: base.y + k * step }, kind, vp);
    const taken = existing.some((r) => Math.abs(r.x - candidate.x) < 8 && Math.abs(r.y - candidate.y) < 8);
    if (!taken) return candidate;
  }
  return clampRect(base, kind, vp);
}

/**
 * Márgenes que las ventanas visibles dejan libres para encuadrar la granja: las ventanas
 * pegadas a un lado reservan ese lado; las que ocupan casi todo el ancho reservan arriba o abajo.
 */
export function computeFitInsets(rects: readonly Rect[], vp: Viewport): Insets {
  const insets: Insets = { left: 0, right: 0, top: HUD_SAFE_TOP, bottom: 0 };
  for (const r of rects) {
    if (r.w >= vp.width * 0.7) {
      if (r.y + r.h / 2 < vp.height / 2) insets.top = Math.max(insets.top, r.y + r.h);
      else insets.bottom = Math.max(insets.bottom, vp.height - r.y);
    } else if (r.x + r.w / 2 < vp.width / 2) {
      insets.left = Math.max(insets.left, r.x + r.w);
    } else {
      insets.right = Math.max(insets.right, vp.width - r.x);
    }
  }
  const limitH = vp.width * 0.62;
  const sumH = insets.left + insets.right;
  if (sumH > limitH) {
    insets.left = (insets.left * limitH) / sumH;
    insets.right = (insets.right * limitH) / sumH;
  }
  const limitV = vp.height * 0.62;
  const sumV = insets.top + insets.bottom;
  if (sumV > limitV) {
    insets.top = (insets.top * limitV) / sumV;
    insets.bottom = (insets.bottom * limitV) / sumV;
  }
  return insets;
}

// ------------------------------------------------------------------ nombres de archivo

export const SCRIPT_EXT = '.py';
const MAX_NAME_LENGTH = 32;

/** Palabras reservadas: un archivo debe poder importarse por su nombre (`import nombre`). */
const RESERVED = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/** Nombre visible en la barra de título: sin la extensión `.py`. */
export function displayName(file: string): string {
  return file.endsWith(SCRIPT_EXT) ? file.slice(0, -SCRIPT_EXT.length) : file;
}

/** Primer `scriptN.py` libre. */
export function nextScriptName(existing: Iterable<string>): string {
  const taken = new Set([...existing].map((f) => f.toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = `script${n}${SCRIPT_EXT}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Valida un nombre de archivo (sin extensión). Devuelve el mensaje de error o null si es válido.
 * `current` es el archivo que se está renombrando (puede conservar su propio nombre).
 */
export function validateScriptName(name: string, existing: Iterable<string>, current?: string): string | null {
  const base = name.trim();
  if (base === '') return 'Escribe un nombre.';
  if (base.length > MAX_NAME_LENGTH) return `Máximo ${MAX_NAME_LENGTH} caracteres.`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) return 'Usa letras, números y _ (sin empezar por un número).';
  if (RESERVED.has(base)) return 'Es una palabra reservada del lenguaje.';
  const file = (base + SCRIPT_EXT).toLowerCase();
  for (const other of existing) {
    if (other === current) continue;
    if (other.toLowerCase() === file) return 'Ya existe un archivo con ese nombre.';
  }
  return null;
}
