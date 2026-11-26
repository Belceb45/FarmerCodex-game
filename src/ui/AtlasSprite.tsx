import { useEffect, useState, type ReactNode } from 'react';
import { ATLAS_URL } from '../renderer/iso/atlas';

/**
 * Íconos de la interfaz recortados del mismo atlas de la granja (doc 07: «extraído del mismo
 * estilo del atlas»). Se dibujan con CSS (background-position) sin cargar PixiJS en React.
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasFrame {
  frame: Rect;
  spriteSourceSize: Rect;
  sourceSize: { w: number; h: number };
}

interface AtlasData {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number } };
}

let cache: AtlasData | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadAtlasData(): Promise<void> {
  pending ??= fetch(ATLAS_URL)
    .then((r) => (r.ok ? (r.json() as Promise<AtlasData>) : null))
    .then((data) => {
      cache = data;
      for (const l of listeners) l();
    })
    .catch(() => undefined);
  return pending;
}

function useAtlasData(): AtlasData | null {
  const [data, setData] = useState<AtlasData | null>(cache);
  useEffect(() => {
    if (cache) {
      setData(cache);
      return;
    }
    const listener = () => setData(cache);
    listeners.add(listener);
    void loadAtlasData();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return data;
}

/** Recurso del inventario → frame del atlas. */
export const ITEM_SPRITE: Readonly<Record<string, string>> = {
  Hay: 'item_hay',
  Wood: 'item_wood',
  Carrot: 'item_carrot',
  Water: 'item_water',
  Fertilizer: 'item_fertilizer',
  Weird_Substance: 'item_weird_substance',
  Pumpkin: 'item_pumpkin',
  Power: 'item_power',
  Cactus: 'item_cactus',
  Gold: 'item_gold',
  Bone: 'item_bone',
};

/** Dibuja el frame recortado (sin el margen transparente del lienzo) centrado en una caja de `size` px. */
export function AtlasSprite({ name, size, fallback = null }: { name: string; size: number; fallback?: ReactNode }) {
  const atlas = useAtlasData();
  const f = atlas?.frames[name];
  if (!atlas || !f) return <>{fallback}</>;
  const image = new URL(atlas.meta.image, new URL(ATLAS_URL, window.location.href)).href;
  const k = (size * 0.94) / Math.max(f.frame.w, f.frame.h);
  return (
    <span aria-hidden="true" className="atlas-sprite" style={{ width: size, height: size }}>
      <span
        style={{
          left: (size - f.frame.w * k) / 2,
          top: (size - f.frame.h * k) / 2,
          width: f.frame.w * k,
          height: f.frame.h * k,
          backgroundImage: `url(${image})`,
          backgroundSize: `${atlas.meta.size.w * k}px ${atlas.meta.size.h * k}px`,
          backgroundPosition: `${-f.frame.x * k}px ${-f.frame.y * k}px`,
        }}
      />
    </span>
  );
}
