import { describe, expect, it } from 'vitest';
import { DeterministicRandom, deriveSeed } from '../src/engine/prng';

/** Implementación de referencia de Mulberry32 (la del documento de arquitectura). */
function referenceMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('DeterministicRandom (Mulberry32)', () => {
  it('produce la misma secuencia con la misma semilla', () => {
    const a = new DeterministicRandom(12345);
    const b = new DeterministicRandom(12345);
    for (let i = 0; i < 1000; i++) expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('coincide con la implementación de referencia', () => {
    const rng = new DeterministicRandom(987654321);
    const ref = referenceMulberry32(987654321);
    for (let i = 0; i < 500; i++) expect(rng.nextFloat()).toBe(ref());
  });

  it('semillas distintas producen secuencias distintas', () => {
    const a = new DeterministicRandom(1);
    const b = new DeterministicRandom(2);
    const sa = Array.from({ length: 10 }, () => a.nextFloat());
    const sb = Array.from({ length: 10 }, () => b.nextFloat());
    expect(sa).not.toEqual(sb);
  });

  it('nextFloat está en [0, 1) y nextInt respeta los límites inclusivos', () => {
    const rng = new DeterministicRandom(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.nextInt(7, 15);
      expect(n).toBeGreaterThanOrEqual(7);
      expect(n).toBeLessThanOrEqual(15);
      seen.add(n);
    }
    expect(seen.size).toBe(9);
  });

  it('chance() aproxima la probabilidad pedida', () => {
    const rng = new DeterministicRandom(2024);
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (rng.chance(0.2)) hits++;
    expect(hits / 20000).toBeGreaterThan(0.18);
    expect(hits / 20000).toBeLessThan(0.22);
  });

  it('getState/setState permiten reanudar la secuencia exactamente', () => {
    const rng = new DeterministicRandom(555);
    for (let i = 0; i < 17; i++) rng.nextFloat();
    const state = rng.getState();
    const expected = [rng.nextFloat(), rng.nextFloat(), rng.nextFloat()];
    const resumed = new DeterministicRandom(0);
    resumed.setState(state);
    expect([resumed.nextFloat(), resumed.nextFloat(), resumed.nextFloat()]).toEqual(expected);
  });

  it('el estado interno se mantiene en 32 bits', () => {
    const rng = new DeterministicRandom(0xffffffff);
    for (let i = 0; i < 10000; i++) rng.nextFloat();
    expect(rng.getState()).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(rng.getState())).toBe(true);
  });

  it('deriveSeed es determinista y separa flujos', () => {
    expect(deriveSeed(42, 1)).toBe(deriveSeed(42, 1));
    expect(deriveSeed(42, 1)).not.toBe(deriveSeed(42, 2));
    expect(deriveSeed(42, 1)).not.toBe(42);
  });
});
