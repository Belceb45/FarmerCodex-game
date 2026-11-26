# 06. Catálogo de Assets, Dron Modular y Pipeline `.webp`

Este documento define el contrato exacto de sprites entre arte e ingeniería (nombres de archivos, proporciones, pivotes) bajo la estética **Chatarra Retro-Industrial + Cultivos Orgánicos Postapocalípticos**, junto con el pipeline automatizado para generar `atlas.webp`.

---

## 1. El Dron Modular ("El Chatarrero") y la Mascota

En lugar de exportar decenas de fotogramas, cada dron es un `PIXI.Container` compuesto por **4 sprites independientes** animados proceduralmente:

1. **`drone_body.png`:** Esfera remachada de metal gastado con parches de distintos tonos de óxido, dos lentes de cámara desparejados al frente y antenas/cables traseros.
2. **`drone_rotor_a.png` / `drone_rotor_b.png`:** Dos hélices laterales (frame sólido y frame borroso para giro en ejecución).
3. **`drone_arm.png`:** Brazo articulado inferior con pinza/soldador que oscila al ejecutar `harvest()`, `plant()` o `till()`.
4. **`hat_<nombre>.png`:** Slot superior para los sombreros equipables mediante `change_hat()` (compatible con los $17$ sombreros definidos en Fase 1 y ampliable a los $26$ de `Hats.*`), reinterpretados como piezas de chatarrero (ej. `Dinosaur_Hat` $\to$ cráneo mecánico, `Top_Hat` $\to$ cilindro de bronce remachado).

### Mascota Flotante (`pet_the_dog()` / `pet_the_piggy()`)
- **`pet_dog.png`:** Perro-alcancía volador de latón/cobre oxidado (implementado en Fase 1 con `pet_the_dog()`; mantener alias `pet_the_piggy()` si se busca compatibilidad con scripts externos) que patrulla suavemente la periferia de la isla.

---

## 2. Catálogo Visual de Terrenos y las 12 Entidades (`Entities.*`)

Todos los sprites deben dibujarse en perspectiva **isométrica $2:1$**, con iluminación consistente desde arriba-izquierda y línea de contorno oscura suave (estilo cómic industrial/postapocalíptico).

### Terrenos e Ítems Especiales (Estilo Chatarra Industrial)
| Asset / Entidad | Sprites requeridos | Descripción visual exacta |
| :--- | :--- | :--- |
| **`Grounds.Grassland`** | `tile_grassland.png` | Bloque cuadrado de placas de hierro oxidado remachadas en las esquinas. |
| **`Grounds.Soil`** | `tile_soil.png` | Montículo de tierra oscura labrada contenida en un marco metálico oxidado con pequeños cables rotos en el borde. |
| **Overlay Humedad** | `tile_water_overlay.png` | Capa semitransparente oscura/azulada que se superpone sobre `tile_soil` según `waterLevel`. |
| **`Items.Weird_Substance`** | `item_weird_substance.png` | Lata metálica oxidada volcada derramando un charco químico morado brillante (`#9B3BD1`). |

### Cultivos (100% Orgánicos en Paleta Opaca Postapocalíptica)
| Entidad (`Entities.*`) | Sprites requeridos | Descripción visual exacta |
| :--- | :--- | :--- |
| **`Grass`** | `grass_sprout.png`, `grass_mature.png` | Manojo denso de pasto silvestre seco y maleza en tonos oliva/paja apagada (`#7A7348`) brotando entre grietas. |
| **`Bush`** | `bush_sprout.png`, `bush_mature.png` | Arbusto orgánico espinoso y enmarañado de hojas verde musgo opaco (`#63693B`). |
| **`Tree`** | `tree_sprout.png`, `tree_mid.png`, `tree_mature.png` | Árbol orgánico de tronco nudoso y retorcido (`#54473A`) con copa irregular de hojas secas oliva. |
| **`Carrot`** | `carrot_sprout.png`, `carrot_mature.png` | Zanahoria orgánica nudosa de naranja terroso opaco (`#B86228`) con penacho de hojas marchitas. |
| **`Pumpkin`** | `pumpkin_sprout.png`, `pumpkin_mature.png`, `pumpkin_mega.png` | Calabaza orgánica gruesa con cicatrices y manchas terrosas (`#BF6E2C`) y hojas secas en la base. La variante `pumpkin_mega` cubre bloques $N \times N$ con gajos amplios. |
| **`Dead_Pumpkin`** | `dead_pumpkin.png` | Calabaza orgánica podrida, hundida, arrugada y grisácea (`#594D41`) rodeada de hojas secas. |
| **`Sunflower`** | `sunflower_sprout.png`, `sunflower_mature.png` | Girasol orgánico de tallo curvo, disco central oscuro y pétalos mostaza opaco (`#BA9434`). |
| **`Cactus`** | `cactus_sprout.png`, `cactus_mature.png` | Cactus orgánico desértico con brazos irregulares y espinas naturales (`#546E45`). Escalable para tamaños $0$–$9$; **diagnóstico:** PixiJS aplica `tint = 0x8B6B4A` (marrón) cuando `cactusSorted === false`. |
| **`Apple`** | `apple.png` | Manzana orgánica de color rojo carmesí opaco (`#8A3636`) con hoja marchita. |

