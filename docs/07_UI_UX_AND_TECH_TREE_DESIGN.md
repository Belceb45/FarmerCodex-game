# 07. Diseño de UI, Ventanas Flotantes y Árbol Tecnológico

Especificación de la interfaz de usuario basada en un **escritorio de terminales flotantes retro-industriales** sobre el lienzo a pantalla completa de la granja. Respeta todas las decisiones funcionales cerradas en las Fases 1 y 2.

---

## 1. Principios de Layout y HUD Superior
La granja ocupa el $100\%$ del viewport sobre el fondo atmosférico `#2A3D45`. El HUD flota sin barras opacas y puede ocultarse por completo con el atajo **`Toggle HUD`** (`F1` o `H` fuera del editor).

### Esquina Superior Izquierda: Barra de Inventario
- Fila horizontal de ítems desbloqueados con espaciado compacto (`12px`–`16px`).
- **Estructura:** Ícono del recurso (`28×28 px`, extraído del mismo estilo del atlas) arriba + contador numérico blanco cálido (`#F2ECE4`) en negrita con sombra dura abajo.
- **Formato compacto obligatorio:** Enteros exactos hasta `999`; a partir de `1000` usar 3 dígitos significativos (`1.24k`, `10.1k`, `6.67M`, `1.24B`).
- Los recursos recién cosechados vuelan en curva hacia su ícono correspondiente y aplican un breve pulso de escala (`1.0` $\to$ `1.18` $\to$ `1.0`) al llegar.

### Esquina Superior Derecha: Botones de Sistema
Grupo de botones metálicos cuadrados (`38×38 px`, borde biselado de hierro `#3D2F28`, fondo `#574B44`, hover `#6E5E55` con borde cobre `#B36B22`):
1. **`+` (Nuevo Script):** Crea una nueva ventana `.py` flotante.
2. **`i` (Documentación):** Abre la ventana flotante del manual interactivo de la API.
3. **Árbol Tecnológico (Ícono chip/engranaje):** Alterna entre la Granja y la vista del Árbol Tecnológico (dentro del árbol cambia a un ícono de plataforma/isla para regresar).
4. **Ajustes (Engranaje):** Abre el panel de configuración:
   - Selector de tema de editor (**Terminal Industrial Ámbar** por defecto, **Oscuro Clásico** y **Claro**).
   - Interruptor para abrir/cerrar la **ventana de Consola** (oculta por defecto, según decisión de Fase 1).
   - Interruptor para desactivar los **destellos de línea activa** (ahorro de CPU con múltiples drones).
   - Tope de velocidad de depuración ($\le 1\times$), volumen de audio y botón **«Reiniciar partida»**.

### Tooltips por Casilla y Cursores Contextuales
- Pasar el puntero sobre cualquier casilla muestra un **tooltip compacto** (fondo `#1E1916` con borde `#8C5327`) con: coordenadas `(x, y)`, tipo de suelo, entidad, porcentaje de crecimiento, `waterLevel`, `isInfected` y metadatos activos (`petals`, `cactusSize`, `cactusSorted`, `companion`).
- Cursores contextuales: agarre (`grab`/`grabbing`) al panear el fondo, puntero en nodos, y flechas en bordes de ventanas redimensionables.

---

## 2. Sistema de Ventanas Flotantes de Código (Estilo Terminal de Chatarra)
El jugador puede abrir, arrastrar, redimensionar, minimizar, renombrar y cerrar múltiples ventanas `.py` alrededor de la isla (su disposición se persiste en `localStorage`):

- **Marco exterior:** Borde de chapa metálica (`2px solid #3D2F28`) con detalle de bisel interior (`#7A6354`) y sombra profunda (`0 8px 24px rgba(0, 0, 0, 0.48)`).
- **Barra de título (`30px`, fondo `#574B44`):**
  - **Izquierda:**
    - Detenido: `Play` (`▶`) y `Step` (`▷`, avanza una sentencia y entra en funciones) en verde energizado (`#4D8C57`).
    - Corriendo: `Stop` (`■`) y `Pause` (`‖`) en naranja alerta (`#D95B26`).
  - **Centro-izquierda:** Nombre editable del archivo sin extensión (ej. `main`, `crops`, `maze`).
  - **Derecha:** Botones compactos metálicos para minimizar (`-`) y cerrar (`×`).
- **Cuerpo del Editor (CodeMirror 6):**
  - Fondo `#1E1916` (tema Industrial Ámbar por defecto), tipografía monoespaciada (`JetBrains Mono` / `Fira Code`, `13px`–`14px`).
  - **Resaltado Industrial:** Texto base `#E8D8C3`, palabras clave/operadores `#FF941A`, enums/números `#D4A34A`, funciones `#63C784`, comentarios `#7D746D`.
  - **Destello de línea activa:** Fondo translúcido cálido (`rgba(255, 148, 26, 0.16)`) siguiendo la sentencia en ejecución (desactivable en Ajustes).
- **Pie de errores en línea (Decisión Fase 1):** Los errores de sintaxis, `UnlockError` o `RUNTIME_ERROR` se muestran directamente en una franja roja/naranja (`#3B1A14`, texto `#FFB088`) al pie de la ventana del script afectado sin obligar a abrir la consola.
- **Soporte Táctil / Móvil:** Al detectar entrada táctil, mostrar barra auxiliar fija sobre el teclado virtual con acceso directo a `:`, `=`, `()`, `[]`, `Tab`, indentación y auto-cierre de pares.

---

## 3. Vista del Árbol Tecnológico (`Tech Tree`)
Ocupa el $100\%$ del viewport sobre `#2A3D45` con paneo fluido y zoom con rueda/pinch:

### Diseño de Nodos
- **Dimensiones:** Tarjetas de chapa oscura (`#1E1916`) de `76×76 px` para entidades/mejoras y `84×46 px` para nodos de sintaxis (`while`, `print()`, `def f():`, `Lists`).
- **Estados del borde (`3px solid`):**
  - **Completado / Nivel máximo:** Borde latón/oro reciclado (`#D4A34A`) + contador inferior (`10 / 10`).
  - **En progreso / Comprable ahora:** Borde cobre brillante (`#C97834`) con leve pulso si el inventario cubre el costo del siguiente nivel.
  - **Bloqueado:** Opacidad `0.48` y borde hierro oscuro (`#3D2F28`).
- **Conectores:** Tuberías/líneas ortogonales finas (`2px`) en cobre apagado (`#8C6F4D`) para ramas bloqueadas y latón brillante (`#D4A34A`) para ramas desbloqueadas, con ángulos rectos de $90^\circ$.
- **Tooltip de nodo:** Muestra nombre, descripción técnica, efecto del siguiente nivel y desglose de costos (en `#63C784` si el inventario alcanza, en `#E06C5A` si falta).