package com.hancel.home.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Freq
import com.hancel.home.core.ListDoc
import com.hancel.home.core.ListItem
import com.hancel.home.core.Template
import com.hancel.home.core.TemplateItem
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class ListasRepoTest {
    @get:Rule val rule = DbRule()
    private val d = LocalDate.of(2026, 11, 3)

    @Test fun listas_guardar_y_leer_con_items_en_orden() = runTest {
        val repo = ListasRepo(rule.db)
        val l = ListDoc(
            "l", "Súper", "t", d, 5, archived = null, pinned = true, sortDue = true, order = -2,
            items = listOf(ListItem("z", "Z", head = true), ListItem("a", "A", done = true, doneAt = d, due = d.plusDays(1)), ListItem("m", "M", extra = true)),
        )
        repo.saveList(l)
        assertEquals(listOf(l), repo.lists.first())
        val l2 = l.copy(items = l.items.drop(1), archived = d)
        repo.saveList(l2)
        assertEquals(listOf(l2), repo.lists.first())
        repo.deleteList("l")
        assertEquals(emptyList<ListDoc>(), repo.lists.first())
    }

    @Test fun saveLists_y_plantillas() = runTest {
        val repo = ListasRepo(rule.db)
        val a = ListDoc("a", "A", null, d, 1, items = emptyList())
        val b = ListDoc("b", "B", null, d, 2, items = emptyList())
        repo.saveLists(listOf(a, b))
        repo.saveLists(listOf(a.copy(order = 1), b.copy(order = 0)))
        assertEquals(mapOf("a" to 1, "b" to 0), repo.lists.first().associate { it.id to it.order })
        val t = Template("t", "Súper", Freq.MONTHLY, listOf(TemplateItem("Sec", head = true), TemplateItem("Leche", dueIn = 3)))
        repo.saveTemplate(t)
        assertEquals(listOf(t), repo.templates.first())
        repo.deleteTemplate("t")
        assertEquals(emptyList<Template>(), repo.templates.first())
    }
}
