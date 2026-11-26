import type { EditorView } from '@codemirror/view';

/**
 * Último editor de código con el foco: la barra de símbolos táctil escribe en él sin robarle el
 * foco (así el teclado virtual sigue abierto en móviles y tabletas).
 */
let current: EditorView | null = null;
let focused = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function noteEditorFocus(view: EditorView, hasFocus: boolean): void {
  if (hasFocus) {
    current = view;
    focused = true;
  } else if (current === view) {
    focused = false;
  }
  notify();
}

export function forgetEditor(view: EditorView): void {
  if (current !== view) return;
  current = null;
  focused = false;
  notify();
}

/** Editor destino (null si ninguno tiene el foco). */
export function focusedEditor(): EditorView | null {
  return focused && current && current.dom.isConnected ? current : null;
}

export function subscribeEditorFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
