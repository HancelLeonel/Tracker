package com.hancel.home.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class PlantillasTest {
    private val d = LocalDate.of(2026, 11, 3)
    private fun tpl(freq: Freq, vararg items: TemplateItem) = Template("t", "Súper", freq, items.toList())
    private fun usada(created: LocalDate) = ListDoc("l$created", "x", "t", created, 0, items = emptyList())

    @Test fun dueInfo_sin_periodo_o_sin_uso_es_null() {
        assertNull(dueInfo(tpl(Freq.NONE), listOf(usada(d)), d))
        assertNull(dueInfo(tpl(Freq.WEEKLY), emptyList(), d))
    }

    @Test fun dueInfo_weekly_usa_la_ultima() {
        val ls = listOf(usada(LocalDate.of(2026, 10, 20)), usada(LocalDate.of(2026, 10, 27)))
        assertEquals(DueInfo.Now, dueInfo(tpl(Freq.WEEKLY), ls, d))
        assertEquals(DueInfo.In(2), dueInfo(tpl(Freq.WEEKLY), ls, LocalDate.of(2026, 11, 1)))
        assertEquals("Ya toca", DueInfo.Now.text())
        assertEquals("Toca en 2 días", DueInfo.In(2).text())
        assertEquals("Toca en 1 día", DueInfo.In(1).text())
    }

    @Test fun dueInfo_biweekly_y_monthly() {
        assertEquals(DueInfo.In(14), dueInfo(tpl(Freq.BIWEEKLY), listOf(usada(d)), d.plusDays(1)))
        val ene31 = LocalDate.of(2026, 1, 31)
        assertEquals(DueInfo.Now, dueInfo(tpl(Freq.MONTHLY), listOf(usada(ene31)), LocalDate.of(2026, 2, 28)))
        assertEquals(DueInfo.In(1), dueInfo(tpl(Freq.MONTHLY), listOf(usada(ene31)), LocalDate.of(2026, 2, 27)))
    }

    @Test fun parseItems_secciones_y_dias() {
        assertEquals(
            listOf(TemplateItem("Cocina", head = true), TemplateItem("Leche", dueIn = 3), TemplateItem("Pan")),
            parseItems("# Cocina\nLeche @3\n\n  Pan  "),
        )
        assertEquals(listOf(TemplateItem("@3")), parseItems("@3"))
        assertEquals(listOf(TemplateItem("Cuarto", head = true)), parseItems("## Cuarto"))
        assertEquals(emptyList<TemplateItem>(), parseItems("#\n  \n"))
    }

    @Test fun newList_desde_plantilla_ids_nuevos_y_fechas() {
        var n = 0
        val t = tpl(Freq.WEEKLY, TemplateItem("Sec", head = true), TemplateItem("Leche", dueIn = 3), TemplateItem("Pan"))
        val otras = listOf(usada(d).copy(order = 2), usada(d.minusDays(1)).copy(order = -4))
        val l = newList(t, null, d, 77, otras) { "id${++n}" }
        assertEquals("id1", l.id)
        assertEquals("Súper · 3 nov", l.name)
        assertEquals("t", l.tplId)
        assertEquals(d, l.created)
        assertEquals(77, l.t)
        assertEquals(-5, l.order)
        assertEquals(
            listOf(ListItem("id2", "Sec", head = true), ListItem("id3", "Leche", due = d.plusDays(3)), ListItem("id4", "Pan")),
            l.items,
        )
    }

    @Test fun newList_vacia_con_nombre() {
        val l = newList(null, "Viaje", d, 1, emptyList()) { "x" }
        assertEquals("Viaje", l.name)
        assertNull(l.tplId)
        assertEquals(-1, l.order)
        assertEquals("Lista · 3 nov", newList(null, " ", d, 1, emptyList()) { "x" }.name)
    }

    @Test fun templateFromList_quita_estado_adicionales_y_fecha_del_nombre() {
        val l = ListDoc(
            "l", "Súper · 3 nov", "t", d, 0,
            items = listOf(ListItem("a", "Sec", head = true), ListItem("b", "Leche", done = true, due = d), ListItem("c", "Extra", extra = true)),
        )
        val t = templateFromList(l) { "nuevo" }
        assertEquals(Template("nuevo", "Súper", Freq.NONE, listOf(TemplateItem("Sec", head = true), TemplateItem("Leche"))), t)
    }
}
