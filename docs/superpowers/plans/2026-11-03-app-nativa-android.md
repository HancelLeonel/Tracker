# Home (app nativa de Android) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir «Home», una app nativa de Android (Finanzas + Listas + Inicio resumido) que reemplace a la PWA Tracker con los mismos datos y las mismas reglas de dinero.

**Architecture:** Proyecto Gradle en `android/`. Hay dos módulos:
- `:core` (Kotlin/JVM puro): modelos y todas las reglas como funciones puras.
- `:app`: Room, DataStore, `ViewModel` + `StateFlow` y Compose con Material 3 dinámico.

La PWA no se toca hasta la última tarea, que solo se ejecuta cuando el usuario lo confirma.

**Tech Stack:** Kotlin 2.1, Jetpack Compose (Material 3), Navigation Compose, Room (KSP), DataStore, kotlinx.serialization, JUnit 4, Robolectric, Compose UI Test.

**Spec:** `docs/superpowers/specs/2026-11-03-app-nativa-android-design.md`

## Global Constraints

- `applicationId = "com.hancel.home"`, nombre visible **Home**. `minSdk = 34`, `targetSdk = compileSdk = 35`. JDK 21.
- Versiones fijadas en `android/gradle/libs.versions.toml`:

  | Componente | Versión |
  |---|---|
  | AGP | 8.7.3 |
  | Gradle | 8.11.1 |
  | Kotlin | 2.1.0 |
  | KSP | 2.1.0-1.0.29 |
  | Compose BOM | 2024.12.01 |
  | Room | 2.6.1 |
  | Navigation Compose | 2.8.5 |
  | Lifecycle | 2.8.7 |
  | Activity Compose | 1.9.3 |
  | DataStore Preferences | 1.1.1 |
  | kotlinx-serialization-json | 1.7.3 |
  | Coroutines | 1.9.0 |
  | JUnit | 4.13.2 |
  | Robolectric | 4.14.1 |
  | androidx.test.ext:junit | 1.2.1 |
  | `sh.calvin.reorderable:reorderable` | 2.4.3 |

  Si una versión no resuelve, usa la más cercana disponible y anótalo en el commit. No se agregan otras dependencias de ejecución.
- **Montos en centavos `Long`**. Formato idéntico a `money()` de la PWA: `Q1,250.00`, y en negativo con el signo menos U+2212: `−Q12.00`.
- **Fechas `LocalDate` locales**. «Hoy» siempre sale de un `java.time.Clock` inyectado (en producción `Clock.systemDefaultZone()`). Nunca se usa UTC para fechas del usuario.
- **Orden alfabético** con `byName`: `Collator` para `es` con fuerza `PRIMARY` (ignora tildes y mayúsculas) y comparación natural de números («Cuenta 2» < «Cuenta 10»).
- Texto de interfaz, comentarios y documentación **en español**.
- Color con significado: **rojo solo para problemas** (saldo negativo, vencido), ingreso en verde (`MaterialTheme.colorScheme.tertiary` o un verde accesible fijo para ingreso), gasto en el color de texto normal.
- La llave de firma (`~/.android/home-release.jks`) y el respaldo real del usuario (`android/paridad/local/`) **nunca entran al repositorio**.
- **No se modifica nada fuera de `android/`**, salvo `.gitignore`, `CLAUDE.md` (Tarea 1 y Tarea 22) y lo que indique la Tarea 22.
- Cada tarea termina con `cd android && ./gradlew test` en verde y **un commit propio** en español, con resumen, lista de cambios y las líneas `Co-Authored-By`/`Claude-Session` del entorno. Después del commit, `git push origin main` (regla del `CLAUDE.md`).

## Review Focus

1. **Movimientos que apuntan a cuentas o categorías borradas**: la PWA permite borrar una categoría con historial. Al importar, nada debe fallar. Sus efectos se ignoran (como `applyMove`), la fila muestra «(eliminada)» y `move_parts` **no** tiene clave foránea hacia `categories`. Pruebas en las Tareas 3, 7 y 9.
2. **Montos escritos con coma o con separador de miles** («12,50», «1,250.00», «1 250»): el teclado de Android en español puede ofrecer la coma decimal. `parseMoney` debe dar 1250 o 125000 sin ambigüedad. Prueba en la Tarea 2.
3. **Cambio de día con la app abierta o restaurada**: «Hoy/Ayer», «Tareas de hoy» y la Agenda deben calcularse con la fecha del momento en que se pintan, no con la de cuando se creó el `ViewModel`. Pruebas en las Tareas 6 y 19.
4. **Volumen**: con 60 000 movimientos, `Ledger.reservedMap()` + `totals()` deben tardar menos de 300 ms en la JVM, y se calculan fuera del hilo principal. Prueba en la Tarea 4.
5. **Importar un respaldo dañado o de otra app teniendo ya datos**: no se toca nada y se muestra un mensaje claro. Si falla a mitad de la escritura, la transacción se revierte. Pruebas en las Tareas 7 y 9.

---

## Estructura de archivos

```
android/
  settings.gradle.kts · build.gradle.kts · gradle.properties · gradle/libs.versions.toml · gradlew(+wrapper)
  core/build.gradle.kts
  core/src/main/kotlin/com/hancel/home/core/
    Modelo.kt        — tipos de dominio (Account, Category, CatKey, Move, Part, Kind, ListDoc, ListItem, Template, TemplateItem, Freq, PortableSettings, Snapshot)
    Formato.kt       — money(), parseMoney(), fmtDate(), dayLabel(), greeting(), byName
    Ledger.kt        — saldos, efectos, apartado de tarjetas, disponible, totales
    Gasto.kt         — borrador del formulario de gasto (reparto, opciones, avisos, validación)
    PagoTarjeta.kt   — propuesta y avisos del pago de tarjeta
    Listas.kt        — sink, sections, avance, orden de la vista, reordenar, archivar
    Agenda.kt        — agenda por grupos, tareas de hoy
    Plantillas.kt    — dueInfo, parseItems, lista desde plantilla, plantilla desde lista
    respaldo/ImportarPwa.kt · respaldo/RespaldoHome.kt
  core/src/test/kotlin/com/hancel/home/core/…   — una clase de prueba por archivo
  app/build.gradle.kts
  app/src/main/java/com/hancel/home/
    MainActivity.kt · HomeApp.kt (Application + contenedor de dependencias)
    data/  HomeDb.kt · Entidades.kt · Daos.kt · Mapeo.kt · DineroRepo.kt · ListasRepo.kt · RespaldoRepo.kt · Ajustes.kt
    ui/    tema/Tema.kt · Navegacion.kt · comun/{CampoMonto,CampoFecha,SelectorCategoria,Confirmar}.kt
           inicio/ · finanzas/ · listas/ · ajustes/   (pantalla + ViewModel por archivo)
  app/src/test/java/com/hancel/home/…               — Robolectric (Room y Compose)
  paridad/extraer_pwa.py · paridad/local/ (ignorado)
```

---

## Fase 0: entorno

