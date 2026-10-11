# CLAUDE.md — Tracker

PWA personal para Android (inicio con frases, finanzas por quincena, hábitos, listas con plantillas, pomodoro, notas con campos propios, compras). **Vanilla JS + IndexedDB, sin build ni dependencias**, publicada en GitHub Pages. Todo el texto de la interfaz, los comentarios y la documentación están en **español**; moneda en quetzales (`Q`). La documentación de usuario/proyecto completa está en [Documentacion.md](Documentacion.md): léela antes de cambiar comportamiento de finanzas.

## Comandos

```fish
python3 -m http.server 8000                    # servir la app en http://localhost:8000
.venv/bin/python tests/run_all.py              # pruebas e2e (ver tests/README.md para preparar el entorno)
.venv/bin/python tests/benchmark_listas.py     # rendimiento con datos sintéticos (no forma parte de run_all)
```

No hay Node. Para validar cualquier cambio de interfaz se usa Playwright (Chromium) contra el servidor estático; no hay forma de "compilar" para detectar errores, así que **ejecuta las pruebas** tras tocar JS.

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `js/app.js` | Arranque, pestañas (menú lateral), repintado (`render`), despacho de clics por `data-act` |
| `js/state.js` | Estado en memoria `S`, carga, **lógica de dinero** (saldos, efectos de movimientos, tarjetas, caché, archivos) |
| `js/db.js` | IndexedDB (`commit`, `replaceAll`, `getAll`, `get`) |
| `js/ui.js` | `modal()`, `catSelect`, `kindSelect`, adjuntos, visor |
| `js/icons.js` | Iconos SVG (`icon(name)`) |
| `js/util.js` | Fechas, periodos, `money()`, `toast()` |
| `js/money.js` | Cuentas, gasto, ingreso, mover, pago de tarjeta, movimientos por cuenta |
| `js/plan.js` | Guía de transferencias por quincena |
| `js/home.js` | Pantalla de inicio (la predeterminada, `S.tab = 'home'`): saludo, fecha y frases |
| `js/notes.js` | Notas: grupos con campos propios (`FIELD_TYPES`), notas, búsqueda y etiquetas |
| `js/aviso.js` | Sonido (`alarm`, `prepAudio`), vibración y pantalla encendida (`keepAwake(dueño, on)`), compartidos por Pomodoro y Gimnasio |
| `js/pomodoro.js` | Temporizador Pomodoro (fases, aviso, Wake Lock) y pantalla completa negra (`#pomo-full`) |
| `js/gym.js` | Gimnasio: rutinas, entrenamiento en curso, descanso entre series, historial, progreso y catálogo de ejercicios |
| `js/catalogo.js` | `GROUPS`, `DEFAULT_EXERCISES` y `exKey()` (identidad de un ejercicio: nombre sin tildes/mayúsculas/espacios de más) |
| `js/bills.js` · `reports.js` · `purchases.js` · `habits.js` · `lists.js` · `data.js` | Pagos pendientes · reportes · compras · hábitos · listas y plantillas · respaldo/ajustes |
| `sw.js` | Service worker (network-first con respaldo offline) |

Cada módulo de vista exporta su vista, sus formularios y un objeto `actions`; `app.js` los une. Los datos se cargan **completos en memoria** al abrir; cada cambio se guarda en IndexedDB y se repinta la vista entera con `innerHTML`.

## Reglas que no hay que romper

**Dinero**
- Una categoría guarda **dinero real**, no presupuesto. Los saldos solo cambian por `effects(m)` de [state.js](js/state.js); `saveMove(old, neu)` revierte el efecto anterior y aplica el nuevo, y `deleteMove` lo revierte. Nunca modifiques `balance` a mano salvo en los formularios de cuenta/categoría.
- **Tarjetas de crédito**: son un *método de pago*. Un gasto con `card` solo suma deuda a la tarjeta; sus `parts` indican la categoría de la que saldrá el dinero y **no cambian su saldo**. Lo apartado por categoría **no se guarda**: se deriva del historial en `cardPending`/`reservedMap`. Pagar una tarjeta es una `transfer` (no cuenta como gasto en reportes). Las categorías de tarjetas no se ofrecen en los selectores de gasto/mover (`catSelect(..., { credit: false })`).
- Disponible para gastar = saldo − apartado (`availWithout`).
- Al editar un gasto no se re-reparte entre categorías, solo se ajustan montos.

