import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENTITY_KINDS, HAT_KINDS, ITEM_KINDS } from '../../src/engine/types';
import { getLodLevel, MAX_PARTICLES } from '../../src/renderer/iso/lod';
import { boardBounds, depthOf, isoX, isoY, pickTile, TILE_H, TILE_W, tileCenter } from '../../src/renderer/iso/projection';
import { CACTUS_UNSORTED_TINT, entityVisual } from '../../src/renderer/iso/visuals';

describe('Isometría 2:1 (doc 05 §3)', () => {
  it('casilla lógica de 128 × 64 y screenX = (x − y)·tileW/2, screenY = −(x + y)·tileH/2', () => {
    expect([TILE_W, TILE_H]).toEqual([128, 64]);
    expect([isoX(0, 0), isoY(0, 0)]).toEqual([0, -0]);
    expect([isoX(3, 1), isoY(3, 1)]).toEqual([(3 - 1) * 64, -(3 + 1) * 32]);
  });

  it('North (y + 1) y East (x + 1) apuntan hacia arriba en la pantalla', () => {
    expect(isoY(0, 1)).toBeLessThan(isoY(0, 0));
    expect(isoY(1, 0)).toBeLessThan(isoY(0, 0));
    expect(isoX(1, 0)).toBeGreaterThan(0);
    expect(isoX(0, 1)).toBeLessThan(0);
  });

  it('el picking es la inversa algebraica: cualquier punto de una casilla devuelve esa casilla', () => {
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 5; y++) {
        for (const [du, dv] of [
          [0.5, 0.5],
          [0.05, 0.05],
          [0.95, 0.1],
          [0.1, 0.95],
          [0.9, 0.9],
        ]) {
          expect(pickTile(isoX(x + du, y + dv), isoY(x + du, y + dv))).toEqual({ x, y });
        }
        const c = tileCenter(x, y);
        expect(pickTile(c.x, c.y)).toEqual({ x, y });
      }
    }
  });

  it('profundidad zIndex = −(x + y): lo más al Sur-Oeste queda delante', () => {
    expect(depthOf(0, 0)).toBeGreaterThan(depthOf(1, 0));
    expect(depthOf(2, 3)).toBe(-5);
  });

  it('los límites de la plataforma encierran sus cuatro esquinas', () => {
    const b = boardBounds(4, 3);
    for (const [u, v] of [
      [0, 0],
      [4, 0],
      [0, 3],
      [4, 3],
    ]) {
      expect(isoX(u, v)).toBeGreaterThanOrEqual(b.x0);
      expect(isoX(u, v)).toBeLessThanOrEqual(b.x1);
      expect(isoY(u, v)).toBeGreaterThanOrEqual(b.y0);
      expect(isoY(u, v)).toBeLessThanOrEqual(b.y1);
    }
  });
});

describe('Degradación elegante (doc 08 §6)', () => {
  it('getLodLevel sigue los umbrales del doc y el pool tiene tope de 150', () => {
    expect(getLodLevel(1, 1)).toBe('HIGH');
    expect(getLodLevel(8, 10)).toBe('HIGH');
    expect(getLodLevel(9, 1)).toBe('MEDIUM');
    expect(getLodLevel(1, 11)).toBe('MEDIUM');
    expect(getLodLevel(17, 1)).toBe('LOW');
    expect(getLodLevel(1, 26)).toBe('LOW');
    expect(MAX_PARTICLES).toBe(150);
  });
});

