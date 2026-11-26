import { describe, expect, it } from 'vitest';
import { ConsoleBuffer } from '../src/store/consoleBuffer';
import { formatCompact, formatSimTime } from '../src/ui/format';

describe('formatCompact (contadores del inventario)', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1.00k'],
    [1240, '1.24k'],
    [1249, '1.24k'],
    [10_100, '10.1k'],
    [999_999, '999k'],
    [6_670_000, '6.67M'],
    [1_240_000_000, '1.24B'],
  ])('%d → %s', (value, expected) => {
    expect(formatCompact(value)).toBe(expected);
  });

  it('formatea el tiempo simulado', () => {
    expect(formatSimTime(12.34)).toBe('12.3 s');
    expect(formatSimTime(185.2)).toBe('3:05.2');
  });
});

describe('ConsoleBuffer (búfer circular de la consola)', () => {
  it('nunca supera su capacidad y conserva las líneas más recientes en orden', () => {
    const buffer = new ConsoleBuffer(1000);
    for (let i = 0; i < 2500; i++) buffer.push({ droneId: 0, text: `línea ${i}`, tick: i, kind: 'log' });
    const lines = buffer.toArray();
    expect(lines).toHaveLength(1000);
    expect(lines[0].text).toBe('línea 1500');
    expect(lines[999].text).toBe('línea 2499');
    buffer.clear();
    expect(buffer.toArray()).toEqual([]);
  });
});
