# Home: app nativa de Android (Finanzas + Listas)

Fecha: 3 nov 2026 · Estado: diseño aprobado por partes en la conversación; pendiente de que el usuario revise este documento.

## Por qué

La PWA «Tracker» funciona, pero el usuario quiere dos cosas que una PWA no da:

1. **Que no se cierre ni se reinicie.** Android mata el proceso en segundo plano y la PWA vuelve a arrancar (splash + Inicio). `sesion.js` solo lo mitiga durante 30 min.
2. **Sensación y rendimiento nativos**: controles, gestos, transiciones y teclado del sistema.

Esto **revierte la decisión del 10 oct 2026** («No habrá APK»), por decisión del usuario.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Nombre | La app se llama **Home** (antes Tracker). Paquete `com.hancel.home` (permanente: cambiarlo crea otra app). |
| Plataforma | Solo Android. Teléfono con **Android 14+**; `minSdk = 34`, `targetSdk`/`compileSdk = 35`. |
| Web | **Se retira** al final de la transición. No se mantienen dos versiones. |
| Alcance | **Finanzas** (sin Pagos pendientes ni Reportes) + **Listas** (con plantillas, Agenda y archivo) + **Inicio resumido** + Ajustes mínimos. |
| Fuera | Hábitos, Notas, Bandeja/nota rápida, *share target*, Pomodoro, Compras, Reportes, Pagos pendientes, Gimnasio, sincronización con Drive, adjuntos, color por lista/plantilla, ajustes de tema y fuente. |
| Datos | Se importa **una vez** el respaldo JSON de la PWA, **sin adjuntos**. Después, respaldo propio exportar/importar JSON. |
| Estilo | **Material 3 con color dinámico** (Material You), tema claro/oscuro del sistema, fuente del sistema. |
| Pila | **Kotlin + Jetpack Compose + Room** (enfoque A). Descartados: Compose con todo en memoria + archivo JSON (B) y Flutter (C). |
| Repositorio | La app vive en `android/` dentro de este repo. El repo (`HancelLeonel/Tracker`) y la carpeta local se **renombran a Home al final**, junto con el retiro de la web (renombrar antes cambia la URL de GitHub Pages y rompe la PWA instalada que se sigue usando). |

## 1. Arquitectura y datos

### Módulos (Gradle)

- **`:core`**: Kotlin/JVM puro, sin dependencias de Android. Modelos de dominio y **todas las reglas** de dinero y de listas como funciones puras. Probado con JUnit.
- **`:app`**: aplicación Android. Room (entidades, DAO, transacciones), repositorios, `ViewModel` + `StateFlow`, pantallas de Compose, navegación, importar/exportar.

Una sola `Activity`, Navigation Compose. Estado de pantalla por `ViewModel` expuesto como `StateFlow` y derivado de los `Flow` de Room.

### Montos

Todos los montos son **centavos en `Long`** (`Q 12.50` = `1250`). Se formatean como `Q 1,234.50` en un solo helper (equivalente de `money()`). No hay `Double` en el dominio, así que los umbrales `0.004` de la PWA pasan a comparaciones exactas (`> 0`).

### Tablas de Room

| Tabla | Campos |
|---|---|
| `accounts` | `id: String`, `name`, `type: NORMAL \| CREDIT`, `limit: Long` (centavos; 0 = sin límite) |
| `categories` | `id`, `accountId` (FK, borrado en cascada), `name`, `balance: Long` (el orden es alfabético al consultar, no se guarda posición) |
| `moves` | `id`, `t: Long` (marca de creación, desempate), `type: EXPENSE \| INCOME \| TRANSFER`, `date: String` (`YYYY-MM-DD` local), `title`, `note`, `kindId?`, `cardId?`, `toAccId?`, `toCatId?`, `total: Long` |
| `move_parts` | `moveId` (FK, cascada), `idx: Int`, `accId`, `catId`, `amount: Long` |
| `kinds` | `id`, `name` (tipos de gasto; hoy en `settings.types`) |
| `lists` | `id`, `name`, `tplId?`, `created: String`, `t: Long`, `archived: String?`, `pinned: Boolean`, `sortDue: Boolean`, `order: Int?` |
| `list_items` | `id`, `listId` (FK, cascada), `position: Int`, `text`, `head`, `done`, `due?`, `doneAt?`, `extra` |
| `templates` | `id`, `name`, `freq: '' \| weekly \| biweekly \| monthly` |
| `template_items` | `templateId` (FK, cascada), `position`, `text`, `head`, `dueIn: Int?` (0–365) |

