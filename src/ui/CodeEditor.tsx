import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { localCompletionSource, python } from '@codemirror/lang-python';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type StateEffect } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { useGameStore, type GameState } from '../store/useGameStore';
import {
  errorLineField,
  execLineField,
  gameCompletions,
  gameConstantHighlighter,
  setErrorLine,
  setExecLine,
} from './editor/extensions';
import { forgetEditor, noteEditorFocus } from './editor/focusedEditor';
import { editorThemeExtension } from './editor/theme';
import { clearEditorFocus, wantsEditorFocus } from './windows/actions';
import { displayName } from './windows/layout';

function execLineFor(state: GameState, file: string): number | null {
  return state.highlightActiveLine && state.execFile === file ? state.execLine : null;
}

function errorLineFor(state: GameState, file: string): number | null {
  return state.errorFile === file ? state.errorLine : null;
}

function contentAttributes(file: string) {
  return EditorView.contentAttributes.of({
    'aria-label': `Código de ${displayName(file)}`,
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
  });
}

/** Editor CodeMirror 6 de un archivo `.py`, con el destello de la línea que ejecuta el dron. */
export function CodeEditor({ file, windowId }: { file: string; windowId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileRef = useRef(file);
  const themeSlot = useRef(new Compartment());
  const attrSlot = useRef(new Compartment());

  // El editor se crea una sola vez por ventana; el nombre del archivo puede cambiar al renombrar.
  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const state = useGameStore.getState();
    const name = fileRef.current;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: state.files[name] ?? '',
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          autocompletion({ override: [gameCompletions, localCompletionSource] }),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          python(),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          themeSlot.current.of(editorThemeExtension(state.editorTheme)),
          gameConstantHighlighter,
          execLineField,
          errorLineField,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) useGameStore.getState().setFileContent(fileRef.current, update.state.doc.toString());
            if (update.focusChanged) noteEditorFocus(update.view, update.view.hasFocus);
          }),
          attrSlot.current.of(contentAttributes(name)),
        ],
      }),
    });
    view.dispatch({ effects: [setExecLine.of(execLineFor(state, name)), setErrorLine.of(errorLineFor(state, name))] });
    viewRef.current = view;
    // En el siguiente frame: con StrictMode el primer editor montado se destruye enseguida.
    const focusFrame = wantsEditorFocus(windowId)
      ? requestAnimationFrame(() => {
          if (viewRef.current !== view) return;
          clearEditorFocus(windowId);
          view.focus();
        })
      : 0;

    const unsubscribe = useGameStore.subscribe((next, prev) => {
      const f = fileRef.current;
      const effects: StateEffect<unknown>[] = [];
      const exec = execLineFor(next, f);
      if (exec !== execLineFor(prev, f)) effects.push(setExecLine.of(exec));
      const error = errorLineFor(next, f);
      if (error !== errorLineFor(prev, f)) effects.push(setErrorLine.of(error));
      if (next.editorTheme !== prev.editorTheme) effects.push(themeSlot.current.reconfigure(editorThemeExtension(next.editorTheme)));
      if (effects.length > 0) view.dispatch({ effects });
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      unsubscribe();
      forgetEditor(view);
      view.destroy();
      viewRef.current = null;
    };
  }, [windowId]);

  useEffect(() => {
    if (fileRef.current === file) return;
    fileRef.current = file;
    viewRef.current?.dispatch({ effects: attrSlot.current.reconfigure(contentAttributes(file)) });
  }, [file]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />;
}
