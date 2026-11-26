import type { EntityKind } from '../../engine/types';
import { easeOutQuad, lerp } from './easing';

/** Tinte de diagnóstico del cactus mal ordenado (doc 06 §2). */
export const CACTUS_UNSORTED_TINT = 0x8b6b4a;

export interface Visual {
  tex: string;
  sx: number;
  sy: number;
  tint: number;
}

/** Sprite y escala de un cultivo según su crecimiento (doc 08 §4). */
export function entityVisual(kind: EntityKind, g: number, meta: number, unsorted: boolean): Visual | null {
  const v = (tex: string, sx: number, sy = sx, tint = 0xffffff): Visual => ({ tex, sx, sy, tint });
  switch (kind) {
    case 'Grass':
      return v(g < 0.5 ? 'grass_sprout' : 'grass_mature', 1, lerp(0.35, 1, g));
    case 'Bush':
      return g < 0.5 ? v('bush_sprout', lerp(0.6, 1, g / 0.5)) : v('bush_mature', lerp(0.65, 1, (g - 0.5) / 0.5));
    case 'Tree':
      if (g < 0.35) return v('tree_sprout', lerp(0.6, 1, g / 0.35));
      if (g < 0.85) return v('tree_mid', lerp(0.75, 1, (g - 0.35) / 0.5));
      return v('tree_mature', lerp(0.85, 1, (g - 0.85) / 0.15));
    case 'Carrot':
      return g < 1 ? v('carrot_sprout', lerp(0.5, 1, Math.min(1, g / 0.8))) : v('carrot_mature', 1);
    case 'Pumpkin':
      return g < 0.3 ? v('pumpkin_sprout', lerp(0.6, 1, g / 0.3)) : v('pumpkin_mature', lerp(0.3, 1, easeOutQuad((g - 0.3) / 0.7)));
    case 'Dead_Pumpkin':
      return v('dead_pumpkin', 1);
    case 'Sunflower':
      return g < 1 ? v('sunflower_sprout', lerp(0.6, 1, g), lerp(0.25, 1, g)) : v('sunflower_mature', 1);
    case 'Cactus': {
      // Tamaño visual s = 0.6 + 0.05 · cactusSize; mal ordenado: tint 0x8B6B4A sobre la variante neutra.
      const size = 0.6 + 0.05 * meta;
      const tint = unsorted ? CACTUS_UNSORTED_TINT : 0xffffff;
      const suffix = unsorted ? '_neutral' : '';
      return g < 0.5
        ? v(`cactus_sprout${suffix}`, size * lerp(0.6, 1, g / 0.5), size * lerp(0.6, 1, g / 0.5), tint)
        : v(`cactus_mature${suffix}`, size * lerp(0.55, 1, (g - 0.5) / 0.5), size * lerp(0.55, 1, (g - 0.5) / 0.5), tint);
    }
    case 'Treasure':
      return v('treasure_closed', 1);
    case 'Apple':
      return v('apple', 1);
    case 'Dinosaur':
      return v('dino_segment', 1);
    case 'Hedge':
      return null;
  }
}

