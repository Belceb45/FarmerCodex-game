import type { SimEvent } from '../engine/types';
import type { RenderSnapshot } from '../worker/protocol';

/**
 * Contenedor mutable fuera del árbol de React: PixiJS lo lee a 60 FPS sin provocar renders.
 * `receivedAt` (performance.now) permite interpolar entre snapshots.
 */
export const liveSnapshot: { current: RenderSnapshot | null; receivedAt: number } = {
  current: null,
  receivedAt: 0,
};

const MAX_PENDING_EVENTS = 200;
const sceneEvents: SimEvent[] = [];

/** Encola los eventos de un snapshot para que el renderizador los consuma una sola vez. */
export function pushSceneEvents(events: readonly SimEvent[]): void {
  if (events.length === 0) return;
  sceneEvents.push(...events);
  if (sceneEvents.length > MAX_PENDING_EVENTS) sceneEvents.splice(0, sceneEvents.length - MAX_PENDING_EVENTS);
}

export function drainSceneEvents(): SimEvent[] {
  return sceneEvents.splice(0, sceneEvents.length);
}
