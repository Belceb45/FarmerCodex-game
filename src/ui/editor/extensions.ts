import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { API_ENTRIES, DIRECTION_NAMES, ENUM_DOCS, GAME_CONSTANTS, LANGUAGE_KEYWORDS, METHOD_DOCS } from '../apiDocs';

// ------------------------------------------------------------------ línea en ejecución / error

export const setExecLine = StateEffect.define<number | null>();
export const setErrorLine = StateEffect.define<number | null>();

function lineDecoration(state: EditorState, line: number | null, className: string): DecorationSet {
  if (line === null || line < 1 || line > state.doc.lines) return Decoration.none;
  return Decoration.set([Decoration.line({ class: className }).range(state.doc.line(line).from)]);
}

function lineField(effect: typeof setExecLine, className: string, clearOnEdit: boolean) {
  return StateField.define<{ line: number | null; deco: DecorationSet }>({
    create: () => ({ line: null, deco: Decoration.none }),
    update(value, tr) {
      let line = value.line;
      for (const e of tr.effects) if (e.is(effect)) line = e.value;
      if (clearOnEdit && tr.docChanged) line = null;
      if (line === value.line && !tr.docChanged) return value;
      return { line, deco: lineDecoration(tr.state, line, className) };
    },
    provide: (field) => EditorView.decorations.from(field, (v) => v.deco),
  });
}

/** Resalta la línea que ejecuta el dron principal (se actualiza con cada snapshot). */
export const execLineField = lineField(setExecLine, 'cm-exec-line', false);
/** Resalta la línea del último error; se borra al editar. */
export const errorLineField = lineField(setErrorLine, 'cm-error-line', true);

// ------------------------------------------------------------------ constantes del juego en color

const constantMatcher = new MatchDecorator({
  regexp: new RegExp(`\\b(?:${GAME_CONSTANTS.join('|')})\\b`, 'g'),
  decoration: Decoration.mark({ class: 'cm-game-const' }),
});

export const gameConstantHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = constantMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = constantMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

// ------------------------------------------------------------------ autocompletado

function insertCall(name: string, takesArgs: boolean) {
  return (view: EditorView, _completion: Completion, from: number, to: number): void => {
    const text = `${name}()`;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length - (takesArgs ? 1 : 0) },
      userEvent: 'input.complete',
    });
  };
}

const API_COMPLETIONS: Completion[] = API_ENTRIES.map((entry) => ({
  label: entry.name,
  type: 'function',
  detail: entry.cost,
  info: `${entry.signature}\n\n${entry.description}`,
  apply: insertCall(entry.name, entry.takesArgs),
  boost: entry.category === 'acciones' || entry.category === 'sensores' ? 2 : 0,
}));

const CONSTANT_COMPLETIONS: Completion[] = [
  ...Object.entries(ENUM_DOCS).map(([name, doc]) => ({ label: name, type: 'enum', detail: doc.description, boost: 1 })),
  ...DIRECTION_NAMES.map((name) => ({ label: name, type: 'constant', detail: 'dirección', boost: 1 })),
];

const KEYWORD_COMPLETIONS: Completion[] = LANGUAGE_KEYWORDS.map((kw) => ({ label: kw, type: 'keyword' }));

const METHOD_COMPLETIONS: Completion[] = Object.entries(METHOD_DOCS).map(([name, doc]) => ({
  label: name,
  type: 'method',
  info: doc,
  apply: insertCall(name, !['copy', 'reverse', 'clear', 'keys', 'values', 'items'].includes(name)),
}));

const SKIP_NODES = new Set(['Comment', 'String', 'FormatString']);

export function gameCompletions(context: CompletionContext): CompletionResult | null {
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (SKIP_NODES.has(node.name)) return null;

  const member = context.matchBefore(/[A-Za-z_][\w]*\.\w*/);
  if (member) {
    const dot = member.text.indexOf('.');
    const owner = member.text.slice(0, dot);
    const doc = ENUM_DOCS[owner];
    const options: Completion[] = doc
      ? doc.members.map((m) => ({ label: m, type: 'enum', detail: `${owner}.${m}` }))
      : METHOD_COMPLETIONS;
    return { from: member.from + dot + 1, options, validFor: /^\w*$/ };
  }

  const word = context.matchBefore(/[A-Za-z_]\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: [...API_COMPLETIONS, ...CONSTANT_COMPLETIONS, ...KEYWORD_COMPLETIONS],
    validFor: /^\w*$/,
  };
}