**Caché y rendimiento**
- `sortedMoves()`, `cardPending()` y `reservedMap()` se cachean por `S.rev`. **Cualquier código que cambie movimientos o cuentas debe llamar a `bump()`** (`saveMove`, `deleteMove`, `saveAccount`, `loadState` ya lo hacen; si borras una cuenta u otra cosa por fuera, llámalo tú). No mutes el `Map` que devuelven.
- Las listas largas se paginan (30 en movimientos, 40 en compras). No pintes listas completas.

**Datos y compatibilidad**
- Base `mi-quincena` v8 (nombre interno heredado, **no lo renombres**: perdería datos guardados). Si añades un store o cambias esquema, sube la versión en `db.js` y migra en `onupgradeneeded`.
- Si añades campos a movimientos/cuentas/pagos/compras, actualiza `validateImport` y `buildExport` en [data.js](js/data.js). Los respaldos con `app: 'mi-quincena'` (nombre anterior) y `version: 2` se siguen aceptando.
- Los archivos adjuntos son Blobs en el store `files`; los registros guardan solo ids. `gcFiles()` borra los huérfanos: no los dejes referenciados desde un lugar que `gcFiles` no revise.
- Fechas como `'YYYY-MM-DD'` en hora local (helpers de `util.js`); nunca `toISOString()` para fechas de usuario.

**Interfaz**
- **Nada de emojis ni símbolos como iconos**: usa `icon('nombre')` de `icons.js`. El trazo toma el color de texto del tema (`var(--text)`); sobre el acento (`.btn.primary`, `.fab`, `.dot`) usa `--accent-ink`, y en los badges de color (`.h-ic`) el color del propio elemento. Añade el icono nuevo a `PATHS`.
- Toda acción es un `data-act="nombre"` en el HTML y una función con ese nombre en el `actions` del módulo. Tras la acción, `app.js` repinta si no hay un diálogo abierto.
- Diálogos con `modal(titulo, html, { onSubmit, onDelete, afterOpen, ... })`. `onSubmit` devuelve `false` para dejar el diálogo abierto. `modal()` cierra el diálogo previo, así que se puede abrir un formulario desde otro diálogo.
- En formularios usa `f.elements.nombre`, **no** `f.nombre` (`f.title`, `f.type`… chocan con propiedades del DOM).
- Escapa todo texto de usuario con `esc()`.
- **Tema Grafito** (oscuro, sobrio): neutros casi negros (`--base`, `--mantle` para tarjetas, `--crust` para campos, `--surface0..2`, `--line` para bordes finos) y **un solo acento** (`--accent`, con `--accent-ink` para el texto sobre él): botones primarios, FAB, foco, barras de progreso y enlaces. **No uses `--mauve` & co. para el chrome**: esos nombres (heredados de Catppuccin) son los **colores elegibles** de hábitos, listas y grupos (`var(--${color})` en el JS) y están atenuados; el color solo debe aparecer donde significa algo (rojo/verde/amarillo apagados = vencido/positivo/aviso). No hay tema claro. `tests/interfaz.py` comprueba el contraste de los pares clave (texto ≥ 7:1, el resto ≥ 4.5:1): si cambias un token, vuelve a correrla.
- **Fuente** (Configuración › Apariencia): `settings.font` = `'system'` (`--font-system`, la del teléfono; en Android suele ser Roboto) o `'jetbrains'` (JetBrains Mono, archivos en `fonts/` con su licencia OFL). `applyFont()` (`ui.js`) pone `data-font` en `<html>` y lo copia a `localStorage` para que `index.html` lo aplique desde el primer pintado; al elegir la monoespaciada baja el tamaño base (`font-size: 90%` en `:root`, todo lo demás usa `rem`). **Usa `var(--font)`/`rem`, no fijes `font-family` ni tamaños en px** en componentes nuevos, y comprueba que no haya desborde horizontal en 390 px con las dos fuentes (`tests/configuracion.py`). Los bloques de código siempre usan JetBrains Mono (`--font-jb`). Los `.woff2` no están en `SHELL`: el service worker los guarda al usarlos.
- Interfaz pensada para móvil (390 px), con áreas táctiles ≥ 44 px. Jerarquía con espacio y líneas finas (`.card` = relleno + borde `--line`), etiquetas de sección en mayúsculas pequeñas (`.overline`, `.slot-h`), botones de icono fantasma (`.icon` sin relleno; si necesitas relleno, añádelo explícitamente como `.note-row > .icon`).
- **Formularios como hoja inferior**: `dialog` va anclado abajo (ancho completo en móvil, máx. 520 px), con esquinas superiores redondeadas, asa y animación corta (respeta `prefers-reduced-motion`); `#viewer` queda a pantalla completa. No fijes alturas en el contenido de un `modal()`: la hoja tiene `max-height: 92dvh` y hace scroll.
- **Iconos de la app** (`icons/*.png`): se generaron renderizando `icons/icon.svg` con Playwright (fondo `#111317`, aro `#e8eaee`, palomita `--accent`); el maskable lleva la marca al 80 %. Si cambias la marca, regenera los tres PNG y `theme-color`/`background_color` (`index.html`, `manifest.webmanifest`); el nombre, icono y splash instalados solo cambian al reinstalar.
- **Orden alfabético** en Finanzas: cuentas y categorías se guardan ordenadas (`sortAccounts()` dentro de `saveAccount`, y al cargar), y las listas de nombres usan `byName`/`byText` de `util.js` (insensibles a tildes y mayúsculas, con números naturales). Si añades una lista de entidades nombradas, ordénala así; las listas con orden propio (movimientos y pagos por fecha, rankings por monto) no.
- **Hábitos**: `icon` (nombre de `HABIT_ICONS`), `slot` (`morning`/`day`/`night`/`''`) y `order` (único; se intercambia con el vecino del mismo `slot` al reordenar). `normalizeHabits()` en `state.js` asigna `order` a los antiguos. Si añades un icono elegible, agrégalo a `PATHS` y a `HABIT_ICONS`; `validateImport` ignora los que no existan.
- **Carrusel de hábitos**: cada momento del día es una tarjeta (`.slot-card`) dentro de `#hcar` (scroll horizontal con *scroll-snap*). `render()` reemplaza el `innerHTML` y eso reinicia el scroll, por eso `S.habitSlot` guarda la tarjeta visible y `restoreCarousel()` (llamada desde `app.js` tras pintar) la restaura; `onCarouselScroll` (listener de `scroll` en captura, porque no burbujea) lo mantiene al día y los botones superiores (`data-slotpill`, **no** son `data-act` para no repintar y poder animar el desplazamiento) llaman a `goSlot`. Los días anteriores se marcan desde el formulario de edición (tira `#wk`, que repinta la vista de fondo tras cada cambio).
- Un gasto **exige título**. El selector de categoría del gasto no asume nada: arranca vacío y ofrece solo categorías con dinero libre.

