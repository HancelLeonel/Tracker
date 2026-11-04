package com.hancel.home.core.respaldo

import com.hancel.home.core.Account
import com.hancel.home.core.AccountType
import com.hancel.home.core.CatKey
import com.hancel.home.core.Category
import com.hancel.home.core.Freq
import com.hancel.home.core.Kind
import com.hancel.home.core.Ledger
import com.hancel.home.core.ListDoc
import com.hancel.home.core.ListItem
import com.hancel.home.core.ListSort
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
import com.hancel.home.core.PortableSettings
import com.hancel.home.core.Snapshot
import com.hancel.home.core.Template
import com.hancel.home.core.TemplateItem
import com.hancel.home.core.newId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

// Lectura de respaldos: el de la PWA Tracker (montos en quetzales con decimales) y el propio de Home (centavos).
// Las validaciones replican validateImport de data.js, solo para cuentas, movimientos, plantillas y listas.

class ImportError(message: String) : Exception(message)

data class ImportSummary(val accounts: Int, val categories: Int, val moves: Int, val lists: Int, val templates: Int, val net: Long)

const val HOME_APP = "home"
const val HOME_VERSION = 1
private val PWA_APPS = setOf("tracker", "mi-quincena")
private val PWA_VERSIONS = setOf(2, 3)

val DEFAULT_KINDS = listOf("Comida", "Transporte", "Servicios", "Suscripciones", "Salud", "Ocio", "Hogar", "Otros")

/** Quetzales con decimales → centavos, mitad hacia arriba, usando el texto decimal (12.345 da 1235, no 1234). */
fun cents(q: Double): Long = BigDecimal(q.toString()).setScale(2, RoundingMode.HALF_UP).movePointRight(2).toLong()

/** Lee un respaldo de la PWA o de Home. `today` es la fecha que toma una lista sin fecha de creación. */
fun parseBackup(json: String, today: LocalDate): Snapshot {
    val root = try {
        Json.parseToJsonElement(json)
    } catch (e: Exception) {
        throw ImportError("El archivo no se pudo leer: no es un respaldo válido.")
    }
    val d = root as? JsonObject ?: throw ImportError("El archivo no es un respaldo de esta app.")
    val app = d.str("app")
    val version = d.num("version")?.toInt()
    return when (app) {
        HOME_APP -> {
            if (version == null || version < 1) throw ImportError("Este respaldo es de una versión que ya no se puede importar.")
            if (version > HOME_VERSION) throw ImportError("Este respaldo es de una versión más nueva de Home. Actualiza la app.")
            Reader(d, today, homeCents = true).snapshot()
        }
        in PWA_APPS -> {
            if (version !in PWA_VERSIONS) throw ImportError("Este respaldo es de una versión que ya no se puede importar.")
            Reader(d, today, homeCents = false).snapshot()
        }
        else -> throw ImportError("El archivo no es un respaldo de esta app.")
    }
}

fun Snapshot.summary() = ImportSummary(
    accounts = accounts.size,
    categories = accounts.sumOf { it.cats.size },
    moves = moves.size,
    lists = lists.size,
    templates = templates.size,
    net = Ledger(accounts, moves).totals().net,
)

private val YMD = Regex("^\\d{4}-\\d{2}-\\d{2}$")

private fun JsonObject.prim(k: String) = this[k] as? JsonPrimitive
private fun JsonObject.str(k: String): String? = prim(k)?.takeIf { it.isString }?.content
private fun JsonObject.num(k: String): Double? = prim(k)?.takeIf { it !is JsonNull }?.doubleOrNull?.takeIf { it.isFinite() }

/** Equivalente de la verdad de JS para un id (`!x.id`): falta, null, "", 0 y false no valen. */
private fun JsonObject.id(k: String = "id"): String? {
    val p = prim(k) ?: return null
    if (p is JsonNull) return null
    if (p.isString) return p.content.ifEmpty { null }
    p.booleanOrNull?.let { return if (it) "true" else null }
    val n = p.doubleOrNull ?: return null
    if (n == 0.0) return null
    return if (n == Math.floor(n) && Math.abs(n) < 1e15) n.toLong().toString() else p.content
}

private fun JsonObject.truthy(k: String): Boolean {
    val p = prim(k) ?: return false
    if (p is JsonNull) return false
    if (p.isString) return p.content.isNotEmpty()
    p.booleanOrNull?.let { return it }
    return (p.doubleOrNull ?: 0.0) != 0.0
}

private fun JsonObject.ymd(k: String): LocalDate? = str(k)?.takeIf { YMD.matches(it) }?.let {
    try { LocalDate.parse(it) } catch (e: Exception) { null }
}

private class Reader(val d: JsonObject, val today: LocalDate, val homeCents: Boolean) {
    fun bad(msg: String): Nothing = throw ImportError(msg)

    fun arr(k: String, name: String): List<JsonElement> = when (val v = d[k]) {
        null -> emptyList()
        is JsonArray -> v
        else -> bad("El respaldo está dañado ($name).")
    }

    fun objs(k: String, name: String, invalid: String) = arr(k, name).map { it as? JsonObject ?: bad(invalid) }

    /** Monto obligatorio: número finito, o error. */
    fun amount(o: JsonObject, k: String): Long {
        val p = o.prim(k)?.takeIf { !it.isString && it !is JsonNull } ?: bad("Hay un monto inválido en el archivo.")
        val n = p.doubleOrNull?.takeIf { it.isFinite() } ?: bad("Hay un monto inválido en el archivo.")
        return if (homeCents) Math.round(n) else cents(n)
    }

    /** `Number(x) || 0` de la PWA: tolerante. */
    fun lenient(o: JsonObject, k: String): Long {
        val n = o.prim(k)?.takeIf { it !is JsonNull }?.content?.toDoubleOrNull()?.takeIf { it.isFinite() } ?: return 0
        return if (homeCents) Math.round(n) else cents(n)
    }