### Tarea 1: herramientas y esqueleto del proyecto

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/libs.versions.toml`, `android/gradlew`, `android/gradle/wrapper/*`, `android/core/build.gradle.kts`, `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/hancel/home/MainActivity.kt`, `android/app/src/main/res/values/strings.xml` (`app_name` = `Home`), `android/core/src/test/kotlin/com/hancel/home/core/HumoTest.kt`
- Modify: `.gitignore` (agregar `android/.gradle/`, `android/**/build/`, `android/local.properties`, `android/paridad/local/`, `*.jks`), `CLAUDE.md` (sección corta «App nativa en `android/`» con los comandos de esta tarea, en un commit aparte)

**Interfaces:**
- Produces: `./gradlew test` y `./gradlew :app:assembleDebug` funcionando. Módulo `:core` (plugin `kotlin("jvm")`, `jvmToolchain(21)`) y `:app` (Android, Compose habilitado con el plugin `org.jetbrains.kotlin.plugin.compose`, `testOptions.unitTests.isIncludeAndroidResources = true`).

- [ ] **Paso 1: instalar el JDK 21.** Descarga Temurin 21 para `mac/aarch64` desde `https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse` y descomprímelo en `~/Library/Java/JavaVirtualMachines/`. Verifica que `/usr/libexec/java_home -v 21` imprima la ruta.
- [ ] **Paso 2: instalar el SDK de Android.** Descarga `commandlinetools-mac-11076708_latest.zip` de `https://dl.google.com/android/repository/` y colócalo en `~/Library/Android/sdk/cmdline-tools/latest/`. Con `JAVA_HOME` del JDK 21, ejecuta `sdkmanager --licenses` (aceptar) y `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"`. Verifica que `~/Library/Android/sdk/platform-tools/adb version` responda.
- [ ] **Paso 3: crear el wrapper.** Descarga `gradle-8.11.1-bin.zip` en el scratchpad y, desde `android/`, ejecuta `<gradle>/bin/gradle wrapper --gradle-version 8.11.1`. Escribe `android/local.properties` con `sdk.dir=/Users/hancelt/Library/Android/sdk`. Ese archivo no se sube.
- [ ] **Paso 4: escribir la prueba de humo** `HumoTest.humo()` con `assertEquals(4, 2 + 2)`, y un `MainActivity` (`ComponentActivity` + `setContent { Text("Home") }`).
- [ ] **Paso 5: verificar.** Ejecuta `cd android && ./gradlew test :app:assembleDebug`. Esperado: `BUILD SUCCESSFUL` y el archivo `app/build/outputs/apk/debug/app-debug.apk`.
- [ ] **Paso 6: commits.** Primero el esqueleto (`android/`, `.gitignore`) y después, aparte, el `CLAUDE.md` con la sección nueva:

```markdown
## App nativa «Home» (en construcción, `android/`)
Kotlin + Compose + Room. Spec: docs/superpowers/specs/2026-11-03-app-nativa-android-design.md · Plan: docs/superpowers/plans/2026-11-03-app-nativa-android.md
- `cd android && ./gradlew test` (JUnit + Robolectric) · `./gradlew :app:assembleRelease` · `adb install -r app/build/outputs/apk/release/app-release.apk`
- JAVA_HOME = JDK 21 de ~/Library/Java/JavaVirtualMachines; SDK en ~/Library/Android/sdk.
- La PWA no se toca mientras se construye Home. La llave ~/.android/home-release.jks y android/paridad/local/ nunca se suben.
```

---

## Fase 1: `:core` (reglas puras)

### Tarea 2: modelos y formato

**Files:**
- Create: `core/src/main/kotlin/com/hancel/home/core/Modelo.kt`, `Formato.kt`
- Test: `core/src/test/kotlin/com/hancel/home/core/FormatoTest.kt`

**Interfaces:**
- Produces (`Modelo.kt`):
  ```kotlin
  enum class AccountType { NORMAL, CREDIT }
  data class Category(val id: String, val name: String, val balance: Long)
  data class Account(val id: String, val name: String, val type: AccountType, val limit: Long, val cats: List<Category>)
  data class CatKey(val acc: String, val cat: String)
  enum class MoveType { EXPENSE, INCOME, TRANSFER }
  data class Part(val key: CatKey, val amount: Long)
  data class Move(val id: String, val t: Long, val type: MoveType, val date: LocalDate, val title: String, val note: String,
                  val kindId: String?, val cardId: String?, val to: CatKey?, val total: Long, val parts: List<Part>)
  data class Kind(val id: String, val name: String)
  data class ListItem(val id: String, val text: String, val head: Boolean = false, val done: Boolean = false,
                      val due: LocalDate? = null, val doneAt: LocalDate? = null, val extra: Boolean = false)
  data class ListDoc(val id: String, val name: String, val tplId: String?, val created: LocalDate, val t: Long,
                     val archived: LocalDate? = null, val pinned: Boolean = false, val sortDue: Boolean = false,
                     val order: Int? = null, val items: List<ListItem>)
  enum class Freq { NONE, WEEKLY, BIWEEKLY, MONTHLY }   // clave en JSON: "", "weekly", "biweekly", "monthly"
  data class TemplateItem(val text: String, val head: Boolean = false, val dueIn: Int? = null)
  data class Template(val id: String, val name: String, val freq: Freq, val items: List<TemplateItem>)
  enum class ListSort { RECENT, DUE, MANUAL }
  data class PortableSettings(val listSort: ListSort = ListSort.RECENT, val listManualSeeded: Boolean = false,
                              val lastKind: String? = null, val lastFrom: CatKey? = null, val lastIncomeTo: CatKey? = null)
  data class Snapshot(val accounts: List<Account>, val moves: List<Move>, val kinds: List<Kind>,
                      val lists: List<ListDoc>, val templates: List<Template>, val settings: PortableSettings)
  ```
- Produces (`Formato.kt`): `fun money(cents: Long): String`, `fun parseMoney(text: String): Long?`, `fun fmtDate(d: LocalDate): String` («3 nov»), `fun dayLabel(d: LocalDate, today: LocalDate): String`, `fun greeting(hour: Int): String`, `val byName: Comparator<String>`, `fun newId(): String` (UUID).

- [ ] **Paso 1: escribir las pruebas que fallan** en `FormatoTest`:
  - `money`: `money(125000) == "Q1,250.00"`, `money(-1200) == "−Q12.00"`, `money(0) == "Q0.00"`.
  - `parseMoney`: `parseMoney("12.50") == 1250L`, `parseMoney("12,50") == 1250L`, `parseMoney("1,250.00") == 125000L`, `parseMoney("1 250") == 125000L`, `parseMoney("0.005") == 1L` (redondeo half-up), `parseMoney("") == null`, `parseMoney("abc") == null`. Regla para la coma: si es el único separador y le siguen 1 o 2 dígitos, es decimal; si no, es separador de miles.
  - `dayLabel`: con `today = 2026-11-03` da «Hoy», con 2026-11-02 «Ayer», con 2026-10-21 «21 oct». Meses: `ene feb mar abr may jun jul ago sep oct nov dic`.
  - `greeting`: `greeting(11) == "Buenos días"`, `greeting(12) == "Buenas tardes"`, `greeting(19) == "Buenas noches"`.
  - `byName`: `listOf("Éxito","ahorro","Cuenta 10","Cuenta 2").sortedWith(byName) == listOf("ahorro","Cuenta 2","Cuenta 10","Éxito")`.
- [ ] **Paso 2: correr** `./gradlew :core:test --tests '*FormatoTest*'`. Esperado: FALLA (no compila).
- [ ] **Paso 3: implementar** `Modelo.kt` y `Formato.kt`. `money` usa `DecimalFormat("#,##0.00", DecimalFormatSymbols(Locale.US))`. `byName` parte el texto en trozos de dígitos y no dígitos y compara los dígitos como números y lo demás con `Collator.getInstance(Locale("es")).apply { strength = Collator.PRIMARY }`.
- [ ] **Paso 4: correr** las pruebas. Esperado: PASAN.
- [ ] **Paso 5: commit** «Home: modelos de dominio y formato de montos y fechas».

### Tarea 3: `Ledger`: efectos y saldos

**Files:**
- Create: `core/src/main/kotlin/com/hancel/home/core/Ledger.kt`
- Test: `core/src/test/kotlin/com/hancel/home/core/LedgerSaldosTest.kt`

**Interfaces:**
- Consumes: modelos de la Tarea 2.
- Produces:
  ```kotlin
  data class Effect(val key: CatKey, val delta: Long)
  data class Totals(val cash: Long, val debt: Long, val net: Long)
  class Ledger(val accounts: List<Account>, val moves: List<Move>) {
    fun account(id: String): Account?
    fun category(key: CatKey): Category?
    fun isCredit(accId: String): Boolean
    fun normalKeys(): List<CatKey>              // categorías de cuentas NORMAL, cuentas y categorías por byName
    fun catLabel(key: CatKey): String           // "Cuenta / Categoría"; tarjeta: "Nombre (tarjeta)"; inexistente: "(eliminada)"
    fun effects(m: Move): List<Effect>
    fun balanceWithout(move: Move?, key: CatKey): Long
    fun totals(): Totals
    fun sortedMoves(): List<Move>               // por date desc, luego t desc
    fun accountDelta(m: Move, accId: String): Long  // cuánto cambió el saldo de ESA cuenta (detalle de cuenta)
  }
  fun applyEffects(accounts: List<Account>, effects: List<Effect>, sign: Int): List<Account>
  ```