describe('Sprites de los cultivos según su crecimiento (doc 08 §4)', () => {
  it('pasto: sprout antes de 0.5 y mature después, scaleY de 0.35 a 1', () => {
    expect(entityVisual('Grass', 0, 0, false)).toMatchObject({ tex: 'grass_sprout', sy: 0.35 });
    expect(entityVisual('Grass', 0.49, 0, false)?.tex).toBe('grass_sprout');
    expect(entityVisual('Grass', 1, 0, false)).toMatchObject({ tex: 'grass_mature', sy: 1 });
  });

  it('árbol: tres sprites con cortes en 0.35 y 0.85', () => {
    expect(entityVisual('Tree', 0.34, 0, false)?.tex).toBe('tree_sprout');
    expect(entityVisual('Tree', 0.35, 0, false)?.tex).toBe('tree_mid');
    expect(entityVisual('Tree', 0.84, 0, false)?.tex).toBe('tree_mid');
    expect(entityVisual('Tree', 0.85, 0, false)?.tex).toBe('tree_mature');
  });

  it('zanahoria y girasol cambian a mature solo al madurar; el girasol crece en scaleY de 0.25 a 1', () => {
    expect(entityVisual('Carrot', 0.99, 0, false)?.tex).toBe('carrot_sprout');
    expect(entityVisual('Carrot', 1, 0, false)?.tex).toBe('carrot_mature');
    expect(entityVisual('Sunflower', 0, 0, false)).toMatchObject({ tex: 'sunflower_sprout', sy: 0.25 });
    expect(entityVisual('Sunflower', 1, 0, false)?.tex).toBe('sunflower_mature');
  });

  it('cactus: tamaño visual s = 0.6 + 0.05 · cactusSize; mal ordenado lleva tint 0x8B6B4A y bien ordenado 0xFFFFFF', () => {
    for (let size = 0; size <= 9; size++) {
      const v = entityVisual('Cactus', 1, size, false);
      expect(v?.sx).toBeCloseTo(0.6 + 0.05 * size, 10);
      expect(v?.tint).toBe(0xffffff);
    }
    const bad = entityVisual('Cactus', 1, 4, true);
    expect(bad?.tint).toBe(CACTUS_UNSORTED_TINT);
    expect(CACTUS_UNSORTED_TINT).toBe(0x8b6b4a);
  });
});

describe('Atlas de sprites (doc 06)', () => {
  const atlas = JSON.parse(fs.readFileSync('public/assets/atlas.json', 'utf8')) as {
    frames: Record<string, { anchor?: { x: number; y: number }; sourceSize: { w: number; h: number } }>;
    meta: { image: string; size: { w: number; h: number }; scale: string };
  };
  const names = new Set(Object.keys(atlas.frames));

  it('una sola hoja atlas.webp de 2048 × 2048 como máximo', () => {
    expect(atlas.meta.image).toBe('atlas.webp');
    expect(atlas.meta.size.w).toBeLessThanOrEqual(2048);
    expect(atlas.meta.size.h).toBeLessThanOrEqual(2048);
    expect(fs.existsSync('public/assets/atlas.webp')).toBe(true);
  });

  it('contiene todo el catálogo: terrenos, cultivos, puzles, dron, mascota, partículas, sombreros e ítems', () => {
    const required = [
      'tile_grassland',
      'tile_soil',
      'tile_water_overlay',
      'item_weird_substance',
      'grass_sprout',
      'grass_mature',
      'bush_sprout',
      'bush_mature',
      'tree_sprout',
      'tree_mid',
      'tree_mature',
      'carrot_sprout',
      'carrot_mature',
      'pumpkin_sprout',
      'pumpkin_mature',
      'pumpkin_mega',
      'dead_pumpkin',
      'sunflower_sprout',
      'sunflower_mature',
      'cactus_sprout',
      'cactus_mature',
      'apple',
      'dino_head',
      'dino_segment',
      'dino_tail',
      'hedge_n',
      'hedge_e',
      'hedge_s',
      'hedge_w',
      'treasure_closed',
      'treasure_open',
      'fx_spark',
      'fx_dust',
      'fx_glow',
      'fx_bubble',
      'drone_body',
      'drone_rotor_a',
      'drone_rotor_b',
      'drone_arm',
      'pet_dog',
      ...HAT_KINDS.map((h) => `hat_${h}`),
      ...ITEM_KINDS.map((i) => `item_${i.toLowerCase()}`),
    ];
    expect(required.filter((n) => !names.has(n))).toEqual([]);
  });

  it('todas las texturas que elige el renderizador existen', () => {
    for (const kind of ENTITY_KINDS) {
      for (const g of [0, 0.2, 0.4, 0.6, 0.9, 1]) {
        for (const unsorted of [false, true]) {
          const v = entityVisual(kind, g, 5, unsorted);
          if (v) expect(names.has(v.tex), `${kind} ${g}: ${v.tex}`).toBe(true);
        }
      }
    }
  });

  it('anclajes: terrenos y cultivos en (0.5, 0.75); el dron en su centro (0.5, 0.5)', () => {
    for (const n of ['tile_grassland', 'tile_soil', 'grass_mature', 'tree_mature', 'pumpkin_mega', 'cactus_mature', 'apple']) {
      expect(atlas.frames[n].anchor, n).toEqual({ x: 0.5, y: 0.75 });
    }
    expect(atlas.frames.drone_body.anchor).toEqual({ x: 0.5, y: 0.5 });
  });
});
