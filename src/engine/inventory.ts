/**
 * Redondea cantidades fraccionarias (depósitos que se rellenan por tick, cosechas infectadas)
 * para que las sumas repetidas no acumulen error de coma flotante: 800 · 0.00125 da exactamente 1.
 */
export function cleanAmount(v: number): number {
  return Math.abs(v) < 1e6 ? Math.round(v * 1e9) / 1e9 : v;
}

/** Inventario global de recursos. No existe mercado: las siembras descuentan de aquí directamente. */
export class Inventory {
  private readonly counts = new Map<string, number>();

  get(item: string): number {
    return this.counts.get(item) ?? 0;
  }

  add(item: string, amount: number): void {
    if (amount === 0) return;
    this.counts.set(item, cleanAmount(this.get(item) + amount));
  }

  has(costs: Readonly<Record<string, number>>): boolean {
    return Object.entries(costs).every(([item, amount]) => this.get(item) >= amount);
  }

  /** Descuenta todos los costos o ninguno. */
  consume(costs: Readonly<Record<string, number>>): boolean {
    if (!this.has(costs)) return false;
    for (const [item, amount] of Object.entries(costs)) this.add(item, -amount);
    return true;
  }

  toRecord(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [item, amount] of this.counts) out[item] = amount;
    return out;
  }

  static fromRecord(record: Readonly<Record<string, number>>): Inventory {
    const inv = new Inventory();
    for (const [item, amount] of Object.entries(record)) inv.counts.set(item, amount);
    return inv;
  }
}
