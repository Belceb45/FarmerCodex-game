# 03. Mecánicas del Juego, Modelo de Datos y Configuración de Balance

## 1. Cuadrícula (`Grid`), Coordenadas y Factores Ambientales
- **Sistema de coordenadas:** El origen `(0, 0)` se ubica en la esquina **Sur-Oeste** (`x = 0` en el borde `West`, `y = 0` en el borde `South`).
  - `North`: `y + 1` | `South`: `y - 1` | `East`: `x + 1` | `West`: `x - 1`.
- **Wrap-around toroidal:** En la granja normal, cruzar cualquier límite con `move()` envuelve la posición al borde opuesto (`(coord + size) % size`). En laberintos (`Hedge`) y modo Dinosaurio, los bordes bloquean el movimiento.
- **Expansión:** Mediante `Unlocks.Expand` el mapa escala progresivamente: `1x1` $\rightarrow$ `1x3` $\rightarrow$ `3x3` $\rightarrow$ `4x4` $\rightarrow$ `6x6` $\rightarrow$ `8x8` $\rightarrow$ `12x12` $\rightarrow$ `16x16` $\rightarrow$ `22x22` $\rightarrow$ `32x32`.

```typescript
export enum GroundType {
  Grassland = 'Grassland',
  Soil = 'Soil',
}

export interface TileState {
  x: number;
  y: number;
  ground: GroundType;
  entity: string | null;
  growthProgress: number;     // 0.0 a 1.0
  growthDuration: number;     // Segundos simulados requeridos
  waterLevel: number;         // 0.0 a 1.0
  isInfected: boolean;        // Alterado por Fertilizer / Weird_Substance
  petals?: number;            // Solo Sunflower (7..15)
  cactusSize?: number;        // Solo Cactus (0..9)
  cactusSorted?: boolean;     // Diagnóstico visual (false = se torna marrón)
  companion?: { entity: string; x: number; y: number }; // Solo Polyculture
  mazeWalls?: number;         // Bitmask: N=1, E=2, S=4, W=8
}
```

### Reglas Ambientales Críticas
- **Labrado (`till()`):** Alterna `Grassland` $\leftrightarrow$ `Soil` y destruye cualquier entidad presente sin devolver recursos.
- **Siembra en suelo inválido:** Plantar cultivos que exigen `Soil` (`Carrot`, `Pumpkin`, `Sunflower`, `Cactus`) sobre `Grassland` retorna `False` silenciosamente (cuesta `1` tick) sin lanzar error ni descontar recursos.
- **Riego (`Items.Water`):** Aplicado sobre cualquier terreno con `use_item(Items.Water)`. Eleva `waterLevel` y acelera el crecimiento. Cada `0.1` segundos de `simTime`, cada casilla húmeda tiene un `10%` de probabilidad determinista de perder humedad. Mantener toda la superficie con `waterLevel > 0.5` desbloquea el logro `Mud Farm`.
- **Fertilización (`Items.Fertilizer`):** Descuenta `2.0` segundos instantáneos del crecimiento restante. No seca el suelo, pero marca `isInfected = true`, convirtiendo el `50%` del rendimiento final en `Items.Weird_Substance`.

## 2. Catálogo Completo de las 12 Entidades
No existe mercado ni `trade()`: `plant()` descuenta los recursos directamente del inventario global.