**Bandeja de notas rápidas** ([inbox.js](js/inbox.js))
- Store `inbox` (`{ id, text, t }`, sin grupo). Se anota en Inicio y se archiva después: tocar la nota abre un diálogo para **editarla, archivarla como nota de un grupo, agregarla como elemento adicional de una lista, o eliminarla**. Al archivar como nota **no se pierde texto**: el enlace va al campo de enlace del grupo, el resto al primer campo de texto largo/corto/código; si el grupo no tiene dónde guardar lo que no cabe en el título, avisa y no archiva (`noteFor()`).
- *Web Share Target*: `manifest.webmanifest` declara `share_target` (GET a `./` con `title`/`text`/`url`); `receiveShared()` en `app.js` lo guarda como nota rápida (sin repetir el enlace si ya viene en el texto), limpia la URL con `history.replaceState` y no duplica al recargar.

**Listas y plantillas** ([lists.js](js/lists.js))
- **Orden de la vista de listas** (`settings.listSort`: `recent`/`due`/`manual`): las **fijadas** (`l.pinned`) van siempre primero; «Por fecha» usa la próxima fecha límite pendiente; en **manual** (`l.order`, flechas `list-up`/`list-down` que intercambian con la vecina del mismo grupo fijadas/no fijadas) la primera vez se parte del orden que se estaba viendo (`settings.listManualSeeded`) y una lista nueva queda arriba. `l.sortDue` ordena los pendientes de esa lista por fecha límite (solo al pintar, en `sink()`). La pestaña **Agenda** agrupa todas las tareas con fecha (Vencidas/Hoy/Mañana/Esta semana/Más adelante) y reutiliza `taskRow()`.
- **Plantillas**: una línea que termina en `@N` (0–365) guarda `dueIn` y la lista creada pone `due = hoy + N`.
- Stores `templates` y `lists`. Al crear una lista se **copia** la plantilla (ids nuevos por elemento); después son independientes, así que editar o borrar una plantilla no toca las listas ya creadas. Los elementos `head: true` son encabezados de sección y no cuentan en el avance.
- Lo agregado a mano lleva `extra: true` y se pinta aparte en «Adicionales». «Todo marcado» se deriva (`isListDone` en `state.js`), pero **archivada es explícito**: `list.archived = 'YYYY-MM-DD'`, que solo pone la acción `list-finish` (botón «Finalizar lista», visible solo con todo marcado) y quita `list-restore`. Una lista archivada es de solo lectura en la interfaz.
- Elementos: `due` (fecha límite, se fija con el `<input type="date" data-change="li-due">` transparente sobre el icono de calendario: tocarlo abre el selector nativo) y `doneAt` (se pone al marcar y se borra al desmarcar). **Lo hecho baja al final de su sección solo al pintar** (`sink()`): el orden de `l.items` nunca cambia, así desmarcar lo devuelve a su lugar. Los eventos `change` de campos se despachan por `data-change` (`changes` de `lists.js` + `data.js` en `app.js`).
- **Migración única** (`archiveOldCompletedLists` en `state.js`, marca `settings.listsArchiveMigrated`): las listas que ya estaban completas antes de existir «Finalizar» se archivan solas con su fecha de creación. Por esa marca, importar un respaldo nuevo no re-archiva nada.
- «Ya toca» se deriva de la última `created` de las listas con ese `tplId` y de `freq`; no hay notificaciones.
- El campo de agregar es un `<form data-noform>` (`app.js` evita su envío) y tras agregar `S.focusNew` devuelve el foco al campo en el repintado.

