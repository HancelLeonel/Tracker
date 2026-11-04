package com.hancel.home.core

import com.hancel.home.core.respaldo.cents
import com.hancel.home.core.respaldo.parseBackup
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * Paridad con la PWA: con el respaldo real del usuario (android/paridad/local/, fuera del repo) y lo que calculó la PWA
 * (`paridad/extraer_pwa.py`), Home debe dar los mismos montos al centavo (±1 por redondeo). Sin esos archivos se salta.
 * `PARIDAD_DIR` cambia la carpeta (p. ej. para probar el circuito con un respaldo sintético).
 */
class ParidadTest {
    private val dir = File(System.getenv("PARIDAD_DIR") ?: "../paridad/local")

    @Test fun coincide_al_centavo() {
        val backup = File(dir, "respaldo.json")
        val expected = File(dir, "esperado.json")
        assumeTrue("Sin respaldo en ${dir.absolutePath}", backup.exists() && expected.exists())

        val s = parseBackup(backup.readText(), LocalDate.now())
        val l = Ledger(s.accounts, s.moves)
        val e = Json.parseToJsonElement(expected.readText()).jsonObject
        val diffs = mutableListOf<String>()

        fun cmp(what: String, q: Double, got: Long) {
            val want = cents(q)
            if (Math.abs(want - got) > 1) diffs += "$what: esperado ${money(want)}, Home ${money(got)}"
        }
        fun cmpMap(what: String, want: JsonObject, got: Map<CatKey, Long>) {
            val keys = want.keys + got.keys.map { it.toString() }
            for (k in keys.sorted()) cmp("$what $k", want[k]?.jsonPrimitive?.double ?: 0.0, got[CatKey.parse(k)] ?: 0)
        }

        val t = e.getValue("totals").jsonObject
        val tot = l.totals()
        cmp("totals.cash", t.getValue("cash").jsonPrimitive.double, tot.cash)
        cmp("totals.debt", t.getValue("debt").jsonPrimitive.double, tot.debt)
        cmp("totals.net", t.getValue("net").jsonPrimitive.double, tot.net)
        val balances = s.accounts.flatMap { a -> a.cats.map { CatKey(a.id, it.id) to it.balance } }.toMap()
        cmpMap("balance", e.getValue("balances").jsonObject, balances)
        cmpMap("reserved", e.getValue("reserved").jsonObject, l.reservedMap())
        val pending = e.getValue("pending").jsonObject
        val cards = pending.keys + s.accounts.filter { it.isCredit }.map { it.id }
        for (card in cards.sorted()) cmpMap("pending[$card]", pending[card]?.jsonObject ?: JsonObject(emptyMap()), l.cardPending(card))

        assertTrue("Diferencias con la PWA (${diffs.size}):\n" + diffs.joinToString("\n"), diffs.isEmpty())
        println("Paridad: ${balances.size} categorías, ${s.moves.size} movimientos, neto ${money(tot.net)} — sin diferencias")
    }
}
