// scripts/build-atlas.mjs
// Dependencias dev: npm i -D free-tex-packer-core sharp
// Empaqueta los PNG de `assets-src/sprites/` en `public/assets/atlas.webp` + `atlas.json` (doc 06 §4).
// Añadido respecto al doc: los anclajes de `assets-src/sprites/anchors.json` se copian a cada frame
// (`anchor`) para que PixiJS coloque los sprites sobre su pivote isométrico sin tablas en el código.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import texturePacker from 'free-tex-packer-core';

const INPUT_DIR = 'assets-src/sprites';
const OUT_DIR = 'public/assets';

const files = await fs.readdir(INPUT_DIR);
const images = await Promise.all(
  files
    .filter((f) => f.endsWith('.png'))
    .map(async (f) => ({
      path: f.replace('.png', ''),
      contents: await fs.readFile(path.join(INPUT_DIR, f)),
    }))
);

let config = { scale: 1 };
try {
  config = { ...config, ...JSON.parse(await fs.readFile(path.join(INPUT_DIR, 'atlas.config.json'), 'utf8')) };
} catch {
  // Sin configuración: PNG a resolución 1×.
}

let anchors = {};
try {
  anchors = JSON.parse(await fs.readFile(path.join(INPUT_DIR, 'anchors.json'), 'utf8'));
} catch {
  console.warn('Sin anchors.json: los sprites usarán el anclaje por defecto de PixiJS.');
}

const packed = await texturePacker.packAsync(images, {
  textureName: 'atlas',
  width: 2048,
  height: 2048,
  padding: 2,
  exporter: 'Pixi',
  allowRotation: false,
});

const sheets = packed.filter((item) => item.name.endsWith('.png'));
if (sheets.length > 1) throw new Error(`Los sprites no caben en una hoja de 2048×2048 (${sheets.length} hojas).`);

await fs.mkdir(OUT_DIR, { recursive: true });

for (const item of packed) {
  if (item.name.endsWith('.png')) {
    const webpBuffer = await sharp(item.buffer)
      .webp({ quality: 85, alphaQuality: 100 })
      .toBuffer();
    await fs.writeFile(path.join(OUT_DIR, 'atlas.webp'), webpBuffer);
  } else if (item.name.endsWith('.json')) {
    const json = JSON.parse(item.buffer.toString('utf8'));
    json.meta.image = 'atlas.webp';
    // PNG supermuestreados (Retina 2×): PixiJS divide los frames por esta resolución.
    json.meta.scale = String(config.scale);
    for (const [name, frame] of Object.entries(json.frames)) {
      const a = anchors[name];
      if (a) frame.anchor = { x: a[0], y: a[1] };
    }
    await fs.writeFile(
      path.join(OUT_DIR, 'atlas.json'),
      JSON.stringify(json, null, 2)
    );
  }
}
console.log('Atlas compilado en public/assets/atlas.webp y atlas.json');
