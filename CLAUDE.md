# CLAUDE.md — Tracker

PWA personal para Android (finanzas por quincena, hábitos, compras). **Vanilla JS + IndexedDB, sin build ni dependencias**, publicada en GitHub Pages. Todo el texto de la interfaz, los comentarios y la documentación están en **español**; moneda en quetzales (`Q`). La documentación de usuario/proyecto completa está en [Documentacion.md](Documentacion.md): léela antes de cambiar comportamiento de finanzas.

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
| `js/bills.js` · `reports.js` · `purchases.js` · `habits.js` · `data.js` | Pagos pendientes · reportes · compras · hábitos · respaldo/ajustes |
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
- Base `mi-quincena` v3 (nombre interno heredado, **no lo renombres**: perdería datos guardados). Si añades un store o cambias esquema, sube la versión en `db.js` y migra en `onupgradeneeded`.
- Si añades campos a movimientos/cuentas/pagos/compras, actualiza `validateImport` y `buildExport` en [data.js](js/data.js). Los respaldos con `app: 'mi-quincena'` (nombre anterior) y `version: 2` se siguen aceptando.
- Los archivos adjuntos son Blobs en el store `files`; los registros guardan solo ids. `gcFiles()` borra los huérfanos: no los dejes referenciados desde un lugar que `gcFiles` no revise.
- Fechas como `'YYYY-MM-DD'` en hora local (helpers de `util.js`); nunca `toISOString()` para fechas de usuario.

**Interfaz**
- **Nada de emojis ni símbolos como iconos**: usa `icon('nombre')` de `icons.js` (trazo blanco). Añade el icono nuevo a `PATHS`. Solo sobre fondos pastel (`.btn.primary`, `.fab`, `.dot`) el trazo es oscuro.
- Toda acción es un `data-act="nombre"` en el HTML y una función con ese nombre en el `actions` del módulo. Tras la acción, `app.js` repinta si no hay un diálogo abierto.
- Diálogos con `modal(titulo, html, { onSubmit, onDelete, afterOpen, ... })`. `onSubmit` devuelve `false` para dejar el diálogo abierto. `modal()` cierra el diálogo previo, así que se puede abrir un formulario desde otro diálogo.
- En formularios usa `f.elements.nombre`, **no** `f.nombre` (`f.title`, `f.type`… chocan con propiedades del DOM).
- Escapa todo texto de usuario con `esc()`.
- Paleta Catppuccin Macchiato vía variables CSS (`--mauve`, `--base`…). Interfaz pensada para móvil (390 px), con áreas táctiles ≥ 44 px.
- **Orden alfabético** en Finanzas: cuentas y categorías se guardan ordenadas (`sortAccounts()` dentro de `saveAccount`, y al cargar), y las listas de nombres usan `byName`/`byText` de `util.js` (insensibles a tildes y mayúsculas, con números naturales). Si añades una lista de entidades nombradas, ordénala así; las listas con orden propio (movimientos y pagos por fecha, rankings por monto) no.
- **Hábitos**: `icon` (nombre de `HABIT_ICONS`), `slot` (`morning`/`day`/`night`/`''`) y `order` (único; se intercambia con el vecino del mismo `slot` al reordenar). `normalizeHabits()` en `state.js` asigna `order` a los antiguos. Si añades un icono elegible, agrégalo a `PATHS` y a `HABIT_ICONS`; `validateImport` ignora los que no existan.
- Un gasto **exige título**. El selector de categoría del gasto no asume nada: arranca vacío y ofrece solo categorías con dinero libre.

**Compartir respaldo**
- `navigator.share` solo acepta ciertos tipos de archivo y **gasta el permiso en el primer intento** (no se puede reintentar). Por eso se comparte como `text/plain` (`.json.txt`) y, ante cualquier fallo distinto de `AbortError` (o si no hay soporte), el respaldo se **descarga** y se avisa el motivo. El importador acepta `.json` y `.txt`. No se pudo reproducir en Brave Android: las pruebas simulan Web Share.

**Instalación / splash**
- El nombre y el icono de la app instalada y el *splash* del sistema salen del manifiesto **al instalar**: tras cambiar nombre o iconos hay que desinstalar y reinstalar en el teléfono (Brave no actualiza accesos directos). `index.html` trae una pantalla de carga propia (`.boot`) que reemplaza la primera vista; mantenla alineada con el logo.

**Service worker**
- Si añades un archivo `.js`/`.css`, agrégalo a `SHELL` en [sw.js](sw.js) y sube el nombre de `CACHE`.

## Pruebas

Las pruebas e2e de `tests/` dependen de textos visibles y de `data-act`; al cambiar la interfaz actualiza las aserciones. **Toda función nueva debe llevar su prueba** (o ampliar una existente) y pasar `tests/run_all.py`. Para comprobar visualmente, haz capturas con Playwright y revísalas (se guardan en la carpeta temporal `tracker-shots/`).

Estado: probado en Chromium de escritorio con teléfono simulado; **falta validar en un Android real**.

## Flujo de trabajo y Git

- Rama `main`, remoto `origin` = `https://github.com/HancelLeonel/Tracker.git`.
- **El usuario hace el `push` manualmente** (no hay credenciales de GitHub en esta máquina). Haz commit cuando te lo pida; no intentes el push salvo que lo pida explícitamente.
- Mensajes de commit en español, con resumen + lista de cambios, y la línea `Co-Authored-By` indicada por el entorno.
- Mantén [Documentacion.md](Documentacion.md) y este archivo al día cuando cambie el comportamiento o las reglas.

## Contexto de producto (decisiones ya tomadas)

- Al usuario le pagan **quincenalmente**; el dinero entra a **una cuenta** y él lo reparte a mano a otras cuentas/efectivo. La **Guía** lista las transferencias pendientes de cada quincena y mide el avance con las transferencias registradas (no reparte nada automáticamente).
- Cada gasto tiene doble categoría: **categoría apartada** (de qué dinero sale) y **tipo de gasto** (en qué se usó).
- Pocos adjuntos (≤ 5 al mes): no hace falta optimizar el almacenamiento de archivos.
- Respaldo: exportar/importar JSON; los adjuntos van solo si se marca «Incluir archivos adjuntos». Importar **reemplaza** todo.
- Fuera de alcance por ahora: sincronización entre dispositivos, varios usuarios.
