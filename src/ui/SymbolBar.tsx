import { cursorCharLeft, cursorCharRight, indentLess, indentMore, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { focusedEditor, subscribeEditorFocus } from './editor/focusedEditor';

/** Símbolos difíciles de teclear en móviles y tabletas (doc 04, Fase 4). */
interface SymbolKey {
  label: string;
  title: string;
  /** Texto a insertar, o par apertura/cierre que rodea la selección. */
  text?: string;
  pair?: [string, string];
  run?: (view: EditorView) => boolean;
  wide?: boolean;
}

const KEYS: readonly SymbolKey[] = [
  { label: 'Tab', title: 'Sangrar', run: indentMore, wide: true },
  { label: '⇤', title: 'Quitar sangría', run: indentLess, wide: true },
  { label: ':', title: 'Dos puntos', text: ':' },
  { label: '=', title: 'Igual', text: '=' },
  { label: '( )', title: 'Paréntesis', pair: ['(', ')'] },
  { label: '[ ]', title: 'Corchetes', pair: ['[', ']'] },
  { label: '" "', title: 'Comillas', pair: ['"', '"'] },
  { label: '.', title: 'Punto', text: '.' },
  { label: ',', title: 'Coma', text: ', ' },
  { label: '_', title: 'Guion bajo', text: '_' },
  { label: '#', title: 'Comentario', text: '# ' },
  { label: '<', title: 'Menor que', text: '<' },
  { label: '>', title: 'Mayor que', text: '>' },
  { label: '+', title: 'Más', text: '+' },
  { label: '-', title: 'Menos', text: '-' },
  { label: '←', title: 'Cursor a la izquierda', run: cursorCharLeft, wide: true },
  { label: '→', title: 'Cursor a la derecha', run: cursorCharRight, wide: true },
  { label: '↶', title: 'Deshacer', run: undo, wide: true },
];

function apply(view: EditorView, key: SymbolKey): void {
  if (key.run) {
    key.run(view);
    return;
  }
  const { from, to } = view.state.selection.main;
  if (key.pair) {
    const [open, close] = key.pair;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: open + selected + close },
      selection: { anchor: from + open.length, head: from + open.length + selected.length },
      userEvent: 'input',
    });
    return;
  }
  const text = key.text ?? '';
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input' });
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return coarse;
}

/**
 * Barra de símbolos táctil: aparece en pantallas táctiles mientras un editor tiene el foco y
 * escribe en él sin quitárselo (pointerdown con preventDefault).
 */
export function SymbolBar() {
  const coarse = useCoarsePointer();
  const editor = useSyncExternalStore(subscribeEditorFocus, focusedEditor, () => null);
  if (!coarse || !editor) return null;
  return (
    <div className="symbol-bar" role="toolbar" aria-label="Símbolos de código">
      {KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
          title={key.title}
          aria-label={key.title}
          className={key.wide ? 'symbol-wide' : undefined}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            const view = focusedEditor();
            if (view) apply(view, key);
          }}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
