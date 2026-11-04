package com.hancel.home.ui.finanzas

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createComposeRule
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
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
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

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class FlujoFormTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()
    private var listo = false

    @After fun cerrar() = modelos.limpiar()

    private fun moves(): List<Move> = bloquear { deps.dinero.moves.first() }
    private fun saldo(k: CatKey) = bloquear { deps.dinero.ledger.first().category(k)!!.balance }
    private fun ajustes() = bloquear { deps.ajustes.portable.first() }
    private fun SemanticsNodeInteraction.tocar() = performSemanticsAction(SemanticsActions.OnClick)

    private fun abrir(type: MoveType, id: String? = null) {
        val vm = modelos.crear { FlujoViewModel(SavedStateHandle(), deps.dinero, deps.ajustes, deps.hoy, deps.clock, type, id) }
        rule.setContent { HomeTheme { FlujoFormScreen(vm, onDone = { listo = true }) } }
    }

    @Test fun ingreso_suma() {
        deps.sembrarCuentas()
        abrir(MoveType.INCOME)
        rule.esperarTexto("Banco · Comida") // sin «último destino», la primera categoría
        rule.onNodeWithText("Monto").performTextInput("100")
        rule.onNodeWithText("Descripción (opcional)").performTextInput("Quincena")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val m = moves().single()
        assertEquals(MoveType.INCOME, m.type)
        assertEquals(listOf(Part(COMIDA, 10000)), m.parts)
        assertEquals("Quincena", m.note)
        assertEquals(60000L, saldo(COMIDA))
        assertEquals(COMIDA, ajustes().lastIncomeTo)
    }

    @Test fun ingreso_usa_el_ultimo_destino() {
        deps.sembrarCuentas()
        bloquear { deps.ajustes.update { it.copy(lastIncomeTo = RENTA) } }
        abrir(MoveType.INCOME)
        rule.esperarTexto("Banco · Renta")
    }

    @Test fun mover_entre_categorias() {
        deps.sembrarCuentas()
        abrir(MoveType.TRANSFER)
        rule.esperarTexto("Mover dinero")
        rule.esperarTexto("Banco · Comida")
        rule.esperarTexto("Banco · Renta")
        rule.onNodeWithText("Monto").performTextInput("50")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val m = moves().single()
        assertEquals(MoveType.TRANSFER, m.type)
        assertEquals(listOf(Part(COMIDA, 5000)), m.parts)
        assertEquals(RENTA, m.to)
        assertEquals(45000L, saldo(COMIDA))
        assertEquals(25000L, saldo(RENTA))
        assertEquals(COMIDA, ajustes().lastFrom)
    }

    @Test fun mover_misma_categoria_rechaza() {
        deps.sembrarCuentas()
        abrir(MoveType.TRANSFER)
        rule.esperarTexto("Banco · Renta")
        rule.onNodeWithText("Banco · Renta").performClick()
        rule.esperarTexto("Comida")
        rule.onNodeWithText("Comida").tocar()
        rule.esperar { rule.onAllNodes(androidx.compose.ui.test.hasText("Banco · Renta")).fetchSemanticsNodes().isEmpty() }
        rule.onNodeWithText("Monto").performTextInput("50")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("Elige categorías distintas.")
        assertTrue(moves().isEmpty())
    }

    @Test fun editar_ingreso_y_eliminarlo() {
        deps.sembrarCuentas()
        bloquear { deps.dinero.saveMove(Move("i", 1, MoveType.INCOME, LocalDate.of(2026, 11, 3), "", "Bono", null, null, null, 2000, listOf(Part(COMIDA, 2000)))) }
        abrir(MoveType.INCOME, "i")
        rule.esperarTexto("Editar: ingreso")
        rule.esperarTexto("Bono")
        rule.onNodeWithText("Monto").performTextReplacement("30")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        assertEquals(53000L, saldo(COMIDA))
    }

    @Test fun eliminar_movimiento_devuelve_saldos() {
        deps.sembrarCuentas()
        bloquear { deps.dinero.saveMove(Move("x", 1, MoveType.TRANSFER, LocalDate.of(2026, 11, 3), "", "", null, null, RENTA, 5000, listOf(Part(COMIDA, 5000)))) }
        abrir(MoveType.TRANSFER, "x")
        rule.esperarTexto("Editar: mover dinero")
        rule.onNodeWithContentDescription("Eliminar movimiento").performClick()
        rule.esperarTexto("¿Eliminar este movimiento?")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperar { listo }
        assertTrue(moves().isEmpty())
        assertEquals(50000L, saldo(COMIDA))
        assertEquals(20000L, saldo(RENTA))
    }
}
