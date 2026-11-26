/** Contrato común de los escenarios de la granja (sprites isométricos y respaldo low-poly). */

export interface HoverTile {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export interface StageCallbacks {
  onHoverTile?: (tile: HoverTile | null) => void;
  onFps?: (fps: number) => void;
  /** Posición (en píxeles del lienzo) del contador de un ítem en el HUD; null si está oculto. */
  getItemTarget?: (item: string) => { x: number; y: number } | null;
  onItemArrived?: (item: string) => void;
  /** Márgenes ocupados por las ventanas y el HUD: la granja se encuadra en el espacio libre. */
  getFitInsets?: () => { left: number; right: number; top: number; bottom: number };
}

export interface FarmScene {
  init(): Promise<void>;
  destroy(): void;
  resetView(): void;
  refit(): void;
  setPaused(paused: boolean): void;
}
