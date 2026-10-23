# Rediseño de UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar de sección con un toque (barra inferior), poder marcar hábitos y tareas desde Inicio, y dar a la app una jerarquía y respuesta visual propias, con color por sección fácil de revertir.

**Architecture:** Solo capa de presentación: `app.js` (barra, «Más», despacho), `home.js` (Inicio), `money.js` (movimientos por día), `css/style.css` (tokens, `--sec`, movimiento). Sin archivos `.js` nuevos (no se toca `SHELL`/`modulepreload`). Las acciones que no deben repintar la vista entera van en una tabla `quiet` que el despachador de clics consulta antes que `actions`.

**Tech Stack:** Vanilla JS + CSS, Playwright (Python) para las pruebas e2e.

**Spec:** `docs/superpowers/specs/2026-10-23-rediseno-ux-design.md`

## Global Constraints

- Texto de interfaz, comentarios y docs en **español**; moneda `Q`.
- **Nada de emojis ni símbolos como iconos**: `icon('nombre')`; los iconos nuevos se añaden a `PATHS` de `icons.js`.
- **CSS solo con tokens**, nunca colores fijos (el tema claro se rompe). Componentes usan `var(--sec)`; los colores por sección viven en **un único bloque** de `style.css` rotulado `/* ── Color por sección ── */`.
- Áreas táctiles ≥ 44 px; sin desborde horizontal a 390 px con las dos fuentes (`system` y `jetbrains`).
- Texto de usuario siempre con `esc()`. Fechas `'YYYY-MM-DD'` locales (helpers de `util.js`).
- No cambia nada de `state.js`, `db.js`, `data.js` (modelo, respaldo), `sync.js`, `sw.js`, ni `gym.js`.
- Cada prueba nueva se registra en `TESTS` de `tests/run_all.py`; abre su propio navegador, espera al servidor con `from _servidor import espera; espera()`.
- Barra: `Inicio` + los 3 primeros de `applyOrder(TABS sin 'home', settings.tabOrder)` + `Más`. Movimiento: casilla 180 ms, barra 250 ms, `scale(.97)` al pulsar, todo anulado con `prefers-reduced-motion`.
- Commit y `push` a `main` **una sola vez, al final** (autorizado por el usuario), con `Co-Authored-By` del entorno, solo si `tests/run_all.py` pasa completo.

## Review Focus

- Orden de menú personalizado (p. ej. `data` o `home` entre los primeros): la barra siempre trae Inicio una vez, 3 destinos sin repetir y «Más» con el resto. → Task 1.
- Respaldo viejo con `homeOrder`/`tileOrder` que incluye `'gym'`, `'habits'`, `'quote'`…: Inicio abre igual. → Task 3.
- Hábito en estado «no toca» (`2`) marcado desde Inicio: cicla como en Hábitos y no cuenta en «n de N». → Task 3.
- Sin hábitos o sin tareas: Inicio muestra un estado vacío con acción, no un hueco. → Task 3.
- 390 px con JetBrains Mono: la barra de 5 destinos no desborda. → Task 1.
- Con la hoja «Más» abierta, tocar un destino cierra la hoja y navega. → Task 1.

---

### Task 1: Barra inferior y hoja «Más» (sin cajón)

**Files:**
- Modify: `index.html` (quitar `#scrim`, `#drawer`; añadir `<nav id="nav" aria-label="Secciones"></nav>` tras `#view`)
- Modify: `js/app.js` (`topbar`, `render`, `actions.tab`, `menuOpen` fuera, `Escape`), `js/ui.js` (`navTabs`)
- Modify: `css/style.css` (borrar `#scrim`, `#drawer`, `.drawer-h`, `#tabs`; añadir `#nav`, `.more-list`; `.fab`, `#view` relleno)
- Create: `tests/_nav.py`, `tests/navegacion.py`
- Modify: `tests/run_all.py` (registrar `navegacion`)