**Inicio** ([home.js](js/home.js))
- La app abre en `S.tab = 'home'`. Inicio muestra: fecha (overline) y saludo, la frase, el campo de **nota rápida** (módulo [inbox.js](js/inbox.js)), cuatro tarjetas de media pantalla en `.tiles` (**Hábitos** de hoy, **Pagos** —`billsSummary()` en `bills.js`—, **Ejercicio** —`homeInfo()` de `gym.js`: cuenta **días** entrenados de los últimos 7 con un círculo `.mini` por día, el último es hoy; el entrenamiento en curso no cuenta— y `.tile-acts` con los botones Gasto/Ingreso/Mover = `new-exp`/`new-inc`/`new-xfer` de `money.js`). **Ya no hay tarjeta de dinero con saldo** (se quitó a propósito: no la repongas), ni de Pomodoro. Las tarjetas son solo lecturas (los botones solo abren formularios existentes); no guardes estado nuevo ahí. Después vienen la **Bandeja** (`S.inbox`) y **«Tareas de hoy»** (`todayTasks()`/`taskRow()` en `lists.js`: elementos pendientes de listas activas con `due <= hoy`; la casilla usa `agenda-toggle`, que fija `doneAt`, y el texto `agenda-open`). Son solo lecturas; no guardes estado nuevo ahí. Las pruebas que asumen Finanzas deben navegar con el menú (`#tabs [data-tab=money]`) tras cargar/recargar; la espera de carga es `#view .home`, no `#view .card`.
- La frase **no** se elige en `homeView()` (se repinta con cada acción, y cambiaría al abrir el menú): se elige con `nextQuote()` al iniciar, al elegir la pestaña Inicio, al tocar la frase y en `visibilitychange`. Es una bolsa mezclada (sin repetir hasta agotar `QUOTES`).

