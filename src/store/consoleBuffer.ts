export type ConsoleKind = 'log' | 'system' | 'error';

export interface ConsoleEntry {
  id: number;
  droneId: number;
  text: string;
  tick: number;
  kind: ConsoleKind;
}

/** Búfer circular de tamaño fijo: nunca guarda más de `capacity` líneas. */
export class ConsoleBuffer {
  readonly capacity: number;
  private readonly slots: (ConsoleEntry | undefined)[];
  private start = 0;
  private length = 0;
  private nextId = 1;

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.slots = new Array<ConsoleEntry | undefined>(capacity);
  }

  get size(): number {
    return this.length;
  }

  push(entry: Omit<ConsoleEntry, 'id'>): void {
    const item: ConsoleEntry = { ...entry, id: this.nextId++ };
    if (this.length < this.capacity) {
      this.slots[(this.start + this.length) % this.capacity] = item;
      this.length++;
    } else {
      this.slots[this.start] = item;
      this.start = (this.start + 1) % this.capacity;
    }
  }

  clear(): void {
    this.slots.fill(undefined);
    this.start = 0;
    this.length = 0;
  }

  toArray(): ConsoleEntry[] {
    const out: ConsoleEntry[] = [];
    for (let i = 0; i < this.length; i++) {
      const item = this.slots[(this.start + i) % this.capacity];
      if (item) out.push(item);
    }
    return out;
  }
}

export const consoleBuffer = new ConsoleBuffer(1000);
