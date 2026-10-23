# Rediseño de UX: navegación, Inicio y sistema visual

Fecha: 23 oct 2026 · Estado: aprobado de palabra por el usuario (enfoque A), sin revisión del documento por decisión suya.

## Por qué

El usuario usa la app (Finanzas, Listas, Hábitos le sirven) pero la siente incómoda y prefiere otras apps. La evaluación del 23 oct mostró que **no es lenta**: toque → cambio en pantalla de 2–7 ms (14–18 ms con la CPU frenada 6×) y las escrituras ya usan `durability: 'relaxed'`. El problema es de UX:

1. Navegación: menú hamburguesa; cambiar de sección = 2 toques + cajón de 150–200 ms + fundido de 160 ms.
2. Los toques no tienen respuesta visible: cada acción repinta la vista entera con `innerHTML`, sin transiciones.
3. Inicio es de solo lectura: para marcar un hábito hay que ir a Hábitos y elegir el momento del día en el carrusel.
4. Aspecto plano: mismo fondo, tarjetas idénticas, etiquetas en mayúsculas por todas partes, un solo acento; en Finanzas, 25 gastos en rojo y texto cortado.
5. Fallo: el botón `+` flotante de Finanzas tapa el lápiz de la última categoría.
6. Fuera de alcance: recordatorios y widgets (una PWA no puede; ya se descartó el APK).

## Alcance (enfoque A)

Se rediseña la **capa de presentación y navegación**. No cambian: modelo de datos, IndexedDB, respaldo, sincronización, lógica de dinero, service worker (no se añaden archivos `.js`, así que `SHELL` y `modulepreload` quedan igual).

**Fuera de alcance:** Gimnasio (el usuario no lo usa por ahora; se trabaja después), repintado parcial en toda la app (enfoque B), recordatorios.

## Diseño

### 1. Navegación
- **Barra inferior** de 5 destinos (alto 56 px + `safe-area-inset-bottom`): *Inicio* y los 3 primeros de `applyOrder(…, settings.tabOrder)` sin Inicio, más **Más**. Por defecto: Inicio, Finanzas, Hábitos, Listas, Más.
- Activo = icono relleno y pastilla con `--sec`. Un toque cambia de sección, **sin fundido** (se elimina `#view.enter`).
- **Más** abre una hoja inferior (`modal()`) con los demás destinos y Configuración.
- La barra se queda en las vistas de detalle (lista abierta, grupo de notas, catálogo); se oculta con un diálogo abierto y en el Pomodoro a pantalla completa.
- Se elimina el cajón (`#drawer`, `#scrim`, `menu-open`/`menu-close`, hamburguesa). La barra superior lleva solo el título y la acción (`+`) o «volver».
- El `+` flotante (`.fab`) sube sobre la barra y el contenido deja relleno inferior suficiente.

### 2. Sistema visual
- **Color por sección, reversible.** Los componentes usan solo `var(--sec)`, que en `:root` vale `var(--accent)`. Un único bloque de `style.css`, marcado con comentario, asigna `--sec` según `body[data-sec="…"]`. **Volver a un solo acento = borrar ese bloque.** Finanzas verde azulado (`--teal`), Hábitos ámbar (`--yellow`/`--peach`), Listas azul (`--blue`), el resto `--accent`. Todo con tokens existentes, así el tema claro lo hereda.
- **Rojo solo para problemas** (saldo negativo, vencido). Un gasto usa el texto normal; el ingreso, verde.
- **Tipografía:** se conservan la fuente del sistema y JetBrains Mono. Números importantes grandes y con `tabular-nums`; se **quitan las etiquetas en mayúsculas espaciadas** (`.overline`, `.slot-h`, `.summary small`…) por títulos normales.
- **Forma:** radios por función (controles 12 px, hojas 20 px, casillas círculo) en vez de un único `--radius`. Listas planas con líneas finas; tarjeta solo para el bloque «Hoy» y lo que de verdad lo pida.
- **Movimiento** solo como respuesta a un toque: casilla con relleno + rebote 180 ms, barras que crecen en 250 ms, botones y filas con `scale(.97)` al pulsar. Todo se anula con `prefers-reduced-motion`.
- Regla del `CLAUDE.md` que se reemplaza: «un solo acento / no uses `--mauve` & co. para el chrome» → «`--sec` por sección, un bloque revertible». `tests/interfaz.py` sigue comprobando el contraste en los dos temas.

### 3. Inicio accionable
Orden: fecha y saludo → **Hoy** (tarjeta: todos los hábitos de hoy, marcables en el sitio, con «n de N») → **Tareas de hoy** (marcables) → línea de pagos vencidos (toca → Finanzas › Pagos) y botones Gasto / Ingreso / Mover → nota rápida → Bandeja → frase discreta al final.
- Marcar desde Inicio devuelve `false` en el manejador (como `gym-f`) y solo cambia la clase/estado del botón y el contador: no repinta ni mueve el scroll. Hábitos y Inicio escriben por el mismo camino (`nextState`/`setDay`, `isDone`/`isSkip`).
- Sin saldo en Inicio (decisión previa). **Se quita la tarjeta de Ejercicio** (y `homeInfo()` deja de usarse en Inicio; se conserva en `gym.js`).
- `HOME_TILES`/`HOME_BLOCKS`/`settings.tileOrder`/`homeOrder`: se mantienen las claves y `applyOrder` para que los respaldos no rompan; las que ya no existan se ignoran.

### 4. Finanzas
- Movimientos **agrupados por día** («Hoy», «Ayer», «21 oct»), la paginación de 30 sigue.
- Fila de dos líneas sin cortar: título + monto; debajo «Cuenta · Categoría» (y el tipo si lo hay).
- Colores: gasto en texto normal, ingreso verde, rojo solo en saldos negativos.

### 5. Hábitos y Listas (pulido)
Se aplican los tokens y movimientos nuevos. El carrusel de Hábitos se conserva para edición y días anteriores. Si el pulido requiere reestructurar, se aplaza.

## Pruebas
- Nuevo `tests/_nav.py` con `ir(page, 'habits')` (usa la barra o «Más» según el orden) y migración de las 28 pruebas que usan `menu-open`/`#tabs`.
- Pruebas nuevas: barra (orden personalizado, «Más», activo, oculta con diálogo), marcado en el sitio desde Inicio (sin repintar), agrupación por día, `+` flotante que no tapa controles, 390 px sin desborde horizontal con las dos fuentes.
- `tests/run_all.py` debe pasar completo antes de publicar.

## Reversibilidad y publicación
- Color por sección: borrar un bloque de CSS.
- Se actualizan `CLAUDE.md` y `Documentacion.md` al terminar.
- Un solo commit al final y `push` a `main` (autorizados por el usuario para probarlo en el teléfono). Por el service worker, la versión nueva se ve en la **segunda apertura** o tocando «Actualizar».

## Criterios de éxito
- Cambiar de sección = 1 toque; marcar un hábito o tarea desde Inicio sin salir.
- Ninguna etiqueta en mayúsculas espaciadas; el rojo solo aparece donde hay un problema.
- Toda la suite en verde; contraste ≥ 7:1 / 4.5:1 en los dos temas.
