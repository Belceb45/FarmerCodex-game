import type { MainToWorkerMessage, WorkerToMainMessage } from '../worker/protocol';

/** Envoltura del Web Worker de simulación en el hilo principal. */
export class SimulationClient {
  private readonly worker: Worker;

  constructor(onMessage: (message: WorkerToMainMessage) => void, onCrash: (reason: string) => void) {
    this.worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), {
      type: 'module',
      name: 'farmercodex-simulacion',
    });
    this.worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => onMessage(event.data);
    this.worker.onerror = (event) => onCrash(event.message || 'error desconocido en el Worker');
  }

  send(message: MainToWorkerMessage): void {
    this.worker.postMessage(message);
  }

  terminate(): void {
    this.worker.terminate();
  }
}