| Entidad | Suelo Válido | Crecimiento Base | Producto | Costo de Siembra | Reglas Especiales |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Grass` | `Grassland` / `Soil` | 0.5 s prom. | `Items.Hay` | Gratis | Crece sola en `Grassland`; al cosechar rebrota automáticamente. Solo se quita con `till()`. |
| `Bush` | `Grassland` / `Soil` | 4.0 s prom. | `Items.Wood` | Gratis | Entidad base sobre la que usar `Weird_Substance` crea un laberinto. |
| `Tree` | `Grassland` / `Soil` | 7.0 s prom. | `Items.Wood` | Gratis | Rinde más madera que `Bush`, pero se ralentiza si hay otros `Tree` en casillas ortogonales adyacentes. |
| `Carrot` | `Soil` | 6.0 s prom. | `Items.Carrot` | `Hay` + `Wood` | Descuenta inventario automáticamente al plantar. |
| `Pumpkin` | `Soil` | 2.0 s prom. | `Items.Pumpkin` | `Carrot` | `20%` muere al madurar (`Dead_Pumpkin`). Adyacentes maduras se fusionan en megacalabazas. |
| `Dead_Pumpkin` | `Soil` | N/A | Ninguno | N/A | `can_harvest()` siempre es `False`. Desaparece con `harvest()`, `plant()` o `till()`. |
| `Sunflower` | `Soil` | 5.0 s prom. | `Items.Power` | `Carrot` | 7 a 15 pétalos; `Items.Power` duplica ($2\times$) la velocidad del dron. |
| `Cactus` | `Soil` | 1.0 s fijo | `Items.Cactus` | `Pumpkin` | Tamaño entero `0..9`. Requiere ordenamiento 2D para cosecha en cadena. |
| `Hedge` | Laberinto | N/A | Ninguno | `Weird_Substance` | Muros infranqueables del laberinto. |
| `Treasure` | Laberinto | N/A | `Items.Gold` | `Weird_Substance` | Cofre del laberinto; entrega oro proporcional al lado; reciclable hasta 300 veces. |
| `Apple` | `Grassland` / `Soil` | N/A | Crece cola | Pasivo | Aparece automáticamente mientras está equipado `Hats.Dinosaur_Hat`. |
| `Dinosaur` | `Grassland` / `Soil` | 0.2 s (cola) | `Items.Bone` | Sombrero | Segmentos de cola arrastrados tras el dron en modo Dinosaurio. |

## 3. Subsistemas Avanzados y Variantes de Balance
Dado que existen pequeñas diferencias documentadas entre `__builtins__.py` y las guías comunitarias de la versión 1.0, el motor debe leer las variantes desde `src/config/balance.json`:

### 3.1 Megacalabazas (`Pumpkin`)
Al madurar calabazas formando un cuadrado completo de $N \times N$ casillas adyacentes (sin `Dead_Pumpkin`), se fusionan en una megacalabaza:
- **Modo `capped_cubic` (guía 1.0, por defecto):** Escala cúbica ($N^3$) hasta $N \le 6$, y cuadrática ($N^2 \times 6$) para $N > 6$.
- **Modo `pure_cubic` (`__builtins__.py`):** $N^3$ para cualquier $N$ fusionado.

### 3.2 Girasoles (`Sunflower`)
- Al plantar, asignar `petals` entero en $[7, 15]$.
- Con $\ge 10$ girasoles en la granja, cosechar el de mayor número de pétalos otorga `sunflower.powerMultiplier` (configurable: `5.0` según `__builtins__.py` u `8.0` según guía comunitaria 1.0).
- Cosechar un girasol inferior al máximo penaliza la siguiente recolección a potencia normal (`1.0`).

### 3.3 Cactus (`Cactus`)
- Al plantar, asignar `cactusSize` en $[0, 9]$.
- Cada casilla evalúa su estado de ordenamiento 2D respecto a vecinos cactus adyacentes:
  - Vecino Norte (`y + 1`) y Este (`x + 1`): $\text{size}_{\text{vecino}} \ge \text{size}_{\text{actual}}$
  - Vecino Sur (`y - 1`) y Oeste (`x - 1`): $\text{size}_{\text{vecino}} \le \text{size}_{\text{actual}}$
- Si algún vecino incumple la regla, marcar `cactusSorted = false` (el renderizador lo tiñe de marrón para diagnóstico visual).
- Al invocar `harvest()` sobre un cactus maduro, recolectar en cadena BFS/DFS todos los cactus maduros conectados que estén correctamente ordenados ($n$ cactus):
  - **Modo `quadratic` (`__builtins__.py`):** rendimiento $= n^2$.
  - **Modo `sqrt_scaled` (guía comunitaria):** rendimiento $= n \times \lfloor \sqrt{n} \rfloor$.

### 3.4 Policultivo (`Polyculture`)
- Desbloqueado inmediatamente después de Laberintos y vinculado a `Hats.Brown_Hat`.
- `get_companion()` retorna `(entidadCompañera, (tx, ty))`. Si `(tx, ty)` contiene la entidad solicitada al cosechar, el rendimiento escala de $5\times$ hasta $15\times$ según el nivel de mejora.

### 3.5 Laberintos (`Hedge` / `Treasure`)
- `use_item(Items.Weird_Substance)` sobre un `Bush` genera un laberinto conectado y coloca `Treasure`.
- Aplicar `Weird_Substance` directamente sobre `Treasure` **recicla** el laberinto (hasta `300` veces para el logro `Recycling`) y reubica el cofre tras `200` ticks.
- **Regla 1.0:** Es obligatorio esperar a que se complete la reubicación antes de llamar a `measure()` desde cualquier casilla del laberinto para obtener las nuevas coordenadas del tesoro.

### 3.6 Modo Dinosaurio (`Hats.Dinosaur_Hat`)
- Equipar `Hats.Dinosaur_Hat` inicia el modo *Snake*: aparece `Apple` (ubicable con `measure()`), cada manzana añade un segmento `Dinosaur` (`0.2` s) que bloquea las casillas previas.
- Al quedarse sin movimientos o quitar el sombrero, se cosecha toda la cola otorgando `Items.Bone` proporcional a $L^2$.

## 4. Progresión, Victoria Final y `balance.json`
- **Ramas no lineales:** Tras la base inicial, **Dinosaurios**, **Cactus** y **Laberintos** pueden investigarse en cualquier orden. **Polyculture** exige haber desbloqueado **Laberintos**.
- **Meta final (`Top_Hat`):** `Items.Hay`: $10^9$, `Items.Wood`: $10^{10}$, `Items.Carrot`: $10^9$, `Items.Cactus`: $10^9$, `Items.Gold`: $10^8$.

### Plantilla `src/config/balance.json`
```json
{
  "ticks": {
    "physicalActionSuccess": 200,
    "physicalActionFail": 1,
    "baseTicksPerSecond": 400,
    "powerSpeedMultiplier": 2.0
  },
  "water": {
    "evaporationIntervalSec": 0.1,
    "evaporationChance": 0.1,
    "evaporationAmount": 0.01,
    "mudFarmThreshold": 0.5
  },
  "fertilizer": {
    "growthReductionSec": 2.0,
    "infectedWeirdSubstanceRatio": 0.5
  },
  "pumpkin": {
    "deathRate": 0.2,
    "maxCubicMergeSize": 6,
    "formulaMode": "capped_cubic"
  },
  "sunflower": {
    "minPetals": 7,
    "maxPetals": 15,
    "minCountForBonus": 10,
    "powerMultiplier": 8.0,
    "earlyHarvestResetToNormal": true
  },
  "cactus": {
    "minSize": 0,
    "maxSize": 9,
    "growthDurationSec": 1.0,
    "formulaMode": "quadratic"
  },
  "polyculture": {
    "baseMultiplier": 5.0,
    "maxMultiplier": 15.0
  },
  "maze": {
    "maxRecycleCount": 300,
    "relocateTicks": 200
  },
  "dinosaur": {
    "tailSegmentGrowthSec": 0.2
  }
}
```