    fun ref(e: JsonElement?, invalid: String): CatKey {
        val o = e as? JsonObject ?: bad(invalid)
        return CatKey(o.id("acc") ?: bad(invalid), o.id("cat") ?: bad(invalid))
    }

    fun snapshot(): Snapshot {
        val accounts = objs("accounts", "cuentas", "Hay una cuenta inválida en el archivo.").map { a ->
            val id = a.id() ?: bad("Hay una cuenta inválida en el archivo.")
            val name = a.str("name") ?: bad("Hay una cuenta inválida en el archivo.")
            val cats = a["cats"] as? JsonArray ?: bad("Hay una cuenta inválida en el archivo.")
            Account(
                id = id, name = name,
                type = if (a.str("type") == "credit") AccountType.CREDIT else AccountType.NORMAL,
                limit = lenient(a, "limit"),
                cats = cats.map { ce ->
                    val c = ce as? JsonObject ?: bad("Hay una categoría inválida en el archivo.")
                    val cid = c.id() ?: bad("Hay una categoría inválida en el archivo.")
                    val cname = c.str("name") ?: bad("Hay una categoría inválida en el archivo.")
                    Category(cid, cname, amount(c, "balance"))
                },
            )
        }

        val badMove = "Hay un movimiento inválido en el archivo."
        val moves = objs("moves", "movimientos", badMove).map { m ->
            val id = m.id() ?: bad(badMove)
            val type = when (m.str("type")) {
                "expense" -> MoveType.EXPENSE; "income" -> MoveType.INCOME; "transfer" -> MoveType.TRANSFER; else -> bad(badMove)
            }
            val date = m.ymd("date") ?: bad(badMove)
            val partsJson = m["parts"] as? JsonArray ?: bad(badMove)
            if (partsJson.isEmpty()) bad(badMove)
            val declared = amount(m, "total")
            val parts = partsJson.map { pe -> Part(ref(pe, badMove), amount(pe as JsonObject, "amount")) }
            val sum = parts.sumOf { it.amount }
            Move(
                id = id,
                t = m.prim("t")?.content?.toDoubleOrNull()?.toLong() ?: 0,
                type = type, date = date,
                title = if (m.truthy("title")) m.prim("title")!!.content else "",
                note = m.prim("note")?.takeIf { it !is JsonNull }?.content ?: "",
                kindId = m.id("kind"), cardId = m.id("card"),
                to = if (type == MoveType.TRANSFER) ref(m["to"], badMove) else null,
                // Al redondear a centavos las partes pueden no sumar el total: mandan las partes, que son las que mueven saldos.
                total = if (sum != declared) sum else declared,
                parts = parts,
            )
        }

        val badTpl = "Hay una plantilla inválida en el archivo."
        val templates = objs("templates", "plantillas", badTpl).map { t ->
            val id = t.id() ?: bad(badTpl)
            val name = t.str("name") ?: bad(badTpl)
            val items = t["items"] as? JsonArray ?: bad(badTpl)
            Template(
                id = id, name = name, freq = Freq.entries.firstOrNull { it.key == t.str("freq") } ?: Freq.NONE,
                items = items.mapNotNull { it as? JsonObject }.filter { it.str("text") != null }.map { i ->
                    val due = i.num("dueIn")?.takeIf { it == Math.floor(it) && it in 0.0..365.0 }?.toInt()
                    if (i.truthy("head")) TemplateItem(i.str("text")!!, head = true) else TemplateItem(i.str("text")!!, dueIn = due)
                },
            )
        }

        val badList = "Hay una lista inválida en el archivo."
        val lists = objs("lists", "listas", badList).map { l ->
            val id = l.id() ?: bad(badList)
            val name = l.str("name") ?: bad(badList)
            val items = l["items"] as? JsonArray ?: bad(badList)
            ListDoc(
                id = id, name = name, tplId = l.id("tplId"),
                created = l.ymd("created") ?: today,
                t = l.prim("t")?.content?.toDoubleOrNull()?.toLong() ?: 0,
                archived = l.ymd("archived"),
                pinned = l.truthy("pinned"), sortDue = l.truthy("sortDue"),
                order = l.num("order")?.toInt(),
                items = items.mapNotNull { it as? JsonObject }.filter { it.id() != null && it.str("text") != null }.map { i ->
                    val head = i.truthy("head")
                    val done = !head && i.truthy("done")
                    ListItem(
                        id = i.id()!!, text = i.str("text")!!, head = head, done = done,
                        due = if (head) null else i.ymd("due"),
                        doneAt = if (done) i.ymd("doneAt") else null,
                        extra = i.truthy("extra"),
                    )
                },
            )
        }

        val settings = d["settings"] as? JsonObject ?: JsonObject(emptyMap())
        val kindsJson = (if (homeCents) d["kinds"] else settings["types"]) as? JsonArray
        val kinds = kindsJson?.mapNotNull { it as? JsonObject }?.mapNotNull { k ->
            val kid = k.id() ?: return@mapNotNull null
            Kind(kid, k.str("name") ?: return@mapNotNull null)
        } ?: DEFAULT_KINDS.map { Kind(newId(), it) }

        return Snapshot(
            accounts = accounts, moves = moves, kinds = kinds, lists = lists, templates = templates,
            settings = PortableSettings(
                listSort = ListSort.of(settings.str("listSort")),
                listManualSeeded = settings.truthy("listManualSeeded"),
                lastKind = settings.id("lastKind"),
                lastFrom = CatKey.parse(settings.str("lastFrom")),
                lastIncomeTo = CatKey.parse(settings.str("lastIncomeTo")),
            ),
        )
    }
}
