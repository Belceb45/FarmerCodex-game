import { HAT_KINDS } from '../../src/engine/types';
import type { MeshBuilder } from '../../src/renderer/iso3d';
import { buildHat } from '../../src/renderer/models/hats';
import { GLOW, METAL, ORGANIC, RUST, type SpriteDef } from './iso';
import { C, desaturate, mix, shade } from './palette';

/**
 * Sombreros reinterpretados como piezas de chatarrero (doc 06 §1): se reutiliza la geometría de
 * los 18 sombreros del juego y se rehornea con chapa desaturada, óxido y grano; las partes vivas
 * (flores, paja, brotes, cactus, calabaza) quedan orgánicas en la paleta opaca del doc 05.
 */

/** Sombreros con partes orgánicas, y qué tonos cuentan como orgánicos en cada uno. */
const ORGANIC_PARTS: Record<string, (h: number, s: number) => boolean> = {
  Flower_Crown: (_h, s) => s > 0.15,
  Hay_Bale: () => true,
  Carrot_Top: (_h, s) => s > 0.25,
  Pumpkin_Helmet: (h, s) => s > 0.3 && (h < 60 || (h > 60 && h < 170)),
  Sprout_Pot: (h, s) => h > 55 && h < 170 && s > 0.2,
  Cactus_Pot: (h, s) => h > 55 && h < 170 && s > 0.15,
};

function hsl(c: number): [number, number, number] {
  const r = ((c >> 16) & 0xff) / 255;
  const g = ((c >> 8) & 0xff) / 255;
  const b = (c & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function scrapHat(mb: MeshBuilder, name: string): void {
  mb.save();
  mb.scale(2.1);
  // El frente de los sombreros mira al Sur; en la isometría el espectador está al Sur-Oeste.
  mb.rotateZ(-Math.PI / 4);
  buildHat(mb, name, 0.6);
  mb.restore();
  const organic = ORGANIC_PARTS[name];
  for (const face of mb.faces) {
    if (face.f & GLOW) {
      face.c = mix(face.c, C.amber, 0.3);
      continue;
    }
    const [h, s] = hsl(face.c);
    if (organic?.(h, s)) {
      face.c = shade(desaturate(face.c, 0.4), 0.92);
      face.f |= ORGANIC;
    } else {
      face.c = shade(mix(desaturate(face.c, 0.5), C.copperDark, 0.2), 0.95);
      face.f |= METAL | RUST;
    }
  }
}

export const HATS: SpriteDef[] = HAT_KINDS.map((name) => ({
  name: `hat_${name}`,
  w: 96,
  h: 96,
  ax: 48,
  ay: 70,
  outline: 1,
  build: (mb: MeshBuilder) => scrapHat(mb, name),
}));
