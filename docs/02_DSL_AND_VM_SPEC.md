# 02. Especificación del Lenguaje DSL, Intérprete AST y Concurrencia

## 1. Subconjunto del Lenguaje (Python 3-like)
El intérprete debe soportar un subconjunto estricto de Python 3 con indentación significativa (`INDENT` / `DEDENT`).

### Sintaxis Soportada
- **Tipos de datos:** `int`, `float`, `bool` (`True`, `False`), `None`, `str`, `list`, `tuple`, `dict`, `set`.
- **Operadores y Comparaciones:** Aritméticos (`+`, `-`, `*`, `/`, `//`, `%`, `**`), asignación compuesta (`+=`, `-=`, etc.), comparación (`==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not in`, `is`), **comparaciones encadenadas** (ej. `0 <= x < size`), lógicos (`and`, `or`, `not`).
- **Control de flujo:** `if` / `elif` / `else`, `while`, `for x in iterable:` (incluyendo `range()`), `break`, `continue`, `pass`.
- **Funciones y Módulos:** `def nombre(a, b=1):`, `return`, `global`, **paso de funciones como argumentos** (orden superior), `import modulo`, `from modulo import funcion` y `from modulo import *` (resolviendo contra los archivos virtuales `.py` del jugador).
- **Anotaciones de tipo:** El parser debe aceptar anotaciones de tipo en parámetros y retornos (ej. `def move_to(x: int, y: int) -> bool:`) e ignorarlas en tiempo de ejecución para mantener compatibilidad con editores externos (VS Code / File Watcher).

### Explícitamente Excluido
- Biblioteca estándar de CPython (`os`, `sys`, `math`, `threading`, etc.).
- Expresiones `lambda`, comprensiones de listas complejas, generadores (`yield`), decoradores, clases (`class`) y `try/except` avanzado.

### Bloqueo Progresivo de Sintaxis (Tech Tree Gating)
El compilador/AST debe validar el código contra el estado actual de `Unlocks` antes de ejecutar: si el jugador utiliza características del lenguaje que aún no ha investigado (`Unlocks.Loops`, `Unlocks.Operators`, `Unlocks.Lists`, `Unlocks.Dictionaries`, `Unlocks.Functions`, `Unlocks.Import`, `Unlocks.Senses`, `Unlocks.Debug`, `Unlocks.Debug_2`, `Unlocks.Costs`, `Unlocks.Timing`, `Unlocks.Simulation`), la VM debe detener el script y emitir un `RUNTIME_ERROR` indicando qué nodo tecnológico falta desbloquear.

## 2. Arquitectura de la Máquina Virtual (VM Iterativa)
Para pausar scripts en cualquier instrucción sin usar la pila de JavaScript ni `eval()`:

```typescript
export type RuntimeValue =
  | number
  | boolean
  | string
  | null
  | RuntimeValue[]
  | Set<RuntimeValue>
  | Map<string, RuntimeValue>
  | FunctionObject
  | DroneHandleObject;

export interface StackFrame {
  file: string;
  functionName: string;
  statements: ASTStatement[];
  ip: number;                          // Instruction Pointer actual
  localScope: Map<string, RuntimeValue>;
  loopStack: LoopContext[];            // Manejo de while/for, break y continue
}

export interface DroneVM {
  id: number;
  x: number;
  y: number;
  hat: string;
  callStack: StackFrame[];
  globalScope: Map<string, RuntimeValue>; // Memoria 100% aislada por dron
  status: 'RUNNING' | 'WAITING' | 'FINISHED' | 'ERROR';
  waitTicks: number;                      // Ticks restantes de la acción física actual
  fixedWaitMs: number;                    // Para animaciones inmunes a velocidad (do_a_flip)
  waitingForDroneId: number | null;       // Bloqueado por wait_for()
  returnValue: RuntimeValue;
}
```

### Ciclo de Ejecución (Scheduler Round-Robin)
En cada tick del motor:
1. Iterar sobre todos los drones activos en orden de ID.
2. Si `drone.status === 'WAITING'`: verificar si `waitingForDroneId` ya está `FINISHED`. Si sí, inyectar su `returnValue` y cambiar a `RUNNING`.
3. Si `drone.fixedWaitMs > 0`: descontar tiempo real/simulado sin aplicar multiplicadores de velocidad ni `Items.Power` (exclusivo para `do_a_flip()`).
4. Si `drone.waitTicks > 0`: decrementar `drone.waitTicks` en `1` (o `2` si hay `Items.Power` activo). Al llegar a `0`, aplicar el efecto físico pendiente.
5. Si `drone.status === 'RUNNING'` y no está esperando: evaluar instrucciones del AST hasta agotar su presupuesto del tick o disparar una acción física.

