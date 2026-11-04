package com.hancel.home.core

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class AgendaTest {
    private val d = LocalDate.of(2026, 11, 3)
    private fun lista(id: String, created: LocalDate = d, archived: LocalDate? = null, vararg items: ListItem) =
        ListDoc(id, id, null, created, 0, archived = archived, items = items.toList())

    @Test fun agenda_grupos() {
        val l = lista(
            "l", d,
            null,
            ListItem("late", "late", due = LocalDate.of(2026, 11, 1)),
            ListItem("hoy", "hoy", due = d),
            ListItem("man", "man", due = LocalDate.of(2026, 11, 4)),
            ListItem("sem", "sem", due = LocalDate.of(2026, 11, 10)),
            ListItem("mas", "mas", due = LocalDate.of(2026, 11, 11)),
        )
        val a = agenda(listOf(l), d)
        assertEquals(Bucket.entries.toList(), a.keys.toList())
        assertEquals(listOf("late", "hoy", "man", "sem", "mas"), a.values.map { g -> g.single().item.id })
    }

    @Test fun agenda_ignora_archivadas_hechas_encabezados_y_sin_fecha() {
        val ls = listOf(
            lista("arch", d, d, ListItem("x", "x", due = d)),
            lista("l", d, null, ListItem("h", "h", head = true), ListItem("ok", "ok", done = true, due = d), ListItem("sin", "sin")),
        )
        assertEquals(emptyMap<Bucket, List<Task>>(), agenda(ls, d))
    }

    @Test fun todayTasks_hasta_hoy_por_due_y_created() {
        val a = lista("a", d.minusDays(1), null, ListItem("a1", "a1", due = d))
        val b = lista("b", d.minusDays(5), null, ListItem("b1", "b1", due = d), ListItem("b2", "b2", due = d.minusDays(2)), ListItem("b3", "b3", due = d.plusDays(1)))
        assertEquals(listOf("b2", "b1", "a1"), todayTasks(listOf(a, b), d).map { it.item.id })
    }

    @Test fun todayTasks_cambia_con_el_dia() {
        val l = lista("l", d, null, ListItem("m", "m", due = d.plusDays(1)))
        assertEquals(0, todayTasks(listOf(l), d).size)
        assertEquals(1, todayTasks(listOf(l), d.plusDays(1)).size)
    }
}