- [ ] **Paso 1: escribir las pruebas que fallan.** Usa un fixture con la cuenta normal `Banco` (categorías `Comida` = 50000 y `Renta` = 20000) y la tarjeta `Visa` (CREDIT, categoría `deuda` = −3000, `limit` = 100000).
  - `gasto_sin_tarjeta_resta_de_cada_parte`: `effects(gasto de 1500 desde Comida) == [Effect(Banco|Comida, -1500)]`.
  - `gasto_con_tarjeta_solo_suma_deuda`: un gasto con `cardId = Visa` y una parte en Comida devuelve `[Effect(Visa|deuda, -total)]`.
  - `gasto_con_tarjeta_inexistente_no_tiene_efectos`: devuelve `[]`.
  - `ingreso_suma_y_transferencia_mueve`: un ingreso de 1000 a Renta da `+1000`. Una transferencia de 700 de Comida a Renta da `[Comida -700, Renta +700]`.
  - `balanceWithout_descuenta_el_propio_movimiento`: con el gasto de 1500 ya aplicado (Comida = 48500), `balanceWithout(gasto, Comida) == 50000`.
  - `applyEffects_ignora_categorias_borradas` (Review Focus 1): un efecto sobre `Banco|borrada` deja las cuentas iguales.
  - `catLabel_eliminada`: `catLabel(CatKey("Banco","zzz")) == "(eliminada)"`.
  - `totals_neto`: `cash = 70000`, `debt = -3000`, `net = 67000`.
  - `sortedMoves_por_fecha_y_t_desc`.
  - `accountDelta`: un gasto con tarjeta desde Comida da 0 para Banco y −total para Visa. Una transferencia entre dos categorías de Banco da 0 para Banco.
- [ ] **Paso 2: correr y ver que fallan.** `./gradlew :core:test --tests '*LedgerSaldosTest*'`.
- [ ] **Paso 3: implementar.** Es una traducción 1:1 de `effects`/`applyMove`/`balanceWithout`/`totals` de `js/state.js`. El mapa de cuentas e índices se calcula `by lazy`.
- [ ] **Paso 4: correr y ver que pasan.**
- [ ] **Paso 5: commit** «Home: efectos de movimientos y saldos en :core».

### Tarea 4: `Ledger`: apartado de tarjetas

**Files:**
- Modify: `core/src/main/kotlin/com/hancel/home/core/Ledger.kt`
- Test: `core/src/test/kotlin/com/hancel/home/core/LedgerTarjetasTest.kt`

**Interfaces:**
- Produces (métodos de `Ledger`): `fun cardPending(cardId: String, exclude: Move? = null): Map<CatKey, Long>`, `fun reservedMap(exclude: Move? = null): Map<CatKey, Long>`, `fun availWithout(move: Move?, key: CatKey): Long`, `fun cardUntracked(cardId: String): Long` (deuda − Σ pendiente; si es mayor que 0 se pinta «Sin categoría (saldo inicial)»). Sin `exclude`, los resultados se memorizan con `lazy`, porque el `Ledger` es inmutable.

- [ ] **Paso 1: escribir las pruebas que fallan.**
  - `compras_suman_por_categoria`: dos compras con Visa, 1000 desde Comida y 500 desde Renta, dan `cardPending(Visa) == {Comida: 1000, Renta: 500}`.
  - `pago_resta_primero_de_su_categoria`: un pago (transferencia a `Visa|deuda`) de 1200 con la parte en Renta da `{Comida: 300}`. Renta paga 500 de lo suyo y el resto sale de la mayor pendiente, que es Comida.
  - `ingreso_a_tarjeta_resta_de_la_mayor`.
  - `orden_por_fecha_y_t`: un pago fechado antes de la compra no la cancela.
  - `exclude_quita_el_movimiento`.
  - `reservedMap_suma_todas_las_tarjetas`.
  - `availWithout_es_saldo_menos_apartado`: Comida con saldo 50000 y apartado 1000 da 49000.
  - `rendimiento_60000_movimientos` (Review Focus 4): genera 60 000 movimientos mezclados con 2 tarjetas y 20 categorías. Mide `reservedMap()` + `totals()` con `measureTimeMillis`, tras una corrida de calentamiento, y comprueba que tarde menos de 300.
- [ ] **Paso 2: correr y ver que fallan.**
- [ ] **Paso 3: implementar** la traducción de `computePending` de `js/state.js` (líneas 231–254) en centavos. `take` y `pay` comparan con `> 0`, no con `> 0.004`. «La mayor pendiente» se elige con `maxByOrNull { it.value }` entre los valores mayores que 0, con el mismo desempate que la PWA: el primero insertado en el mapa, así que se usa `LinkedHashMap`.
- [ ] **Paso 4: correr y ver que pasan.**
- [ ] **Paso 5: commit** «Home: apartado de tarjetas (cardPending, reservedMap, disponible)».

### Tarea 5: borradores de gasto y de pago de tarjeta

**Files:**
- Create: `core/src/main/kotlin/com/hancel/home/core/Gasto.kt`, `PagoTarjeta.kt`
- Test: `core/src/test/kotlin/com/hancel/home/core/GastoTest.kt`, `PagoTarjetaTest.kt`

**Interfaces:**
- Consumes: `Ledger` (`availWithout`, `normalKeys`, `cardPending`, `balanceWithout`, `catLabel`).
- Produces:
  ```kotlin
  data class Row(val key: CatKey?, val amount: Long)
  data class ExpenseDraft(val editing: Move?, val total: Long, val allowNeg: Boolean, val auto: Boolean, val rows: List<Row>) {
    companion object { fun start(ledger: Ledger, editing: Move?, preset: CatKey?): ExpenseDraft }
  }
  sealed interface DraftStatus { object Ok; object Unpicked; data class Missing(val cents: Long, val canAdd: Boolean)
                                 data class Over(val cents: Long); data class Negative(val allowed: Boolean) }
  fun ExpenseDraft.withTotal(total: Long, l: Ledger): ExpenseDraft       // reparte de nuevo si auto
  fun ExpenseDraft.withAllowNeg(on: Boolean, l: Ledger): ExpenseDraft
  fun ExpenseDraft.withKey(i: Int, key: CatKey, l: Ledger): ExpenseDraft
  fun ExpenseDraft.withAmount(i: Int, cents: Long): ExpenseDraft         // auto = false
  fun ExpenseDraft.removeRow(i: Int, l: Ledger): ExpenseDraft
  fun ExpenseDraft.addRow(): ExpenseDraft                                // key = null, amount = lo que falta
  fun ExpenseDraft.choices(i: Int, l: Ledger): List<CatKey>
  fun ExpenseDraft.canAdd(l: Ledger): Boolean
  fun ExpenseDraft.status(l: Ledger): DraftStatus
  sealed interface SaveCheck { data class Error(val msg: String); data class Confirm(val msg: String); object Ok }
  fun ExpenseDraft.checkSave(title: String, cardId: String?, l: Ledger, confirmedNeg: Boolean, confirmedLimit: Boolean): SaveCheck
  fun ExpenseDraft.toMove(id: String, t: Long, date: LocalDate, title: String, note: String, kindId: String?, cardId: String?): Move
  data class PayProposal(val rows: List<Row>, val debt: Long, val untracked: Long)
  fun proposeCardPayment(l: Ledger, card: Account, editing: Move?): PayProposal
  fun payWarnings(rows: List<Row>, debt: Long, l: Ledger, editing: Move?): List<String>  // "más de lo que debes", "una categoría quedará en negativo"
  ```

