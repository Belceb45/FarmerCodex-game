# AGENTS.md - Contexto Maestro de Implementación

Este archivo contiene las directrices obligatorias para cualquier agente de IA o desarrollador que trabaje en la implementación web del juego (**FarmerCodex**). Antes de escribir código, lee los documentos en la carpeta `docs/` en orden numérico (`01` a `08`).

## 1. Resumen del Proyecto
Videojuego web de automatización agrícola mediante programación en un DSL con sintaxis estilo Python 3. El jugador controla de 1 a 32 drones sobre una cuadrícula expandible (de `1x1` hasta `32x32`).

### Dirección Visual Oficial
- **Estética:** **Chatarra Retro-Industrial + Cultivos 100% Orgánicos Postapocalípticos** (`docs/05_VISUAL_STYLE_AND_PALETTE.md` a `docs/08_ANIMATIONS_SPEC.md`).
- Infraestructura, drones ("El Chatarrero"), puzles y terminales UI siguen un estilo retro-industrial remachado; toda la flora y cultivos son 100% orgánicos en tonos opacos postapocalípticos (sin apariencia biomecánica ni rejillas neón).

### Reglas Inquebrantables de Diseño
1. **Simulación No-Idle:** El tiempo de simulación (`simTime`) **solo avanza** si existe al menos un dron activo ejecutando instrucciones o esperando ticks de una acción. Si el usuario detiene o pausa los scripts o todos los drones terminan, el mundo se congela por completo.
2. **Aislamiento en Web Worker:** El intérprete del DSL y el motor de simulación **NUNCA** deben correr en el hilo principal del navegador. Un bucle `while True:` del jugador jamás debe congelar la UI.
3. **Prohibido `eval()` / `new Function()`:** El código del usuario se compila a un AST propio y a bytecode ejecutado paso a paso en una Máquina Virtual (VM) iterativa con pila explícita.
4. **Determinismo Estricto:** Prohibido usar `Math.random()` dentro de `src/engine/` o `src/vm/`. Toda aleatoriedad debe provenir del PRNG determinista con semilla (`Mulberry32`).
5. **Cero dependencias de DOM en el motor:** Los directorios `src/engine/` y `src/vm/` deben ser TypeScript puro, ejecutables directamente en Node/Vitest sin mocks de navegador (`tsconfig.engine.json` y `tests/rules.test.ts` verifican esta regla).

## 2. Pila Tecnológica Obligatoria
- **Build & Lenguaje:** Vite + TypeScript (modo `strict: true`).
- **UI & Estado:** React 19 + Tailwind CSS + Zustand.
- **Editor de Código:** CodeMirror 6 (resaltado Python, autocompletado de API del juego, ventanas flotantes `.py`).
- **Renderizado 2.5D:** PixiJS v8 (WebGL con fallback Canvas 2D) a 60 FPS interpolados.
- **Audio:** Howler.js o Web Audio API con *throttling* para altas velocidades.
- **Persistencia:** IndexedDB (`farmercodex_db` vía `idb`: stores `files`, `saves`, `leaderboards`) para archivos `.py` y partidas; `localStorage` solo para preferencias de UI/tema y disposición de ventanas.
- **Testing:** Vitest para pruebas unitarias deterministas del motor, lexer, parser, VM y subsistemas.

## 3. Decisiones Cerradas en Fases Anteriores (`docs/04_IMPLEMENTATION_ROADMAP.md`)
- **UI de Escritorio Flotante:** La granja ocupa el 100% del fondo; el código vive en ventanas flotantes `.py` (mover, redimensionar, minimizar, cerrar, renombrar) y la documentación (`i`) también es una ventana flotante.
- **Consola Opcional y Errores en Línea:** La ventana de consola (`quick_print` / historial circular de 1000 líneas) está **oculta por defecto** y se activa desde Ajustes. Los errores de sintaxis, `UnlockError` y `RUNTIME_ERROR` se muestran directamente al pie de la ventana del script afectado con la línea marcada.
- **Mascota Voladora:** Se implementa el perro alcancía volador con `pet_the_dog()` (manteniendo compatibilidad con scripts externos vía alias `pet_the_piggy()` cuando corresponda).
- **Compilación y Paso a Paso:** La VM compila el AST a bytecode (`src/vm/compiler.ts`) para pausar en cualquier instrucción; `Step` avanza una sentencia y entra en funciones.
- **Economía, Desbloqueos y Persistencia:**
  - Persistencia en IndexedDB bajo `farmercodex_db` con autoguardado al editar archivos, cada 5 s durante ejecución, al detener y al desbloquear; Ajustes incluye «Reiniciar partida».
  - `plant()` trata el pasto y las calabazas muertas como casilla libre y coloca el brote al instante antes de la espera de ticks; usar entidades/ítems/sombreros sin su tecnología detiene el script con `UnlockError`.
  - El agua y el fertilizante se recargan automáticamente según los niveles de `Watering` y `Fertilizer` mientras corre un script.
  - `Expand` admite cuadrículas rectangulares (incluido 1×3); `get_world_size()` devuelve el lado mayor.
  - El dron permanece siempre en vuelo y con las hélices girando incluso en pausa o detenido (la pausa solo congela la ejecución del script y `simTime`).
  - La granja, los drones y el perro son objetos independientes: arrastrar mueve solo la granja; un dron sin script flota donde quedó y, al ejecutar, vuela hasta su casilla y la sigue; el perro patrulla su propia zona. Cada ejecución empieza con el dron principal en (0, 0) (salvo en modo Dinosaurio).
  - `set_world_size()` es temporal (dura la ejecución) y `simulate()` congela la granja principal mientras corre una granja aislada y devuelve sus segundos simulados.

