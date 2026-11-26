import { isFileActive, useGameStore } from '../../store/useGameStore';
import { useWindowStore } from '../../store/useWindowStore';
import { SCRIPT_EXT, validateScriptName } from './layout';

/** Ventanas cuyo editor debe recibir el foco al montarse (recién creadas con «+»). */
const pendingEditorFocus = new Set<string>();

export function wantsEditorFocus(windowId: string): boolean {
  return pendingEditorFocus.has(windowId);
}

export function clearEditorFocus(windowId: string): void {
  pendingEditorFocus.delete(windowId);
}

/** «+»: crea un archivo `.py` vacío y abre su ventana delante de las demás. */
export function createScriptWindow(): void {
  const file = useGameStore.getState().createFile();
  const id = useWindowStore.getState().openCode(file);
  pendingEditorFocus.add(id);
}

/** «×»: cierra la ventana y elimina su archivo (detiene el script si era el que corría). */
export function deleteScriptWindow(windowId: string): void {
  const win = useWindowStore.getState().windows.find((w) => w.id === windowId);
  if (!win) return;
  useWindowStore.getState().closeWindow(windowId);
  if (win.file) useGameStore.getState().deleteFile(win.file);
}

/** Renombra el archivo de una ventana. Devuelve un mensaje de error o null si se aplicó. */
export function renameScript(windowId: string, newBase: string): string | null {
  const win = useWindowStore.getState().windows.find((w) => w.id === windowId);
  if (!win?.file) return 'La ventana ya no existe.';
  const game = useGameStore.getState();
  const error = validateScriptName(newBase, Object.keys(game.files), win.file);
  if (error) return error;
  if (isFileActive(game, win.file)) return 'Detén el script antes de renombrarlo.';
  const to = newBase.trim() + SCRIPT_EXT;
  if (to === win.file) return null;
  game.renameFile(win.file, to);
  useWindowStore.getState().renameFileRefs(win.file, to);
  return null;
}