- [ ] **Paso 1: escribir las pruebas que fallan** (reglas de `expenseForm`/`payCardForm` en `js/money.js:195-470`):
  - `start_nuevo_selector_vacio`: con `preset = null` hay una fila con `key == null`. Un preset que no es categoría normal se ignora.
  - `start_edicion_abre_con_allowNeg_si_ya_dejaba_negativo`.
  - `autoFill_no_supera_lo_libre_al_crear`: con un total de 60000, Comida libre 50000 y una fila Comida, queda `amount == 50000` y `status == Missing(10000, canAdd = true)`.
  - `autoFill_con_allowNeg_pone_todo`: la fila queda en 60000.
  - `al_editar_no_se_reparte_con_tope` (`cap()` es falso al editar).
  - `editar_monto_apaga_auto`: después de `withAmount`, cambiar el total ya no reparte.
  - `choices_solo_con_dinero_libre_y_sin_repetir`. Con `allowNeg`, todas menos las ya usadas. Si ninguna tiene dinero libre, todas.
  - `checkSave`: sin título → `Error("El gasto necesita un título.")`. Sin categoría → `Error("Elige de qué categoría sale el dinero.")`. Si la suma no da el total → `Error("Los montos de las categorías deben sumar el total del gasto.")`. Si se pasa de lo libre sin `allowNeg` → `Confirm("Una categoría quedará en negativo. ¿Continuar?")`. Si supera el crédito disponible → `Confirm("Esta compra supera el crédito disponible de Visa (Q970.00). ¿Continuar?")`.
  - `toMove_descarta_filas_en_cero`.
  - `propuesta_pago_desde_pendiente_en_orden_alfabetico`. `propuesta_sin_pendiente_usa_primera_normal_con_la_deuda`. `debt` y `untracked` coinciden con el fixture.
- [ ] **Paso 2: correr y ver que fallan.**
- [ ] **Paso 3: implementar.** Todas las funciones son puras y devuelven un borrador nuevo. Los mensajes son el texto exacto de la PWA.
- [ ] **Paso 4: correr y ver que pasan.**
- [ ] **Paso 5: commit** «Home: borradores de gasto y pago de tarjeta con las reglas de la PWA».

### Tarea 6: listas, agenda y plantillas

**Files:**
- Create: `core/src/main/kotlin/com/hancel/home/core/Listas.kt`, `Agenda.kt`, `Plantillas.kt`
- Test: `core/src/test/kotlin/com/hancel/home/core/ListasTest.kt`, `AgendaTest.kt`, `PlantillasTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  // Listas.kt
  data class Section(val head: ListItem?, val items: List<ListItem>)
  data class Progress(val done: Int, val total: Int)
  fun sink(items: List<ListItem>, byDue: Boolean): List<ListItem>
  fun sections(items: List<ListItem>): List<Section>
  fun ListDoc.progress(): Progress
  fun ListDoc.isDone(): Boolean
  fun ListDoc.nextDue(): LocalDate?
  fun ListDoc.lateCount(today: LocalDate): Int
  fun orderedActive(lists: List<ListDoc>, sort: ListSort): List<ListDoc>          // fijadas primero
  fun seedOrder(visible: List<ListDoc>): List<ListDoc>                           // order = índice
  fun reorder(lists: List<ListDoc>, sort: ListSort, id: String, toIndexInGroup: Int): List<ListDoc>  // solo dentro de su grupo
  fun ListDoc.toggle(itemId: String, today: LocalDate): ListDoc                  // done y doneAt
  fun ListDoc.finish(today: LocalDate): ListDoc                                  // solo si isDone()
  // Agenda.kt
  enum class Bucket(val label: String) { LATE("Vencidas"), TODAY("Hoy"), TOMORROW("Mañana"), WEEK("Esta semana"), LATER("Más adelante") }
  data class Task(val list: ListDoc, val item: ListItem)
  fun agenda(lists: List<ListDoc>, today: LocalDate): Map<Bucket, List<Task>>
  fun todayTasks(lists: List<ListDoc>, today: LocalDate): List<Task>
  // Plantillas.kt
  sealed interface DueInfo { object Now; data class In(val days: Int) }
  fun dueInfo(t: Template, lists: List<ListDoc>, today: LocalDate): DueInfo?
  fun parseItems(text: String): List<TemplateItem>
  fun listFromTemplate(t: Template, today: LocalDate, t0: Long, newId: () -> String): ListDoc
  fun templateFromList(l: ListDoc, newId: () -> String): Template
  ```

- [ ] **Paso 1: escribir las pruebas que fallan** (reglas de `js/lists.js`):
  - `sink_hecho_baja_por_doneAt_y_no_cambia_el_original`. `sink_byDue_pendientes_con_fecha_primero`.
  - `sections_primera_sin_encabezado`. `progress_no_cuenta_encabezados`. `isDone_lista_vacia_es_falso`.
  - Orden:
    - `orden_recent_por_created_y_t_desc`.
    - `orden_due_sin_fecha_al_final` (la clave `"9999"` equivale a `LocalDate.MAX`).
    - `orden_manual_order_nulo_al_final`.
    - `fijadas_siempre_primero`.
    - `reorder_no_cruza_de_grupo`.
  - `finish_solo_con_todo_marcado` (si no, devuelve la misma lista).
  - Agenda:
    - `agenda_grupos`: con `today = 2026-11-03` y fechas 11-01, 11-03, 11-04, 11-10 y 11-11 quedan en LATE, TODAY, TOMORROW, WEEK y LATER. «Esta semana» es `<= today + 7`.
    - `agenda_ignora_archivadas_hechas_y_encabezados`.
    - `todayTasks_due_hasta_hoy_por_due_y_created`.
    - `todayTasks_cambia_con_el_dia` (Review Focus 3): la misma lista con `today` 11-03 y 11-04 da resultados distintos.
  - `dueInfo`:
    - `dueInfo_sin_periodo_o_sin_uso_es_null`.
    - `dueInfo_weekly`: con la última `created` 10-27 y `today` 11-03 da `Now`. Con `today` 11-01 da `In(2)`.
    - `dueInfo_monthly_suma_un_mes` (01-31 + 1 mes = 02-28 en 2026, igual que `plusMonths`).
  - `parseItems`: `"# Cocina\nLeche @3\n\n  Pan  "` da `[Item("Cocina", head), Item("Leche", dueIn=3), Item("Pan")]`. `"@3"` solo da el texto `"@3"`.
  - `listFromTemplate_ids_nuevos_y_due_hoy_mas_dueIn`. `templateFromList_quita_estado`.
- [ ] **Paso 2: correr y ver que fallan.**
- [ ] **Paso 3: implementar.** `today` siempre llega como parámetro; ninguna función de `:core` lee el reloj.
- [ ] **Paso 4: correr y ver que pasan.**
- [ ] **Paso 5: commit** «Home: reglas de listas, agenda y plantillas en :core».

### Tarea 7: importar la PWA y respaldo propio

**Files:**
- Create: `core/src/main/kotlin/com/hancel/home/core/respaldo/ImportarPwa.kt`, `respaldo/RespaldoHome.kt`; agregar `kotlin("plugin.serialization")` y `kotlinx-serialization-json` a `core/build.gradle.kts`
- Test: `core/src/test/kotlin/com/hancel/home/core/respaldo/ImportarPwaTest.kt`, `RespaldoHomeTest.kt`, recursos `core/src/test/resources/pwa-minimo.json` (sintético, escrito a mano)

