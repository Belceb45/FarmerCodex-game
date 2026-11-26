const UNITS = ['k', 'M', 'B', 'T', 'Qa', 'Qi'];

/**
 * Formato compacto del inventario: enteros exactos hasta 999 y, desde 1000,
 * tres cifras significativas truncadas (nunca muestra más de lo que hay): 1.24k, 10.1k, 6.67M.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 ? '-' : '';
  let v = Math.abs(value);
  if (v < 1000) return sign + (Number.isInteger(v) ? String(v) : String(Math.floor(v * 10) / 10));
  let unit = -1;
  while (v >= 1000 && unit < UNITS.length - 1) {
    v /= 1000;
    unit++;
  }
  const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const factor = 10 ** decimals;
  const truncated = Math.floor(v * factor + 1e-9) / factor;
  return sign + truncated.toFixed(decimals) + UNITS[unit];
}

/** Tiempo simulado legible: "12.4 s" o "3:05.2". */
export function formatSimTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

export function formatInteger(value: number): string {
  return Math.floor(value).toLocaleString('es');
}
