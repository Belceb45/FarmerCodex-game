# 01. Arquitectura del Sistema, Web Worker y Motor de Ticks

## 1. Diagrama de Módulos
El sistema separa la ejecución determinista (Web Worker) de la presentación interactiva (Main Thread a 60 FPS):

```text
+--------------------------------------------------------------------+
|                        HILO PRINCIPAL (UI)                         |
|  +-------------------+   +--------------------+   +-------------+  |
|  |   Editor Code     |   |  Renderizador 2D   |   | UI React    |  |
|  |  (CodeMirror 6)   |   |   (PixiJS 60 FPS)  |   |  (Zustand)  |  |
|  +---------+---------+   +---------^----------+   +------^------+  |
|            |                       |                     |         |
|            +---------------+       | Interpolación       | Estado  |
|                            |       | (STATE_SNAPSHOT)    | UI      |
+----------------------------|-------|---------------------|---------+
                             | PostMessage                 |
                             v                             |
+----------------------------------------------------------|---------+
|                        WEB WORKER DEDICADO               |         |
|  +-------------------------------------------------------+------+  |
|  |               Puente de Mensajería (protocol.ts)             |  |
|  +----------------------------+---------------------------------+  |
|                               |                                    |
|  +----------------------------v---------------------------------+  |
|  |             Compilador AST + Máquina Virtual (VM)            |  |
|  |           - Lexer / Parser    - Scheduler (1..32 Drones)     |  |
|  +----------------------------+---------------------------------+  |
|                               |                                    |
|  +----------------------------v---------------------------------+  |
|  |                    Motor de Simulación                       |  |
|  |      - Grid (1x1..32x32)      - Inventario y Tech Tree       |  |
|  |      - Reloj de Ticks + PRNG  - Subsistemas Avanzados        |  |
|  +--------------------------------------------------------------+  |
+--------------------------------------------------------------------+
```

## 2. Protocolo de Mensajería (Worker Bridge)
Definir en `src/worker/protocol.ts` usando uniones discriminadas de TypeScript:

```typescript
export type MainToWorkerMessage =
  | { type: 'INIT_GAME'; seed: number; savedState?: SerializedWorldState }
  | { type: 'SYNC_FILES'; files: Record<string, string> }
  | { type: 'RUN_SCRIPT'; entryFile: string }
  | { type: 'STOP_ALL' }
  | { type: 'PAUSE'; paused: boolean }
  | { type: 'STEP_TICK'; ticks?: number }
  | { type: 'SET_SPEED_MULTIPLIER'; multiplier: number }
  | { type: 'UNLOCK_TECH'; techId: string };

export type WorkerToMainMessage =
  | { type: 'READY' }
  | { type: 'STATE_SNAPSHOT'; snapshot: RenderSnapshot }
  | { type: 'CONSOLE_LOG'; droneId: number; message: string; tick: number }
  | { type: 'RUNTIME_ERROR'; droneId: number; file: string; line: number; error: string }
  | { type: 'ACHIEVEMENT_UNLOCKED'; achievementId: string }
  | { type: 'SAVE_REQUIRED'; state: SerializedWorldState };
```

### Frecuencia de Snapshots y Rendimiento
- El Worker corre su bucle de ticks en ráfagas (*time-sliced*) mediante `setTimeout` o `MessageChannel` para no bloquear la recepción de mensajes `STOP_ALL`.
- El Worker emite `STATE_SNAPSHOT` a un máximo de **30-60 Hz** (cada ~16-33 ms), nunca en cada tick individual.
- Para reducir el costo de clonación estructurada en cuadrículas de `32x32`, empaquetar los datos de las celdas en arreglos planos o listas de celdas modificadas (*dirty tiles*) más el arreglo compacto de hasta 32 drones.

## 3. Motor de Ticks y Regla No-Idle
- **Unidad fundamental:** El **tick**.
- **Pausa automática:** En cada ciclo del bucle del Worker, si `scheduler.hasActiveDrones() === false`, el reloj `simTime` y `totalTicks` **no avanzan**, las plantas no crecen y el agua no se evapora.
- **Costos base:**
  - Consultas de lectura y operaciones lógicas/aritméticas: `0` o `1` tick (ver tabla en `02_DSL_AND_VM_SPEC.md`).
  - Acciones físicas exitosas (`move`, `harvest`, `till`, `plant`, `use_item`, `swap`): exactamente `200` ticks.
- **Aceleración:**
  - La tasa de ticks por segundo escala con las mejoras de velocidad del Árbol Tecnológico.
  - Si `inventory.Items.Power > 0`, cada dron consume energía automáticamente para duplicar ($2\times$) su velocidad de ejecución de ticks.

## 4. Determinismo (PRNG Mulberry32)
Implementación obligatoria en `src/engine/prng.ts` para soportar reproducibilidad y marcadores competitivos (`Fastest_Reset`):

```typescript
export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public getState(): number {
    return this.state;
  }

  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.nextFloat() * (maxInclusive - minInclusive + 1));
  }

  public chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }
}
```

## 5. Renderizador 2D e Interpolación (PixiJS)
- PixiJS lee el último `RenderSnapshot` almacenado en un contenedor mutable (fuera del árbol de React para evitar re-renders a 60 FPS).
- Cada dron guarda `(prevX, prevY)` y `(targetX, targetY)`. El bucle `app.ticker` interpola suavemente con `lerp` según el progreso de los `200` ticks de movimiento.
- **Cámara:** Paneo y zoom suave con rueda del ratón/pinch-to-zoom para escalar desde `1x1` hasta `32x32`.
- **Buffer de consola:** La UI mantiene un buffer circular con un límite estricto de `1000` líneas.

## 6. Persistencia Local (IndexedDB)
Almacenar en IndexedDB (`farmercodex_db`):
- `files`: `{ name: string (PK, ej. "main.py"), content: string, updatedAt: number }`
- `saves`: `{ slotId: string (PK), seed: number, worldState: SerializedWorldState, updatedAt: number }`
- `leaderboards`: `{ boardId: string, bestTicks: number, seed: number, achievedAt: number }`
- `localStorage`: solo preferencias visuales (`theme: 'dark' | 'light'`, tamaño del panel dividido, volumen de audio).