**Interfaces:**
- Produces (`ui.js`): `navTabs(): { bar: TabRow[], more: TabRow[] }` donde `TabRow = [key, name, icon]`; `bar` = Inicio + 3 primeros de `orderedTabs()` sin Inicio; `more` = el resto.
- Produces (`tests/_nav.py`): `ir(page, tab)` — toca `#nav [data-tab=tab]` si existe; si no, `#nav [data-act=more]` y luego `#dlg [data-tab=tab]`; espera 60 ms.
- DOM: `#nav` con un `button[data-act=tab][data-tab]` por destino de la barra y un `button[data-act=more]` al final; el activo lleva `.on` (y «Más» lleva `.on` si la pestaña actual está en `more`).

- [ ] **Step 1: Escribir `tests/navegacion.py` (falla)** con estas comprobaciones sobre un teléfono 390×800: la barra tiene 5 botones (`Inicio, Finanzas, Hábitos, Listas, Más`) con el orden por defecto; un toque en `Hábitos` cambia `#topbar h1` a «Hábitos» y marca `.on`; «Más» abre `#dlg` con `Compras, Pomodoro, Gimnasio, Notas, Configuración` y tocar `Notas` cierra el diálogo y muestra «Notas» con «Más» en `.on`; con `settings.tabOrder = ['data','notes','home', …]` guardado, la barra es `Inicio, Configuración, Notas, Finanzas, Más` sin repetidos; no existe `#drawer` ni `[data-act=menu-open]`; con `html[data-font=jetbrains]` `document.documentElement.scrollWidth <= innerWidth` y cada botón de la barra mide ≥ 44 px de alto; con `#dlg` abierto la barra queda tapada (diálogo modal).
- [ ] **Step 2: Ejecutar** `.venv/bin/python tests/navegacion.py` — esperado: FAIL (no existe `#nav`).
- [ ] **Step 3: Implementar `navTabs()` en `ui.js`** y `renderNav()` en `app.js` (se llama desde `render()` tras pintar la vista); `actions.tab` cierra `#dlg` si está abierto y ya no llama a `menuOpen`; `actions.more` abre `modal('Más', …)` sin `onSubmit` con un `<div class="more-list">` de botones `data-act="tab" data-tab` (icono + nombre, ≥ 52 px). Quitar `menuOpen`, `menu-open`, `menu-close`, el `keydown` de Escape para el menú y las referencias a `#drawer` en `render()`. `topbar(title, action)` ya no lleva hamburguesa (título con `padding-left: 16px`). Las vistas de detalle conservan su botón «volver».
- [ ] **Step 4: CSS.** `#nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 6; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding-bottom: env(safe-area-inset-bottom); background: color-mix(in srgb, var(--mantle) 96%, transparent); border-top: 1px solid var(--line) }`; botones de 56 px con icono sobre etiqueta pequeña, activo con pastilla `color-mix(in srgb, var(--sec) 18%, transparent)` y trazo `var(--sec)`. `.fab { bottom: calc(72px + env(safe-area-inset-bottom)) }` y `#view` relleno inferior `calc(150px + env(safe-area-inset-bottom))`. `#toast` y `#upd` suben por encima de la barra (`bottom: calc(72px + …)`). `#pomo-full` debe quedar sobre la barra (verificar su `z-index`).
- [ ] **Step 5: Crear `tests/_nav.py` con `ir()`**, registrar `navegacion` en `run_all.py`, ejecutar `tests/navegacion.py` — esperado: PASS.
- [ ] **Step 6: Migrar las pruebas existentes al ayudante.** En las 28 pruebas que usan `menu-open`/`#tabs`/`menu-close`/`#drawer`, sustituir el patrón «abrir menú + tocar pestaña» por `ir(page, 'tab')` (`from _nav import ir`); reescribir a mano las que prueban el cajón en sí (`interfaz.py`, `orden_menu.py`, el bloque del menú de `inicio.py`) para comprobar la barra y «Más» (en `orden_menu.py`, que Configuración › Orden cambie los 3 destinos de la barra). Ejecutar `.venv/bin/python tests/run_all.py -j 8` — esperado: las que no dependen de Inicio/estilo en verde; las que fallen por textos de Inicio se arreglan en Task 3.
- [ ] **Step 7: Capturas** a 390 px de Inicio, Finanzas y la hoja «Más» en tema oscuro y claro; revisarlas.