**Notas** ([notes.js](js/notes.js))
- Los grupos tienen `sort: 'alpha'` opcional (orden alfabético por título; por defecto, más recientes primero).
- Stores `noteGroups` (`fields: [{ id, name, type, list?, options? }]`) y `notes` (`values` indexado por **id de campo**, no por nombre: renombrar un campo no pierde datos). Solo se guardan valores con contenido (`has()`); los campos quitados se borran de las notas al guardar el grupo. Los tipos están en `FIELD_TYPES`, que `data.js` usa para sanear al importar: **si añades un tipo, hay que tratarlo en `short()`, `full()`, `fieldInput()` y el guardado de `noteForm`**.
- Los valores pueden no corresponder al tipo actual del campo (cambiar el tipo conserva los datos): `short()`/`full()`/`rate()` toleran valores raros y nunca deben lanzar.
- **Solo se enlazan URLs http(s)** (`safeUrl`); los demás esquemas (`javascript:`) se muestran como texto. Todo texto de usuario va con `esc()`, también en `aria-label` y atributos.
- El buscador (`#nsearch`) repinta solo `#nlist` (como `#psearch` en Compras). Los botones de estrella del formulario no son `data-act`: se manejan con un listener dentro del diálogo.
- En la vista de un grupo la barra superior tiene «volver» en lugar del menú: las pruebas deben volver (`note-back`) antes de usar el menú.

**Pomodoro** ([pomodoro.js](js/pomodoro.js))
- Estado en `S.settings.pomo` (`cfg`, `run`, `day`), así que viaja en el respaldo sin tocar `data.js`. **`cfg()` y `run()` corrigen cualquier valor inválido al leerlo** (un respaldo manipulado no debe dejar la cuenta en cero).
- La cuenta se **deriva de `run.endsAt`** (hora absoluta), nunca de un contador: sobrevive a temporizadores atrasados, recargas y app cerrada. El `setInterval` solo repinta `[data-pomo-clock]`/`[data-pomo-bar]` (no hace `render()` completo salvo al cambiar de fase) y se detiene solo cuando no hay `endsAt`.
- `resume()` (al iniciar o importar) continúa el temporizador, o si terminó con la app cerrada avanza **sin sonar**. La vibración solo se intenta tras un toque (`navigator.userActivation`): Chrome la bloquea y deja un error en consola si no.
- La pantalla completa es un `<div id="pomo-full">` fuera de `#view` (sobrevive a los repintados) con `data-act="pomo-exit"`; solo debe contener el contador (la prueba lo exige). Mantiene Wake Lock mientras corre.
- No hay pestaña de Tareas: las tareas se llevan con Listas.
- Los avisos con la pantalla bloqueada no son posibles como PWA (sin servidor push); el diseño asume que la pantalla se queda encendida (Wake Lock). No se contempla una versión APK.

**Gimnasio** ([gym.js](js/gym.js))
- Stores `routines` (plantillas: `exercises: [{ name, sets, reps, weight, rest? }]`) y `workouts` (`exercises: [{ id, name, rest?, sets: [{ reps, weight, done, at? }] }]`). Empezar una rutina **copia** (como Listas); un `workout` sin `end` está en curso y **solo puede haber uno** (`active()`; el import deja el más reciente y cierra los demás). Al terminar se **quitan las series sin marcar** y los ejercicios que quedan vacíos.
- El descanso vive en `S.settings.gym` (`cfg: { unit: 'kg'|'lb', rest }`, `rest: { endsAt, total }`) y, como en el Pomodoro, **se deriva de `endsAt`**; `cfg()` y `rest()` corrigen cualquier valor inválido al leerlos. `resume()` (en `init()` y al importar) continúa o, si terminó con la app cerrada, lo quita **sin sonar**. El `setInterval` solo repinta `[data-rest-clock]`/`[data-rest-bar]`.
- **Pantalla encendida compartida**: `keepAwake('pomodoro'|'gym', on)` guarda quién la necesita y la suelta cuando ya nadie. No uses `navigator.wakeLock` directo.
- Los campos de peso y repeticiones se despachan por `data-change` (`gym-w`/`gym-r`) y **devuelven `false` para que `app.js` no repinte**: si repintara, la casilla de marcar que se toca justo después se perdería. `gym-set` además lee los valores de la fila al marcar. Los ejercicios se identifican por nombre normalizado (`key()`): de ahí salen «Última vez», récords y Progreso (`progressMap()`).
- **Catálogo** (store `exercises`: `{ id, name, group }`): los ejercicios **se eligen, nunca se escriben a mano** (`exerciseSelect()`: `<select>` por grupo en el editor de rutinas por filas, en «Agregar ejercicio» y en las opciones del ejercicio). Las rutinas y los entrenamientos guardan el **nombre** (no un id), así el historial sobrevive aunque el ejercicio salga del catálogo; la identidad es `exKey(nombre)`. Renombrar en el catálogo lo propaga a rutinas y entrenamientos (`renameEverywhere`); no se admiten nombres repetidos y **no se puede eliminar** uno que esté en una rutina. Un nombre que ya no está en el catálogo se ofrece igual, marcado «(fuera del catálogo)», para no perderlo al guardar. La pantalla es `S.gymSub = 'catalog'` (sin la barra de secciones; el topbar lleva volver y +); el buscador `#gsearch` repinta solo `#gcat`.
- **Siembra única** (`seedExercises` en `state.js`, marca `settings.gymCatalogSeeded`): carga `DEFAULT_EXERCISES` más los nombres que ya usaban rutinas e historial (en «Otro»). Lo que se borre del catálogo **no vuelve**. Al importar o borrar todo hay que quitar la marca de `S.settings` en memoria antes de `loadState()` (ya lo hacen `doImport`, `validateImport` y `wipe`); un respaldo sin la marca se vuelve a sembrar. Si añades un grupo, ponlo en `GROUPS` (los inválidos pasan a «Otro» al importar).
- `sanitizeRoutines`/`sanitizeWorkouts`/`sanitizeExercises` (usadas por `validateImport`) acotan series, repeticiones y pesos. **Si añades un campo a rutinas o entrenamientos, actualiza ambas.**

