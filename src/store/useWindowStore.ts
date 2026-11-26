import { create } from 'zustand';
import {
  cascadeRect,
  clampRect,
  defaultLayout,
  type Rect,
  type Viewport,
  type WindowKind,
} from '../ui/windows/layout';

export interface WindowState extends Rect {
  id: string;
  kind: WindowKind;
  /** Archivo `.py` que edita (solo ventanas de código). */
  file: string | null;
  z: number;
  minimized: boolean;
}

/** Ventana guardada en localStorage (la disposición es una preferencia visual, doc 01). */
export interface SavedWindow extends Rect {
  kind: WindowKind;
  file: string | null;
  minimized: boolean;
}

export interface SavedLayout {
  windows: SavedWindow[];
}

export type DeskView = 'farm' | 'tree';

export interface WindowStore {
  initialized: boolean;
  windows: WindowState[];
  topZ: number;
  viewport: Viewport;
  /** Toggle HUD (F1 / H): oculta HUD y ventanas para ver la granja limpia. */
  hudVisible: boolean;
  settingsOpen: boolean;
  /** Granja o árbol tecnológico (el botón del árbol alterna entre ambos). */
  view: DeskView;
  init: (vp: Viewport, files: readonly string[], saved?: SavedLayout | null) => void;
  toggleTree: () => void;
  openCode: (file: string) => string;
  closeWindow: (id: string) => void;
  focus: (id: string) => void;
  setRect: (id: string, rect: Rect) => void;
  toggleMinimize: (id: string) => void;
  toggleDocs: () => void;
  toggleConsole: () => void;
  toggleRecords: () => void;
  /** Cierra la ventana o el panel de arriba (Esc): ajustes, árbol tecnológico, registros, documentación. */
  closeTop: () => boolean;
  setViewport: (vp: Viewport) => void;
  toggleHud: () => void;
  setSettingsOpen: (open: boolean) => void;
  renameFileRefs: (from: string, to: string) => void;
  resetLayout: () => void;
}

export const CONSOLE_WINDOW_ID = 'console';
export const DOCS_WINDOW_ID = 'docs';
export const RECORDS_WINDOW_ID = 'records';

const SINGLETON_IDS: Readonly<Record<Exclude<WindowKind, 'code'>, string>> = {
  console: CONSOLE_WINDOW_ID,
  docs: DOCS_WINDOW_ID,
  records: RECORDS_WINDOW_ID,
};

let nextCodeId = 1;
const newCodeId = (): string => `code-${nextCodeId++}`;

function placeCodeWindows(windows: WindowState[], base: Rect, vp: Viewport): WindowState[] {
  const placed: Rect[] = [];
  return windows.map((w) => {
    if (w.kind !== 'code') return w;
    const rect = cascadeRect(placed, base, 'code', vp);
    placed.push(rect);
    return { ...w, ...rect };
  });
}

