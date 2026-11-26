import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { spriteSvg, type SpriteDef } from './iso';
import { CROPS } from './crops';
import { DRONE } from './drone';
import { FX } from './fx';
import { HATS } from './hats';
import { ITEMS } from './items';
import { PUZZLES } from './puzzles';
import { TERRAIN } from './terrain';

/** Supermuestreo de los PNG: 2 = resolución Retina (el atlas lo declara en `meta.scale`). */
export const SUPERSAMPLE = 2;

/** Todos los sprites del catálogo (doc 06), en el orden en que se generan. */
export const SPRITES: SpriteDef[] = [...TERRAIN, ...CROPS, ...PUZZLES, ...DRONE, ...HATS, ...FX, ...ITEMS];

export interface GenerateOptions {
  outDir: string;
  /** Solo los sprites cuyo nombre contiene alguno de estos textos. */
  only?: string[];
  /** Guarda también el SVG intermedio (depuración). */
  keepSvg?: boolean;
}

/** Genera los PNG-32 de `assets-src/sprites/` y el archivo de anclajes que el empaquetador añade al atlas. */
export async function generate(opts: GenerateOptions): Promise<void> {
  await fs.mkdir(opts.outDir, { recursive: true });
  const anchors: Record<string, [number, number]> = {};
  const list = opts.only?.length ? SPRITES.filter((s) => opts.only?.some((o) => s.name.includes(o))) : SPRITES;
  const names = new Set<string>();
  for (const def of list) {
    if (names.has(def.name)) throw new Error(`Sprite duplicado: ${def.name}`);
    names.add(def.name);
    const { svg, overflow } = spriteSvg(def, SUPERSAMPLE);
    if (overflow) console.warn(`⚠ ${def.name}: ${overflow}`);
    const file = path.join(opts.outDir, `${def.name}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
    if (opts.keepSvg) await fs.writeFile(path.join(opts.outDir, `${def.name}.svg`), svg);
    const [nx, ny] = def.anchor ?? [def.ax / def.w, def.ay / def.h];
    anchors[def.name] = [Number(nx.toFixed(4)), Number(ny.toFixed(4))];
  }
  // Conserva los anclajes de sprites no regenerados (o añadidos a mano con arte final).
  const anchorsFile = path.join(opts.outDir, 'anchors.json');
  let previous: Record<string, [number, number]> = {};
  try {
    previous = JSON.parse(await fs.readFile(anchorsFile, 'utf8')) as Record<string, [number, number]>;
  } catch {
    previous = {};
  }
  const merged = Object.fromEntries(Object.entries({ ...previous, ...anchors }).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(anchorsFile, JSON.stringify(merged, null, 2) + '\n');
  await fs.writeFile(path.join(opts.outDir, 'atlas.config.json'), JSON.stringify({ scale: SUPERSAMPLE }, null, 2) + '\n');
  console.log(`${list.length} sprites generados en ${opts.outDir}`);
}
