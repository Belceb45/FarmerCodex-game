import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import type { EditorTheme } from '../../store/useGameStore';

const MONO = '"JetBrains Mono Variable", "JetBrains Mono", "Fira Code", Consolas, monospace';

interface ThemeColors {
  bg: string;
  text: string;
  gutterBg: string;
  gutterText: string;
  gutterActive: string;
  cursor: string;
  selection: string;
  activeLine: string;
  /** Destello de la línea que ejecuta el dron (doc 07). */
  exec: string;
  error: string;
  errorBar: string;
  bracket: string;
  bracketOutline: string;
  gameConst: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipSelected: string;
  muted: string;
  searchMatch: string;
}

function buildTheme(c: ThemeColors, dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': { color: c.text, backgroundColor: c.bg, height: '100%', fontSize: '13.5px' },
      '.cm-scroller': { fontFamily: MONO, lineHeight: '1.55' },
      '.cm-content': { caretColor: c.cursor, padding: '6px 0' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.cursor, borderLeftWidth: '2px' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: `${c.selection} !important`,
      },
      '.cm-gutters': { backgroundColor: c.gutterBg, color: c.gutterText, border: 'none', paddingRight: '4px' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c.gutterActive },
      '.cm-activeLine': { backgroundColor: c.activeLine },
      '.cm-matchingBracket': { backgroundColor: c.bracket, outline: `1px solid ${c.bracketOutline}` },
      '.cm-exec-line': { backgroundColor: c.exec },
      '.cm-error-line': { backgroundColor: c.error, boxShadow: `inset 3px 0 0 ${c.errorBar}` },
      '.cm-game-const': { color: c.gameConst },
      '.cm-tooltip': {
        backgroundColor: c.tooltipBg,
        border: `1px solid ${c.tooltipBorder}`,
        borderRadius: '3px',
        color: c.tooltipText,
        fontFamily: MONO,
        fontSize: '12.5px',
      },
      '.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px !important' },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: c.tooltipSelected, color: c.tooltipText },
      '.cm-completionDetail': { color: c.muted, fontStyle: 'normal', marginLeft: '10px' },
      '.cm-completionInfo': { maxWidth: '320px', padding: '8px 10px', lineHeight: '1.45', fontFamily: 'inherit' },
      '.cm-panels': { backgroundColor: c.gutterBg, color: c.text },
      '.cm-searchMatch': { backgroundColor: c.searchMatch },
    },
    { dark },
  );
}

/** Oscuro Clásico: fondo #242424. */
const DARK: ThemeColors = {
  bg: '#242424',
  text: '#E8E8E8',
  gutterBg: '#242424',
  gutterText: '#6a6f70',
  gutterActive: '#a9aeaf',
  cursor: '#E8E8E8',
  selection: '#3d474b',
  activeLine: 'rgba(255, 255, 255, 0.035)',
  exec: 'rgba(255, 255, 255, 0.22)',
  error: 'rgba(232, 93, 71, 0.22)',
  errorBar: '#e8644a',
  bracket: 'rgba(229, 192, 123, 0.16)',
  bracketOutline: 'rgba(229, 192, 123, 0.5)',
  gameConst: '#E5C07B',
  tooltipBg: '#2e3133',
  tooltipBorder: '#4a5052',
  tooltipText: '#E8E8E8',
  tooltipSelected: '#44505a',
  muted: '#9aa0a2',
  searchMatch: 'rgba(229, 192, 123, 0.25)',
};

/** Terminal Industrial Ámbar (doc 07): pantalla CRT #1E1916 y texto #E8D8C3. */
const AMBER: ThemeColors = {
  bg: '#1E1916',
  text: '#E8D8C3',
  gutterBg: '#1E1916',
  gutterText: '#6e6158',
  gutterActive: '#b8a99a',
  cursor: '#FF941A',
  selection: '#4a3626',
  activeLine: 'rgba(255, 236, 210, 0.03)',
  exec: 'rgba(255, 148, 26, 0.16)',
  error: 'rgba(217, 91, 38, 0.22)',
  errorBar: '#D95B26',
  bracket: 'rgba(212, 163, 74, 0.16)',
  bracketOutline: 'rgba(212, 163, 74, 0.5)',
  gameConst: '#D4A34A',
  tooltipBg: '#2a221d',
  tooltipBorder: '#8C5327',
  tooltipText: '#E8D8C3',
  tooltipSelected: '#4a3626',
  muted: '#8f8276',
  searchMatch: 'rgba(212, 163, 74, 0.25)',
};