Ajustes en **DataStore** (preferencias): `listSort` (`recent \| due \| manual`), `listManualSeeded`, `lastKind`, `lastFrom`, `lastIncomeTo`, cuentas plegadas.

Las tarjetas de crédito conservan la forma actual: una cuenta `CREDIT` con **una sola categoría** cuyo saldo es la deuda (≤ 0).

Los ids siguen siendo `String` (se conservan los de la PWA; los nuevos con `UUID`).

### Reglas de dinero (en `:core`, traducción 1:1 de `state.js`)

- `effects(move)`: lista de `(acc, cat, delta)`.
  - Gasto con `cardId` → solo `(card, cat0, -total)`.
  - Si no, cada parte con `+amount` (ingreso) o `-amount`, y en una transferencia además `(to, +total)`.
- `balanceWithout(move, key)`, `cardPending(cardId, exclude)` (recorrido por `date` y luego `t`; un pago resta primero de la categoría de origen y luego de las de mayor pendiente; un ingreso a la tarjeta, de las de mayor pendiente), `reservedMap(exclude)`, `availWithout(move, key)`, `totals()` (efectivo, deuda, neto). (`allocatePayment` no se traduce: solo lo usaba Pagos pendientes.)
- **Lo apartado no se guarda**: se deriva del historial cada vez que cambia el `Flow` de movimientos. Desaparecen `S.rev`/`bump()` y la caché manual.
- `saveMove(old, new)` y `deleteMove(m)` corren en **una transacción de Room**: revierten los efectos de `old`, aplican los de `new` y escriben el movimiento con sus partes. Es el **único** lugar que cambia `balance`, salvo el formulario de categoría (ajuste manual del saldo).
- Disponible para gastar = saldo − apartado.

### Reglas de listas (en `:core`, traducción de `lists.js`)

- `sink(items, byDue)`: los pendientes conservan su orden (o van por fecha si `sortDue`), lo hecho baja al final de su sección ordenado por `doneAt`. **El orden guardado no cambia.**
- `sections(items)`, avance (sin contar `head`), `isListDone`, `nextDue`, «N vencidas / Próxima: …».
- Orden de la vista: fijadas primero; `recent` (por `created` y luego `t`, más nuevas arriba), `due` (próxima fecha pendiente) o `manual` (`order`; la primera vez parte del orden visible: `listManualSeeded`; una lista nueva queda arriba).
- Plantillas: `dueInfo` («Ya toca» / «Toca en N días» según `freq` y la última `created` con ese `tplId`), `parseItems` (`#` = sección, ` @N` final = `dueIn`). Crear una lista desde una plantilla **copia** los elementos con ids nuevos y `due = hoy + dueIn`.
- Agenda: pendientes con fecha de listas no archivadas, en Vencidas / Hoy / Mañana / Esta semana (≤ 7 días) / Más adelante.
- Tareas de hoy (Inicio): pendientes con `due ≤ hoy`, ordenadas por `due` y luego `created` de la lista.
- Archivar es explícito (`archived = hoy`, solo con todo marcado); una lista archivada es de solo lectura; restaurar quita la marca.

## 2. Pantallas y navegación

- **Barra inferior** Material 3 (`NavigationBar`) con **Inicio · Finanzas · Listas**. **Ajustes** desde un icono en la barra superior. Atrás = gesto del sistema. No hay deslizar entre pestañas ni «Más».
- **Inicio**:
  - Fecha y saludo.
  - **Tareas de hoy**: 3 visibles y luego «Ver N más», que abre Listas › Agenda. Marcar desde Inicio no hace saltar la fila hasta salir de la pantalla.
  - Botones grandes **Gasto · Ingreso · Mover**.
  - **Sin** tarjeta de saldo.
- **Finanzas**:
  - **Total**: dinero neto, más «En cuentas · Deuda en tarjetas» si hay deuda, y los botones Gasto/Ingreso/Mover.
  - **Una tarjeta por cuenta** (plegable): categorías con saldo y «X por pagar a tarjeta · libre Y». Tocar una categoría abre un gasto desde ella; el lápiz la edita; botón «Categoría».
  - **Tarjeta de crédito**: «Debes / A favor», crédito disponible, desglose de lo apartado por categoría (y «Sin categoría (saldo inicial)»), botones **Pagar tarjeta** y **Compra**.
  - **Movimientos por día**: `LazyColumn` con encabezados fijos «Hoy / Ayer / 21 oct», sin paginar, del más reciente al más antiguo (por `date` y luego `t`, descendente). Gasto en color de texto normal, ingreso en verde, rojo solo para saldos negativos.
  - Tocar el nombre de una cuenta abre la **pantalla de detalle** con sus movimientos (cuánto cambió el saldo de *esa* cuenta en cada uno).
  - Cuentas y categorías en **orden alfabético** (insensible a tildes y mayúsculas, números naturales).
