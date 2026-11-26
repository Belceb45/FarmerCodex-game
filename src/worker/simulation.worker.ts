/**
 * Punto de entrada del Web Worker. Toda la ejecución del DSL y la simulación vive aquí,
 * fuera del hilo principal: un `while True:` del jugador nunca congela la interfaz.
 */
import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol';
import { SimulationHost } from './simulationHost';

interface WorkerScope {
  postMessage(message: WorkerToMainMessage, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<MainToWorkerMessage>) => void) | null;
}

const scope = self as unknown as WorkerScope;

const host = new SimulationHost({
  post: (message, transfer) => scope.postMessage(message, transfer ?? []),
  now: () => performance.now(),
  seed: Date.now() >>> 0,
});

scope.onmessage = (event) => {
  host.handleMessage(event.data);
};

// Bucle en ráfagas: cada pump() dura como máximo ~8 ms y luego cede el control,
// de modo que STOP_ALL y el resto de mensajes se atienden de inmediato.
function loop(): void {
  host.pump();
  setTimeout(loop, host.isBusy() ? 0 : 16);
}

scope.postMessage({ type: 'READY' }, []);
loop();