### Task 2: Sistema visual (tokens, color por sección, movimiento)

**Files:**
- Modify: `css/style.css`, `js/app.js` (`document.body.dataset.sec = S.tab` en `render()`; quitar `enter`/`#view.enter`)
- Modify: `tests/interfaz.py` (pares de contraste de `--sec` sobre `--accent-ink` en los dos temas; sin `text-transform: uppercase` en `.overline`)
- Test: `tests/estilo.py` (nuevo, registrar en `run_all.py`)

**Interfaces:**
- Produces (CSS): `--sec` (en `:root` = `var(--accent)`); `--r-ctl: 12px`, `--r-sheet: 20px`; clase `.pop` (rebote 180 ms para `.dot.on`/`.chk`); bloque `/* ── Color por sección ── */` con `body[data-sec="money"] { --sec: var(--teal) }`, `habits` → `var(--yellow)`, `lists` → `var(--blue)`.

- [ ] **Step 1: Escribir `tests/estilo.py` (falla).** Con `S.tab` en cada sección: `getComputedStyle(document.body).getPropertyValue('--sec')` resuelto igual a `--teal`/`--yellow`/`--blue` en money/habits/lists y a `--accent` en home/notes; `.btn.primary` en Finanzas usa el fondo de `--sec`; ningún elemento visible tiene `text-transform: uppercase` (recorrer `#view *`, `#nav *`); `.overline` mide ≥ 0.8 rem; con `prefers-reduced-motion: reduce` (contexto de Playwright) `.dot` y `.btn` no tienen transición ni animación; **revertir el color**: eliminando por JS la hoja del bloque (o `document.body.dataset.sec = ''`) `--sec` vuelve a ser `--accent`.
- [ ] **Step 2: Ejecutar** `.venv/bin/python tests/estilo.py` — esperado: FAIL.
- [ ] **Step 3: Implementar en `style.css`.** (a) Tokens y bloque de color por sección. (b) `.btn.primary`, `.fab`, `.bar i`, `.seg button.on`, `.slot-pills button.on`, `#nav` activo y `.pk-o.on .i` pasan a `var(--sec)`; el foco (`outline`) sigue en `--accent`. (c) Quitar mayúsculas y tracking de `.overline`, `.slot-h`, `.summary small`, `.pomo-phase b`: `.overline` queda en `font-size: .9rem; font-weight: 600; color: var(--subtext1)`. (d) Radios: `.btn` y `input` usan `--r-ctl`; `dialog`/`.pk` usan `--r-sheet`. (e) Movimiento: `transition: transform .08s` y `:active { transform: scale(.97) }` en `.btn, .dot, .chk, .move, .li, .tile, .list-card`; `.bar i { transition: width .25s }`; `@keyframes pop { 40% { transform: scale(1.18) } }` y `.pop { animation: pop .18s }`; todo dentro de `@media (prefers-reduced-motion: no-preference)`. (f) Eliminar `#view.enter` y `view-in`.
- [ ] **Step 4: Ejecutar** `tests/estilo.py` y `tests/interfaz.py` (contraste, dos temas) — esperado: PASS. Si algún par de `--sec` no llega a 4.5:1, ajustar a otro token existente (no a un color fijo).
- [ ] **Step 5: Capturas** de Finanzas, Hábitos, Listas y Notas en oscuro y claro; revisar.

### Task 3: Inicio accionable

**Files:**
- Modify: `js/home.js` (`homeView`, `todayBlock`, `HOME_BLOCKS`, `HOME_TILES`, `quiet`), `js/habits.js` (exportar `setDay`, `cls`, `mark`, `label`, `groups`), `js/lists.js` (`taskRow(list, item, act = 'agenda-toggle')`, `quiet`-compatible), `js/app.js` (despachar `quiet`), `css/style.css`
- Test: `tests/inicio.py`, `tests/inicio_resumen.py`, `tests/bandeja.py`, `tests/orden_menu.py` (actualizar), `tests/inicio_accionable.py` (nuevo, registrar)