- **Formularios** (gasto, ingreso, mover, pagar tarjeta, cuenta, categoría, tipo de gasto): pantalla completa con «Guardar» arriba.
  - Selector de categoría en **hoja inferior en dos pasos** (cuenta → categoría; directo a categorías si hay una sola cuenta).
  - `DatePicker` de Material para las fechas y teclado decimal para los montos.
  - Reglas del gasto que se conservan:
    - Título obligatorio.
    - Tipo de gasto con el último usado por defecto.
    - «Pagado con» (efectivo/débito o una tarjeta).
    - Varias filas de categoría con reparto automático que no supera lo libre al crear.
    - El selector arranca vacío y solo ofrece categorías con dinero libre.
    - «Permitir saldo negativo» ofrece todas las categorías y pide confirmación al pasarse de lo libre; abre marcada si el gasto ya dejaba un saldo negativo.
    - Al editar no se re-reparte.
    - Las categorías de tarjetas no aparecen en los selectores de gasto ni de mover.
  - Pagar tarjeta propone una fila por categoría con lo pendiente de `cardPending` (orden alfabético por «Cuenta / Categoría»); sin pendientes, una fila con la primera categoría normal y la deuda. Permite agregar o quitar filas; avisa «más de lo que debes» y «una categoría quedará en negativo».
- **Listas**:
  - Pestañas superiores **Listas · Agenda · Plantillas · Archivadas** (con contador).
  - **Listas**: fijar, orden Reciente / Por fecha / Manual; en manual se reordena **arrastrando** dentro de su grupo (fijadas / no fijadas).
  - **Detalle**: secciones, «Adicionales» (`extra`), fecha límite con `DatePicker`, campo para agregar fijo abajo que conserva el foco y el teclado, opción «ordenar por fecha» (`sortDue`) y **Finalizar lista** solo con todo marcado.
  - **Plantillas**: editor por filas (Enter agrega fila, Backspace en una fila vacía la quita, pegar varias líneas las separa con `parseItems`, sección y «vence a los N días» por fila) y «Ya toca».
  - Crear una lista desde una plantilla, desde cero o guardar una lista como plantilla.
- **Ajustes**: Tipos de gasto (agregar, renombrar, borrar), **Exportar respaldo**, **Importar respaldo**, **Borrar todo** (con confirmación) y versión de la app.
- **Estado tras matar el proceso**: la pestaña, la sub-pestaña de Listas, la lista o cuenta abierta, el scroll y los formularios a medias se restauran con `rememberSaveable`/`SavedStateHandle`, **sin límite de tiempo**. Sin splash propio: solo el del sistema (icono sobre fondo liso).
- **Icono**: se reutiliza el logo actual (aro de tres arcos + palomita) como *adaptive icon* (vector), con el nombre «Home».

## 3. Migración de datos y respaldos

### Importar el respaldo de la PWA (una vez)

- Acepta `app: 'tracker'` o `'mi-quincena'`, `version` 2 o la actual, archivo `.json` o `.json.txt` (selector de archivos del sistema).
- **Toma**: `accounts` (con `cats` → `categories`), `moves` (`parts`, `to`, `card`, `kind`, `title`, `note`, `date`, `t`, `total`), `templates`, `lists`, `settings.types` (→ `kinds`), `settings.listSort`, `settings.listManualSeeded`, `settings.lastKind`, `settings.lastFrom`, `settings.lastIncomeTo`.
- **Ignora**: todo lo demás, incluidos `files`, `bill`, `color`, `order` de cuentas, hábitos, notas, bandeja, pagos, compras, gimnasio, Pomodoro, tema, fuente y `collapsed`.
- **Validación** con el mismo rigor que `validateImport`. Ante un error se muestra el motivo y no se toca nada.
- **Conversión a centavos**: `round(x × 100)` para cada `balance`, `amount`, `total` y `limit`. Si en un movimiento `Σ parts ≠ total` tras redondear, **`total := Σ parts`** (las partes son las que movieron los saldos; así la deuda de la tarjeta y el destino de un «mover» siguen cuadrando).
- **Resumen antes de reemplazar**: cuentas, categorías, movimientos, listas, plantillas y **dinero total**, con confirmación.
- **Reemplaza todo en una sola transacción.** Si falla, no queda nada a medias.

### Respaldo propio

