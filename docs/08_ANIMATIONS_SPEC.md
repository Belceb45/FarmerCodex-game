# 08. Especificación Técnica de Animaciones Procedurales (PixiJS)

Para mantener **60 FPS** en navegador con tableros de hasta $32 \times 32$ y $32$ drones sin saturar la VRAM con *spritesheets* pesados, todas las animaciones combinan **1 a 3 sprites estáticos** del `atlas.webp` con **transformaciones matemáticas procedurales** en el hilo de renderizado.

---

## 1. Reglas Globales de Tiempo y Escalado
1. **Desacoplamiento del Worker:** El motor de simulación (Web Worker) emite eventos discretos y el estado interpolable en `RenderSnapshot` (posición previa, posición objetivo, progreso de ticks $p \in [0, 1]$, acción en curso). El `AnimationManager` de PixiJS interpola suavemente en `app.ticker`.
2. **Escalado por Velocidad:** Todas las animaciones de trabajo (`move`, `harvest`, `plant`, `till`, `swap`) escalan su duración inversamente con la velocidad de ejecución del dron (`Speed` y `Items.Power`).
   - Si la duración de una acción cae por debajo de $35\text{ ms}$, se omite el rebote elástico y se hace una transición directa para evitar parpadeo visual.
3. **Excepción Absoluta (`do_a_flip()`):** Siempre dura exactamente **$1000\text{ ms}$ de tiempo real**, sin verse acelerada por mejoras de velocidad ni por `Items.Power`.

---

## 2. Animaciones del Dron Modular ("El Chatarrero") y Mascota

| Estado / Acción | Piezas afectadas | Comportamiento Matemático y Visual |
| :--- | :--- | :--- |
| **Idle / Flotación** | `drone_body`, `drone_rotors` | Flotación vertical continua: $\Delta y = \sin(t \cdot 4.0 + \text{id}) \cdot 3\text{ px}$. Las hélices alternan entre `drone_rotor_a` y `drone_rotor_b` cada $40\text{ ms}$ mientras `status === 'RUNNING'` (se detienen si está pausado). |
| **Desplazamiento (`move`)** | `Container` completo | Interpolación lineal (`lerp`) entre `prevPos` y `targetPos` usando el progreso $p = 1 - \frac{\text{waitTicks}}{200}$. Inclinación (*tilt*) del cuerpo de $\pm 0.14\text{ rad}$ ($\approx 8^\circ$) hacia el vector de movimiento. En *wrap-around* toroidal (salto de borde a borde), desactivar `lerp` en ese frame y hacer un *fade-out/in* rápido ($60\text{ ms}$). |
| **Acción (`harvest`/`plant`/`till`)** | `drone_arm` + `EffectsLayer` | El brazo rota hacia abajo ($\Delta\theta = +0.55\text{ rad}$) con curva `easeOutQuad` en $80\text{ ms}$ y regresa. En el punto bajo emite $3$–$5$ chispas (`fx_spark`, color `#FF941A`, `blendMode = 'add'`, vida $220\text{ ms}$). |
| **Pirueta (`do_a_flip`)** | `drone_body` + `drone_hat` | Duración fija $1000\text{ ms}$: rotación completa $\theta = 2\pi \cdot \text{easeInOutCubic}(u)$ combinada con salto parabólico $\Delta y = -28 \cdot 4u(1 - u)\text{ px}$ donde $u \in [0, 1]$. |
| **Cambio de sombrero** | `drone_hat` | Al llamar `change_hat()`, el sombrero anterior encoge a $0$ y el nuevo entra con `easeOutBack` ($180\text{ ms}$). |
| **Mascota (`pet_the_dog`)** | `pet_dog` | Órbita sinusoidal lenta fuera del borde del mapa. Al invocar `pet_the_dog()`, ejecuta 2 rebotes rápidos (`scaleY: 0.8 -> 1.2 -> 1.0`, $400\text{ ms}$) y libera $5$ chispas doradas (`#D4A34A`). |

---

## 3. Animaciones de Terrenos y Factores Ambientales