**Interfaces:**
- Produces:
  ```kotlin
  class ImportError(message: String) : Exception(message)
  data class ImportSummary(val accounts: Int, val categories: Int, val moves: Int, val lists: Int, val templates: Int, val net: Long)
  fun parseBackup(json: String): Snapshot        // detecta por "app": tracker | mi-quincena → PWA; home → propio; otro → ImportError
  fun Snapshot.summary(): ImportSummary
  fun exportHome(s: Snapshot, exportedAt: Instant): String   // {"app":"home","version":1,...} centavos enteros, fechas ISO
  ```

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `rechaza_otra_app`: `{"app":"x"}` lanza `ImportError("El archivo no es un respaldo de esta app.")`. `rechaza_version`: con `version: 1` lanza «Este respaldo es de una versión que ya no se puede importar.». Se aceptan las versiones 2 y 3 (`VERSION = 3` en `js/data.js`).
  - `rechaza_monto_invalido`: con `"balance":"x"` lanza «Hay un monto inválido en el archivo.».
  - `rechaza_json_roto`: un JSON roto lanza un `ImportError` con un mensaje en español, nunca una excepción de la librería.
  - `convierte_a_centavos_con_redondeo`: `12.345` da 1235 (half-up, como `Math.round` de JS con positivos).
  - `total_se_ajusta_a_la_suma_de_parts`: con parts `0.105` y `0.105` (11 y 11) y total `0.21` (21), queda `total == 22`.
  - `ignora_colores_adjuntos_bill_y_secciones_quitadas` (el fixture trae `habits`, `files`, `bill`, `color`).
  - `kinds_desde_settings_types` y `settings_lastKind_lastFrom_lastIncomeTo` (en la PWA `lastFrom` es `"acc|cat"`).
  - `movimiento_con_categoria_borrada_se_conserva` (Review Focus 1).
  - `ida_y_vuelta_home`: `parseBackup(exportHome(s)) == s`.
  - `summary_neto`.
- [ ] **Paso 2: correr y ver que fallan.**
- [ ] **Paso 3: implementar** con `Json { ignoreUnknownKeys = true }` y un `JsonElement` recorrido a mano para la PWA, porque sus campos son opcionales y mezclados. Las validaciones replican `validateImport` (`js/data.js:213`) solo para cuentas, movimientos, plantillas y listas. Para el formato propio, clases `@Serializable` espejo de `Snapshot`.
- [ ] **Paso 4: correr y ver que pasan.**
- [ ] **Paso 5: commit** «Home: importar respaldo de la PWA y respaldo propio».

### Tarea 8: prueba de paridad con la PWA

**Files:**
- Create: `android/paridad/extraer_pwa.py`, `core/src/test/kotlin/com/hancel/home/core/ParidadTest.kt`

**Interfaces:**
- Consumes: `parseBackup`, `Ledger`.
- Produces: `android/paridad/local/esperado.json` con la forma `{ "totals": {cash, debt, net}, "balances": {"acc|cat": q}, "reserved": {"acc|cat": q}, "pending": {"cardId": {"acc|cat": q}} }`, en quetzales tal como los da la PWA.

- [ ] **Paso 1: escribir `extraer_pwa.py`** (corre con `.venv/bin/python`).
  1. Levanta `python3 -m http.server 8766` en la raíz del repo como subproceso y espera con `_servidor.espera(8766)` (`sys.path` hacia `tests/`).
  2. Abre Chromium, `goto` a `http://localhost:8766/` y espera `#view .home`.
  3. Con `page.evaluate`, importa `./js/data.js` y `./js/state.js` y ejecuta `restore(validateImport(json))`. Después calcula `totals()`, los saldos de cada categoría, `reservedMap()` y `cardPending(id)` de cada tarjeta.
  4. Escribe `paridad/local/esperado.json`. La entrada es `paridad/local/respaldo.json`.
- [ ] **Paso 2: escribir `ParidadTest.coincide_al_centavo`.** Lee `../paridad/local/respaldo.json` y `esperado.json` relativos a `core/`. Si no existen, usa `Assume.assumeTrue(false)` para que la suite siga en verde sin datos privados. Compara cada valor con `abs(cents - round(q*100)) <= 1` y, si falla, lista **todas** las diferencias (clave, esperado, obtenido).
- [ ] **Paso 3: verificar el salto.** `./gradlew :core:test --tests '*ParidadTest*'`. Esperado: SKIPPED (no hay respaldo).
- [ ] **Paso 4: pedir el respaldo al usuario.** Debe exportarlo desde la PWA del teléfono **sin adjuntos** y copiarlo a `android/paridad/local/respaldo.json`. Corre `extraer_pwa.py` y luego la prueba. Esperado: PASA. Si falla, **detente**: no sigas con la Fase 2 hasta explicar cada diferencia.
- [ ] **Paso 5: commit** «Home: prueba de paridad de saldos y apartados con la PWA» (sin `paridad/local/`).

---

## Fase 2: persistencia

### Tarea 9: Room y repositorios

**Files:**
- Create: `app/src/main/java/com/hancel/home/data/{Entidades,Daos,HomeDb,Mapeo,DineroRepo,ListasRepo,RespaldoRepo}.kt`
- Test: `app/src/test/java/com/hancel/home/data/{DineroRepoTest,ListasRepoTest,RespaldoRepoTest}.kt` (Robolectric, `Room.inMemoryDatabaseBuilder(...).allowMainThreadQueries()`)

**Interfaces:**
- Consumes: modelos, `Ledger.effects`, `applyEffects`, `parseBackup`, `exportHome`.
- Produces:
  ```kotlin
  @Database(version = 1, exportSchema = true) abstract class HomeDb : RoomDatabase()   // esquema exportado a android/app/schemas
  class DineroRepo(db: HomeDb) {
    val accounts: Flow<List<Account>>; val moves: Flow<List<Move>>; val kinds: Flow<List<Kind>>
    val ledger: Flow<Ledger>                      // combine(accounts, moves) en Dispatchers.Default
    suspend fun saveMove(old: Move?, new: Move)   // una transacción: revierte old, aplica new, upsert
    suspend fun deleteMove(m: Move)
    suspend fun saveAccount(a: Account)           // incluye sus categorías; quita las que ya no están
    suspend fun deleteAccount(id: String)
    suspend fun saveKind(k: Kind); suspend fun deleteKind(id: String)
  }
  class ListasRepo(db: HomeDb) {
    val lists: Flow<List<ListDoc>>; val templates: Flow<List<Template>>
    suspend fun saveList(l: ListDoc); suspend fun saveLists(ls: List<ListDoc>); suspend fun deleteList(id: String)
    suspend fun saveTemplate(t: Template); suspend fun deleteTemplate(id: String)
  }
  class RespaldoRepo(db: HomeDb, ajustes: Ajustes) {
    suspend fun snapshot(): Snapshot
    suspend fun replaceAll(s: Snapshot)           // una transacción; borra todo y escribe todo
    suspend fun wipe()
  }
  ```
  Tablas y campos como en la sección 1 de la spec. `move_parts`: PK `(moveId, idx)`, FK a `moves` con cascada y **sin** FK a `categories` ni a `accounts`. `categories` sí tiene FK a `accounts` con cascada. Fechas como `TEXT` ISO mediante `TypeConverter`.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `guardar_gasto_cuadra_saldos`, `editar_gasto_revierte_y_aplica`, `borrar_gasto_devuelve_el_dinero`.
  - `gasto_con_tarjeta_no_toca_la_categoria`.
  - `borrar_categoria_conserva_movimientos` (Review Focus 1).
  - `replaceAll_es_todo_o_nada` (Review Focus 5): un `Snapshot` con un id de categoría duplicado provoca una violación de PK a mitad de la escritura. La prueba espera la excepción y comprueba que los datos previos siguen intactos.
  - `snapshot_ida_y_vuelta`: `replaceAll(s)` y luego `snapshot() == s`.
  - `listas_guardar_y_leer_con_items_en_orden`.
- [ ] **Paso 2: correr y ver que fallan.** `./gradlew :app:testDebugUnitTest --tests '*Repo*'`.
- [ ] **Paso 3: implementar.** `saveMove` usa `db.withTransaction { … }`: lee las cuentas dentro de la transacción, aplica `applyEffects(old, -1)` y `applyEffects(new, +1)`, escribe solo las categorías cambiadas y el movimiento con sus partes (borra las partes viejas).
- [ ] **Paso 4: correr y ver que pasan.**
- [ ] **Paso 5: commit** «Home: base Room y repositorios con transacciones».

### Tarea 10: ajustes (DataStore)