- Formato `{ app: 'home', version: 1, exportedAt, accounts, moves, kinds, lists, templates, settings }` con montos en **centavos enteros**.
- El importador distingue el formato por `app`.
- **Exportar**: hoja de compartir de Android (`ACTION_SEND` con un `.json` real) o «Guardar en Archivos» (`ACTION_CREATE_DOCUMENT`).

### Comprobación de paridad (requisito antes de dar por buena la migración)

1. Con el respaldo real del usuario, un script de Playwright corre en la PWA `totals()`, `reservedMap()`, `cardPending()` de cada tarjeta y el saldo de cada categoría, y guarda el resultado como JSON esperado.
2. Un test de JUnit importa el mismo respaldo en `:core` y compara al centavo.
3. Una diferencia de más de 1 centavo **detiene** la migración hasta explicarla.

El respaldo real y el JSON esperado **no se suben al repositorio**: van en una ruta local ignorada por git (`android/paridad/local/`).

## 4. Herramientas, pruebas, entrega y transición

### Herramientas (instaladas por terminal, sin Homebrew)

- JDK 21 (Temurin) en `~/Library/Java/JavaVirtualMachines/`.
- Android SDK en `~/Library/Android/sdk`: `cmdline-tools`, `platform-tools` (adb), `platforms;android-35` y `build-tools`.
- Gradle por *wrapper* (`./gradlew`, versión fija en el repo).
- Android Studio es opcional. Sin emulador por ahora.

### Pruebas

- **`:core` (JUnit)**: efectos, saldos, apartado de tarjetas, reparto del gasto, pago de tarjeta, totales, centavos e importación, `sink`/secciones/avance, orden de listas, Agenda, tareas de hoy, `dueInfo`, `parseItems` y la **prueba de paridad**.
- **`:app` (Robolectric + Compose UI Test, en la JVM)**:
  - Guardar, editar y borrar un gasto cuadra los saldos en Room.
  - Importar es todo o nada, y exportar → importar devuelve lo mismo.
  - Marcar una tarea en Inicio.
  - Finalizar y restaurar una lista.
  - Reordenar arrastrando.
  - Restaurar el estado tras recrear la Activity y tras matar el proceso.
- Comando: `./gradlew test`. **Toda función nueva lleva su prueba; nada se publica en rojo.**
- Lo que no se puede probar en la JVM (teclado real, gestos, Material You con el fondo del usuario) lo valida el usuario en su teléfono.

### Firma y entrega

- Llave de firma en `~/.android/home-release.jks`, **fuera del repo**, con su contraseña fuera del repo (`~/.gradle/gradle.properties`). **El usuario guarda una copia**: sin ella no se puede actualizar la app instalada.
- Instalación por **depuración inalámbrica**: `adb pair` una vez, después `adb install -r` en cada versión (**conserva los datos**). Si el teléfono no está conectado, se le entrega el APK firmado.
- `versionCode` sube en cada entrega.

### Transición

1. Se construye todo en `android/` **sin tocar la PWA**, que sigue publicada y en uso.
2. Con Finanzas, Listas e Inicio listos: el usuario exporta desde la PWA, importa en Home (tras pasar la prueba de paridad) y las usa en paralelo unos días, con la PWA congelada.
3. Cuando el usuario confirme que todo cuadra, en **commits aparte y reversibles**:
   1. Se retira la web (`index.html`, `js/`, `css/`, `fonts/`, `sw.js`, `manifest.webmanifest`, `tests/` de Playwright, `icons/generar.py` salvo que se adapte para el icono nativo).
   2. Se reescriben `CLAUDE.md` y `Documentacion.md` para Android.
   3. El usuario desactiva GitHub Pages y renombra el repositorio a **Home** en GitHub. Después se actualizan `origin` y la carpeta local.

### Flujo de trabajo

Igual que hoy, adaptado: un commit por cambio, en español, reversible con `git revert`, sin reescribir la historia. Publicar = `./gradlew test` en verde → commit → `push` a `origin main` → `adb install -r` si el teléfono está conectado. Las reglas nuevas del `CLAUDE.md` van en su propio commit.

## Riesgos

- **Pérdida de la llave de firma** → no hay actualizaciones; habría que reinstalar desde el respaldo JSON. Se mitiga con la copia del usuario.
- **Diferencias de redondeo** al pasar a centavos → se mitiga con la prueba de paridad y la regla `total := Σ parts`.
- **Alcance**: reescribir dos secciones completas es varias veces el trabajo del rediseño de octubre. El plan de implementación debe entregar en fases instalables (primero importar y ver Finanzas, después formularios, después Listas e Inicio) para que el usuario pruebe pronto en su teléfono.
