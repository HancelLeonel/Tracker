package com.hancel.home.ui.listas

import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.ListItem
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class ListaTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()
    private val hoy = LocalDate.of(2026, 11, 3)
    private var atras = false

    @After fun cerrar() = modelos.limpiar()

    private fun doc(id: String = "l") = bloquear { deps.listas.lists.first() }.firstOrNull { it.id == id }
    private fun item(text: String) = doc()!!.items.first { it.text == text }
    private fun y(text: String) = rule.onNodeWithText(text).fetchSemanticsNode().positionInRoot.y

    private fun abrir(id: String = "l") {
        val vm = modelos.crear { ListaViewModel(id, deps.listas, deps.hoy, deps.clock) }
        rule.setContent { HomeTheme { ListaScreen(vm, onBack = { atras = true }) } }
    }

    private fun tres() = deps.lista("l", "Súper · 3 nov", items = listOf(ListItem("a", "Arroz"), ListItem("b", "Beans"), ListItem("c", "Café")))

    @Test fun marcar_baja_al_final_y_desmarcar_vuelve() {
        tres()
        abrir()
        rule.esperarTexto("Café")
        rule.onNodeWithContentDescription("Marcar Arroz").performClick()
        rule.esperar { doc()!!.items.first { it.id == "a" }.done }
        assertEquals(hoy, item("Arroz").doneAt)
        rule.esperarTexto("1/3")
        assertTrue(y("Arroz") > y("Café"))
        rule.onNodeWithContentDescription("Marcar Arroz").performClick()
        rule.esperar { !item("Arroz").done }
        rule.waitForIdle()
        assertTrue(y("Arroz") < y("Beans"))
    }

    @Test fun tocar_el_texto_marca_como_en_la_pwa() {
        tres()
        abrir()
        rule.esperarTexto("Beans")
        rule.onNodeWithText("Beans").performClick()
        rule.esperar { item("Beans").done }
        rule.onNode(hasSetTextAction() and hasText("Beans")).assertDoesNotExist() // no abre la edición
    }

    @Test fun marcar_dos_seguidas_no_pierde_ninguna() {
        tres()
        abrir()
        rule.esperarTexto("Café")
        rule.onNodeWithContentDescription("Marcar Arroz").performClick()
        rule.onNodeWithContentDescription("Marcar Beans").performClick()
        rule.esperar { item("Arroz").done && item("Beans").done }
    }

    @Test fun agregar_mantiene_foco_y_va_a_adicionales() {
        tres()
        abrir()
        rule.esperarTexto("Café")
        val campo = rule.onNode(hasSetTextAction() and hasText("Agregar algo adicional…"))
        campo.performClick()
        campo.performTextInput("Pilas")
        rule.onNode(hasSetTextAction()).performImeAction() // con texto ya no muestra el texto de ayuda
        rule.esperar { doc()!!.items.any { it.text == "Pilas" } }
        val p = item("Pilas")
        assertTrue(p.extra)
        rule.esperarTexto("Adicionales")
        rule.esperarTexto("0/1")
        rule.onNode(hasSetTextAction()).assertIsFocused()
        rule.onNode(hasSetTextAction() and hasText("Pilas")).assertDoesNotExist()
    }

    @Test fun poner_fecha() {
        tres()
        abrir()
        rule.esperarTexto("Beans")
        rule.onNodeWithContentDescription("Fecha límite de Beans").performClick()
        rule.esperarTexto("Aceptar")
        rule.onNodeWithText("Aceptar").performClick()
        rule.esperar { item("Beans").due == hoy }
        rule.esperarTexto("Vence hoy")
        rule.onNodeWithContentDescription("Fecha límite de Beans").performClick()
        rule.esperarTexto("Quitar fecha")
        rule.onNodeWithText("Quitar fecha").performClick()
        rule.esperar { item("Beans").due == null }
    }

    @Test fun editar_y_quitar_elemento_en_la_fila() {
        tres()
        abrir()
        rule.esperarTexto("Beans")
        rule.onNodeWithText("Beans").performTouchInput { longClick() } // pulsación larga: editar
        rule.onNode(hasSetTextAction() and hasText("Beans")).performTextReplacement("Frijoles")
        rule.onNodeWithContentDescription("Guardar cambios").performClick()
        rule.esperar { doc()!!.items.any { it.text == "Frijoles" } }
        rule.esperarTexto("Frijoles")
        assertFalse(item("Frijoles").done)
        rule.onNodeWithText("Frijoles").performTouchInput { longClick() }
        rule.onNodeWithContentDescription("Quitar Frijoles").performClick()
        rule.esperarTexto("¿Quitar este elemento de la lista?")
        rule.onNodeWithText("Quitar").performClick()
        rule.esperar { doc()!!.items.none { it.text == "Frijoles" } }
    }

    @Test fun secciones_con_encabezado() {
        deps.lista("l", "Viaje", items = listOf(ListItem("h", "Ropa", head = true), ListItem("a", "Camisas"), ListItem("h2", "Papeles", head = true), ListItem("b", "Pasaporte")))
        abrir()
        rule.esperarTexto("Pasaporte")
        rule.esperarTexto("0/2")
        assertTrue(y("Ropa") < y("Camisas") && y("Camisas") < y("Papeles") && y("Papeles") < y("Pasaporte"))
    }

    @Test fun finalizar_solo_con_todo_marcado() {
        deps.lista("l", "Corta", items = listOf(ListItem("a", "Uno"), ListItem("b", "Dos", done = true, doneAt = hoy)))
        abrir()
        rule.esperarTexto("1/2")
        rule.onNodeWithText("Finalizar lista").assertDoesNotExist()
        rule.onNodeWithContentDescription("Marcar Uno").performClick()
        rule.esperarTexto("Todo listo")
        rule.onNodeWithText("Finalizar lista").performClick()
        rule.esperar { atras }
        assertEquals(hoy, doc()!!.archived)
    }

    @Test fun archivada_es_solo_lectura() {
        deps.lista("l", "Vieja", archived = LocalDate.of(2026, 11, 1), items = listOf(ListItem("a", "Uno", done = true, doneAt = hoy)))
        abrir()
        rule.esperarTexto("Lista finalizada el 1 nov")
        rule.onNode(hasSetTextAction()).assertDoesNotExist()
        rule.onNodeWithContentDescription("Marcar Uno").assertDoesNotExist()
        rule.onNodeWithContentDescription("Opciones de la lista").assertDoesNotExist()
        rule.onNodeWithText("Restaurar lista").performClick()
        rule.esperar { doc()!!.archived == null }
    }

    @Test fun guardar_como_plantilla() {
        deps.lista("l", "Súper · 3 nov", items = listOf(ListItem("h", "Frutas", head = true), ListItem("a", "Manzanas", done = true), ListItem("x", "Pilas", extra = true)))
        abrir()
        rule.esperarTexto("Manzanas")
        rule.onNodeWithContentDescription("Opciones de la lista").performClick()
        rule.onNodeWithText("Guardar como plantilla").performClick()
        rule.esperar { bloquear { deps.listas.templates.first() }.isNotEmpty() }
        val t = bloquear { deps.listas.templates.first() }.single()
        assertEquals("Súper", t.name)
        assertEquals(listOf("Frutas", "Manzanas"), t.items.map { it.text })
        assertTrue(t.items.first().head)
        rule.esperarTexto("Plantilla «Súper» guardada.")
    }

    @Test fun fijar_ordenar_por_fecha_y_renombrar() {
        tres()
        abrir()
        rule.esperarTexto("Café")
        rule.onNodeWithContentDescription("Opciones de la lista").performClick()
        rule.onNodeWithText("Fijar arriba").performClick()
        rule.esperar { doc()!!.pinned }
        rule.onNodeWithContentDescription("Opciones de la lista").performClick()
        rule.onNodeWithText("Ordenar pendientes por fecha").performClick()
        rule.esperar { doc()!!.sortDue }
        rule.onNodeWithContentDescription("Opciones de la lista").performClick()
        rule.onNodeWithText("Renombrar").performClick()
        rule.onNode(hasSetTextAction() and hasText("Súper · 3 nov")).performTextReplacement("Despensa")
        rule.onNodeWithText("Guardar nombre").performClick()
        rule.esperar { doc()!!.name == "Despensa" }
    }

    @Test fun eliminar_lista_vuelve_atras() {
        tres()
        abrir()
        rule.esperarTexto("Café")
        rule.onNodeWithContentDescription("Opciones de la lista").performClick()
        rule.onNodeWithText("Eliminar lista").performClick()
        rule.esperarTexto("¿Eliminar la lista «Súper · 3 nov»?")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperar { atras }
        assertNull(doc())
        assertFalse(atras && doc() != null)
    }
}