**Hojas inferiores y teclado**
- `index.html` declara `interactive-widget=resizes-content` en el viewport: sin eso Chrome en Android solo encoge el viewport *visual* y el teclado tapa la hoja anclada abajo. Con él, `max-height: 92dvh` sigue el área visible y la hoja hace scroll. `ui.js` además acerca al centro el campo que recibe el foco. No se puede probar el teclado real en Chromium de escritorio: `tests/gimnasio.py` solo comprueba que el viewport lo declare.

**Compartir respaldo**
- `navigator.share` solo acepta ciertos tipos de archivo y **gasta el permiso en el primer intento** (no se puede reintentar). Por eso se comparte como `text/plain` (`.json.txt`) y, ante cualquier fallo distinto de `AbortError` (o si no hay soporte), el respaldo se **descarga** y se avisa el motivo. El importador acepta `.json` y `.txt`. Se usa Chrome en Android; las pruebas simulan Web Share.

**Instalación / splash**
- El nombre y el icono de la app instalada y el *splash* del sistema salen del manifiesto **al instalar**: tras cambiar nombre o iconos hay que desinstalar y reinstalar en el teléfono. `index.html` trae una pantalla de carga propia (`.boot`) que reemplaza la primera vista; mantenla alineada con el logo.

**Arranque (no debe quedarse mudo en el logo)**
- `db.js` abre la base con `onblocked` (evento `db-blocked` → `app.js` explica que hay otra ventana con la versión anterior; la apertura sigue esperando y continúa sola) y `onversionchange` (cierra y recarga). **Cada vez que subas la versión de la base, una ventana vieja (sin este código) seguirá bloqueando hasta cerrarse**: es esperable, y por eso existe el aviso.
- `index.html` trae un *watchdog* en script clásico (no depende de los módulos): a los 10 s (`window.__bootWatchdogMs` en pruebas) reemplaza el logo por «Tracker no pudo iniciar» con el último error y los botones Reintentar / Actualizar la app. `init()` captura también los errores de `render()`.
- **Inicio es la primera pantalla**: sus secciones van envueltas en `safe()` para que un dato raro omita esa parte en vez de impedir que la app abra. Mantén ese patrón si agregas secciones a Inicio. `tests/arranque.py` cubre estos casos.

**Service worker**
- **Red lenta**: solo en las navegaciones, si la red tarda más de 3 s y hay copia, se abre con la copia y durante 30 s (`slowUntil`) todo sale de la copia (así no se mezclan versiones); en segundo plano se vuelve a descargar. Sin copia (primera visita) espera a la red. `tests/sw.py` lo prueba con un servidor lento.
- El `fetch` del service worker usa `cache: 'no-cache'` (revalida con el servidor): sin eso la caché HTTP de GitHub Pages (10 min) puede mezclar módulos viejos y nuevos tras publicar y dejar la app sin arrancar.
- Si añades un archivo `.js`/`.css`, agrégalo a `SHELL` en [sw.js](sw.js) y sube el nombre de `CACHE`.
- Si añades un archivo `.js` también agrégalo a los `<link rel="modulepreload">` de [index.html](index.html) (descarga los módulos en paralelo; sin ellos el arranque por red es más lento). `tests/smoke.py` falla si `js/`, `SHELL` y `index.html` no coinciden.
- Antes de "optimizar" el código de datos, mide: la revisión de oct 2026 mostró que, salvo la lectura de IndexedDB, todo está por debajo de 100 ms con 60,000 movimientos (ver «Rendimiento» en [Documentacion.md](Documentacion.md)).