**Interfaces:**
- Produces (`home.js`): `quiet: Record<string, (el: HTMLElement) => Promise<void>>` con `'home-habit'` (alterna el estado de `el.dataset.id` hoy con `setDay`, guarda con `saveHabit`, reemplaza solo `#today-habits` y añade `.pop` al botón tocado) y `'home-task'` (alterna `done`/`doneAt` del elemento `el.dataset.id` de la lista `el.dataset.list`, guarda con `saveList`, actualiza fila y contador sin repintar). `HOME_BLOCKS = [['tasks','Tareas de hoy'], ['tiles','Pagos y accesos'], ['quick','Nota rápida'], ['inbox','Bandeja'], ['quote','Frase']]`; `HOME_TILES = [['bills','Pagos'], ['actions','Gasto, Ingreso y Mover']]`. El bloque «Hoy» (hábitos) va **fijo** justo bajo el saludo y no es reordenable.
- Consumes (`app.js`): el despachador consulta `quiet[el.dataset.act]` antes que `actions` y, si existe, la ejecuta y **no** repinta.

- [ ] **Step 1: Escribir `tests/inicio_accionable.py` (falla).** Con datos importados (6 hábitos en 3 momentos, 2 tareas de hoy, 1 pago vencido): «Hoy» muestra los 6 hábitos a la vez y «n de N»; tocar la casilla de uno cambia `aria-pressed` y el contador **sin** que `#view` se reemplace (guardar una referencia a un nodo ajeno, p. ej. `.home-top h2`, y comprobar que sigue conectado) ni cambie `window.scrollY`; recargar conserva el cambio; el segundo toque pasa a «no toca» y el tercero a sin marcar, y «n de N» no cuenta el «no toca» (valor `2`); marcar una tarea la tacha y baja el contador de «Tareas de hoy» sin repintar y persiste; no existe tarjeta de Ejercicio ni `[data-act=home-gym]`; sin hábitos aparece «Crea tu primer hábito» con botón a `new-habit`; sin tareas «Nada pendiente para hoy.»; con `settings.homeOrder = ['quote','quick','tiles','inbox','tasks']` y `settings.tileOrder = ['gym','habits','bills','actions']` guardados, Inicio abre sin errores de consola y «Hoy» sigue siendo lo primero tras el saludo; sin desborde a 390 px.
- [ ] **Step 2: Ejecutar** — esperado: FAIL.
- [ ] **Step 3: Implementar.** `todayBlock()` envuelto en `safe()`: `<section class="card today-habits" id="today-habits">` con encabezado «Hoy» + «n de N» + barra, y las filas ordenadas con `groups().all` (momento del día, luego `order`), cada una con icono del hábito (`badge`), nombre y botón `.dot` con `data-act="home-habit" data-id`. `homeView()`: fecha como texto atenuado (no `.overline`), saludo, `todayBlock()`, luego los bloques reordenables. Pagos: una línea `.home-line` («3 pagos vencidos ›», `data-act="home-bills"`) solo si hay vencidos o vence en ≤ 3 días; los tres botones de `moneyActions()` en fila compacta. Quitar `gymTile`/`habitsTile` de `home.js` y el import de `gym.js`; `home-gym` se elimina de `actions`. La frase pasa a `.home-quote.quiet`: texto pequeño atenuado al final. `app.js`: `const q = el && quiet[el.dataset.act]; if (q) return void await q(el);` antes de `actions`.
- [ ] **Step 4: Ejecutar** `tests/inicio_accionable.py` — esperado: PASS. Actualizar `inicio.py`, `inicio_resumen.py`, `bandeja.py` y `orden_menu.py` a la nueva estructura (sin tarjetas Hábitos/Ejercicio, orden por defecto nuevo) y ejecutarlos — esperado: PASS.
- [ ] **Step 5: Capturas** de Inicio con datos y vacío, oscuro y claro; revisar.

### Task 4: Finanzas — movimientos por día y rojo solo en problemas

**Files:**
- Modify: `js/money.js` (lista de movimientos de la vista de cuentas, líneas ~39–64; `accountMovesDialog` ~145), `css/style.css`
- Test: `tests/finanzas_dias.py` (nuevo, registrar); revisar `tests/paginacion_y_cache.py`, `tests/flujo_completo.py`, `tests/tarjetas.py`

