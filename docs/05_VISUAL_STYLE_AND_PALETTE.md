# 05. Estilo Visual, Paleta Postapocalíptica y Optimización 2.5D

Este documento es la **fuente única de verdad visual** para el proyecto. Define la dirección de arte **"Solar-punk de Desguace / Chatarra Postapocalíptica"** en proyección **2.5D isométrica**, diseñada para correr a **60 FPS estables** en navegador con PixiJS (WebGL) sobre tableros de hasta $32 \times 32$ y $32$ drones simultáneos.

> **Nota de migración desde Fase 1:** El proyector procedural `src/renderer/iso3d.ts` implementado en la Fase 1 funciona como etapa de bloqueo visual y respaldo (*fallback*). La migración al arte final sustituye el dibujado geométrico por sprites 2.5D pre-renderizados en `public/assets/atlas.webp`, manteniendo exactamente el mismo consumo de `RenderSnapshot` desde el Web Worker.

---

## 1. Dirección de Arte General (Contraste Clave)
La identidad visual se apoya en un contraste narrativo claro entre **dos mundos materiales**:

1. **Infraestructura, Drones y Puzles (Chatarra Retro-Industrial):** Plataformas de hierro oxidado, marcos metálicos remachados, tuberías de cobre, alambre de púas, cofres parchados y drones remendados ("El Chatarrero").
2. **Cultivos y Vegetación (100% Orgánicos Postapocalípticos):** Todas las plantas, frutas y verduras (`Grass`, `Bush`, `Tree`, `Carrot`, `Pumpkin`, `Dead_Pumpkin`, `Sunflower`, `Cactus`, `Apple`) son **completamente orgánicas**, sin engranajes ni cables incrustados. Tienen siluetas ligeramente irregulares y una paleta desaturada, terrosa y opaca que transmite naturaleza sobreviviendo entre la chatarra.

### Regla de Rendimiento (Cero 3D en Tiempo Real)
Toda la iluminación (luz cálida superior-izquierda), oclusión ambiental, remaches, óxido y texturas orgánicas vienen **horneadas (*baked*)** en los sprites `.webp`. El navegador no calcula iluminación PBR ni sombras 3D dinámicas en tiempo real.

---

## 2. Paleta de Colores Oficial (Hex)

### Entorno, Plataforma y Suelos
| Elemento | Hex Principal | Sombra / Borde | Luz / Acento | Uso |
| :--- | :--- | :--- | :--- | :--- |
| **Vacío Atmosférico (Fondo)** | `#2A3D45` | `#1C2A30` | `#46616E` | Gradiente neblinoso de fondo en Granja y Árbol Tecnológico. |
| **Hierro Oxidado (`Grassland`)** | `#6B584C` | `#3D2F28` | `#8C4A2F` | Placas metálicas remachadas con manchas de óxido. |
| **Tierra Labrada (`Soil` seca)** | `#4A3A2E` | `#2B211A` | `#634E3E` | Tierra orgánica oscura contenida en marco de chapa oxidada. |
| **Tierra Labrada (`Soil` húmeda)** | `#2E231B` | `#1A130E` | `#4A6670` | Oscurecimiento y leve reflejo húmedo proporcional a `waterLevel` ($0.0$ a $1.0$). |
| **Cobre y Metal del Dron** | `#A67C52` | `#5E432B` | `#C9A47B` | Chasis remendado de "El Chatarrero", parches y hélices. |

### Cultivos Orgánicos Postapocalípticos (Tonos Opacos)
| Entidad | Hex Principal | Sombra / Contorno | Acento |
| :--- | :--- | :--- | :--- |
| **`Grass` (Pasto seco/silvestre)** | `#7A7348` | `#423E25` | `#968E5C` |
| **`Bush` / `Tree` (Follaje opaco)** | `#63693B` | `#34381E` | `#7D854C` |
| **`Tree` (Tronco retorcido)** | `#54473A` | `#2E261E` | `#6E5E4E` |
| **`Carrot` (Raíz terrosa)** | `#B86228` | `#6E3714` | `#6D6639` (hojas) |
| **`Pumpkin` / Megacalabaza** | `#BF6E2C` | `#733E16` | `#D48A48` |
| **`Dead_Pumpkin` (Podrida)** | `#594D41` | `#2E2720` | `#736557` |
| **`Sunflower` (Pétalos mostaza)** | `#BA9434` | `#6E5419` | `#3D3228` (centro) |
| **`Cactus` (Verde desértico)** | `#546E45` | `#2D3D24` | `#718F5E` |
| **`Cactus` mal ordenado (Tinte)** | `#8B6B4A` | `#523D28` | `#A6825C` |
| **`Apple` (Rojo opaco)** | `#8A3636` | `#4D1B1B` | `#A84C4C` |
| **`Weird_Substance` (Químico)** | `#9B3BD1` | `#591D7D` | `#C76BFF` |

