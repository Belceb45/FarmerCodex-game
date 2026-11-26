/** Referencia de la API del DSL disponible en esta fase (autocompletado y panel de ayuda). */
import { ENTITY_KINDS, HAT_KINDS, ITEM_KINDS, LEADERBOARD_KINDS, UNLOCK_KINDS } from '../engine/types';

export type ApiCategory = 'acciones' | 'drones' | 'sensores' | 'salida' | 'cosmeticos' | 'simulacion' | 'utilidades';

export interface ApiEntry {
  name: string;
  signature: string;
  cost: string;
  description: string;
  category: ApiCategory;
  takesArgs: boolean;
}

export const API_ENTRIES: readonly ApiEntry[] = [
  {
    name: 'move',
    signature: 'move(direccion) -> bool',
    cost: '200 ticks',
    description:
      'Mueve el dron una casilla hacia North, South, East o West. En la granja los bordes conectan con el lado opuesto; en el laberinto y en el modo Dinosaurio los bordes, los setos y la cola bloquean (False en 1 tick).',
    category: 'acciones',
    takesArgs: true,
  },
  {
    name: 'harvest',
    signature: 'harvest() -> bool',
    cost: '200 ticks · 1 si no hay nada',
    description:
      'Cosecha lo que hay bajo el dron. Si aún no está maduro lo destruye sin dar recursos. Una megacalabaza N×N rinde N³ (N²·6 desde N = 7), los cactus ordenados se cosechan en cadena (n²) y el tesoro da oro. Devuelve True si quitó algo.',
    category: 'acciones',
    takesArgs: false,
  },
  {
    name: 'till',
    signature: 'till()',
    cost: '200 ticks',
    description: 'Labra la casilla: alterna entre Grassland y Soil y destruye lo que haya encima.',
    category: 'acciones',
    takesArgs: false,
  },
  {
    name: 'plant',
    signature: 'plant(entidad) -> bool',
    cost: '200 ticks · 1 si falla',
    description:
      'Siembra la entidad bajo el dron (el pasto y las calabazas muertas cuentan como casilla libre) y descuenta su costo del inventario. Devuelve False sin gastar nada si el suelo no vale (Carrot, Pumpkin, Sunflower y Cactus necesitan Soil), la casilla está ocupada o faltan recursos. Requiere Siembra.',
    category: 'acciones',
    takesArgs: true,
  },
  {
    name: 'use_item',
    signature: 'use_item(item, n=1) -> bool',
    cost: '200 ticks · 1 si falla',
    description:
      'Items.Water sube la humedad de la casilla (acelera el crecimiento; se evapora con el tiempo). Items.Fertilizer quita 2 s al crecimiento pero infecta la planta: la mitad de su cosecha será Weird_Substance. Items.Weird_Substance (n ≥ lado de la granja) sobre un arbusto crea un laberinto; sobre el tesoro lo recicla y el cofre reaparece en otro sitio a los 200 ticks.',
    category: 'acciones',
    takesArgs: true,
  },
  {
    name: 'swap',
    signature: 'swap(direccion) -> bool',
    cost: '200 ticks · 1 si falla',
    description: 'Intercambia la entidad bajo el dron con la vecina (también si alguna está vacía). No cruza los bordes. Sirve para ordenar cactus. Requiere Cactus.',
    category: 'acciones',
    takesArgs: true,
  },
  {
    name: 'unlock',
    signature: 'unlock(tecnologia) -> bool',
    cost: '200 ticks · 1 si falla',
    description: 'Compra el siguiente nivel de una tecnología desde el código, por ejemplo unlock(Unlocks.Speed).',
    category: 'acciones',
    takesArgs: true,
  },
  {
    name: 'can_harvest',
    signature: 'can_harvest() -> bool',
    cost: '1 tick',
    description: 'True si lo que hay bajo el dron está maduro.',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_pos_x',
    signature: 'get_pos_x() -> int',
    cost: '1 tick',
    description: 'Columna actual del dron (0 = borde West).',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_pos_y',
    signature: 'get_pos_y() -> int',
    cost: '1 tick',
    description: 'Fila actual del dron (0 = borde South).',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_world_size',
    signature: 'get_world_size() -> int',
    cost: '1 tick',
    description: 'Lado N de la granja (N x N casillas).',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_entity_type',
    signature: 'get_entity_type() -> Entities | None',
    cost: '1 tick',
    description: 'Entidad bajo el dron (por ejemplo Entities.Grass) o None.',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_ground_type',
    signature: 'get_ground_type() -> Grounds',
    cost: '1 tick',
    description: 'Suelo bajo el dron: Grounds.Grassland o Grounds.Soil.',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_water',
    signature: 'get_water() -> float',
    cost: '1 tick',
    description: 'Humedad de la casilla bajo el dron, de 0.0 a 1.0.',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'measure',
    signature: 'measure(direccion=None) -> int | (x, y) | None',
    cost: '1 tick',
    description:
      'Pétalos de un girasol o tamaño de un cactus (bajo el dron o en la vecina indicada). En el laberinto da la posición del tesoro (None mientras reaparece) y en el modo Dinosaurio, la de la manzana.',
    category: 'sensores',
    takesArgs: true,
  },
  {
    name: 'can_move',
    signature: 'can_move(direccion) -> bool',
    cost: '1 tick',
    description: 'True si el dron puede moverse hacia esa dirección (sin muro del laberinto, cola del dinosaurio ni borde que lo impida).',
    category: 'sensores',
    takesArgs: true,
  },
  {
    name: 'get_companion',
    signature: 'get_companion() -> (Entities, (x, y)) | None',
    cost: '1 tick',
    description:
      'Planta compañera que pide la planta bajo el dron y dónde la quiere. Si está ahí al cosechar, la cosecha se multiplica de 5× a 15× según el nivel. Requiere Policultivo.',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'num_unlocked',
    signature: 'num_unlocked(cosa) -> int',
    cost: '1 tick',
    description: 'Nivel de una tecnología (Unlocks), o 1/0 si una entidad, un ítem o un sombrero ya están habilitados.',
    category: 'sensores',
    takesArgs: true,
  },
  {
    name: 'get_cost',
    signature: 'get_cost(cosa, nivel=None) -> dict | None',
    cost: '1 tick',
    description: 'Costo de sembrar una entidad o del siguiente nivel de una tecnología, como diccionario {Items.X: cantidad}.',
    category: 'sensores',
    takesArgs: true,
  },
  {
    name: 'num_items',
    signature: 'num_items(item) -> int',
    cost: '1 tick',
    description: 'Cantidad del recurso en el inventario, por ejemplo num_items(Items.Hay).',
    category: 'sensores',
    takesArgs: true,
  },
  {
    name: 'get_time',
    signature: 'get_time() -> float',
    cost: '0 ticks',
    description: 'Segundos simulados transcurridos (solo avanzan mientras hay scripts activos).',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'get_tick_count',
    signature: 'get_tick_count() -> int',
    cost: '0 ticks',
    description: 'Ticks simulados transcurridos.',
    category: 'sensores',
    takesArgs: false,
  },
  {
    name: 'print',
    signature: 'print(*valores)',
    cost: '200 ticks',
    description: 'Muestra los valores flotando sobre el dron y en la consola. El dron espera mientras tanto.',
    category: 'salida',
    takesArgs: true,
  },
  {
    name: 'quick_print',
    signature: 'quick_print(*valores)',
    cost: '0 ticks',
    description: 'Escribe en la consola al instante, sin animación ni espera.',
    category: 'salida',
    takesArgs: true,
  },
  {
    name: 'change_hat',
    signature: 'change_hat(sombrero)',
    cost: '200 ticks',
    description:
      'Cambia el sombrero del dron, por ejemplo change_hat(Hats.Beanie). Hats.Dinosaur_Hat (requiere Dinosaurios) inicia el modo Dinosaurio: come manzanas para alargar la cola; al quitártelo o quedar atrapado, la cola da huesos (largo²). Algunos sombreros se ganan con logros (Hats.Viking_Helmet con «Enjambre») y Hats.Top_Hat con su tecnología.',
    category: 'cosmeticos',
    takesArgs: true,
  },
  {
    name: 'pet_the_dog',
    signature: 'pet_the_dog()',
    cost: '200 ticks',
    description: 'Acaricia al perro alcancía volador: se acerca al dron y lo celebra con corazones. pet_the_piggy() es un alias.',
    category: 'cosmeticos',
    takesArgs: false,
  },
  {
    name: 'pet_the_piggy',
    signature: 'pet_the_piggy()',
    cost: '200 ticks',
    description: 'Alias de pet_the_dog() para scripts escritos para otros juegos.',
    category: 'cosmeticos',
    takesArgs: false,
  },
  {
    name: 'do_a_flip',
    signature: 'do_a_flip()',
    cost: '1 segundo fijo',
    description: 'El dron da una pirueta completa. Dura siempre 1 s, sin acelerarse con la mejora Velocidad ni con Items.Power.',
    category: 'cosmeticos',
    takesArgs: false,
  },
  {
    name: 'spawn_drone',
    signature: 'spawn_drone(funcion, *args) -> dron | None',
    cost: '200 ticks · 1 si no hay hueco',
    description:
      'Megagranja: crea un dron hijo en tu casilla que ejecuta funcion(*args) con su propia memoria (las variables globales, listas y argumentos se copian: ningún dron puede cambiar las de otro). Devuelve None sin error si ya hay max_drones() drones.',
    category: 'drones',
    takesArgs: true,
  },
  {
    name: 'wait_for',
    signature: 'wait_for(dron) -> valor',
    cost: '1 tick + la espera',
    description: 'Bloquea al dron hasta que el hijo termine y devuelve una copia del valor que retornó su función (None si falló).',
    category: 'drones',
    takesArgs: true,
  },
  {
    name: 'has_finished',
    signature: 'has_finished(dron) -> bool',
    cost: '1 tick',
    description: 'Comprueba sin esperar si un dron hijo ya terminó.',
    category: 'drones',
    takesArgs: true,
  },
  {
    name: 'num_drones',
    signature: 'num_drones() -> int',
    cost: '1 tick',
    description: 'Drones trabajando ahora mismo (incluido este).',
    category: 'drones',
    takesArgs: false,
  },
  {
    name: 'max_drones',
    signature: 'max_drones() -> int',
    cost: '1 tick',
    description: 'Drones permitidos a la vez según el nivel de Megagranja (1, 2, 4, 8, 16 o 32).',
    category: 'drones',
    takesArgs: false,
  },
  {
    name: 'set_execution_speed',
    signature: 'set_execution_speed(velocidad)',
    cost: '200 ticks',
    description: 'Limita la velocidad para ver mejor lo que pasa: 1 es la velocidad base; un valor ≤ 0 vuelve al máximo desbloqueado.',
    category: 'simulacion',
    takesArgs: true,
  },
  {
    name: 'clear',
    signature: 'clear()',
    cost: '200 ticks',
    description: 'Restablece la granja a Grassland con pasto, sin agua, y devuelve el dron a (0, 0).',
    category: 'simulacion',
    takesArgs: false,
  },
  {
    name: 'set_world_size',
    signature: 'set_world_size(lado)',
    cost: '200 ticks',
    description:
      'Reduce la granja a lado × lado (mínimo 3, nunca más que la desbloqueada) mientras dure la ejecución: la limpia y devuelve los drones a (0, 0). Un valor ≤ 0 o mayor que la granja la deja completa. No está disponible en los marcadores.',
    category: 'simulacion',
    takesArgs: true,
  },
  {
    name: 'simulate',
    signature: 'simulate("archivo.py", sim_unlocks, sim_items, sim_globals, semilla, ritmo) -> float',
    cost: '200 ticks + la simulación',
    description:
      'Ejecuta el archivo en una granja aislada y devuelve los segundos simulados que tardó. Tu granja espera congelada y no gana nada. sim_unlocks: Unlocks (todo al máximo), una lista de desbloqueos o {Unlocks.X: nivel}; sim_items: {Items.X: cantidad}; sim_globals: {"nombre": valor}. Sin argumentos usa tus desbloqueos, sin recursos, semilla 0 y ritmo 1.',
    category: 'simulacion',
    takesArgs: true,
  },
  {
    name: 'leaderboard_run',
    signature: 'leaderboard_run(Leaderboards.X, "archivo.py", ritmo)',
    cost: '200 ticks',
    description:
      'Intento cronometrado (requiere Marcadores): detiene este script y ejecuta el archivo en una granja aislada con semilla fija, midiendo los ticks simulados hasta la meta. El ritmo solo acelera lo que tardas en verlo.',
    category: 'simulacion',
    takesArgs: true,
  },
  { name: 'len', signature: 'len(x) -> int', cost: '1 tick', description: 'Longitud de una lista, tupla, cadena, dict o set.', category: 'utilidades', takesArgs: true },
  { name: 'range', signature: 'range(inicio, fin, paso)', cost: '1 tick', description: 'Secuencia de enteros para recorrer con for.', category: 'utilidades', takesArgs: true },
  { name: 'abs', signature: 'abs(x)', cost: '1 tick', description: 'Valor absoluto.', category: 'utilidades', takesArgs: true },
  { name: 'min', signature: 'min(a, b, ...)', cost: '1 tick por comparación', description: 'El menor valor (de los argumentos o de una lista).', category: 'utilidades', takesArgs: true },
  { name: 'max', signature: 'max(a, b, ...)', cost: '1 tick por comparación', description: 'El mayor valor (de los argumentos o de una lista).', category: 'utilidades', takesArgs: true },
  { name: 'random', signature: 'random() -> float', cost: '1 tick', description: 'Número en [0, 1). Determinista: la misma semilla repite la secuencia.', category: 'utilidades', takesArgs: false },
  { name: 'str', signature: 'str(x) -> str', cost: '1 tick', description: 'Convierte a texto.', category: 'utilidades', takesArgs: true },
  { name: 'int', signature: 'int(x) -> int', cost: '1 tick', description: 'Convierte a entero (trunca los decimales).', category: 'utilidades', takesArgs: true },
  { name: 'float', signature: 'float(x) -> float', cost: '1 tick', description: 'Convierte a número decimal.', category: 'utilidades', takesArgs: true },
  { name: 'bool', signature: 'bool(x) -> bool', cost: '1 tick', description: 'Convierte a True o False.', category: 'utilidades', takesArgs: true },
  { name: 'list', signature: 'list(iterable) -> list', cost: '1 tick', description: 'Crea una lista.', category: 'utilidades', takesArgs: true },
  { name: 'tuple', signature: 'tuple(iterable) -> tuple', cost: '1 tick', description: 'Crea una tupla.', category: 'utilidades', takesArgs: true },
  { name: 'set', signature: 'set(iterable) -> set', cost: '1 tick', description: 'Crea un conjunto.', category: 'utilidades', takesArgs: true },
  { name: 'dict', signature: 'dict() -> dict', cost: '1 tick', description: 'Crea un diccionario.', category: 'utilidades', takesArgs: true },
];