export const useWindowStore = create<WindowStore>()((set, get) => ({
  initialized: false,
  windows: [],
  topZ: 0,
  viewport: { width: 1280, height: 800 },
  hudVisible: true,
  settingsOpen: false,
  view: 'farm',

  init: (vp, files, saved) => {
    if (get().initialized) return;
    const layout = defaultLayout(vp);
    let z = 0;
    const restored: WindowState[] = [];
    const placedFiles = new Set<string>();
    for (const sw of saved?.windows ?? []) {
      if (sw.kind === 'code') {
        if (!sw.file || !files.includes(sw.file) || placedFiles.has(sw.file)) continue;
        placedFiles.add(sw.file);
        restored.push({ id: newCodeId(), kind: 'code', file: sw.file, ...clampRect(sw, 'code', vp, sw.minimized), z: ++z, minimized: sw.minimized });
      } else if (!restored.some((w) => w.kind === sw.kind)) {
        const id = SINGLETON_IDS[sw.kind];
        restored.push({ id, kind: sw.kind, file: null, ...clampRect(sw, sw.kind, vp, sw.minimized), z: ++z, minimized: sw.minimized });
      }
    }
    // Archivos sin posición guardada: en cascada desde la posición inicial. La consola no se abre sola.
    const occupied: Rect[] = restored.filter((w) => w.kind === 'code');
    const fresh: WindowState[] = files
      .filter((file) => !placedFiles.has(file))
      .map((file) => {
        const rect = cascadeRect(occupied, layout.code, 'code', vp);
        occupied.push(rect);
        return { id: newCodeId(), kind: 'code', file, ...rect, z: ++z, minimized: false };
      });
    set({ initialized: true, viewport: vp, windows: [...restored, ...fresh], topZ: z });
  },

  toggleTree: () => set((s) => ({ view: s.view === 'tree' ? 'farm' : 'tree', settingsOpen: false })),

  openCode: (file) => {
    const { windows, viewport, topZ } = get();
    const base = defaultLayout(viewport).code;
    const rect = cascadeRect(
      windows.filter((w) => w.kind === 'code'),
      base,
      'code',
      viewport,
    );
    const id = newCodeId();
    set({ windows: [...windows, { id, kind: 'code', file, ...rect, z: topZ + 1, minimized: false }], topZ: topZ + 1 });
    return id;
  },

  closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  focus: (id) => {
    const { windows, topZ } = get();
    const win = windows.find((w) => w.id === id);
    if (!win || win.z === topZ) return;
    set({ windows: windows.map((w) => (w.id === id ? { ...w, z: topZ + 1 } : w)), topZ: topZ + 1 });
  },

  setRect: (id, rect) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, ...clampRect(rect, w.kind, s.viewport, w.minimized) } : w)),
    })),

  toggleMinimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        const minimized = !w.minimized;
        return { ...w, minimized, ...clampRect(w, w.kind, s.viewport, minimized) };
      }),
    })),

  toggleDocs: () => {
    const { windows, viewport, topZ } = get();
    if (windows.some((w) => w.id === DOCS_WINDOW_ID)) {
      set({ windows: windows.filter((w) => w.id !== DOCS_WINDOW_ID) });
      return;
    }
    const rect = defaultLayout(viewport).docs;
    set({
      windows: [...windows, { id: DOCS_WINDOW_ID, kind: 'docs', file: null, ...rect, z: topZ + 1, minimized: false }],
      topZ: topZ + 1,
    });
  },

  toggleConsole: () => {
    const { windows, viewport, topZ } = get();
    if (windows.some((w) => w.id === CONSOLE_WINDOW_ID)) {
      set({ windows: windows.filter((w) => w.id !== CONSOLE_WINDOW_ID) });
      return;
    }
    const rect = defaultLayout(viewport).console;
    set({
      windows: [...windows, { id: CONSOLE_WINDOW_ID, kind: 'console', file: null, ...rect, z: topZ + 1, minimized: false }],
      topZ: topZ + 1,
    });
  },

  toggleRecords: () => {
    const { windows, viewport, topZ } = get();
    if (windows.some((w) => w.id === RECORDS_WINDOW_ID)) {
      set({ windows: windows.filter((w) => w.id !== RECORDS_WINDOW_ID) });
      return;
    }
    const rect = defaultLayout(viewport).records;
    set({
      windows: [...windows, { id: RECORDS_WINDOW_ID, kind: 'records', file: null, ...rect, z: topZ + 1, minimized: false }],
      topZ: topZ + 1,
      view: 'farm',
    });
  },

  closeTop: () => {
    const s = get();
    if (s.settingsOpen) {
      set({ settingsOpen: false });
      return true;
    }
    if (s.view === 'tree') {
      set({ view: 'farm' });
      return true;
    }
    // La ventana auxiliar de más arriba (registros, documentación o consola); las de código no se cierran con Esc.
    let top: WindowState | null = null;
    for (const w of s.windows) if (w.kind !== 'code' && (!top || w.z > top.z)) top = w;
    if (!top) return false;
    set({ windows: s.windows.filter((w) => w.id !== top.id) });
    return true;
  },

  setViewport: (vp) =>
    set((s) => ({
      viewport: vp,
      windows: s.windows.map((w) => ({ ...w, ...clampRect(w, w.kind, vp, w.minimized) })),
    })),

  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible, settingsOpen: false })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  renameFileRefs: (from, to) =>
    set((s) => ({ windows: s.windows.map((w) => (w.file === from ? { ...w, file: to } : w)) })),

  resetLayout: () => {
    const { windows, viewport } = get();
    const layout = defaultLayout(viewport);
    const reset = windows.map((w) => {
      if (w.kind === 'console') return { ...w, ...layout.console, minimized: false };
      if (w.kind === 'docs') return { ...w, ...layout.docs, minimized: false };
      if (w.kind === 'records') return { ...w, ...layout.records, minimized: false };
      return { ...w, minimized: false };
    });
    set({ windows: placeCodeWindows(reset, layout.code, viewport) });
  },
}));

/** Archivo de la ventana de código enfocada más recientemente (destino de los atajos). */
export function activeCodeFile(): string | null {
  let best: WindowState | null = null;
  for (const w of useWindowStore.getState().windows) {
    if (w.kind === 'code' && w.file && (!best || w.z > best.z)) best = w;
  }
  return best?.file ?? null;
}

// ------------------------------------------------------------------ disposición guardada

const LAYOUT_KEY = 'farmercodex:layout';

export function loadSavedLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLayout;
    return Array.isArray(parsed.windows) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSavedLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    // Sin almacenamiento: nada que borrar.
  }
}

let layoutTimer: ReturnType<typeof setTimeout> | null = null;

/** Guarda la posición, el tamaño y el orden de las ventanas poco después de cada cambio. */
useWindowStore.subscribe((next, prev) => {
  if (!next.initialized || next.windows === prev.windows) return;
  if (layoutTimer !== null) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    layoutTimer = null;
    const layout: SavedLayout = {
      windows: [...useWindowStore.getState().windows]
        .sort((a, b) => a.z - b.z)
        .map(({ kind, file, x, y, w, h, minimized }) => ({ kind, file, x, y, w, h, minimized })),
    };
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // Sin almacenamiento: la disposición solo dura esta sesión.
    }
  }, 300);
});
