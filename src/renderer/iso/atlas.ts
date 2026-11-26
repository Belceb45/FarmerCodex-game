import { Assets, Texture, type Spritesheet } from 'pixi.js';

/** Atlas único de sprites (doc 05 §4): `public/assets/atlas.webp` + `atlas.json`. */
export interface Atlas {
  readonly sheet: Spritesheet;
  has(name: string): boolean;
  tex(name: string): Texture;
}

export const ATLAS_URL = `${import.meta.env.BASE_URL}assets/atlas.json`;

export async function loadAtlas(): Promise<Atlas> {
  const sheet = await Assets.load<Spritesheet>(ATLAS_URL);
  if (!sheet?.textures || Object.keys(sheet.textures).length === 0) throw new Error('Atlas vacío');
  return {
    sheet,
    has: (name) => name in sheet.textures,
    tex: (name) => sheet.textures[name] ?? Texture.EMPTY,
  };
}