**Files:**
- Create: `app/src/main/java/com/hancel/home/data/Ajustes.kt`
- Test: `app/src/test/java/com/hancel/home/data/AjustesTest.kt`

**Interfaces:**
- Produces: `class Ajustes(store: DataStore<Preferences>) { val portable: Flow<PortableSettings>; suspend fun update(f: (PortableSettings) -> PortableSettings); val collapsed: Flow<Set<String>>; suspend fun toggleCollapsed(accId: String) }`. `RespaldoRepo.replaceAll` escribe `portable`. `collapsed` es del dispositivo y no viaja.

- [ ] **Paso 1: escribir las pruebas** `por_defecto_recent`, `update_persiste` y `collapsed_alterna`, con un `PreferenceDataStoreFactory` en una carpeta temporal.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.** Guarda `CatKey` como `"acc|cat"`.
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: ajustes en DataStore».

---

## Fase 3: primera entrega instalable (importar y ver Finanzas)

### Tarea 11: tema, navegación, Ajustes con importar y exportar

**Files:**
- Create: `HomeApp.kt` (contenedor: `HomeDb`, repos, `Ajustes`, `Clock`), `ui/tema/Tema.kt`, `ui/Navegacion.kt`, `ui/ajustes/{AjustesScreen,AjustesViewModel}.kt`, `ui/comun/Confirmar.kt`, `res/drawable/ic_launcher_foreground.xml` + `mipmap-anydpi-v26/ic_launcher.xml` (icono adaptativo vectorial a partir de `icons/icon.svg`: aro de tres arcos `#d9bc7a`/`#86a8e8`/`#7cc4bb` y palomita `#e8eaee`; fondo `#111317`)
- Modify: `MainActivity.kt`, `AndroidManifest.xml`
- Test: `app/src/test/java/com/hancel/home/ui/{NavegacionTest,AjustesTest}.kt`

**Interfaces:**
- Produces:
  - `HomeTheme { }`: `dynamicDarkColorScheme`/`dynamicLightColorScheme` según `isSystemInDarkTheme()`, `enableEdgeToEdge()`.
  - Rutas `inicio`, `finanzas`, `finanzas/cuenta/{id}`, `listas`, `listas/{id}`, `ajustes`, y las de formularios que agreguen las tareas siguientes.
  - Barra inferior con 3 destinos (Inicio, Finanzas, Listas). Ajustes desde un icono en la `TopAppBar`.
  - El destino de arranque es `inicio`. Durante esta fase muestra un `Text("Inicio")`.
- Ajustes:
  - **Importar respaldo**: `OpenDocument("application/json","text/plain")` → `parseBackup` → diálogo con el resumen («3 cuentas · 11 categorías · 2 412 movimientos · 14 listas · 5 plantillas · Dinero total Q8,341.27») → `replaceAll`. Si hay un error, diálogo con su mensaje.
  - **Exportar respaldo**: «Compartir» (`ACTION_SEND` con `FileProvider` y `home-AAAA-MM-DD.json`) o «Guardar en Archivos» (`CreateDocument`).
  - **Borrar todo**: con confirmación.
  - Versión de la app.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `barra_inferior_cambia_de_destino`.
  - `ajustes_desde_la_barra_superior`.
  - `importar_muestra_resumen_y_reemplaza`: un ViewModel con `RespaldoRepo` en memoria y el JSON de `pwa-minimo.json` (copiado a `app/src/test/resources`).
  - `importar_archivo_malo_no_toca_nada` (Review Focus 5).
  - `estado_se_conserva_al_recrear`: con `ActivityScenario.recreate()` y el destino Finanzas, sigue en Finanzas.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.** El ViewModel de Ajustes expone `sealed interface ImportState { Idle; Preview(summary, snapshot); Error(msg); Done }`. La navegación guarda su estado con `rememberNavController` (sobrevive a la muerte del proceso).
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: tema Material You, navegación y respaldo en Ajustes».

### Tarea 12: Finanzas (lectura) y detalle de cuenta

**Files:**
- Create: `ui/finanzas/{FinanzasScreen,FinanzasViewModel,CuentaScreen,MovimientoFila}.kt`
- Test: `app/src/test/java/com/hancel/home/ui/finanzas/FinanzasTest.kt`

**Interfaces:**
- Consumes: `DineroRepo.ledger`, `Ajustes.collapsed`, `dayLabel`, `money`.
- Produces: `FinanzasViewModel.state: StateFlow<FinanzasState>` con `totals`, cuentas con categorías (libre y apartado), tarjetas (deuda, disponible, desglose, `untracked`), y movimientos agrupados por día como `List<DayGroup(label, moves)>`. «Hoy» se calcula al recolectar con `clock`: el flujo se combina con un tic que emite al cambiar el día (`ACTION_DATE_CHANGED` o recálculo en `ON_RESUME`).
- Pantalla:
  - Tarjeta de total, con «En cuentas Q… · Deuda en tarjetas Q…» solo si hay deuda, y los botones Gasto/Ingreso/Mover (deshabilitados hasta la Tarea 15).
  - `LazyColumn` con `stickyHeader` por día.
  - Cuentas plegables.
  - Cuentas y categorías ordenadas con `byName`. Las tarjetas van en el mismo orden alfabético que las cuentas, igual que la PWA.
  - Saldos negativos en `colorScheme.error`.
  - Sin cuentas: tarjeta vacía con «Crear cuenta» (se activa en la Tarea 14).
- Detalle de cuenta: los movimientos con `accountDelta != 0` o que la tocan, con el encabezado por día.

- [ ] **Paso 1: escribir las pruebas que fallan** (Compose + Robolectric, con datos sembrados en el repo):
  - `muestra_total_y_deuda`.
  - `categoria_con_apartado_muestra_libre`: «Q10.00 por pagar a tarjeta · libre Q490.00».
  - `tarjeta_muestra_desglose_y_saldo_inicial`.
  - `encabezados_hoy_ayer` con `Clock.fixed`.
  - `hoy_se_actualiza_al_cambiar_el_dia` (Review Focus 3): avanza el reloj de prueba, dispara el tic y el encabezado «Hoy» pasa a «Ayer».
  - `plegar_cuenta`.
  - `detalle_de_cuenta`.
  - `movimiento_de_categoria_borrada_dice_eliminada`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: pantalla de Finanzas y detalle de cuenta».

### Tarea 13: firma, versión e instalación (Entrega 1)

**Files:**
- Modify: `app/build.gradle.kts` (`signingConfigs.release` leído de `~/.gradle/gradle.properties`: `HOME_STORE_FILE`, `HOME_STORE_PASSWORD`, `HOME_KEY_ALIAS`, `HOME_KEY_PASSWORD`; `versionCode`/`versionName` en `android/gradle.properties`; `isMinifyEnabled = true` + reglas de R8 por defecto)
- Modify: `CLAUDE.md` (en la sección de Home: cómo firmar, subir `versionCode` e instalar)

- [ ] **Paso 1: generar la llave.** `keytool -genkeypair -v -keystore ~/.android/home-release.jks -alias home -keyalg RSA -keysize 4096 -validity 36500` con una contraseña aleatoria. Anota las cuatro propiedades en `~/.gradle/gradle.properties`.
- [ ] **Paso 2: compilar.** `./gradlew test :app:assembleRelease`. Esperado: `app-release.apk` firmado. Compruébalo con `apksigner verify --print-certs`.
- [ ] **Paso 3: pedir al usuario** que guarde una copia de `~/.android/home-release.jks` y su contraseña (por ejemplo en Drive), y que active la **depuración inalámbrica**. Con los datos que le muestra el teléfono: `adb pair <ip:puerto> <código>` y `adb connect <ip:puerto>`.
- [ ] **Paso 4: instalar** con `adb install -r app/build/outputs/apk/release/app-release.apk`. El usuario importa su respaldo y compara el total y los saldos con la PWA. Si el teléfono no está, envíale el APK.
- [ ] **Paso 5: commit** «Home: firma de la versión y primera entrega», y `push`.

---

## Fase 4: formularios de dinero (Entrega 2)

