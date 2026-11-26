/** Elementos del HUD hacia los que vuelan los recursos cosechados (por nombre de ítem). */
export const hudTargets = new Map<string, HTMLElement>();

/** Acciones de la cámara de la granja accesibles desde el HUD (las registra el fondo). */
export const stageControls: { resetView: (() => void) | null } = { resetView: null };