## 3. Concurrencia Multi-Dron (Megafarm: 1 a 32 Drones)
- **Sin colisiones físicas:** Hasta 32 drones pueden superponerse en la misma coordenada `(x, y)` sin bloquearse entre sí.
- **Aislamiento total de memoria:** Ningún dron puede leer ni mutar variables globales o estructuras mutables de otro dron.
- **Clonación de argumentos:** `spawn_drone(fn, *args)` clona profundamente todos los argumentos antes de crear el nuevo `DroneVM` en la misma casilla que el dron padre.
- **Límite de drones:** Si se alcanza `max_drones()`, `spawn_drone()` **no lanza error**; retorna `None` y cuesta solo `1` tick.

## 4. Las 7 Enumeraciones Globales Exactas
Deben exponerse exactamente con estos nombres en el espacio global del DSL:

1. **`Entities` (12):** `Apple`, `Bush`, `Cactus`, `Carrot`, `Dead_Pumpkin`, `Dinosaur`, `Grass`, `Hedge`, `Pumpkin`, `Sunflower`, `Treasure`, `Tree`.
2. **`Items` (12):** `Bone`, `Cactus`, `Carrot`, `Fertilizer`, `Gold`, `Hay`, `Piggy` *(trofeo nostálgico)*, `Power`, `Pumpkin`, `Water`, `Weird_Substance`, `Wood`.
3. **`Grounds` (2):** `Grassland`, `Soil`.
4. **`Directions` (4):** `North`, `South`, `East`, `West`.
5. **`Hats` (26):** `Brown_Hat`, `Cactus_Hat`, `Carrot_Hat`, `Dinosaur_Hat`, `Gold_Hat`, `Gold_Trophy_Hat`, `Golden_Cactus_Hat`, `Golden_Carrot_Hat`, `Golden_Gold_Hat`, `Golden_Pumpkin_Hat`, `Golden_Sunflower_Hat`, `Golden_Tree_Hat`, `Gray_Hat`, `Green_Hat`, `Pumpkin_Hat`, `Purple_Hat`, `Silver_Trophy_Hat`, `Straw_Hat`, `Sunflower_Hat`, `The_Farmers_Remains`, `Top_Hat`, `Traffic_Cone`, `Traffic_Cone_Stack`, `Tree_Hat`, `Wizard_Hat`, `Wood_Trophy_Hat`.
6. **`Unlocks` (25 + `Timing`):** `Auto_Unlock`, `Cactus`, `Carrots`, `Costs`, `Debug`, `Debug_2`, `Dictionaries`, `Dinosaurs`, `Expand`, `Fertilizer`, `Functions`, `Grass`, `Hats`, `Import`, `Leaderboard`, `Lists`, `Loops`, `Mazes`, `Megafarm`, `Operators`, `Plant`, `Polyculture`, `Pumpkins`, `Senses`, `Simulation`, `Timing` *(reemplazó a Benchmark en 1.0)*.
7. **`Leaderboards` (16):** `Cactus`, `Cactus_Single`, `Carrots`, `Carrots_Single`, `Dinosaur`, `Fastest_Reset`, `Hay`, `Hay_Single`, `Maze`, `Maze_Single`, `Pumpkins`, `Pumpkins_Single`, `Sunflowers`, `Sunflowers_Single`, `Wood`, `Wood_Single`.

## 5. Catálogo Completo de la API Built-in

### Acciones Físicas y de Escena
| Firma de función | Costo en ticks | Comportamiento y detalles clave |
| :--- | :--- | :--- |
| `harvest() -> bool` | `200` (éxito) / `1` (fallo) | Recolecta si está maduro. Si no está maduro, **lo destruye**. Retorna `True` si removió algo. |
| `plant(entity: Entity) -> bool` | `200` (éxito) / `1` (fallo) | Descuenta recursos automáticamente y siembra si el terreno es válido y está libre. Falla silenciosamente (`False`) si no cumple. |
| `move(direction: Direction) -> bool` | `200` (éxito) / `1` (fallo) | Mueve 1 casilla con *wrap-around* toroidal en granja normal; bloqueado por `Hedge` o cola `Dinosaur`. |
| `till() -> None` | `200` | Alterna `Grassland` $\leftrightarrow$ `Soil` y destruye inmediatamente cualquier entidad presente en la casilla. |
| `use_item(item: Item, n=1) -> bool` | `200` (éxito) / `1` (fallo) | Aplica `Items.Water`, `Items.Fertilizer` o `Items.Weird_Substance` sobre la casilla actual. |
| `swap(direction: Direction) -> bool` | `200` (éxito) / `1` (fallo) | Intercambia la entidad bajo el dron con la vecina en `direction` (**funciona también con casillas `None`**). |
| `change_hat(hat: Hat) -> None` | `200` | Cambia el sombrero del dron; `Hats.Dinosaur_Hat` activa el modo Dinosaurio. |
| `do_a_flip() -> None` | **1 segundo fijo** | Pirueta aérea completa; **inmune** a mejoras de velocidad y `Items.Power`. |
| `pet_the_piggy() -> None` | `200` | Acaricia la alcancía (`Piggy Bank`) de la granja disparando su animación. |
| `clear() -> None` | `200` | Restablece el entorno de la granja a `Grassland` y devuelve el dron a `(0, 0)`. |