### Tarea 14: componentes comunes, cuentas, categorías y tipos de gasto

**Files:**
- Create: `ui/comun/{CampoMonto,CampoFecha,SelectorCategoria}.kt`, `ui/finanzas/{CuentaForm,CategoriaForm}.kt`, `ui/ajustes/TiposScreen.kt`
- Test: `app/src/test/java/com/hancel/home/ui/comun/SelectorCategoriaTest.kt`, `ui/finanzas/CuentaFormTest.kt`

**Interfaces:**
- Produces:
  - `CampoMonto(value: Long?, onChange: (Long?) -> Unit, label: String)`: teclado `KeyboardType.Decimal` y `parseMoney`.
  - `CampoFecha(value: LocalDate, onChange: (LocalDate) -> Unit)`: `DatePickerDialog` de Material 3 en hora local.
  - `SelectorCategoria(selected: CatKey?, options: List<CatKey>, ledger: Ledger, amountOf: (CatKey) -> Long, placeholder: String, onPick: (CatKey) -> Unit)`: botón que abre un `ModalBottomSheet` en dos pasos (cuentas con su suma → categorías con su monto, botón «volver»). Con una sola cuenta va directo al paso 2. El botón muestra «Cuenta · Categoría».
- Formularios:
  - **Cuenta**: nombre; tipo normal o tarjeta; en tarjeta, límite y «Deuda actual» (escribe `cats[0].balance = -deuda` y crea la categoría «Deuda» si falta).
  - **Categoría**: «Para qué es el dinero» y «Dinero real que hay ahora», con el aviso de que corrige el saldo directamente.
  - Ambos se pueden eliminar con confirmación.
  - **Tipos de gasto**: agregar, renombrar, borrar, en orden `byName`. Si la base está vacía, se siembran los de la PWA: Comida, Transporte, Servicios, Suscripciones, Salud, Ocio, Hogar, Otros.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `selector_dos_pasos` y `selector_una_cuenta_salta_a_categorias`.
  - `campo_monto_acepta_coma`.
  - `crear_tarjeta_con_deuda`.
  - `editar_saldo_de_categoria`.
  - `borrar_categoria_pide_confirmacion`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.** Los formularios son pantallas completas con «Guardar» en la `TopAppBar`. Su estado vive en el ViewModel con `SavedStateHandle`, para que sobreviva a la muerte del proceso.
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: selector de categoría y formularios de cuenta, categoría y tipos».

### Tarea 15: formulario de gasto

**Files:**
- Create: `ui/finanzas/{GastoForm,GastoViewModel}.kt`
- Test: `app/src/test/java/com/hancel/home/ui/finanzas/GastoFormTest.kt`

**Interfaces:**
- Consumes: `ExpenseDraft` y sus funciones (Tarea 5), `SelectorCategoria`, `CampoMonto`, `CampoFecha`, `DineroRepo.saveMove/deleteMove`, `Ajustes.update` (`lastKind`).
- Produces: la ruta `finanzas/gasto?id={id}&acc={acc}&cat={cat}&card={card}`, usada por Finanzas (botón, toque en una categoría, «Compra» de una tarjeta), por el detalle de cuenta (tocar un gasto) y por Inicio.
- Campos en orden:
  - Título (obligatorio, máx. 60).
  - Monto total.
  - Tipo de gasto (último usado).
  - «Pagado con», solo si hay tarjetas.
  - Filas de categoría. Su etiqueta es «Se descuenta de» o, con tarjeta, «Categoría de la que saldrá el dinero al pagar la tarjeta».
  - Línea de estado con los textos de `DraftStatus`, igual que la PWA.
  - «Agregar otra categoría», visible solo con `Missing` + `canAdd` y sin filas por elegir.
  - Casilla «Permitir saldo negativo» con su explicación.
  - Nota (máx. 120).
  - Fecha.
  - Al editar, «Eliminar» en el menú.
- `checkSave` → `Error`: snackbar. `Confirm`: `AlertDialog` y se reintenta con la confirmación.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `gasto_simple_guarda_y_actualiza_saldo`.
  - `sin_titulo_no_guarda`.
  - `reparto_automatico_y_falta_asignar`.
  - `pasarse_pide_confirmacion`.
  - `editar_abre_con_negativo_si_aplica`.
  - `compra_con_tarjeta_desde_finanzas_preselecciona_tarjeta`.
  - `formulario_sobrevive_a_recrear` (con `StateRestorationTester` o `recreate()`: título y monto siguen escritos).
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: formulario de gasto con reparto entre categorías».

### Tarea 16: ingreso, mover y pago de tarjeta (Entrega 2)

**Files:**
- Create: `ui/finanzas/{FlujoForm,PagoTarjetaForm}.kt` (con sus ViewModels)
- Test: `app/src/test/java/com/hancel/home/ui/finanzas/FlujoFormTest.kt`, `PagoTarjetaFormTest.kt`

**Interfaces:**
- Consumes: `proposeCardPayment`, `payWarnings`, `Ledger.availWithout`, `Ajustes` (`lastFrom`, `lastIncomeTo`).
- Ingreso («Entra a», monto, descripción, fecha) y Mover («Desde», con lo libre; «Hacia», con el saldo). Los valores por defecto siguen a `flowForm`: `lastFrom`/`lastIncomeTo` o la primera normal. Si origen y destino son iguales: «Elige categorías distintas.».
- Pago de tarjeta: «Debes Q…», filas de la propuesta, «Otra categoría», «Total a pagar: Q…» con los avisos, descripción (por defecto «Pago <tarjeta>»), fecha, y el botón «Registrar pago». Sin montos: «Indica cuánto vas a pagar.».
- Las tarjetas no se ofrecen en ningún selector de estos formularios.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `ingreso_suma`.
  - `mover_entre_categorias` y `mover_misma_categoria_rechaza`.
  - `pago_tarjeta_propone_pendiente_y_baja_apartado`.
  - `pago_mas_de_lo_que_debes_avisa`.
  - `editar_y_eliminar_pago`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.** Activa los botones Gasto/Ingreso/Mover de Finanzas y «Pagar tarjeta».
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: ingreso, mover y pago de tarjeta». Después sube `versionCode`, compila el release, ejecuta `adb install -r` y entrega para que el usuario lo pruebe.

---

## Fase 5: Listas (Entrega 3)

### Tarea 17: vista de listas, crear y archivo

**Files:**
- Create: `ui/listas/{ListasScreen,ListasViewModel,NuevaListaSheet}.kt`
- Test: `app/src/test/java/com/hancel/home/ui/listas/ListasTest.kt`

**Interfaces:**
- Consumes: `orderedActive`, `seedOrder`, `reorder`, `progress`, `lateCount`, `nextDue`, `ListasRepo`, `Ajustes` (`listSort`, `listManualSeeded`).
- Pestañas superiores `Listas · Agenda · Plantillas · Archivadas (N)`. La pestaña elegida se guarda con `rememberSaveable`. Agenda y Plantillas se rellenan en la Tarea 19.
- Cada fila de lista muestra nombre, avance «3/8», barra de progreso, «N vencidas» (en rojo) o «Próxima: 5 nov», y el icono de fijada.
- Orden:
  - Menú con Recientes, Por fecha y Manual.
  - La primera vez que se elige Manual se usa `seedOrder(visible)` y se marca `listManualSeeded`.
  - En Manual se arrastra con `sh.calvin.reorderable` (`ReorderableItem` dentro de `LazyColumn`), solo dentro de su grupo, y se guarda con `reorder` al soltar.
  - Una lista nueva queda arriba: `order = min − 1`.
- **Nueva lista**: hoja con «Lista vacía» (nombre) o una plantilla (con su `DueInfo`). Al crearla, abre el detalle.
- **Archivadas**: solo lectura, «Restaurar» y «Eliminar».

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `fijadas_primero`.
  - `cambiar_a_manual_conserva_lo_visible`.
  - `arrastrar_reordena_y_persiste` (con `performTouchInput { longClick(); moveBy(...) }`).
  - `crear_desde_plantilla_con_fechas`.
  - `restaurar_archivada`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: vista de listas con orden manual por arrastre y archivo».

