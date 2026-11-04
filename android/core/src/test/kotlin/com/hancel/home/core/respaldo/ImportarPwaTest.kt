package com.hancel.home.core.respaldo

import com.hancel.home.core.CatKey
import com.hancel.home.core.Freq
import com.hancel.home.core.Kind
import com.hancel.home.core.ListItem
import com.hancel.home.core.ListSort
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
import com.hancel.home.core.TemplateItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ImportarPwaTest {
    private val hoy = LocalDate.of(2026, 11, 3)
    private val json = javaClass.getResource("/pwa-minimo.json")!!.readText()
    private val s by lazy { parseBackup(json, hoy) }

    private fun error(text: String) = assertThrows(ImportError::class.java) { parseBackup(text, hoy) }.message

    @Test fun rechaza_otra_app_y_version() {
        assertEquals("El archivo no es un respaldo de esta app.", error("""{"app":"x"}"""))
        assertEquals("El archivo no es un respaldo de esta app.", error("""[1,2]"""))
        assertEquals("Este respaldo es de una versión que ya no se puede importar.", error("""{"app":"tracker","version":1}"""))
        parseBackup("""{"app":"mi-quincena","version":2}""", hoy) // los respaldos con el nombre anterior siguen valiendo
    }

    @Test fun rechaza_json_roto_con_mensaje_en_espanol() {
        assertEquals("El archivo no se pudo leer: no es un respaldo válido.", error("""{"app": "tracker", """))
        assertEquals("El archivo no se pudo leer: no es un respaldo válido.", error(""))
    }

    @Test fun rechaza_montos_y_registros_invalidos() {
        val base = """{"app":"tracker","version":3,"""
        assertEquals("Hay un monto inválido en el archivo.", error(base + """"accounts":[{"id":"a","name":"A","cats":[{"id":"c","name":"C","balance":"x"}]}]}"""))
        assertEquals("Hay una cuenta inválida en el archivo.", error(base + """"accounts":[{"id":"a","name":"A"}]}"""))
        assertEquals("Hay una categoría inválida en el archivo.", error(base + """"accounts":[{"id":"a","name":"A","cats":[{"name":"C","balance":1}]}]}"""))
        assertEquals("Hay un movimiento inválido en el archivo.", error(base + """"moves":[{"id":"m","type":"expense","date":"2026-1-1","total":1,"parts":[{"acc":"a","cat":"c","amount":1}]}]}"""))
        assertEquals("Hay un movimiento inválido en el archivo.", error(base + """"moves":[{"id":"m","type":"expense","date":"2026-01-01","total":1,"parts":[]}]}"""))
        assertEquals("Hay un movimiento inválido en el archivo.", error(base + """"moves":[{"id":"m","type":"transfer","date":"2026-01-01","total":1,"parts":[{"acc":"a","cat":"c","amount":1}]}]}"""))
        assertEquals("El respaldo está dañado (listas).", error(base + """"lists":{}}"""))
        assertEquals("Hay una plantilla inválida en el archivo.", error(base + """"templates":[{"id":"t","name":"T"}]}"""))
        assertEquals("Hay una lista inválida en el archivo.", error(base + """"lists":[{"id":"l","items":[]}]}"""))
    }

    @Test fun convierte_cuentas_a_centavos() {
        assertEquals(listOf("banco", "visa"), s.accounts.map { it.id })
        assertEquals(listOf(48550L, 20000L), s.accounts[0].cats.map { it.balance })
        assertEquals(-4500L, s.accounts[1].cats[0].balance)
        assertEquals(100000L, s.accounts[1].limit)
        assertTrue(s.accounts[1].isCredit)
    }

    @Test fun redondeo_half_up_por_texto_decimal() {
        assertEquals(1235L, cents(12.345))
        assertEquals(1L, cents(0.005))
        assertEquals(-1200L, cents(-12.0))
        assertEquals(1999L, cents(19.99))
    }

    @Test fun movimientos_con_sus_campos() {
        val g2 = s.moves.first { it.id == "g2" }
        assertEquals(MoveType.EXPENSE, g2.type)
        assertEquals("visa", g2.cardId)
        assertEquals("k1", g2.kindId)
        assertEquals(LocalDate.of(2026, 11, 2), g2.date)
        assertEquals(4500L, g2.total)
        val x1 = s.moves.first { it.id == "x1" }
        assertEquals(CatKey("banco", "renta"), x1.to)
        assertEquals("Ahorro", x1.note)
        assertEquals("", x1.title)
    }

    @Test fun total_se_ajusta_a_la_suma_de_parts() {
        val i1 = s.moves.first { it.id == "i1" }
        assertEquals(listOf(Part(CatKey("banco", "renta"), 11), Part(CatKey("banco", "comida"), 11)), i1.parts)
        assertEquals(22L, i1.total)
    }

    @Test fun movimiento_con_categoria_borrada_se_conserva() {
        assertEquals(CatKey("banco", "borrada"), s.moves.first { it.id == "old" }.parts.single().key)
        assertEquals(5, s.moves.size)
    }

    @Test fun plantillas_y_listas_sin_color() {
        val t = s.templates.single()
        assertEquals(Freq.BIWEEKLY, t.freq)
        assertEquals(listOf(TemplateItem("Cocina", head = true), TemplateItem("Leche", dueIn = 3), TemplateItem("Pan"), TemplateItem("Raro")), t.items)
        val l1 = s.lists.first { it.id == "l1" }
        assertTrue(l1.pinned)
        assertEquals(0, l1.order)
        assertEquals("t1", l1.tplId)
        assertEquals(
            listOf(
                ListItem("a", "Cocina", head = true),
                ListItem("b", "Leche", done = true, due = LocalDate.of(2026, 11, 4), doneAt = LocalDate.of(2026, 11, 2)),
                ListItem("c", "Pan"),
                ListItem("d", "Extra", extra = true),
            ),
            l1.items,
        )
        val l2 = s.lists.first { it.id == "l2" }
        assertEquals(LocalDate.of(2026, 9, 10), l2.archived)
        assertTrue(l2.sortDue)
        assertNull(l2.order)
    }

    @Test fun lista_sin_fecha_de_creacion_usa_hoy() {
        val sn = parseBackup("""{"app":"tracker","version":3,"lists":[{"id":"l","name":"L","items":[]}]}""", hoy)
        assertEquals(hoy, sn.lists.single().created)
    }

    @Test fun kinds_y_ajustes_desde_settings() {
        assertEquals(listOf(Kind("k1", "Comida"), Kind("k2", "Transporte")), s.kinds)
        assertEquals(ListSort.MANUAL, s.settings.listSort)
        assertTrue(s.settings.listManualSeeded)
        assertEquals("k1", s.settings.lastKind)
        assertEquals(CatKey("banco", "comida"), s.settings.lastFrom)
        assertEquals(CatKey("banco", "renta"), s.settings.lastIncomeTo)
    }

    @Test fun sin_tipos_usa_los_de_siempre() {
        val sn = parseBackup("""{"app":"tracker","version":3}""", hoy)
        assertEquals(DEFAULT_KINDS, sn.kinds.map { it.name })
    }

    @Test fun summary_cuenta_y_neto() {
        assertEquals(ImportSummary(accounts = 2, categories = 3, moves = 5, lists = 2, templates = 1, net = 48550 + 20000 - 4500), s.summary())
    }
}
