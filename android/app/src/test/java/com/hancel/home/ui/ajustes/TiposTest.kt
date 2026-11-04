package com.hancel.home.ui.ajustes

import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Kind
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class TiposTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()

    @After fun cerrar() = modelos.limpiar()

    private fun nombres() = bloquear { deps.dinero.kinds.first().map { it.name } }

    private fun abrir() {
        val vm = modelos.crear { TiposViewModel(deps.dinero) }
        rule.setContent { HomeTheme { TiposScreen(vm, onBack = {}) } }
    }

    @Test fun tipos_en_orden_alfabetico() {
        bloquear { listOf("Ocio", "comida", "Ábaco").forEachIndexed { i, n -> deps.dinero.saveKind(Kind("k$i", n)) } }
        abrir()
        rule.esperarTexto("Ocio")
        val y = listOf("Ábaco", "comida", "Ocio").map { rule.onNodeWithText(it).fetchSemanticsNode().boundsInRoot.top }
        assertEquals(y.sorted(), y)
    }

    @Test fun tipos_agregar_renombrar_borrar() {
        bloquear { deps.dinero.saveKind(Kind("k1", "Comida")) }
        abrir()
        rule.esperarTexto("Comida")
        rule.onNodeWithText("Nuevo tipo").performTextInput("Mascotas")
        rule.onNodeWithContentDescription("Agregar tipo").performClick()
        rule.esperar { nombres().contains("Mascotas") }

        rule.onNodeWithText("Nuevo tipo").performTextInput("comida")
        rule.onNodeWithContentDescription("Agregar tipo").performClick()
        rule.esperarTexto("Ya hay un tipo con ese nombre.")

        rule.onNodeWithText("Comida").performClick()
        rule.onNodeWithText("Nombre").performTextReplacement("Supermercado")
        rule.onNodeWithContentDescription("Guardar nombre").performClick()
        rule.esperar { nombres().contains("Supermercado") }
        assertEquals("k1", bloquear { deps.dinero.kinds.first().first { it.name == "Supermercado" }.id })

        rule.onNodeWithText("Mascotas").performClick()
        rule.onNodeWithContentDescription("Eliminar Mascotas").performClick()
        rule.esperarTexto("¿Eliminar el tipo «Mascotas»?")
        rule.onNodeWithText("Eliminar tipo").performClick()
        rule.esperar { nombres() == listOf("Supermercado") }
        rule.esperar { rule.onAllNodes(hasText("Mascotas")).fetchSemanticsNodes().isEmpty() }
    }
}
