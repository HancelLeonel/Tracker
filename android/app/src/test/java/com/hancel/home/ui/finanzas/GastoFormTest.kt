package com.hancel.home.ui.finanzas

import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.SavedStateHandle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.CatKey
import com.hancel.home.core.Move
import com.hancel.home.core.Part
import com.hancel.home.ui.HomeRoot
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.RelojPrueba
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import com.hancel.home.ui.verEnLista
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class GastoFormTest {
    @get:Rule val rule = createComposeRule()
    private val reloj = RelojPrueba()
    private val deps = depsDePrueba(reloj)
    private val modelos = Modelos()
    private val hoy = LocalDate.of(2026, 11, 3)
    private var listo = false

    @After fun cerrar() = modelos.limpiar()

    private fun moves(): List<Move> = bloquear { deps.dinero.moves.first() }
    private fun saldo(k: CatKey) = bloquear { deps.dinero.ledger.first().category(k)!!.balance }
    private fun crear(h: SavedStateHandle = SavedStateHandle(), id: String? = null, preset: CatKey? = null, card: String? = null) =
        modelos.crear { GastoViewModel(h, deps.dinero, deps.ajustes, deps.hoy, deps.clock, id, preset, card) }

    private fun abrir(id: String? = null, preset: CatKey? = null) {
        val vm = crear(id = id, preset = preset)
        rule.setContent { HomeTheme { GastoFormScreen(vm, onDone = { listo = true }) } }
    }

    /** Las filas de una hoja inferior se tocan con la acción de clic (ver SelectorCategoriaTest). */
    private fun SemanticsNodeInteraction.tocar() = performSemanticsAction(SemanticsActions.OnClick)

    @Test fun gasto_simple_guarda_y_actualiza_saldo() {
        deps.sembrarCuentas()
        bloquear { deps.dinero.seedKindsIfEmpty() }
        abrir(preset = COMIDA)
        rule.esperarTexto("Banco · Comida")
        rule.onNodeWithText("Título").performTextInput("Súper")
        rule.onNodeWithText("Monto total").performTextInput("25,50")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val m = moves().single()
        assertEquals("Súper", m.title)
        assertEquals(2550L, m.total)
        assertEquals(listOf(Part(COMIDA, 2550)), m.parts)
        assertEquals(hoy, m.date)
        assertEquals(null, m.cardId)
        assertEquals(47450L, saldo(COMIDA))
        assertNotNull(m.kindId)
        assertEquals(m.kindId, bloquear { deps.ajustes.portable.first().lastKind })
    }

    @Test fun sin_titulo_no_guarda() {
        deps.sembrarCuentas()
        abrir(preset = COMIDA)
        rule.esperarTexto("Banco · Comida")
        rule.onNodeWithText("Monto total").performTextInput("10")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("El gasto necesita un título.")
        assertTrue(moves().isEmpty())
        assertTrue(!listo)
    }

    @Test fun reparto_automatico_y_falta_asignar() {
        deps.sembrarCuentas()
        abrir(preset = COMIDA)
        rule.esperarTexto("Banco · Comida")
        rule.onNodeWithText("Título").performTextInput("Mercado")
        rule.onNodeWithText("Monto total").performTextInput("600")
        rule.esperarTexto("Falta asignar Q100.00. Agrega otra categoría.")
        rule.onNodeWithText("Agregar otra categoría").performClick()
        rule.esperarTexto("Elige de qué categoría sale el dinero.")
        rule.onNodeWithText("Elegir categoría…").performClick()
        rule.esperarTexto("Renta")
        rule.onNodeWithText("Renta").tocar()
        rule.esperarTexto("Banco · Renta")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        assertEquals(listOf(Part(COMIDA, 50000), Part(RENTA, 10000)), moves().single().parts)
    }

    @Test fun pasarse_pide_confirmacion() {
        deps.sembrarCuentas()
        deps.gasto("t", 1000, COMIDA, hoy, card = "visa") // Comida tiene Q10 apartados: libre Q490
        abrir(preset = COMIDA)
        rule.esperarTexto("Banco · Comida")
        rule.onNodeWithText("Título").performTextInput("Cena")
        rule.onNodeWithText("Monto total").performTextInput("500")
        rule.esperarTexto("Falta asignar Q10.00.")
        rule.onNodeWithText("Monto").performTextReplacement("500")
        rule.esperarTexto("Alguna categoría quedará en negativo.")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("Una categoría quedará en negativo. ¿Continuar?")
        rule.onNodeWithText("Cancelar").performClick()
        rule.waitForIdle()
        assertEquals(1, moves().size)
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("Una categoría quedará en negativo. ¿Continuar?")
        rule.onNodeWithText("Continuar").performClick()
        rule.esperar { listo }
        assertEquals(listOf(Part(COMIDA, 50000)), moves().first { it.id != "t" }.parts)
    }

    @Test fun editar_abre_con_negativo_si_aplica() {
        deps.sembrarCuentas()
        deps.gasto("g", 60000, COMIDA, hoy, title = "Grande") // deja Comida en −Q100
        abrir(id = "g")
        rule.esperarTexto("Editar gasto")
        rule.esperarTexto("Grande")
        rule.onNodeWithText("Permitir saldo negativo", substring = true).assertIsOn()
    }

    @Test fun nuevo_gasto_sin_negativo() {
        deps.sembrarCuentas()
        abrir(preset = COMIDA)
        rule.esperarTexto("Banco · Comida")
        rule.onNodeWithText("Permitir saldo negativo", substring = true).assertIsOff()
    }

    @Test fun eliminar_gasto_devuelve_el_saldo() {
        deps.sembrarCuentas()
        deps.gasto("g", 1000, COMIDA, hoy, title = "Pan")
        abrir(id = "g")
        rule.esperarTexto("Pan")
        rule.onNodeWithContentDescription("Eliminar gasto").performClick()
        rule.esperarTexto("¿Eliminar este gasto?")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperar { listo }
        assertTrue(moves().isEmpty())
        assertEquals(50000L, saldo(COMIDA))
    }

    @Test fun compra_con_tarjeta_desde_finanzas_preselecciona_tarjeta() {
        deps.sembrarCuentas()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        rule.verEnLista("lista-finanzas", "Compra")
        rule.onNodeWithText("Compra").performClick()
        rule.esperarTexto("Tarjeta Visa (se paga después)")
        rule.esperarTexto("Categoría de la que saldrá el dinero al pagar la tarjeta")
    }

    @Test fun formulario_sobrevive_a_recrear() {
        deps.sembrarCuentas()
        val h = SavedStateHandle()
        var vm by mutableStateOf(crear(h, preset = COMIDA))
        rule.setContent { HomeTheme { key(vm) { GastoFormScreen(vm, onDone = {}) } } }
        rule.esperarTexto("Banco · Comida")
        rule.onNodeWithText("Título").performTextInput("Pan dulce")
        rule.onNodeWithText("Monto total").performTextInput("12")
        rule.waitForIdle()
        // Android cerró la app: un modelo nuevo con lo que quedó guardado en el SavedStateHandle.
        val guardado = SavedStateHandle(h.keys().associateWith { h.get<Any?>(it) })
        vm = crear(guardado, preset = COMIDA)
        rule.esperarTexto("Pan dulce")
        rule.esperar { rule.onAllNodesWithText("12").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Banco · Comida").assertExists()
    }
}
