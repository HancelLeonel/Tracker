package com.hancel.home.core.respaldo

import com.hancel.home.core.AccountType
import com.hancel.home.core.CatKey
import com.hancel.home.core.MoveType
import com.hancel.home.core.Snapshot
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.time.Instant

@OptIn(ExperimentalSerializationApi::class)
private val PRETTY = Json { prettyPrint = true; prettyPrintIndent = "  " }

private fun JsonObjectBuilder.ref(k: String, c: CatKey) = putJsonObject(k) { put("acc", c.acc); put("cat", c.cat) }

/**
 * Respaldo propio de Home: los mismos nombres de campo que la PWA (así se lee con el mismo lector), pero con montos
 * en centavos enteros, los tipos de gasto en `kinds` y sin nada de lo que Home no usa.
 */
fun exportHome(s: Snapshot, exportedAt: Instant): String = PRETTY.encodeToString(
    kotlinx.serialization.json.JsonObject.serializer(),
    buildJsonObject {
        put("app", HOME_APP)
        put("version", HOME_VERSION)
        put("exportedAt", exportedAt.toString())
        putJsonObject("settings") {
            put("listSort", s.settings.listSort.key)
            put("listManualSeeded", s.settings.listManualSeeded)
            s.settings.lastKind?.let { put("lastKind", it) }
            s.settings.lastFrom?.let { put("lastFrom", it.toString()) }
            s.settings.lastIncomeTo?.let { put("lastIncomeTo", it.toString()) }
        }
        putJsonArray("kinds") { s.kinds.forEach { k -> addJsonObject { put("id", k.id); put("name", k.name) } } }
        putJsonArray("accounts") {
            s.accounts.forEach { a ->
                addJsonObject {
                    put("id", a.id); put("name", a.name); put("type", if (a.type == AccountType.CREDIT) "credit" else "normal"); put("limit", a.limit)
                    putJsonArray("cats") { a.cats.forEach { c -> addJsonObject { put("id", c.id); put("name", c.name); put("balance", c.balance) } } }
                }
            }
        }
        putJsonArray("moves") {
            s.moves.forEach { m ->
                addJsonObject {
                    put("id", m.id); put("t", m.t)
                    put("type", when (m.type) { MoveType.EXPENSE -> "expense"; MoveType.INCOME -> "income"; MoveType.TRANSFER -> "transfer" })
                    put("date", m.date.toString())
                    if (m.title.isNotEmpty()) put("title", m.title)
                    put("note", m.note)
                    m.kindId?.let { put("kind", it) }
                    m.cardId?.let { put("card", it) }
                    m.to?.let { ref("to", it) }
                    put("total", m.total)
                    putJsonArray("parts") { m.parts.forEach { p -> addJsonObject { put("acc", p.key.acc); put("cat", p.key.cat); put("amount", p.amount) } } }
                }
            }
        }
        putJsonArray("templates") {
            s.templates.forEach { t ->
                addJsonObject {
                    put("id", t.id); put("name", t.name); put("freq", t.freq.key)
                    putJsonArray("items") {
                        t.items.forEach { i -> addJsonObject { put("text", i.text); if (i.head) put("head", true); i.dueIn?.let { put("dueIn", it) } } }
                    }
                }
            }
        }
        putJsonArray("lists") {
            s.lists.forEach { l ->
                addJsonObject {
                    put("id", l.id); put("name", l.name); l.tplId?.let { put("tplId", it) }
                    put("created", l.created.toString()); put("t", l.t)
                    l.archived?.let { put("archived", it.toString()) }
                    if (l.pinned) put("pinned", true)
                    if (l.sortDue) put("sortDue", true)
                    l.order?.let { put("order", it) }
                    putJsonArray("items") {
                        l.items.forEach { i ->
                            addJsonObject {
                                put("id", i.id); put("text", i.text)
                                if (i.head) put("head", true) else put("done", i.done)
                                i.due?.let { put("due", it.toString()) }
                                i.doneAt?.let { put("doneAt", it.toString()) }
                                if (i.extra) put("extra", true)
                            }
                        }
                    }
                }
            }
        }
    },
)