const LIGHT: ThemeColors = {
  bg: '#f7f5ef',
  text: '#2b2f31',
  gutterBg: '#efece4',
  gutterText: '#9aa1a3',
  gutterActive: '#4d5457',
  cursor: '#2b2f31',
  selection: '#d6e0e3',
  activeLine: 'rgba(0, 0, 0, 0.03)',
  exec: 'rgba(240, 190, 60, 0.34)',
  error: 'rgba(214, 72, 52, 0.16)',
  errorBar: '#d24a33',
  bracket: 'rgba(154, 103, 0, 0.12)',
  bracketOutline: 'rgba(154, 103, 0, 0.45)',
  gameConst: '#9a6700',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cfcac0',
  tooltipText: '#2b2f31',
  tooltipSelected: '#e3ebee',
  muted: '#7b8486',
  searchMatch: 'rgba(240, 190, 60, 0.35)',
};

const darkHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: '#e0926a' },
    { tag: [t.bool, t.null, t.number], color: '#E5C07B' },
    { tag: [t.string], color: '#a8c47f' },
    { tag: [t.comment, t.lineComment], color: '#7F8C8D', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#88c0e0' },
    { tag: [t.function(t.definition(t.variableName))], color: '#9fd2f6', fontWeight: '600' },
    { tag: [t.definition(t.variableName), t.variableName], color: '#E8E8E8' },
    { tag: [t.propertyName], color: '#d6b3e6' },
    { tag: [t.operator, t.punctuation], color: '#b9bfc1' },
    { tag: [t.invalid], color: '#ff7a6b' },
  ]),
);

/** Resaltado industrial (doc 07): palabras clave y operadores #FF941A, enums y números #D4A34A, funciones #63C784, comentarios #7D746D. */
const amberHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: '#FF941A' },
    { tag: [t.bool, t.null, t.number], color: '#D4A34A' },
    { tag: [t.string], color: '#C9A47B' },
    { tag: [t.comment, t.lineComment], color: '#7D746D', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#63C784' },
    { tag: [t.function(t.definition(t.variableName))], color: '#7fdc9c', fontWeight: '600' },
    { tag: [t.definition(t.variableName), t.variableName], color: '#E8D8C3' },
    { tag: [t.propertyName], color: '#D4A34A' },
    { tag: [t.operator], color: '#FF941A' },
    { tag: [t.punctuation], color: '#b8a99a' },
    { tag: [t.invalid], color: '#ffb088' },
  ]),
);

const lightHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: '#b4532a' },
    { tag: [t.bool, t.null, t.number], color: '#9a6700' },
    { tag: [t.string], color: '#4e7a2a' },
    { tag: [t.comment, t.lineComment], color: '#8a9597', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#1f6ea6' },
    { tag: [t.function(t.definition(t.variableName))], color: '#165a92', fontWeight: '600' },
    { tag: [t.definition(t.variableName), t.variableName], color: '#2b2f31' },
    { tag: [t.propertyName], color: '#8a4fa6' },
    { tag: [t.operator, t.punctuation], color: '#5c6568' },
    { tag: [t.invalid], color: '#d24a33' },
  ]),
);

const amberTheme = [buildTheme(AMBER, true), amberHighlight];
const darkTheme = [buildTheme(DARK, true), darkHighlight];
const lightTheme = [buildTheme(LIGHT, false), lightHighlight];

export function editorThemeExtension(theme: EditorTheme): Extension {
  return theme === 'light' ? lightTheme : theme === 'dark' ? darkTheme : amberTheme;
}