## 4. Estructura de Directorios Esperada
```text
/
├── AGENTS.md                           # Este archivo
├── docs/
│   ├── 01_ARCHITECTURE.md              # Worker Bridge, Ticks, PRNG, Render y Persistencia
│   ├── 02_DSL_AND_VM_SPEC.md           # Gramática DSL, AST, VM, Megafarm y API completa
│   ├── 03_GAME_MECHANICS_AND_DATA.md   # Grid, Entidades, Subsistemas, Balance y Tech Tree
│   ├── 04_IMPLEMENTATION_ROADMAP.md    # Plan de ejecución en 4 fases, notas y pruebas
│   ├── 05_VISUAL_STYLE_AND_PALETTE.md  # Dirección visual oficial, paleta hex y optimización 2.5D
│   ├── 06_ASSETS_AND_ENTITY_SHAPES.md  # Catálogo de sprites, dron modular y pipeline .webp
│   ├── 07_UI_UX_AND_TECH_TREE_DESIGN.md# UI retro-industrial, ventanas flotantes y Tech Tree
│   └── 08_ANIMATIONS_SPEC.md           # Animaciones procedurales, ParticlePool y Auto-LOD
├── src/
│   ├── config/
│   │   ├── balance.json                # Parámetros numéricos externalizados
│   │   └── techTree.json               # Grafo de desbloqueos y costos
│   ├── engine/                         # TypeScript puro (sin DOM)
│   │   ├── prng.ts
│   │   ├── types.ts
│   │   ├── grid.ts
│   │   ├── inventory.ts
│   │   ├── tech.ts
│   │   ├── world.ts
│   │   └── subsystems/                 # pumpkin.ts, sunflower.ts, cactus.ts, maze.ts, polyculture.ts, dino.ts
│   ├── vm/                             # TypeScript puro (sin DOM)
│   │   ├── lexer.ts
│   │   ├── parser.ts
│   │   ├── ast.ts
│   │   ├── compiler.ts
│   │   ├── values.ts
│   │   ├── errors.ts
│   │   ├── droneVm.ts
│   │   ├── scheduler.ts
│   │   └── builtins.ts
│   ├── worker/
│   │   ├── protocol.ts                 # Tipos discriminados de mensajes PostMessage
│   │   ├── simulationHost.ts           # Bucle determinista sin DOM (No-Idle + snapshots)
│   │   └── simulation.worker.ts        # Punto de entrada del Web Worker
│   ├── renderer/
│   │   ├── FarmStage.ts                # Escena PixiJS + interpolación (lerp)
│   │   ├── iso3d.ts                    # Proyector 2.5D low-poly (respaldo procedural)
│   │   ├── palette.ts                  # Paleta visual del renderizador
│   │   ├── sprites.ts                  # Sprites auxiliares y efectos
│   │   └── models/                     # Modelos procedurales (island, crops, subsystems, drone, dog, hats)
│   ├── store/
│   │   ├── useGameStore.ts             # Zustand (estado sincronizado desde Worker)
│   │   └── useWindowStore.ts           # Disposición de ventanas flotantes y vista activa
│   ├── persistence/
│   │   └── db.ts                       # IndexedDB (`farmercodex_db`: files, saves, leaderboards)
│   └── ui/                             # Componentes React (Editor, HUD, TechTree, Windows)
└── tests/                              # Pruebas unitarias Vitest (engine, vm, subsystems, rules)
```

## 5. Flujo de Trabajo para la IA
1. Consulta `docs/04_IMPLEMENTATION_ROADMAP.md` para identificar la fase activa y revisar las notas de decisiones cerradas.
2. Consulta `docs/05_VISUAL_STYLE_AND_PALETTE.md`–`08_ANIMATIONS_SPEC.md` antes de modificar estilos, renderizado, assets o animaciones.
3. Implementa primero las estructuras puras en `src/engine/` y `src/vm/` junto con sus pruebas en `tests/`.
4. Ejecuta `npm test` (Vitest) y `npm run build` (TypeScript strict + Vite) y verifica que pasen en verde.
5. No hardcodees fórmulas de balance: lee siempre desde `src/config/balance.json` y `src/config/techTree.json`.
