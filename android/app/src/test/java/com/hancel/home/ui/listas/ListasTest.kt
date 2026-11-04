package com.hancel.home.ui.listas

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.lifecycle.SavedStateHandle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.Deps
import com.hancel.home.core.Freq
import com.hancel.home.core.ListDoc
import com.hancel.home.core.ListItem
import com.hancel.home.core.ListSort
import com.hancel.home.core.Template
import com.hancel.home.core.TemplateItem
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate

private val HOY = LocalDate.of(2026, 11, 3)

fun Deps.lista(
    id: String, name: String, created: LocalDate = HOY, pinned: Boolean = false, order: Int? = null,
    archived: LocalDate? = null, items: List<ListItem> = listOf(ListItem("$id-1", "Uno"), ListItem("$id-2", "Dos")),
) = bloquear { listas.saveList(ListDoc(id, name, null, created, 1, archived, pinned, false, order, items)) }

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class ListasTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()
    private var abierta: String? = null

    @After fun cerrar() = modelos.limpiar()

    private fun listas() = bloquear { deps.listas.lists.first() }.associateBy { it.id }
    private fun ajustes() = bloquear { deps.ajustes.portable.first() }
    private fun y(text: String) = rule.onNodeWithText(text).fetchSemanticsNode().positionInRoot.y
    private fun SemanticsNodeInteraction.tocar() = performSemanticsAction(SemanticsActions.OnClick)

    private fun abrir() {
        val vm = modelos.crear { ListasViewModel(deps.listas, deps.ajustes, deps.hoy) }
        rule.setContent { HomeTheme { ListasScreen(vm, ListasAcciones(onAbrir = { abierta = it })) } }
    }

    @Test fun fijadas_primero() {
        deps.lista("a", "Alfa", created = HOY.minusDays(2))
        deps.lista("b", "Beta", created = HOY)
        deps.lista("c", "Gamma", created = HOY.minusDays(14), pinned = true)
        abrir()
        rule.esperarTexto("Alfa")
        assertTrue(y("Gamma") < y("Beta"))
        assertTrue(y("Beta") < y("Alfa"))
        rule.onNodeWithContentDescription("Fijada").assertExists()
    }

    @Test fun fila_muestra_avance_y_vencidas() {
        deps.lista("a", "Alfa", items = listOf(ListItem("1", "Uno", done = true), ListItem("2", "Dos", due = HOY.minusDays(1)), ListItem("3", "Tres")))
        deps.lista("b", "Beta", items = listOf(ListItem("4", "Cuatro", due = LocalDate.of(2026, 11, 5))))
        abrir()
        rule.esperarTexto("1/3")
        rule.esperarTexto("1 vencida")
        rule.esperarTexto("Próxima: 5 nov")
        rule.onNodeWithText("Alfa").performClick()
        rule.esperar { abierta == "a" }
    }

    @Test fun cambiar_a_manual_conserva_lo_visible() {
        bloquear { deps.ajustes.update { it.copy(listSort = ListSort.DUE) } }
        deps.lista("a", "Alfa", items = listOf(ListItem("1", "Uno", due = LocalDate.of(2026, 11, 10))))
        deps.lista("b", "Beta", items = listOf(ListItem("2", "Dos", due = LocalDate.of(2026, 11, 5))))
        deps.lista("c", "Gamma")
        abrir()
        rule.esperarTexto("Gamma")
        assertTrue(y("Beta") < y("Alfa") && y("Alfa") < y("Gamma"))
        rule.onNodeWithContentDescription("Ordenar listas").performClick()
        rule.esperarTexto("Manual")
        rule.onNodeWithText("Manual").performClick()
        rule.esperar { ajustes().listSort == ListSort.MANUAL }
        assertTrue(ajustes().listManualSeeded)
        rule.esperar { listas()["b"]?.order == 0 }
        assertEquals(1, listas()["a"]!!.order)
        assertEquals(2, listas()["c"]!!.order)
        rule.waitForIdle()
        assertTrue(y("Beta") < y("Alfa") && y("Alfa") < y("Gamma"))
    }

    @Test fun arrastrar_reordena_y_persiste() {
        bloquear { deps.ajustes.update { it.copy(listSort = ListSort.MANUAL, listManualSeeded = true) } }
        deps.lista("a", "Alfa", order = 0)
        deps.lista("b", "Beta", order = 1)
        deps.lista("c", "Gamma", order = 2)
        abrir()
        rule.esperarTexto("Gamma")
        rule.onNodeWithTag("lista-a").performTouchInput {
            down(center)
            advanceEventTime(1_000)
            repeat(12) { moveBy(Offset(0f, height * 0.13f), delayMillis = 32) }
            up()
        }
        rule.esperar { listas()["a"]?.order == 1 }
        assertEquals(0, listas()["b"]!!.order)
        assertEquals(2, listas()["c"]!!.order)
    }

    @Test fun restaurar_archivada() {
        deps.lista("v", "Viejo", archived = LocalDate.of(2026, 11, 1))
        deps.lista("a", "Alfa")
        abrir()
        rule.esperarTexto("Archivo 1")
        rule.onNodeWithText("Archivo 1").performClick()
        rule.esperarTexto("Finalizada el 1 nov")
        rule.onNodeWithText("Restaurar").performClick()
        rule.esperar { listas()["v"]?.archived == null }
    }

    @Test fun eliminar_archivada() {
        deps.lista("v", "Viejo", archived = LocalDate.of(2026, 11, 1))
        abrir()
        rule.esperarTexto("Archivo 1")
        rule.onNodeWithText("Archivo 1").performClick()
        rule.onNodeWithContentDescription("Eliminar Viejo").performClick()
        rule.esperarTexto("¿Eliminar la lista «Viejo»?")
        rule.onNodeWithText("Eliminar lista").performClick()
        rule.esperar { listas()["v"] == null }
    }

    @Test fun crear_desde_plantilla_con_fechas() {
        bloquear {
            deps.listas.saveTemplate(Template("t", "Súper", Freq.NONE, listOf(TemplateItem("Frutas", head = true), TemplateItem("Leche"), TemplateItem("Pagar luz", dueIn = 2))))
        }
        var creada: String? = null
        val vm = modelos.crear { NuevaListaViewModel(SavedStateHandle(), deps.listas, deps.hoy, deps.clock) }
        rule.setContent { HomeTheme { NuevaListaScreen(vm, onBack = {}, onCreated = { creada = it }) } }
        rule.esperarTexto("Lista vacía")
        rule.esperarTexto("Lista · 3 nov")
        rule.onNodeWithText("Lista vacía").performClick()
        rule.esperarTexto("Súper")
        rule.onNodeWithText("Súper").tocar()
        rule.esperarTexto("Súper · 3 nov")
        rule.onNodeWithText("Crear").performClick()
        rule.esperar { creada != null }
        val l = listas()[creada]!!
        assertEquals("Súper · 3 nov", l.name)
        assertEquals("t", l.tplId)
        assertEquals(listOf("Frutas", "Leche", "Pagar luz"), l.items.map { it.text })
        assertEquals(LocalDate.of(2026, 11, 5), l.items.last().due)
        assertNull(l.items[1].due)
    }
}
