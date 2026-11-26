import { describe, expect, it } from 'vitest';
import { MAX_VOICES, soundForEvent, SoundThrottle } from '../src/audio/sounds';
import { formatTicks, mergeRecord } from '../src/store/records';
import type { LeaderboardResult } from '../src/worker/protocol';

const result = (ticks: number, success = true): LeaderboardResult => ({ boardId: 'Hay', file: 'main.py', success, ticks, simTime: ticks / 400 });

describe('Marcas de los marcadores', () => {
  it('guarda la primera marca y solo la reemplaza si mejora (menos ticks)', () => {
    const first = mergeRecord(undefined, result(5000), 1, 101);
    expect(first).toMatchObject({ improved: true, previous: null, entry: { bestTicks: 5000, runs: 1, file: 'main.py', seed: 101 } });
    const worse = mergeRecord(first?.entry, result(6000), 2, 101);
    expect(worse).toMatchObject({ improved: false, previous: 5000, entry: { bestTicks: 5000, runs: 2, achievedAt: 1 } });
    const better = mergeRecord(worse?.entry, result(4200), 3, 101);
    expect(better).toMatchObject({ improved: true, previous: 5000, entry: { bestTicks: 4200, runs: 3, achievedAt: 3 } });
  });

  it('los intentos fallidos no cuentan', () => {
    expect(mergeRecord(undefined, result(10, false), 1, 0)).toBeNull();
  });

  it('formatea ticks simulados con su tiempo', () => {
    expect(formatTicks(12345)).toBe('12 345 ticks · 30.86 s');
    expect(formatTicks(400)).toBe('400 ticks · 1.00 s');
  });
});

describe('Sonido con throttling', () => {
  it('cada evento tiene su sonido y los silenciosos devuelven null', () => {
    expect(soundForEvent({ kind: 'harvest', tick: 0, x: 0, y: 0, mature: true, items: { Hay: 1 } })).toBe('harvest');
    expect(soundForEvent({ kind: 'harvest', tick: 0, x: 0, y: 0, mature: false, items: {} })).toBe('thud');
    expect(soundForEvent({ kind: 'harvest', tick: 0, x: 0, y: 0, mature: true, items: { Gold: 64 } })).toBe('treasure');
    expect(soundForEvent({ kind: 'flip', tick: 0, droneId: 1, x: 0, y: 0 })).toBe('flip');
    expect(soundForEvent({ kind: 'spawn', tick: 0, droneId: 1, x: 0, y: 0 })).toBe('spawn');
    expect(soundForEvent({ kind: 'print', tick: 0, droneId: 0, x: 0, y: 0, text: 'hola' })).toBeNull();
  });

  it('descarta repeticiones dentro del enfriamiento y respeta el tope de voces', () => {
    const t = new SoundThrottle();
    expect(t.allow('harvest', 0, 2)).toBe(true);
    expect(t.allow('harvest', 20, 2)).toBe(false);
    expect(t.allow('harvest', 50, 2)).toBe(true);
    // Otra categoría no comparte enfriamiento, pero sí el tope de voces.
    t.active = MAX_VOICES - 1;
    expect(t.allow('plant', 60, 1)).toBe(true);
    expect(t.allow('till', 60, 2)).toBe(false);
  });
});