export const ENUM_DOCS: Readonly<Record<string, { description: string; members: readonly string[] }>> = {
  Directions: { description: 'Direcciones (también disponibles sin prefijo)', members: ['North', 'East', 'South', 'West'] },
  Items: { description: 'Recursos del inventario', members: ITEM_KINDS },
  Entities: { description: 'Entidades de la granja', members: ENTITY_KINDS },
  Unlocks: { description: 'Tecnologías del árbol', members: UNLOCK_KINDS },
  Grounds: { description: 'Tipos de suelo', members: ['Grassland', 'Soil'] },
  Hats: { description: 'Sombreros del dron (change_hat)', members: HAT_KINDS },
  Leaderboards: { description: 'Marcadores locales (leaderboard_run)', members: LEADERBOARD_KINDS },
};

export const DIRECTION_NAMES = ['North', 'East', 'South', 'West'] as const;

export const GAME_CONSTANTS: readonly string[] = [...Object.keys(ENUM_DOCS), ...DIRECTION_NAMES];

export const LANGUAGE_KEYWORDS: readonly string[] = [
  'if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'break', 'continue', 'pass',
  'and', 'or', 'not', 'is', 'True', 'False', 'None', 'global',
];

export const METHOD_DOCS: Readonly<Record<string, string>> = {
  append: 'lista.append(x): añade al final',
  extend: 'lista.extend(iterable): añade varios',
  insert: 'lista.insert(i, x): inserta en la posición i',
  pop: 'lista.pop() / dict.pop(clave): quita y devuelve',
  remove: 'lista.remove(x) / set.remove(x): quita un elemento',
  index: 'lista.index(x): posición de x',
  count: 'lista.count(x): veces que aparece x',
  copy: 'copia superficial',
  reverse: 'lista.reverse(): invierte en el sitio',
  clear: 'vacía la colección',
  get: 'dict.get(clave, defecto)',
  keys: 'dict.keys()',
  values: 'dict.values()',
  items: 'dict.items(): pares (clave, valor)',
  add: 'set.add(x)',
  discard: 'set.discard(x): quita si existe',
};

export const LANGUAGE_NOTES: readonly string[] = [
  'Subconjunto de Python 3: variables, if/elif/else, while, for ... in, def, return, global, listas, tuplas, dict y set.',
  'Sin lambda, clases, try/except, comprensiones ni f-strings. La sangría define los bloques.',
  'import nombre, from nombre import f y from nombre import * cargan otros archivos .py de tus ventanas.',
  'Cada operación cuesta ticks (aritmética, comparaciones, llamadas: 1). Las acciones físicas cuestan 200.',
  'El tiempo solo avanza mientras hay un script en marcha: si lo detienes, la granja se congela.',
  'Con Megagranja cada dron hijo tiene su propia memoria: comparte resultados con return y wait_for().',
];