## Pruebas

Las pruebas e2e de `tests/` dependen de textos visibles y de `data-act`; al cambiar la interfaz actualiza las aserciones. **Toda función nueva debe llevar su prueba** (o ampliar una existente) y pasar `tests/run_all.py`. Para comprobar visualmente, haz capturas con Playwright y revísalas (se guardan en la carpeta temporal `tracker-shots/`).

Estado: probado en Chromium de escritorio con teléfono simulado; **falta validar en un Android real**.

## Flujo de trabajo y Git

- Rama `main`, remoto `origin` = `https://github.com/HancelLeonel/Tracker.git`.
- **El usuario hace el `push` manualmente** (no hay credenciales de GitHub en esta máquina). Haz commit cuando te lo pida; no intentes el push salvo que lo pida explícitamente.
- Mensajes de commit en español, con resumen + lista de cambios, y la línea `Co-Authored-By` indicada por el entorno.
- Mantén [Documentacion.md](Documentacion.md) y este archivo al día cuando cambie el comportamiento o las reglas.

## Pendientes (actualizado el 12 oct 2026)

**Validación en Android real** (el resto se probó solo en Chromium de escritorio con teléfono simulado)
- ✅ Carrusel de hábitos con el dedo: probado en Android.
- ✅ Calendario de fechas límite en Listas: probado en Android.
- ✅ Copiar en Notas: probado en Android.
- ✅ Probado en Android: Pomodoro, fuente JetBrains Mono, nota rápida, orden manual y fijado de listas, *Web Share Target* y arranque tras actualizar la base.
- ⬜ **Hojas inferiores con el teclado abierto**: el teclado las tapaba; se corrigió con `interactive-widget=resizes-content` (ver arriba) y **falta confirmarlo en el teléfono**. Cierra las demás ventanas de Tracker antes de abrir la versión nueva (base v7).
- ⬜ **Gimnasio** completo en el teléfono: descanso con sonido y vibración, pantalla encendida, escribir pesos con el teclado numérico y marcar series con el dedo. Para ver el icono y el *splash* nuevos hay que desinstalar y reinstalar.

**Siguiente en el menú**
- Nada fijo. Ideas para Gimnasio: editar un entrenamiento ya terminado, reordenar ejercicios, una tarjeta en Inicio con el entrenamiento en curso, notas por serie.

**Ideas opcionales**
- Tema claro automático (descartado por ahora; las variables CSS ya lo permitirían).
- Notas: archivar varias notas rápidas a la vez; sugerir el grupo según el contenido (si es un enlace, el grupo con campo de enlace).
- Datos dañados: Inicio (`safe()`) y los pagos (`pending()`) ya los toleran; falta revisar otras pantallas (hábitos con `dates` nulo, etc.).

**Decisiones tomadas**
- Navegador de uso: **Chrome** en Android (se dejó de usar Brave).
- **No habrá APK**: se descartó (10 oct). Los avisos con la pantalla bloqueada no son posibles como PWA; el diseño asume pantalla encendida.
- No hay pestaña de **Tareas**: se llevan con Listas.
- Sin sincronización entre dispositivos ni varios usuarios.

## Contexto de producto (decisiones ya tomadas)

- Al usuario le pagan **quincenalmente**; el dinero entra a **una cuenta** y él lo reparte a mano a otras cuentas/efectivo. La **Guía** lista las transferencias pendientes de cada quincena y mide el avance con las transferencias registradas (no reparte nada automáticamente).
- Cada gasto tiene doble categoría: **categoría apartada** (de qué dinero sale) y **tipo de gasto** (en qué se usó).
- Pocos adjuntos (≤ 5 al mes): no hace falta optimizar el almacenamiento de archivos.
- Respaldo: exportar/importar JSON; los adjuntos van solo si se marca «Incluir archivos adjuntos». Importar **reemplaza** todo.
- Fuera de alcance por ahora: sincronización entre dispositivos, varios usuarios.
