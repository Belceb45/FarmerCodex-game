import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SerializedWorldState } from '../engine/world';

/** Persistencia local en IndexedDB (doc 01, sección 6). */

export const DB_NAME = 'farmercodex_db';
const DB_VERSION = 1;
/** Ranura del autoguardado de la partida. */
export const AUTOSAVE_SLOT = 'autosave';

export interface StoredFile {
  name: string;
  content: string;
  updatedAt: number;
}

export interface SaveSlot {
  slotId: string;
  seed: number;
  worldState: SerializedWorldState;
  updatedAt: number;
}

export interface LeaderboardEntry {
  boardId: string;
  /** Mejor marca en ticks simulados (menos es mejor). */
  bestTicks: number;
  seed: number;
  achievedAt: number;
  /** Archivo con el que se consiguió (vacío en Fastest_Reset). */
  file?: string;
  /** Intentos completados en total. */
  runs?: number;
}

interface FarmerCodexDB extends DBSchema {
  files: { key: string; value: StoredFile };
  saves: { key: string; value: SaveSlot };
  leaderboards: { key: string; value: LeaderboardEntry };
}

/** Operaciones que necesita el juego; la versión en memoria sirve para las pruebas y como respaldo. */
export interface PersistenceBackend {
  loadFiles(): Promise<StoredFile[]>;
  putFile(file: StoredFile): Promise<void>;
  deleteFile(name: string): Promise<void>;
  loadSave(slotId: string): Promise<SaveSlot | undefined>;
  putSave(slot: SaveSlot): Promise<void>;
  loadLeaderboards(): Promise<LeaderboardEntry[]>;
  putLeaderboard(entry: LeaderboardEntry): Promise<void>;
  /** Borra archivos y partidas (reiniciar partida). Los marcadores se conservan: Fastest_Reset mide reinicios. */
  clear(): Promise<void>;
}

export function createIdbBackend(): PersistenceBackend {
  let dbPromise: Promise<IDBPDatabase<FarmerCodexDB>> | null = null;
  const db = (): Promise<IDBPDatabase<FarmerCodexDB>> => {
    dbPromise ??= openDB<FarmerCodexDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'name' });
        if (!database.objectStoreNames.contains('saves')) database.createObjectStore('saves', { keyPath: 'slotId' });
        if (!database.objectStoreNames.contains('leaderboards')) {
          database.createObjectStore('leaderboards', { keyPath: 'boardId' });
        }
      },
    });
    return dbPromise;
  };
  return {
    async loadFiles() {
      return (await db()).getAll('files');
    },
    async putFile(file) {
      await (await db()).put('files', file);
    },
    async deleteFile(name) {
      await (await db()).delete('files', name);
    },
    async loadSave(slotId) {
      return (await db()).get('saves', slotId);
    },
    async putSave(slot) {
      await (await db()).put('saves', slot);
    },
    async loadLeaderboards() {
      return (await db()).getAll('leaderboards');
    },
    async putLeaderboard(entry) {
      await (await db()).put('leaderboards', entry);
    },
    async clear() {
      const d = await db();
      const tx = d.transaction(['files', 'saves'], 'readwrite');
      await Promise.all([tx.objectStore('files').clear(), tx.objectStore('saves').clear(), tx.done]);
    },
  };
}

export function createMemoryBackend(): PersistenceBackend {
  const files = new Map<string, StoredFile>();
  const saves = new Map<string, SaveSlot>();
  const boards = new Map<string, LeaderboardEntry>();
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async loadFiles() {
      return [...files.values()].map(copy).sort((a, b) => a.name.localeCompare(b.name));
    },
    async putFile(file) {
      files.set(file.name, copy(file));
    },
    async deleteFile(name) {
      files.delete(name);
    },
    async loadSave(slotId) {
      const slot = saves.get(slotId);
      return slot ? copy(slot) : undefined;
    },
    async putSave(slot) {
      saves.set(slot.slotId, copy(slot));
    },
    async loadLeaderboards() {
      return [...boards.values()].map(copy);
    },
    async putLeaderboard(entry) {
      boards.set(entry.boardId, copy(entry));
    },
    async clear() {
      files.clear();
      saves.clear();
    },
  };
}

/**
 * Sincroniza un mapa de archivos con el almacén: guarda los nuevos o modificados (con espera,
 * para no escribir en cada tecla) y borra los que desaparecen (cerrar o renombrar una ventana).
 */
export class FileSync {
  private readonly backend: PersistenceBackend;
  private readonly delayMs: number;
  private readonly now: () => number;
  private known: Record<string, string> = {};
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Map<string, string>();

  constructor(backend: PersistenceBackend, options: { delayMs?: number; now?: () => number } = {}) {
    this.backend = backend;
    this.delayMs = options.delayMs ?? 400;
    this.now = options.now ?? Date.now;
  }

  /** Estado ya guardado (al arrancar desde el almacén). */
  setBaseline(files: Record<string, string>): void {
    this.known = { ...files };
  }

  update(files: Record<string, string>): void {
    for (const [name, content] of Object.entries(files)) {
      if (this.known[name] !== content) this.schedule(name, content);
    }
    for (const name of Object.keys(this.known)) {
      if (!(name in files)) {
        this.cancel(name);
        void this.backend.deleteFile(name);
      }
    }
    this.known = { ...files };
  }

  /** Escribe ya lo pendiente (antes de recargar la página). */
  async flush(): Promise<void> {
    const writes = [...this.pending.entries()].map(([name, content]) => {
      this.cancel(name);
      return this.backend.putFile({ name, content, updatedAt: this.now() });
    });
    await Promise.all(writes);
  }

  private schedule(name: string, content: string): void {
    this.cancel(name);
    this.pending.set(name, content);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        this.pending.delete(name);
        void this.backend.putFile({ name, content, updatedAt: this.now() });
      }, this.delayMs),
    );
  }

  private cancel(name: string): void {
    const timer = this.timers.get(name);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(name);
    this.pending.delete(name);
  }
}