### Modos Especiales y Puzles (Estilo Chatarra Industrial)
| Entidad (`Entities.*`) | Sprites requeridos | Descripción visual exacta |
| :--- | :--- | :--- |
| **`Dinosaur`** | `dino_head.png`, `dino_segment.png`, `dino_tail.png` | Reptil mecánico articulado hecho de placas de chatarra, pistones y tubos flexibles. Al equipar `Dinosaur_Hat`, `dino_head` sustituye al dron y `dino_segment` llena las casillas previas. |
| **`Hedge`** | `hedge_n.png`, `hedge_e.png`, `hedge_s.png`, `hedge_w.png` (o `hedge_block.png`) | Barricada improvisada de tablas viejas, láminas de chapa oxidada y alambre de púas enrollado arriba. |
| **`Treasure`** | `treasure_closed.png`, `treasure_open.png` | Cofre pesado de hierro remachado con bandas de cobre oxidado y candado metálico. |

### Partículas Compartidas (en el mismo Atlas)
- `fx_spark.png` (chispa cálida para soldadura y recolección).
- `fx_dust.png` (nube suave gris/marrón para `till()`, `Dead_Pumpkin` y muros).
- `fx_glow.png` (halo radial blanco para `blendMode = 'add'` tintable por código).
- `fx_bubble.png` (gota/burbuja tintable para agua celeste o sustancia morada).

---

## 3. Estándar de Exportación y Pivotes
- **Formato fuente:** `PNG-32` con fondo 100% transparente en `assets-src/sprites/`.
- **Resolución normalizada:**
  - Tiles base (`tile_*`): $128 \times 128\text{ px}$ (o $256 \times 256\text{ px}$ si se busca nitidez Retina $2\times$).
  - Cultivos y entidades: $128 \times 128\text{ px}$ (árbol maduro y megacalabaza: hasta $256 \times 256\text{ px}$).
  - Íconos HUD: $64 \times 64\text{ px}$ (reutilizables a escala en el inventario).
- **Anclaje (*Anchor / Pivot*):**
  - Terrenos y cultivos: `(0.5, 0.75)` (centro exacto de la cara superior de la casilla isométrica) para que el escalado vertical (`scaleY`) crezca siempre desde el suelo hacia arriba.
  - Dron: `(0.5, 0.5)` (centro geométrico del cuerpo para rotación en `do_a_flip()`).

---

## 4. Pipeline Automatizado para Compilar `atlas.webp`
Cuando los PNG individuales se recortan (desde la hoja de referencia o desde Blender) y se guardan en `assets-src/sprites/`, el script `scripts/build-atlas.mjs` los empaqueta automáticamente en un único Texture Atlas optimizado para PixiJS:

```javascript
// scripts/build-atlas.mjs
// Dependencias dev: npm i -D free-tex-packer-core sharp
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

const packed = await texturePacker.packAsync(images, {
  textureName: 'atlas',
  width: 2048,
  height: 2048,
  padding: 2,
  exporter: 'Pixi',
  allowRotation: false,
});

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
    await fs.writeFile(
      path.join(OUT_DIR, 'atlas.json'),
      JSON.stringify(json, null, 2)
    );
  }
}
console.log('Atlas compilado en public/assets/atlas.webp y atlas.json');
```

### Procesamiento Rápido desde Hoja de Referencia (4x4)
Si se parte de una hoja de sprites en cuadrícula $4 \times 4$ sobre fondo gris sólido:
1. Dividir en 16 cuadrantes individuales y recortar las etiquetas de texto inferiores.
2. Eliminar el fondo sólido con `rembg` (`pip install rembg` $\to$ `rembg p raw/ sprites/`) o herramienta de recorte.
3. Centrar cada objeto sobre su pivote isométrico `(0.5, 0.75)` a $256 \times 256\text{ px}$ y ejecutar `node scripts/build-atlas.mjs`.