### Tarea 18: detalle de lista

**Files:**
- Create: `ui/listas/{ListaScreen,ListaViewModel,ElementoSheet}.kt`
- Test: `app/src/test/java/com/hancel/home/ui/listas/ListaTest.kt`

**Interfaces:**
- Consumes: `sink`, `sections`, `toggle`, `finish`, `templateFromList`, `ListasRepo`.
- Pantalla:
  - Secciones con su encabezado. Lo hecho va tachado, abajo, según `sink(items, l.sortDue)`.
  - «Adicionales» aparte (`extra`).
  - Cada fila tiene casilla, texto, fecha («Hoy», «Vencida 2 nov» en rojo) y un icono de calendario que abre `CampoFecha` (con «Quitar fecha»).
  - Tocar el texto abre `ElementoSheet`: editar el texto, fecha, eliminar.
- **Campo para agregar**, fijo abajo (`imePadding()`). Agrega con `extra = true` y **conserva el foco** con un `FocusRequester` que no se suelta.
- Menú: fijar, ordenar por fecha (`sortDue`), renombrar, guardar como plantilla y eliminar (con confirmación).
- **«Finalizar lista»** visible solo si `isDone()`; archiva y vuelve atrás.
- Una lista archivada se muestra sin controles de edición.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `marcar_baja_al_final_y_desmarcar_vuelve`.
  - `agregar_mantiene_foco_y_va_a_adicionales`.
  - `poner_fecha`.
  - `finalizar_solo_con_todo_marcado`.
  - `archivada_es_solo_lectura`.
  - `guardar_como_plantilla`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: detalle de lista».

### Tarea 19: plantillas y agenda

**Files:**
- Create: `ui/listas/{PlantillasScreen,PlantillaForm,PlantillaViewModel,AgendaScreen}.kt`
- Test: `app/src/test/java/com/hancel/home/ui/listas/PlantillasTest.kt`, `AgendaTest.kt`

**Interfaces:**
- Consumes: `dueInfo`, `parseItems`, `agenda`, `Freq`, `ListasRepo`, `clock`.
- **Plantillas**: tarjetas con el nombre, el número de elementos y la etiqueta «Ya toca» / «Toca en N días», más el botón «Crear lista».
- **Editor**:
  - Nombre y frecuencia (Sin periodo, Cada semana, Cada 15 días, Cada mes).
  - Filas en una `LazyColumn`, cada una con un `TextField`, y que se pueden reordenar.
  - Enter (`ImeAction.Next`) agrega una fila debajo y le pasa el foco. Backspace en una fila vacía (`onPreviewKeyEvent`) la quita y devuelve el foco a la anterior.
  - Pegar texto con saltos de línea en una fila la divide con `parseItems`.
  - Con el foco en una fila aparecen sus herramientas: «Es una sección» y «Vence a los _ días» (0–365).
  - El estado del editor vive en el ViewModel (`SavedStateHandle`).
  - Menú del editor: «Eliminar plantilla», con confirmación. Las listas ya creadas no cambian.
- **Agenda**: grupos de `agenda(lists, today)` con su contador y «Vencidas» en rojo. La casilla marca en el sitio y tocar la fila abre la lista. «Hoy» se recalcula al volver a la pantalla (Review Focus 3).

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `enter_agrega_fila_con_foco`.
  - `backspace_en_vacia_la_quita`.
  - `pegar_varias_lineas`.
  - `ya_toca`.
  - `agenda_grupos_y_marcar`.
  - `agenda_cambia_de_dia`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: plantillas con editor por filas y agenda».

---

## Fase 6: Inicio y cierre de la app (Entrega 3)

### Tarea 20: Inicio

**Files:**
- Create: `ui/inicio/{InicioScreen,InicioViewModel}.kt`
- Test: `app/src/test/java/com/hancel/home/ui/inicio/InicioTest.kt`

**Interfaces:**
- Consumes: `todayTasks`, `greeting`, `fmtDate`, `ListasRepo`, `clock`, las rutas de formulario de la Tarea 15 y 16, y la pestaña Agenda de la Tarea 17.
- Pantalla:
  - «Lunes · 3 nov» y el saludo según la hora.
  - **Tareas de hoy**: 3 visibles y luego «Ver N más en Listas», que abre Listas › Agenda. Al marcar una, la fila **no desaparece** hasta salir de Inicio (el ViewModel guarda los ids `justMarked`, que se limpian en `ON_STOP`). Tocar el texto abre su lista. Sin tareas: «Nada pendiente para hoy».
  - Tres botones grandes: Gasto, Ingreso, Mover.
  - Sin tarjeta de saldo.

- [ ] **Paso 1: escribir las pruebas que fallan:**
  - `muestra_tres_y_ver_mas`.
  - `marcar_no_salta`.
  - `botones_abren_formularios`.
  - `fecha_y_saludo_con_reloj_fijo`.
- [ ] **Paso 2: verificar que fallan.**
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4: verificar que pasan.**
- [ ] **Paso 5: commit** «Home: Inicio con tareas de hoy y accesos rápidos».

### Tarea 21: restauración tras matar el proceso y entrega completa

**Files:**
- Test: `app/src/test/java/com/hancel/home/ui/RestauracionTest.kt`
- Modify: lo que las pruebas revelen. Probablemente agregar `rememberSaveable` o `SavedStateHandle` en lugares que faltaron.

- [ ] **Paso 1: escribir las pruebas que fallan.** Con `ActivityScenario.recreate()` y con el ciclo de `onSaveInstanceState` y un `Bundle` nuevo:
  - `restaura_lista_abierta_y_scroll`.
  - `restaura_pestana_de_listas`.
  - `restaura_detalle_de_cuenta`.
  - `restaura_formulario_de_mover_a_medias`.
- [ ] **Paso 2: verificar** cuáles fallan.
- [ ] **Paso 3: corregir** lo necesario.
- [ ] **Paso 4: verificar** con `./gradlew test`. Esperado: todo en verde.
- [ ] **Paso 5: validar en el teléfono.** Sube `versionCode` e instala el release. El usuario, con la opción de desarrollador «No conservar actividades», abre una lista, pasa a otra app y vuelve: debe seguir en la misma lista.
- [ ] **Paso 6: commit** «Home: restaurar el estado tras matar el proceso» y entrega. Desde aquí el usuario usa Home y la PWA en paralelo unos días.

---

## Fase 7: transición (solo con la confirmación del usuario)

### Tarea 22: retirar la web y documentar Home

**Requisito previo:** el usuario confirma explícitamente que Home le funciona y que puede retirar la PWA. **No la ejecutes sin esa confirmación.**

**Files:**
- Delete (un commit): `index.html`, `js/`, `css/`, `fonts/`, `sw.js`, `manifest.webmanifest`, `tests/` (Playwright), `icons/*.png`, `icons/generar.py`. Se conserva `icons/icon.svg` como fuente del logo.
- Modify (otro commit): `CLAUDE.md` reescrito para Android (estructura de `android/`, reglas de dinero en `:core`, Room, pruebas, firma, entrega, flujo Git) y `Documentacion.md`.
- Mover: `android/paridad/extraer_pwa.py` queda inútil sin la PWA. Se borra en el mismo commit que la web.

- [ ] **Paso 1: commit** «Retirar la PWA: Home la reemplaza». Indica el hash y cómo revertirlo con `git revert <hash>`.
- [ ] **Paso 2: commit** de la documentación.
- [ ] **Paso 3: pedir al usuario** que desactive GitHub Pages y renombre el repositorio a **Home** en GitHub (Settings › General). Después: `git remote set-url origin https://github.com/HancelLeonel/Home.git`, y el usuario renombra la carpeta local a `Home`. Al cambiar de ruta, la memoria del proyecto de Claude Code empieza vacía: hay que copiar `~/.claude/projects/-Users-hancelt-Documents-Proyectos-Tracker/memory/` a la carpeta de proyecto nueva.
- [ ] **Paso 4: `push`.**
