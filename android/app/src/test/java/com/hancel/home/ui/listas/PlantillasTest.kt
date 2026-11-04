package com.hancel.home.ui.listas

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.pressKey
import androidx.lifecycle.SavedStateHandle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Freq
import com.hancel.home.core.ListItem
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
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate

@OptIn(ExperimentalTestApi::class)
@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class PlantillasTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()
    private val hoy = LocalDate.of(2026, 11, 3)
    private var listo = false

    @After fun cerrar() = modelos.limpiar()

    private fun plantillas() = bloquear { deps.listas.templates.first() }
    private fun filas() = rule.onAllNodesWithTag("fila-plantilla").fetchSemanticsNodes()

    private fun editor(id: String? = null, lista: String? = null) {
        val vm = modelos.crear { PlantillaViewModel(SavedStateHandle(), deps.listas, id, lista) }
        rule.setContent { HomeTheme { PlantillaFormScreen(vm, onDone = { listo = true }) } }
    }

    @Test fun enter_agrega_fila_con_foco() {
        editor()
        rule.esperarTexto("Nueva plantilla")
        rule.onAllNodesWithTag("fila-plantilla")[0].performTextInput("Leche")
        rule.onAllNodesWithTag("fila-plantilla")[0].performImeAction()
        rule.esperar { filas().size == 2 }
        rule.onAllNodesWithTag("fila-plantilla")[1].assertIsFocused()
    }

    @Test fun backspace_en_vacia_la_quita() {
        editor()
        rule.esperarTexto("Nueva plantilla")
        rule.onAllNodesWithTag("fila-plantilla")[0].performTextInput("Leche")
        rule.onAllNodesWithTag("fila-plantilla")[0].performImeAction()
        rule.esperar { filas().size == 2 }
        rule.onAllNodesWithTag("fila-plantilla")[1].performKeyInput { pressKey(Key.Backspace) }
        rule.esperar { filas().size == 1 }
        rule.onAllNodesWithTag("fila-plantilla")[0].assertIsFocused()
    }

    @Test fun pegar_varias_lineas() {
        editor()
        rule.esperarTexto("Nueva plantilla")
        rule.onNode(hasSetTextAction() and hasText("Nombre")).performTextInput("Súper")
        rule.onAllNodesWithTag("fila-plantilla")[0].performTextReplacement("# Frutas\nManzanas\nPagar luz @2")
        rule.esperar { filas().size == 3 }
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val t = plantillas().single()
        assertEquals("Súper", t.name)
        assertEquals(listOf(TemplateItem("Frutas", head = true), TemplateItem("Manzanas"), TemplateItem("Pagar luz", dueIn = 2)), t.items)
    }

    @Test fun herramientas_de_la_fila_seccion_vence_y_mover() {
        editor()
        rule.esperarTexto("Nueva plantilla")
        rule.onNode(hasSetTextAction() and hasText("Nombre")).performTextInput("Casa")
        rule.onAllNodesWithTag("fila-plantilla")[0].performTextInput("Barrer")
        rule.onAllNodesWithTag("fila-plantilla")[0].performImeAction()
        rule.esperar { filas().size == 2 }
        rule.onAllNodesWithTag("fila-plantilla")[1].performTextInput("Limpieza")
        rule.onNodeWithContentDescription("Es una sección").performClick()
        rule.onNodeWithContentDescription("Subir").performClick()
        rule.onAllNodesWithTag("fila-plantilla")[1].performClick()
        rule.onNode(hasSetTextAction() and hasText("Días")).performTextInput("3")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        assertEquals(listOf(TemplateItem("Limpieza", head = true), TemplateItem("Barrer", dueIn = 3)), plantillas().single().items)
    }

    @Test fun nombre_obligatorio() {
        editor()
        rule.esperarTexto("Nueva plantilla")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("Escribe un nombre.")
        assertTrue(plantillas().isEmpty())
    }

    @Test fun editar_y_eliminar_plantilla() {
        bloquear { deps.listas.saveTemplate(Template("t", "Súper", Freq.WEEKLY, listOf(TemplateItem("Leche")))) }
        editor("t")
        rule.esperarTexto("Editar plantilla")
        rule.esperarTexto("Cada semana")
        rule.esperar { rule.onAllNodes(hasSetTextAction() and hasText("Leche")).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithContentDescription("Eliminar plantilla").performClick()
        rule.esperarTexto("Las listas que ya creaste con ella no se borran.")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperar { listo }
        assertTrue(plantillas().isEmpty())
    }

    @Test fun desde_una_lista_sin_adicionales() {
        deps.lista("l", "Súper · 3 nov", items = listOf(ListItem("h", "Frutas", head = true), ListItem("a", "Manzanas", done = true), ListItem("x", "Pilas", extra = true)))
        editor(lista = "l")
        rule.esperarTexto("Nueva plantilla")
        rule.esperar { rule.onAllNodes(hasSetTextAction() and hasText("Súper")).fetchSemanticsNodes().isNotEmpty() } // sin la fecha
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        assertEquals(listOf(TemplateItem("Frutas", head = true), TemplateItem("Manzanas")), plantillas().single().items)
    }

    @Test fun ya_toca_y_crear_lista() {
        bloquear {
            deps.listas.saveTemplate(Template("t", "Súper", Freq.WEEKLY, listOf(TemplateItem("Leche"), TemplateItem("Pan"))))
            deps.listas.saveTemplate(Template("u", "Limpieza", Freq.WEEKLY, listOf(TemplateItem("Barrer"))))
        }
        deps.lista("a", "Súper · 27 oct", created = hoy.minusDays(7)).also { bloquear { deps.listas.saveList(deps.listas.lists.first().single { it.id == "a" }.copy(tplId = "t")) } }
        deps.lista("b", "Limpieza · 1 nov", created = hoy.minusDays(2)).also { bloquear { deps.listas.saveList(deps.listas.lists.first().single { it.id == "b" }.copy(tplId = "u")) } }
        var abierta: String? = null
        val vm = modelos.crear { ListasViewModel(deps.listas, deps.ajustes, deps.hoy, deps.clock) }
        rule.setContent { HomeTheme { ListasScreen(vm, ListasAcciones(onAbrir = { abierta = it })) } }
        rule.esperarTexto("Plantillas")
        rule.onNodeWithText("Plantillas").performClick()
        rule.esperarTexto("Ya toca")
        rule.esperarTexto("Toca en 5 días")
        rule.esperarTexto("2 elementos · Cada semana · última vez 27 oct")
        rule.onNodeWithContentDescription("Crear lista de Súper").performClick()
        rule.esperar { abierta != null }
        val l = bloquear { deps.listas.lists.first() }.single { it.id == abierta }
        assertEquals("Súper · 3 nov", l.name)
        assertEquals("t", l.tplId)
    }
}