**Interfaces:**
- Produces (`money.js`): `dayLabel(date: string): string` → `'Hoy'`, `'Ayer'` o `fmtDate(date)`; `groupByDay(moves): [label, Move[]][]` respetando el orden dado.

- [ ] **Step 1: Escribir `tests/finanzas_dias.py` (falla).** Con 25 gastos en días distintos y 2 el mismo día: hay un encabezado por día («Hoy», «Ayer», «21 oct»…) y los del mismo día quedan bajo uno solo; cada fila tiene título y monto en la primera línea y «Cuenta · Categoría» (más el tipo si lo hay) completos en la segunda (`scrollWidth <= clientWidth`, sin `text-overflow` cortando a 390 px); el monto de un gasto **no** tiene la clase `out` en rojo (color = `--text`), el de un ingreso es verde y un saldo negativo de categoría sigue en rojo; «Ver más» sigue paginando de a 30 y respeta los encabezados; con el `+` flotante visible, el último lápiz de categoría no queda tapado (`elementFromPoint` en su centro devuelve el propio botón tras hacer scroll al final).
- [ ] **Step 2: Ejecutar** — esperado: FAIL.
- [ ] **Step 3: Implementar `dayLabel`/`groupByDay`** y usarlos en la vista de cuentas y en `accountMovesDialog`; la sección «Movimientos» deja de ser `.card` (lista plana con encabezados de día `.day-h`). `.move .amt.out` pasa a `color: var(--text)`; `.in` sigue verde. Fila a dos líneas con `<small>` completo y `overflow-wrap: anywhere`.
- [ ] **Step 4: Ejecutar** `tests/finanzas_dias.py`, `paginacion_y_cache.py`, `flujo_completo.py`, `tarjetas.py` — esperado: PASS (ajustar aserciones que dependan del markup anterior).
- [ ] **Step 5: Capturas** de Finanzas con datos, oscuro y claro; revisar.

### Task 5: Pulido de Hábitos y Listas, documentación y publicación

**Files:**
- Modify: `css/style.css` (Hábitos/Listas con `--sec` y `.pop` en `.dot.on` y `.chk`), `js/habits.js` y `js/lists.js` (añadir `.pop` al marcar solo si el repintado conserva el nodo; si no, omitir), `CLAUDE.md`, `Documentacion.md`
- Test: `tests/run_all.py` completo

- [ ] **Step 1: Aplicar el pulido** que no requiera reestructurar (colores por `--sec`, barras animadas, filas con `scale`); si algo exige tocar la estructura, dejarlo anotado en `Documentacion.md` como pendiente y no hacerlo.
- [ ] **Step 2: Actualizar `CLAUDE.md`:** tabla de estructura (sin cajón; barra en `app.js`), reglas de **Interfaz** (sustituir «un solo acento / no uses `--mauve`…» por `--sec` y el bloque revertible, «sin etiquetas en mayúsculas», radios por función, movimiento), **Orden del menú e Inicio** (barra = Inicio + 3 primeros de `tabOrder`; «Hoy» fijo; `HOME_BLOCKS`/`HOME_TILES` nuevos; `quiet`), **Inicio** (sin tarjeta de Ejercicio; marcar en el sitio), pruebas (`_nav.py`, `ir()`), y el pendiente «Gimnasio se rehará después». Actualizar `Documentacion.md` en lo que describa navegación e Inicio.
- [ ] **Step 3: Ejecutar** `.venv/bin/python tests/run_all.py` — esperado: todas PASS, `errors: []`, `FALLAS: []`; `tests/smoke.py` debe seguir verde (no se añadieron `.js`).
- [ ] **Step 4: Revisión visual final** a 390 px: Inicio, Finanzas, Hábitos, Listas, Notas, «Más», Configuración; en oscuro y claro y con las dos fuentes; sin desborde, sin superposición del `+` con la barra.
- [ ] **Step 5: Commit y push (una vez).** `git add -A` de los archivos del rediseño (incluido `docs/superpowers`), commit en español con resumen + lista de cambios y la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git push origin main`. Decirle al usuario que la versión se ve en la **segunda apertura** o con «Actualizar», y que Gimnasio quedó intacto.