| Evento | Duración | Curva / Efecto Visual |
| :--- | :--- | :--- |
| **Labrado (`till()`)** | $160\text{ ms}$ | Pulso de compresión en la casilla (`scaleY: 0.88 -> 1.0`, `easeOutQuad`) + $6$ partículas de tierra (`fx_dust`, `#4A3A2E`) y $2$ chispas metálicas que enmascaran el cambio entre `tile_grassland` y `tile_soil`. |
| **Riego (`Items.Water`)** | $240\text{ ms}$ | $6$ gotas celestes (`fx_bubble`, `#4AC6E8`) saltando en arco desde el centro + transición suave del `alpha` de `tile_water_overlay` hacia `waterLevel`. |
| **Fertilizante (`Items.Fertilizer`)** | $300\text{ ms}$ | Destello breve en la planta (`scale: 1.0 -> 1.15 -> 1.0`) + $5$ partículas verdes/moradas ascendentes que marcan la entrada en estado `isInfected`. |
| **Infección (`isInfected === true`)** | Continuo | Cada $1.2\text{ s}$ emite $1$ burbuja morada (`#C76BFF`, `blendMode = 'add'`) desde la base del cultivo y aplica un pulso tenue de tinte violeta. |
| **`Weird_Substance` (Aplicación)** | $280\text{ ms}$ | Onda expansiva circular con `fx_glow` tintado en `#9B3BD1` (`scale: 0.2 -> 1.4`, `alpha: 0.85 -> 0.0`). |

---

## 4. Animaciones de Cultivos Orgánicos Postapocalípticos

Regla global: al invocar `plant()`, el sprite `*_sprout` aparece **de inmediato** con un *pop-in* (`scale: 0.1 -> 1.0`, `easeOutBack`, $140\text{ ms}$).

| Cultivo | Crecimiento (`growthProgress` $0 \to 1$) | Estado Idle (Maduro) | Cosecha / Evento Especial |
| :--- | :--- | :--- | :--- |
| **`Grass`** | Cambia de `grass_sprout` a `grass_mature` en $0.5$; escala vertical `scaleY: 0.35 -> 1.0`. | Vaivén por viento: `skewX = sin(t * 2.2 + x * 0.7) * 0.05`. | Corte instantáneo a `scaleY = 0.25` + $4$ briznas secas saltando. |
| **`Bush`** | Escala uniforme `0.3 -> 1.0`; cambio a `bush_mature` en $0.5$ con pulso `easeOutBack`. | Ligero respiro (`scaleX/Y` $\pm 1.5\%$). | Sacudida horizontal ($\pm 2\text{ px}$, $100\text{ ms}$) + $5$ hojas secas. |
| **`Tree`** | 3 sprites: `tree_sprout` ($<0.35$), `tree_mid` ($<0.85$), `tree_mature` ($\ge 0.85$). | Balanceo suave de copa (`skewX` $\pm 0.025$). | Inclinación lateral de $15^\circ$ + `alpha -> 0` ($180\text{ ms}$) + astillas. |
| **`Carrot`** | `carrot_sprout` crece hasta $0.8$; en $1.0$ cambia a `carrot_mature` con *pop* corto. | Estático con leve movimiento en hojas. | Salto vertical de "arranque" (`y - 12px` en $120\text{ ms}$) antes de volar al HUD. |
| **`Pumpkin`** | Inflado progresivo `scale: 0.3 -> 1.0` con `easeOutQuad`. | Estático. | **Fusión Megacalabaza:** las $N \times N$ casillas hacen un *flash* claro ($110\text{ ms}$) y se reemplazan por `pumpkin_mega` escalada a $N \times N$ con *squash & stretch* (`scaleX: 1.15, scaleY: 0.85 -> 1.0`). |
| **`Dead_Pumpkin`** | Al morir ($\approx 20\%$), se aplasta (`scaleY: 1.0 -> 0.72`) y cambia a `dead_pumpkin`. | Estático; esporas ocasionales. | Al limpiarla se desintegra en $5$ partículas de `fx_dust` grisáceo. |
| **`Sunflower`** | Tallo sube en `scaleY: 0.25 -> 1.0`; al madurar abre `sunflower_mature`. | Oscilación suave de cabeza. El girasol con **máximo de pétalos** (si hay $\ge 10$) muestra halo tenue `fx_glow` dorado (`alpha: 0.35`, `add`). | Destello dorado de `Items.Power` al cosechar. |
| **`Cactus`** | Crece en $1.0\text{ s}$ fijo a tamaño visual $s = 0.6 + 0.05 \cdot \text{cactusSize}$. | **Diagnóstico crítico:** `tint = 0x8B6B4A` si `cactusSorted === false`; `0xFFFFFF` si está ordenado. | **`swap()`:** intercambio en arco corto ($120\text{ ms}$). **Cosecha en cadena:** cascada de *pops* con desfase de $35\text{ ms}$ por salto BFS (tope total de $450\text{ ms}$). |