### Sensores, Inventario y Progresión
| Firma de función | Costo en ticks | Comportamiento |
| :--- | :--- | :--- |
| `can_harvest() -> bool` | `1` | `True` si la entidad bajo el dron está lista para cosecharse. |
| `can_move(direction: Direction) -> bool` | `1` | Comprueba si la dirección está libre de muros (laberintos) o cola (dinosaurio). |
| `get_pos_x() -> int` / `get_pos_y() -> int` | `1` | Coordenadas enteras iniciando en `(0, 0)` en la esquina **Sur-Oeste**. |
| `get_world_size() -> int` | `1` | Dimensión lateral $N$ de la cuadrícula activa. |
| `get_entity_type() -> Entity \| None` | `1` | Identifica la entidad bajo el dron. |
| `get_ground_type() -> Ground` | `1` | Retorna `Grounds.Grassland` o `Grounds.Soil`. |
| `get_water() -> float` | `1` | Nivel de hidratación actual (`0.0` a `1.0`). |
| `get_companion() -> (Entity, (int, int))` | `1` | Retorna `(entidad, (x, y))` para bonificación de `Polyculture`. |
| `measure(direction=None) -> Any` | `1` | Lee pétalos (`Sunflower`), tamaño (`Cactus`), tipo (`Dinosaur`) o `(x, y)` de `Treasure` / `Apple`. |
| `num_items(item: Item) -> float` | `1` | Cantidad actual del recurso en inventario global. |
| `get_cost(thing, level=None) -> dict \| None` | `1` | Diccionario de costos de una entidad o nivel de desbloqueo. |
| `num_unlocked(thing) -> int` | `1` | Nivel actual de mejora de `thing` (o `1`/`0` para desbloqueos únicos). |
| `unlock(tech: Unlock) -> bool` | `200` / `1` | Compra un desbloqueo por código si hay recursos suficientes. |

### Multidrón, Depuración, Simulación y Utilidades
| Firma de función | Costo en ticks | Comportamiento |
| :--- | :--- | :--- |
| `spawn_drone(fn, *args) -> Handle \| None` | `200` (éxito) / `1` (fallo) | Crea un dron hijo aislado en la misma casilla; retorna `None` si se alcanzó `max_drones()`. |
| `wait_for(drone) -> Any` | `1` (si ya terminó) | Bloquea al dron padre hasta que `drone` finalice y devuelve su valor de retorno. |
| `has_finished(drone) -> bool` | `1` | Comprobación no bloqueante del estado del dron hijo. |
| `max_drones() -> int` / `num_drones() -> int` | `1` | Límite permitido / drones vivos actualmente. |
| `print(*args) -> None` | `200` | Pausa la ejecución y dibuja **texto flotante en la escena** sobre el dron. |
| `quick_print(*args) -> None` | `0` | Escribe directamente en la consola de salida sin animación espacial. |
| `get_time() -> float` / `get_tick_count() -> int` | `0` | Tiempo simulado en segundos y conteo exacto de ticks (reemplazó a `get_op_count()`). |
| `set_execution_speed(speed: float) -> None` | `200` | Fija tope de velocidad (`<= 0` restaura el máximo desbloqueado). |
| `set_world_size(size: int) -> None` | `200` | Reduce temporalmente el tablero a `size x size` (**mínimo 3**), limpia la granja y reinicia posición. |
| `simulate(filename, sim_unlocks, sim_items, sim_globals, seed, speedup) -> float` | `200` | Ejecuta una simulación aislada determinista y retorna la duración medida. |
| `leaderboard_run(leaderboard, file_name, speedup) -> None` | `200` | Inicia un intento cronometrado oficial para una de las 16 tablas `Leaderboards`. |
| `min(*args)` / `max(*args)` / `abs(x)` / `random()` / `len()` / `range()` | `abs: 1`, `min/max: #comp`, otros `1` | Utilidades matemáticas y de secuencias (con `random()` alimentado por el PRNG determinista). |