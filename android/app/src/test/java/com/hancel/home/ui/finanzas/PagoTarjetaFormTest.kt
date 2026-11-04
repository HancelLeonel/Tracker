package com.hancel.home.ui.finanzas

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
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
class PagoTarjetaFormTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()
    private val hoy = LocalDate.of(2026, 11, 3)
    private val deuda = CatKey("visa", "deuda")
    private var listo = false

    @After fun cerrar() = modelos.limpiar()

    private fun moves(): List<Move> = bloquear { deps.dinero.moves.first() }
    private fun ledger() = bloquear { deps.dinero.ledger.first() }
    private fun saldo(k: CatKey) = ledger().category(k)!!.balance

    /** Banco y Visa (Q30 de saldo inicial) más una compra de Q10 con Visa desde Comida: debe Q40. */
    private fun sembrar() {
        deps.sembrarCuentas()
        deps.gasto("g", 1000, COMIDA, hoy, card = "visa", title = "Súper")
    }

    private fun abrir(id: String? = null) {
        val vm = modelos.crear { PagoTarjetaViewModel(SavedStateHandle(), deps.dinero, deps.hoy, deps.clock, "visa", id) }
        rule.setContent { HomeTheme { PagoTarjetaFormScreen(vm, onDone = { listo = true }) } }
    }

    private fun pago(id: String, amount: Long) = bloquear {
        deps.dinero.saveMove(Move(id, 5, MoveType.TRANSFER, hoy, "", "Pago Visa", null, null, deuda, amount, listOf(Part(COMIDA, amount))))
    }

    @Test fun pago_tarjeta_propone_pendiente_y_baja_apartado() {
        sembrar()
        abrir()
        rule.esperarTexto("Pagar Visa")
        rule.esperarTexto("Debes Q40.00 · propuesto según los gastos hechos con la tarjeta")
        rule.esperarTexto("Q30.00 son saldo inicial sin categoría.")
        rule.esperarTexto("Banco · Comida")
        rule.esperarTexto("Total a pagar: Q10.00")
        rule.onNodeWithText("Registrar pago").performClick()
        rule.esperar { listo }
        val p = moves().single { it.type == MoveType.TRANSFER }
        assertEquals(listOf(Part(COMIDA, 1000)), p.parts)
        assertEquals(deuda, p.to)
        assertEquals("Pago Visa", p.note)
        assertEquals(49000L, saldo(COMIDA))
        assertEquals(-3000L, saldo(deuda))
        assertEquals(0L, ledger().reservedMap()[COMIDA] ?: 0L)
    }

    @Test fun pago_mas_de_lo_que_debes_avisa() {
        sembrar()
        abrir()
        rule.esperarTexto("Total a pagar: Q10.00")
        rule.onNodeWithText("Monto").performTextReplacement("50")
        rule.esperarTexto("Total a pagar: Q50.00 (más de lo que debes)")
    }

    @Test fun pago_sin_montos_no_se_registra() {
        sembrar()
        abrir()
        rule.esperarTexto("Total a pagar: Q10.00")
        rule.onNodeWithText("Monto").performTextClearance()
        rule.onNodeWithText("Registrar pago").performClick()
        rule.esperarTexto("Indica cuánto vas a pagar.")
        assertTrue(moves().none { it.type == MoveType.TRANSFER })
    }

    @Test fun editar_y_eliminar_pago() {
        sembrar()
        pago("p", 1000)
        abrir("p")
        rule.esperarTexto("Editar pago de Visa")
        rule.esperarTexto("Debes Q40.00") // lo que se debía antes de este pago
        rule.esperarTexto("Total a pagar: Q10.00")
        rule.onNodeWithText("Monto").performTextReplacement("20")
        rule.onNodeWithText("Registrar pago").performClick()
        rule.esperar { listo }
        assertEquals(48000L, saldo(COMIDA))
        assertEquals(-2000L, saldo(deuda))
    }

    @Test fun eliminar_pago_devuelve_la_deuda() {
        sembrar()
        pago("p", 1000)
        abrir("p")
        rule.esperarTexto("Editar pago de Visa")
        rule.onNodeWithContentDescription("Eliminar pago").performClick()
        rule.esperarTexto("¿Eliminar este pago?")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperar { listo }
        assertTrue(moves().none { it.id == "p" })
        assertEquals(50000L, saldo(COMIDA))
        assertEquals(-4000L, saldo(deuda))
    }
}
