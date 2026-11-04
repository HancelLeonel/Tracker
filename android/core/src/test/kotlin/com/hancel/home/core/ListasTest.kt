package com.hancel.home.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ListasTest {
    private val d = LocalDate.of(2026, 11, 3)
    private fun it(id: String, done: Boolean = false, doneAt: LocalDate? = null, due: LocalDate? = null, head: Boolean = false) =
        ListItem(id, id, head = head, done = done, doneAt = doneAt, due = due)
    private fun lista(id: String, created: LocalDate = d, t: Long = 0, pinned: Boolean = false, order: Int? = null, items: List<ListItem> = emptyList(), archived: LocalDate? = null) =
        ListDoc(id, id, null, created, t, archived = archived, pinned = pinned, order = order, items = items)

    @Test fun sink_hecho_baja_por_doneAt_y_no_cambia_el_original() {
        val items = listOf(it("a", true, d), it("b"), it("c", true, d.minusDays(1)), it("d"))
        assertEquals(listOf("b", "d", "c", "a"), sink(items, false).map { it.id })
        assertEquals(listOf("a", "b", "c", "d"), items.map { it.id })
    }

    @Test fun sink_byDue_pendientes_con_fecha_primero() {
        val items = listOf(it("a"), it("b", due = d.plusDays(2)), it("c", due = d), it("x", true, d))
        assertEquals(listOf("c", "b", "a", "x"), sink(items, true).map { it.id })
    }

    @Test fun sections_primera_sin_encabezado() {
        val s = sections(listOf(it("a"), it("H", head = true), it("b"), it("H2", head = true)))
        assertEquals(listOf(null, "H", "H2"), s.map { it.head?.id })
        assertEquals(listOf(listOf("a"), listOf("b"), emptyList()), s.map { sec -> sec.items.map { it.id } })
        assertEquals(listOf("H"), sections(listOf(it("H", head = true), it("b"))).map { it.head?.id })
    }

    @Test fun progress_no_cuenta_encabezados_e_isDone() {
        val l = lista("l", items = listOf(it("H", head = true), it("a", true), it("b")))
        assertEquals(Progress(1, 2), l.progress())
        assertFalse(l.isDone())
        assertTrue(l.copy(items = listOf(it("H", head = true), it("a", true))).isDone())
        assertFalse(lista("vacia").isDone())
        assertFalse(lista("solo", items = listOf(it("H", head = true))).isDone())
    }

    @Test fun nextDue_y_lateCount() {
        val l = lista("l", items = listOf(it("a", due = d.minusDays(1)), it("b", due = d.plusDays(3)), it("c", true, due = d.minusDays(5))))
        assertEquals(d.minusDays(1), l.nextDue())
        assertEquals(1, l.lateCount(d))
        assertNull(lista("x").nextDue())
    }

    @Test fun orden_recent_por_created_y_t_desc() {
        val ls = listOf(lista("a", d.minusDays(1), 9), lista("b", d, 1), lista("c", d, 5))
        assertEquals(listOf("c", "b", "a"), orderedActive(ls, ListSort.RECENT).map { it.id })
    }

    @Test fun orden_due_sin_fecha_al_final() {
        val ls = listOf(lista("sin"), lista("tarde", items = listOf(it("x", due = d.plusDays(5)))), lista("pronto", items = listOf(it("y", due = d))))
        assertEquals(listOf("pronto", "tarde", "sin"), orderedActive(ls, ListSort.DUE).map { it.id })
    }

    @Test fun orden_manual_order_nulo_al_final() {
        val ls = listOf(lista("n"), lista("dos", order = 2), lista("uno", order = 1))
        assertEquals(listOf("uno", "dos", "n"), orderedActive(ls, ListSort.MANUAL).map { it.id })
    }

    @Test fun fijadas_siempre_primero_y_sin_archivadas() {
        val ls = listOf(lista("a", t = 9), lista("fija", t = 1, pinned = true), lista("arch", t = 20, archived = d))
        assertEquals(listOf("fija", "a"), orderedActive(ls, ListSort.RECENT).map { it.id })
    }

    @Test fun seedOrder_da_el_indice() {
        assertEquals(listOf(0, 1), seedOrder(listOf(lista("x"), lista("y"))).map { it.order })
    }

    @Test fun reorder_dentro_de_su_grupo() {
        val ls = listOf(lista("f1", pinned = true, order = 0), lista("a", order = 1), lista("b", order = 2), lista("c", order = 3))
        val out = reorder(ls, ListSort.MANUAL, "c", 0)
        assertEquals(listOf("f1", "c", "a", "b"), orderedActive(out, ListSort.MANUAL).map { it.id })
        val fuera = reorder(ls, ListSort.MANUAL, "f1", 3) // no cruza al grupo de no fijadas
        assertEquals(listOf("f1", "a", "b", "c"), orderedActive(fuera, ListSort.MANUAL).map { it.id })
    }

    @Test fun toggle_pone_y_quita_doneAt() {
        val l = lista("l", items = listOf(it("a")))
        val on = l.toggle("a", d)
        assertEquals(ListItem("a", "a", done = true, doneAt = d), on.items[0])
        assertEquals(ListItem("a", "a"), on.toggle("a", d).items[0])
    }

    @Test fun finish_solo_con_todo_marcado() {
        val l = lista("l", items = listOf(it("a")))
        assertSame(l, l.finish(d))
        assertEquals(d, l.toggle("a", d).finish(d).archived)
    }

    @Test fun itemMeta_textos() {
        assertEquals(ItemMeta(MetaTone.NEG, "Venció el 1 nov (hace 2 días)"), itemMeta(it("a", due = d.minusDays(2)), d))
        assertEquals(ItemMeta(MetaTone.WARN, "Vence hoy"), itemMeta(it("a", due = d), d))
        assertEquals(ItemMeta(MetaTone.WARN, "Vence mañana"), itemMeta(it("a", due = d.plusDays(1)), d))
        assertEquals(ItemMeta(MetaTone.MUTED, "Vence el 10 nov (en 7 días)"), itemMeta(it("a", due = d.plusDays(7)), d))
        assertEquals(ItemMeta(MetaTone.MUTED, "Hecho el 3 nov"), itemMeta(it("a", true, d), d))
        assertEquals(ItemMeta(MetaTone.MUTED, "Vence el 5 ene 2027 (en 63 días)"), itemMeta(it("a", due = LocalDate.of(2027, 1, 5)), d))
        assertNull(itemMeta(it("a"), d))
        assertEquals("1 día", pl(1, "día"))
        assertEquals("2 vencidas", pl(2, "vencida"))
    }
}
