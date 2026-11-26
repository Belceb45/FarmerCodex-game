import type { TileState } from '../types';
import type { World } from '../world';

/**
 * Calabazas (doc 03 §3.1): al madurar, `deathRate` de morir (Dead_Pumpkin); las maduras que
 * forman un cuadrado N×N se fusionan en una megacalabaza que rinde según `formulaMode`.
 */

/** Rendimiento (en unidades del rendimiento base) de una megacalabaza de lado n. */
export function megaPumpkinYield(world: World, n: number): number {
  const cfg = world.balance.pumpkin;
  if (cfg.formulaMode === 'pure_cubic' || n <= cfg.maxCubicMergeSize) return n ** 3;
  return n * n * cfg.maxCubicMergeSize;
}

function isRipePumpkin(world: World, x: number, y: number): boolean {
  if (!world.grid.inBounds(x, y)) return false;
  const t = world.grid.get(x, y);
  return t.entity === 'Pumpkin' && t.growthProgress >= 1;
}

/** Deshace la megacalabaza a la que pertenece la casilla (sus calabazas vuelven a ser 1×1). */
export function breakMega(world: World, tile: TileState): void {
  const m = tile.mega;
  if (!m) return;
  for (let y = m.y; y < m.y + m.size; y++) {
    for (let x = m.x; x < m.x + m.size; x++) {
      if (!world.grid.inBounds(x, y)) continue;
      const t = world.grid.get(x, y);
      if (t.mega && t.mega.x === m.x && t.mega.y === m.y && t.mega.size === m.size) t.mega = undefined;
    }
  }
}

/**
 * Busca el mayor cuadrado (N ≥ 2) de calabazas maduras que contiene (x, y) con programación
 * dinámica O(ancho·alto) y lo fusiona. Devuelve el lado de la megacalabaza resultante (1 si no hay).
 */
export function mergePumpkins(world: World, x: number, y: number): number {
  const w = world.width;
  const h = world.height;
  // best[i] = lado del mayor cuadrado de calabazas maduras cuya esquina Nor-Este es la casilla i.
  const best = new Int16Array(w * h);
  let bestSize = 1;
  let bestX = x;
  let bestY = y;
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      if (!isRipePumpkin(world, cx, cy)) continue;
      const left = cx > 0 ? best[cy * w + cx - 1] : 0;
      const down = cy > 0 ? best[(cy - 1) * w + cx] : 0;
      const diag = cx > 0 && cy > 0 ? best[(cy - 1) * w + cx - 1] : 0;
      const k = 1 + Math.min(left, down, diag);
      best[cy * w + cx] = k;
      if (cx < x || cy < y) continue;
      // Un cuadrado de lado m con esquina (cx, cy) contiene (x, y) si m ≥ max(cx - x, cy - y) + 1.
      const need = Math.max(cx - x, cy - y) + 1;
      if (k >= need && k > bestSize) {
        bestSize = k;
        bestX = cx - k + 1;
        bestY = cy - k + 1;
      }
    }
  }
  const current = world.grid.get(x, y).mega?.size ?? 1;
  if (bestSize < 2 || bestSize <= current) return current;
  // Las megacalabazas que el nuevo cuadrado corta solo en parte se deshacen.
  for (let ty = bestY; ty < bestY + bestSize; ty++) {
    for (let tx = bestX; tx < bestX + bestSize; tx++) {
      const t = world.grid.get(tx, ty);
      const m = t.mega;
      if (m && (m.x < bestX || m.y < bestY || m.x + m.size > bestX + bestSize || m.y + m.size > bestY + bestSize)) {
        breakMega(world, t);
      }
    }
  }
  for (let ty = bestY; ty < bestY + bestSize; ty++) {
    for (let tx = bestX; tx < bestX + bestSize; tx++) {
      world.grid.get(tx, ty).mega = { x: bestX, y: bestY, size: bestSize };
    }
  }
  return bestSize;
}

/** Al madurar: tirada de muerte con el PRNG y, si sobrevive, intento de fusión. */
export function onPumpkinMature(world: World, tile: TileState): void {
  if (world.rng.chance(world.balance.pumpkin.deathRate)) {
    breakMega(world, tile);
    tile.entity = 'Dead_Pumpkin';
    tile.growthProgress = 1;
    tile.growthDuration = 0;
    world.record('deadPumpkins');
    world.emit({ kind: 'pumpkin', tick: world.totalTicks, x: tile.x, y: tile.y, dead: true, mega: 0 });
    return;
  }
  const size = mergePumpkins(world, tile.x, tile.y);
  if (size >= 2) world.record('maxMega', size, 'max');
  world.emit({ kind: 'pumpkin', tick: world.totalTicks, x: tile.x, y: tile.y, dead: false, mega: size });
}

/** Casillas de la megacalabaza (o solo la casilla, si es una calabaza suelta). */
export function pumpkinTiles(world: World, tile: TileState): TileState[] {
  const m = tile.mega;
  if (!m) return [tile];
  const out: TileState[] = [];
  for (let y = m.y; y < m.y + m.size; y++) for (let x = m.x; x < m.x + m.size; x++) out.push(world.grid.get(x, y));
  return out;
}