### Interfaz de Usuario (Terminal Retro-Industrial)
| Elemento | Hex | Uso |
| :--- | :--- | :--- |
| **Fondo Editor / Pantalla CRT** | `#1E1916` | Interior oscuro tipo terminal industrial para ventanas `.py` y nodos. |
| **Marco Metálico / Barra Título** | `#574B44` | Encabezados y bordes remachados con textura de acero gastado (`#3D2F28` borde, `#7A6354` bisel). |
| **Texto Código Principal** | `#E8D8C3` | Código legible en tema oscuro industrial (ámbar cálido `#FF941A` para palabras clave/acentos). |
| **Botón Acción Positiva (Run / OK)** | `#4D8C57` | Estados `Run`, `Step`, botones del HUD y mejoras asequibles. |
| **Botón Alerta / Ejecución Activa** | `#D95B26` | Estados `Stop`, `Pause` y alertas de error. |
| **Borde Nodo Completado** | `#D4A34A` | Oro reciclado / latón para nodos completados y conectores del Árbol Tecnológico. |
| **Borde Nodo En Progreso** | `#8C5327` | Cobre oxidado (`#C97834` comprable) para nodos parcialmente investigados. |

---

## 3. Matemáticas de Proyección Isométrica 2:1
Para un tamaño lógico de casilla `tileW = 128` y `tileH = 64` (proporción $2:1$), la conversión entre coordenadas de simulación $(x, y)$ (con origen $(0,0)$ en Sur-Oeste) y pantalla $(\text{screenX}, \text{screenY})$ es:

$$\text{screenX} = (x - y) \cdot \frac{\text{tileW}}{2}$$

$$\text{screenY} = -(x + y) \cdot \frac{\text{tileH}}{2}$$

*(Nota: el signo negativo en `screenY` hace que `North` ($y+1$) y `East` ($x+1$) apunten hacia arriba en la pantalla, manteniendo la orientación intuitiva del tablero.)*

- **Ordenamiento de profundidad (*Depth Sorting*):** Cada casilla y entidad usa `zIndex = -(x + y)` (los elementos más al Sur-Oeste quedan al frente).
- **Picking del ratón (Hover/Tooltips):** Inversa algebraica directa sin hitboxes individuales:

$$x = \left\lfloor \frac{\text{screenX}}{\text{tileW}} - \frac{\text{screenY}}{\text{tileH}} \right\rfloor, \quad y = \left\lfloor -\frac{\text{screenY}}{\text{tileH}} - \frac{\text{screenX}}{\text{tileW}} \right\rfloor$$

---

## 4. Arquitectura de Optimización en PixiJS ($32 \times 32$ y $32$ Drones)
Para sostener **60 FPS** con hasta $1{,}024$ parcelas y $32$ drones activos:

1. **Texture Atlas Único ($1$–$2$ Draw Calls):** Todos los tiles, fases de cultivos, sombreros y piezas del dron se compilan en `public/assets/atlas.webp` + `atlas.json` (máximo $2048 \times 2048\text{ px}$ por hoja).
2. **Separación en 5 Capas:**
   - **Capa 0 (`BackgroundLayer`):** Gradiente atmosférico y motas de polvo lentas.
   - **Capa 1 (`StaticPlatformLayer`):** Bordes de plataforma, placas `Grassland` y cajas `Soil`. Se cachea (`cacheAsTexture`) y **solo se invalida** ante `till()`, `Expand` o cambios de `waterLevel`.
   - **Capa 2 (`EntitiesLayer`):** Cultivos orgánicos, muros `Hedge` y `Treasure`, ordenados por profundidad.
   - **Capa 3 (`DroneLayer`):** Hasta $32$ drones modulares y la mascota voladora con sus sombras proyectadas (`alpha: 0.30`).
   - **Capa 4 (`EffectsLayer`):** `PIXI.ParticleContainer` con **Object Pooling** (límite estricto de $150$ partículas activas) para chispas, tierra, esporas y recursos volando hacia el HUD.
3. **Brillos Falsos (`Additive Blending`):** Chispas de soldadura, halo del girasol máximo y burbujas de `Weird_Substance` usan un único sprite de halo suave con `blendMode = 'add'`, evitando shaders costosos.
4. **Degradación Elegante (*Auto-LOD*):** Cuando el número de drones supera $8$ o la velocidad efectiva supera $10\times$, se desactivan automáticamente las partículas ambientales y se reducen los íconos voladores al HUD.