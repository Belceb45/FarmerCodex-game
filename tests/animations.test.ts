import { describe, expect, it } from 'vitest';
import {
  actionDurationMs,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutBounce,
  easeOutQuad,
  FAST_ACTION_THRESHOLD_MS,
  flyerCountForAmount,
  getLodLevel,
  isFastAction,
} from '../src/renderer/animMath';

describe('Matemáticas de animación procedural', () => {
  it('las curvas de easing respetan extremos 0 y 1 y sus características', () => {
    for (const fn of [easeOutQuad, easeInCubic, easeInOutCubic, easeOutBack, easeOutBounce]) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
      expect(fn(-0.5)).toBeCloseTo(0, 5);
      expect(fn(1.5)).toBeCloseTo(1, 5);
    }
    expect(easeOutBack(0.75)).toBeGreaterThan(1);
    expect(easeOutBounce(0.5)).toBeGreaterThan(0.7);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it('Auto-LOD degrada en los umbrales de drones y velocidad efectiva (doc 08)', () => {
    expect(getLodLevel(1, 1)).toBe('HIGH');
    expect(getLodLevel(8, 10)).toBe('HIGH');
    expect(getLodLevel(9, 1)).toBe('MEDIUM');
    expect(getLodLevel(1, 11)).toBe('MEDIUM');
    expect(getLodLevel(16, 25)).toBe('MEDIUM');
    expect(getLodLevel(17, 1)).toBe('LOW');
    expect(getLodLevel(1, 26)).toBe('LOW');
  });

  it('detecta acciones ultrarrápidas por debajo de 35 ms para evitar parpadeo', () => {
    expect(actionDurationMs(0, 200, 400)).toBe(500);
    expect(isFastAction(actionDurationMs(0, 200, 400))).toBe(false);
    const fastMs = actionDurationMs(0, 200, 8000);
    expect(fastMs).toBeLessThan(FAST_ACTION_THRESHOLD_MS);
    expect(isFastAction(fastMs)).toBe(true);
    expect(isFastAction(actionDurationMs(0, 200, 0))).toBe(false);
  });

  it('ajusta el número de íconos voladores al HUD según cantidad y LOD', () => {
    expect(flyerCountForAmount(1, 'HIGH', 1)).toBe(1);
    expect(flyerCountForAmount(5, 'HIGH', 1)).toBe(2);
    expect(flyerCountForAmount(27, 'HIGH', 1)).toBe(3);
    expect(flyerCountForAmount(5, 'MEDIUM', 1)).toBe(0);
    expect(flyerCountForAmount(5, 'MEDIUM', 3)).toBe(1);
    expect(flyerCountForAmount(27, 'LOW', 3)).toBe(0);
  });
});
