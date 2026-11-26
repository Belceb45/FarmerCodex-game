# FarmerCodex

Juego web de automatización agrícola: programas un dron con un lenguaje estilo Python 3 y lo ves trabajar sobre una granja en cuadrícula. La interfaz es un escritorio de terminales flotantes de código sobre la granja, que ocupa todo el fondo. Estética de chatarra retro-industrial con cultivos orgánicos postapocalípticos, en isometría 2:1 (docs 05–08).

**Estado:** las 4 fases de [la hoja de ruta](docs/04_IMPLEMENTATION_ROADMAP.md) completas: núcleo determinista, intérprete, Web Worker y UI; cultivos, agua, fertilizante, árbol tecnológico, `import` entre archivos y guardado en IndexedDB; megacalabazas, girasoles y energía, cactus ordenables, laberintos, policultivo y modo Dinosaurio; Megagranja con hasta 32 drones aislados en una granja de 32×32, 59 logros con sombreros de recompensa, 16 marcadores locales, sonido y atajos; después, `simulate()`, `set_world_size()` y una granja que se mueve independiente del dron y del perro. Pendiente del doc 02: el bloqueo progresivo de sintaxis.

## Interfaz

- **Ventanas `.py`:** el botón **+** crea una; se arrastran por la barra de título, se redimensionan por bordes y esquinas, se minimizan (**–**) y se cierran (**×**, elimina el archivo tras confirmar). Doble clic en el nombre para renombrar.
- **Barra de título:** **▶** ejecutar y **▷** paso a paso (verdes) cuando el script está detenido; **■** detener y **‖** pausar (naranjas) mientras corre.
- **HUD:** inventario arriba a la izquierda (cada recurso aparece al conseguirlo o desbloquearlo); arriba a la derecha **+**, **i** (documentación), trofeo (logros y marcadores), árbol tecnológico y ajustes (tema del editor Ámbar / Oscuro / Claro, destello de línea activa, tope de velocidad, volumen, consola, reiniciar partida, estado).
- **Simulaciones:** mientras corre `simulate()`, la granja que se ve es la simulada y una banda inferior muestra el archivo, la semilla y el tiempo simulado, con un botón para detenerla.
- **Registros (trofeo o `L`):** los 59 logros con su progreso y el sombrero que regalan, y los 16 marcadores con la mejor marca (ticks simulados), el archivo y un botón **▶** para un intento cronometrado con el archivo y el ritmo elegidos. Durante un intento, una banda inferior muestra la meta y permite detenerlo; las marcas se guardan en IndexedDB y sobreviven a «Reiniciar partida».
- **Táctil:** en móviles y tabletas, al editar aparece una barra de símbolos (`Tab`, quitar sangría, `:`, `=`, `( )`, `[ ]`, comillas, flechas y deshacer) que escribe sin cerrar el teclado.
- **Errores:** aparecen al pie de la ventana del script, con la línea marcada en rojo. La consola de salida (búfer circular de 1000 líneas, `quick_print`) no se muestra por defecto: se abre desde Ajustes.
- **Árbol tecnológico:** ocupa toda la pantalla, con paneo y zoom; clic en una tarjeta para comprar su siguiente nivel. El tooltip muestra el efecto y los costos (verde si alcanzan, rojo si faltan).
- **Granja (sprites 2.5D):** plataforma de desguace suspendida con placas de hierro oxidado, tierra en marcos de chapa, tuberías y cables colgando; cultivos orgánicos, barricadas y cofre del laberinto, reptil mecánico del modo Dinosaurio, «El Chatarrero» (dron remachado con dos hélices laterales que siempre giran, brazo con pinza y 18 sombreros de chatarra) y el perro-alcancía de latón. Todo sale de un único atlas `public/assets/atlas.webp`, con las animaciones procedurales del doc 08 (brotes, cosechas por cultivo, fusión de megacalabazas, muros que brotan, vuelo de recursos al HUD, partículas con Auto-LOD). Al pasar el puntero, tooltip de la casilla.
- **Granja, dron y perro por separado:** arrastrar mueve solo la granja y la rueda hace zoom. Sin script, el dron flota donde quedó; al ejecutar vuela hasta la casilla (0, 0) y desde ahí trabaja, y si mueves la granja mientras trabaja la alcanza volando. El perro patrulla su propia zona y con `pet_the_dog()` vuela hasta el dron. El dron y el perro se pueden agarrar y soltar en otro sitio. Doble clic recentra todo. Si el atlas no carga, se usa el renderizador low-poly de respaldo.
- **Guardado:** los scripts, la granja, el inventario y los desbloqueos se guardan solos en IndexedDB (`farmercodex_db`); la posición de las ventanas, en `localStorage`.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: lexer, parser, VM, motor, simulación y reglas
npm run typecheck  # app + motor sin DOM + pruebas
npm run build      # typecheck + build de producción en dist/
npm run assets     # regenera los sprites de assets-src/sprites y el atlas de public/assets (≈ 2 min)
npm run atlas      # solo empaqueta el atlas (tras reemplazar PNG por arte final)
```

Atajos (sobre la ventana de código activa): `Ctrl+Enter` ejecutar / pausar / continuar · `F10` paso a paso · `Ctrl+Shift+Enter` detener. Fuera del editor: `F1` o `H` ocultar la interfaz · `T` árbol tecnológico · `L` logros y marcadores · `Esc` cerrar ajustes, árbol o la ventana auxiliar de arriba.

## Arquitectura

| Carpeta | Contenido |
| :--- | :--- |
| `src/config/` | `balance.json` (costos en ticks, crecimiento, rendimientos, agua, fertilizante y los seis subsistemas), `techTree.json` (nodos, niveles, costos y efectos), `achievements.json` (59 logros) y `leaderboards.json` (16 marcadores). Nada de balance está escrito en el código. |
| `src/engine/` | Mundo determinista: PRNG Mulberry32, cuadrícula (rectangular), inventario, crecimiento, evaporación, desbloqueos (`tech.ts`), estadísticas y bus de logros (`achievements.ts`), marcadores (`leaderboards.ts`) y `subsystems/` (calabaza, girasol y energía, cactus, laberinto, policultivo, dinosaurio). TypeScript puro, sin DOM. |
| `src/vm/` | Lexer con `INDENT`/`DEDENT` → parser (AST) → compilador a bytecode → VM iterativa con pila explícita, builtins, planificador Round-Robin de 1 a 32 drones y flota Megafarm (`fleet.ts`: drones hijos con memoria aislada por copia profunda). Sin `eval()` ni `new Function()`. |
| `src/worker/` | Protocolo de mensajes (uniones discriminadas), `SimulationHost` (regla No-Idle, ráfagas de ≤ 8 ms, snapshots a ~30 Hz con arreglos planos, intentos de marcador en granjas aisladas) y punto de entrada del Web Worker. |
| `src/renderer/` | Escena PixiJS v8 a pantalla completa. `iso/`: `IsoStage` con sprites del atlas en isometría 2:1 (capas del doc 05, plataforma cacheada, sincronización solo de casillas que cambian, pool de sprites y de drones, pool de partículas y Auto-LOD, animaciones del doc 08 con pirueta y aparición de drones), la granja (`field`) separada de los voladores (`sky`) con su vuelo libre (`flight.ts`), proyección y picking (`projection.ts`). Respaldo: proyector low-poly `iso3d.ts` con sus modelos en `models/`. |
| `src/audio/` | Efectos sintetizados con Web Audio (`SoundManager.ts`) y su *throttling* puro (`sounds.ts`: 45–60 ms por categoría, 8 voces como máximo). |
| `scripts/` | `generate-sprites.mjs` hornea los modelos de `scripts/sprites/` en PNG isométricos (`assets-src/sprites/`) y `build-atlas.mjs` los empaqueta en `public/assets/atlas.webp` + `atlas.json` (doc 06). |
| `src/persistence/` | `db.ts`: IndexedDB con `idb` (`files`, `saves`, `leaderboards`) y sincronización de archivos. |
| `src/store/` | Zustand: estado del juego (archivos, ejecución, inventario, desbloqueos), escritorio de ventanas, arranque y guardado, cliente del Worker. |
| `src/ui/` | React: ventanas flotantes (`windows/`), HUD (`hud/`), árbol tecnológico (`tech/`), editor CodeMirror 6 y fondo de la granja. |
| `tests/` | 458 pruebas Vitest deterministas (`tests/subsystems/`: fórmulas, costos en ticks y cambios de `balance.json` de cada subsistema; `tests/renderer/`: proyección 2:1, Auto-LOD, sprites por crecimiento, contrato del atlas y vuelo libre del dron; `megafarm`: aislamiento de memoria y 32 drones; `records`: logros y marcadores; `simulate`: `simulate()`, `set_world_size()` y el inicio en (0, 0); `stress`: 100 000 ticks con 32 drones). |

`tsconfig.engine.json` compila `src/engine`, `src/vm` y el host de simulación **sin la librería DOM**, y `tests/rules.test.ts` impide `Math.random`, `eval`, `new Function`, DOM y tiempo real en esas carpetas.

## Lenguaje disponible

Subconjunto de Python 3: `int`, `float`, `bool`, `None`, `str`, `list`, `tuple`, `dict`, `set`; operadores aritméticos, comparaciones encadenadas, `and`/`or`/`not`, `in`, `is`; `if/elif/else`, `while`, `for ... in`, `break`, `continue`, `pass`; `def` con valores por defecto, argumentos con nombre, recursión, cierres y funciones como valores; `global`; anotaciones de tipo (se ignoran); `import nombre`, `from nombre import f` y `from nombre import *` entre los archivos `.py` de tus ventanas. No hay `lambda`, clases, `try`, comprensiones ni f-strings.

API del juego: `move`, `harvest`, `till`, `plant`, `use_item`, `swap`, `can_harvest`, `can_move`, `measure`, `get_companion`, `get_pos_x`, `get_pos_y`, `get_world_size`, `get_entity_type`, `get_ground_type`, `get_water`, `num_items`, `unlock`, `num_unlocked`, `get_cost`, `change_hat`, `pet_the_dog` (alias `pet_the_piggy`), `do_a_flip`, `print`, `quick_print`, `get_time`, `get_tick_count`, `set_execution_speed`, `clear`, `set_world_size`, `simulate`, `leaderboard_run`; Megagranja: `spawn_drone`, `wait_for`, `has_finished`, `num_drones`, `max_drones`; más `len`, `range`, `abs`, `min`, `max`, `random` y conversiones. Enums: `Items`, `Entities`, `Grounds`, `Directions`, `Unlocks`, `Hats`, `Leaderboards`. El botón **i** de la app muestra la referencia completa con sus costos.

## Modelo de tiempo

- Asignaciones y literales cuestan 0 ticks; aritmética, comparaciones, lógica, subíndices y llamadas, 1; cada vuelta de bucle, 1; las acciones físicas, 200 (1 si fallan). El efecto se aplica al terminar la espera.
- Sin mejoras se procesan 400 ticks por segundo real; la mejora Velocidad multiplica ese ritmo. El tiempo simulado, el crecimiento, la evaporación y el relleno de agua y fertilizante **solo avanzan si hay un script activo** y sin pausa.
- Con `Items.Power` en el inventario, cada dron activo gasta energía y trabaja al doble (sus esperas bajan 2 ticks por tick del mundo); las plantas siguen creciendo al ritmo normal.
- Cada ejecución empieza con el dron en (0, 0) (salvo en modo Dinosaurio, que conserva su casilla). `set_world_size()` dura hasta que termina la ejecución.
- `simulate()` congela tu granja mientras corre la simulada y devuelve sus segundos simulados (ticks / 400), igual que `get_time()`.
- Con varios drones, el planificador recorre los activos por orden de id en cada tick. `wait_for()` y `do_a_flip()` bloquean al dron (estado `WAITING`); la pirueta dura siempre 1 s real a la velocidad desbloqueada, sin acelerarse con `Items.Power`.