---

## 5. Modos Especiales (`Dinosaur` y Laberintos)

| Entidad | Animación Específica |
| :--- | :--- |
| **`Apple`** | Aparece cayendo desde $\Delta y = -16\text{ px}$ con rebote (`easeOutBounce`, $220\text{ ms}$). En idle pulsa suavemente (`scale: 1.0` $\leftrightarrow$ `1.06`). Al comerla emite $4$ partículas `#8A3636`. |
| **`Dinosaur`** | Al equipar `Dinosaur_Hat`, nube de vapor/chispas ($180\text{ ms}$) cambia el dron a `dino_head`. Cada `dino_segment` interpola su posición hacia la casilla del segmento precedente en sincronía con el movimiento del dron, con un leve balanceo alterno ($\pm 0.04\text{ rad}$). Al cosechar la cola, desintegración en cascada con íconos de `Items.Bone`. |
| **`Hedge`** | Al generar el laberinto desde un `Bush`, los muros brotan desde el suelo (`scaleY: 0 -> 1`, `easeOutBack`, $240\text{ ms}$) con retardo radial de $15\text{ ms}$ por distancia Manhattan al arbusto origen. |
| **`Treasure`** | Brillo sutil intermitente en el candado (`fx_glow`). Al reciclar con `Weird_Substance`, durante los **$200$ ticks** de reubicación el cofre se desmaterializa (`alpha: 1 -> 0` + espiral de partículas moradas/doradas) y reaparece en la nueva coordenada. Al cosechar, cambia a `treasure_open` y lanza partículas doradas al HUD. |

---

## 6. Efectos Globales, Pool de Partículas y Throttling de Audio

### Vuelo de Recursos al HUD
Al completar `harvest()`, emitir $1$ a $3$ sprites pequeños del ítem cosechado siguiendo una curva Bézier cuadrática desde la casilla hasta el botón del ítem en la esquina superior izquierda ($420\text{ ms}$, `easeInCubic`).

### Texto Flotante (`print()` vs `quick_print()`)
- `print(*args)` instancia una etiqueta temporal en coordenadas del mundo sobre el dron (`#FF941A` con contorno `#1E1916`), sube $24\text{ px}$ y se desvanece al completar la pausa de $200$ ticks.
- `quick_print(*args)` no crea ningún objeto visual en el lienzo.

### Arquitectura de `ParticlePool` y Auto-LOD
```typescript
export interface Particle {
  sprite: PIXI.Sprite;
  active: boolean;
  vx: number;
  vy: number;
  gravity: number;
  lifeMs: number;
  maxLifeMs: number;
  startScale: number;
  endScale: number;
}

export function getLodLevel(activeDrones: number, effectiveSpeed: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (activeDrones > 16 || effectiveSpeed > 25) return 'LOW';
  if (activeDrones > 8 || effectiveSpeed > 10) return 'MEDIUM';
  return 'HIGH';
}
```
- **`HIGH`:** Todas las partículas activas, viento en pasto, chispas de soldadura e íconos voladores al HUD (máximo $150$ partículas en pool).
- **`MEDIUM`:** Desactiva esporas/viento ambiental y reduce a $1$ chispa por acción y $1$ ícono al HUD cada 3 cosechas.
- **`LOW` (Megafarm a máxima velocidad):** Desactiva humo/chispas/vuelo al HUD; mantiene únicamente interpolación de drones, tintes de diagnóstico de cactus, cambios de textura y `do_a_flip()`.

### Limitador de Audio (Obligatorio)
En `src/audio/SoundManager.ts`, cada efecto (`harvest`, `plant`, `till`, `move`, `spark`, `unlock`) debe pasar por un cooldown mínimo de **$45$–$60\text{ ms}$** por categoría y un máximo global de **$8$ canales simultáneos**, evitando distorsión o fallos de Web Audio / Howler.js cuando $32$ drones cosechan a la vez.