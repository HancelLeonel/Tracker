package com.hancel.home.core

import com.hancel.home.core.Fx.COMIDA
import com.hancel.home.core.Fx.RENTA
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GastoTest {
    private val l = Ledger(Fx.accounts(), emptyList())

    @Test fun start_nuevo_selector_vacio_y_preset_valido() {
        assertEquals(listOf(Row(null, 0)), ExpenseDraft.start(l, null, null).rows)
        assertEquals(listOf(Row(COMIDA, 0)), ExpenseDraft.start(l, null, COMIDA).rows)
        assertEquals(listOf(Row(null, 0)), ExpenseDraft.start(l, null, Fx.VISA).rows) // una tarjeta no es categoría de gasto
    }

    @Test fun start_edicion_abre_con_allowNeg_si_ya_dejaba_negativo() {
        val g = Fx.gasto(60000, COMIDA)
        val after = Ledger(Fx.accounts(comida = -10000), listOf(g))
        val d = ExpenseDraft.start(after, g, null)
        assertTrue(d.allowNeg)
        assertEquals(listOf(Row(COMIDA, 60000)), d.rows)
        assertFalse(ExpenseDraft.start(Ledger(Fx.accounts(comida = 0), listOf(Fx.gasto(100, COMIDA))), Fx.gasto(100, COMIDA), null).allowNeg)
    }

    @Test fun autoFill_no_supera_lo_libre_al_crear() {
        val d = ExpenseDraft.start(l, null, COMIDA).withTotal(60000, l)
        assertEquals(listOf(Row(COMIDA, 50000)), d.rows)
        assertEquals(DraftStatus.Missing(10000, canAdd = true), d.status(l))
    }

    @Test fun autoFill_reparte_entre_filas() {
        val d = ExpenseDraft.start(l, null, COMIDA).withTotal(60000, l).addRow().withKey(1, RENTA, l)
        assertEquals(listOf(Row(COMIDA, 50000), Row(RENTA, 10000)), d.rows)
        assertEquals(DraftStatus.Ok, d.status(l))
    }

    @Test fun autoFill_con_allowNeg_pone_todo() {
        val d = ExpenseDraft.start(l, null, COMIDA).withTotal(60000, l).withAllowNeg(true, l)
        assertEquals(listOf(Row(COMIDA, 60000)), d.rows)
        assertEquals(DraftStatus.Negative(allowed = true), d.status(l))
    }

    @Test fun al_editar_no_se_reparte_con_tope() {
        val g = Fx.move(MoveType.EXPENSE, 1000, Part(COMIDA, 1000))
        val lg = Ledger(Fx.accounts(comida = 0), listOf(g)) // sin este gasto Comida tendría 10.00
        val d = ExpenseDraft.start(lg, g, null).withTotal(5000, lg)
        assertEquals(listOf(Row(COMIDA, 5000)), d.rows)
    }

    @Test fun editar_monto_apaga_auto() {
        val d = ExpenseDraft.start(l, null, COMIDA).withTotal(1000, l).withAmount(0, 400).withTotal(2000, l)
        assertFalse(d.auto)
        assertEquals(listOf(Row(COMIDA, 400)), d.rows)
        assertEquals(DraftStatus.Missing(1600, canAdd = true), d.status(l))
    }

    @Test fun status_sin_elegir_y_pasarse() {
        assertEquals(DraftStatus.Unpicked, ExpenseDraft.start(l, null, null).withTotal(100, l).status(l))
        assertEquals(DraftStatus.Over(300), ExpenseDraft.start(l, null, COMIDA).withTotal(100, l).withAmount(0, 400).status(l))
    }

    @Test fun choices_solo_con_dinero_libre_y_sin_repetir() {
        val lg = Ledger(Fx.accounts(renta = 0), emptyList())
        val d = ExpenseDraft.start(lg, null, COMIDA).addRow()
        assertEquals(emptyList<CatKey>(), d.choices(1, lg).filter { it == COMIDA })
        assertEquals(listOf(COMIDA), d.choices(0, lg))
        assertEquals(listOf(RENTA), d.withAllowNeg(true, lg).choices(1, lg))
        val sinDinero = Ledger(Fx.accounts(comida = 0, renta = 0), emptyList())
        assertEquals(listOf(COMIDA, RENTA), ExpenseDraft.start(sinDinero, null, null).choices(0, sinDinero))
    }

    @Test fun canAdd_solo_si_queda_otra_con_dinero() {
        val lg = Ledger(Fx.accounts(renta = 0), emptyList())
        assertFalse(ExpenseDraft.start(lg, null, COMIDA).canAdd(lg))
        assertTrue(ExpenseDraft.start(l, null, COMIDA).canAdd(l))
    }

    @Test fun removeRow_vuelve_a_repartir() {
        val d = ExpenseDraft.start(l, null, COMIDA).withTotal(60000, l).addRow().withKey(1, RENTA, l).removeRow(1, l)
        assertEquals(listOf(Row(COMIDA, 50000)), d.rows)
    }

    @Test fun checkSave_errores_y_confirmaciones() {
        val ok = ExpenseDraft.start(l, null, COMIDA).withTotal(1000, l)
        assertEquals(SaveCheck.Error("El gasto necesita un título."), ok.checkSave("  ", null, l))
        assertEquals(SaveCheck.Error("Escribe el monto del gasto."), ExpenseDraft.start(l, null, COMIDA).checkSave("x", null, l))
        assertEquals(SaveCheck.Error("Elige de qué categoría sale el dinero."), ExpenseDraft.start(l, null, null).withTotal(1000, l).checkSave("x", null, l))
        assertEquals(
            SaveCheck.Error("Los montos de las categorías deben sumar el total del gasto."),
            ok.withAmount(0, 900).checkSave("x", null, l),
        )
        val pasa = ok.withAmount(0, 1000).withTotal(60000, l).withAmount(0, 60000)
        assertEquals(SaveCheck.Confirm("Una categoría quedará en negativo. ¿Continuar?", ConfirmKind.NEGATIVE), pasa.checkSave("x", null, l))
        assertEquals(SaveCheck.Ok, pasa.checkSave("x", null, l, confirmed = setOf(ConfirmKind.NEGATIVE)))
        assertEquals(SaveCheck.Ok, ok.checkSave("Almuerzo", null, l))
    }

    @Test fun checkSave_limite_de_credito() {
        val d = ExpenseDraft.start(l, null, COMIDA).withAllowNeg(true, l).withTotal(98000, l)
        assertEquals(
            SaveCheck.Confirm("Esta compra supera el crédito disponible de Visa (Q970.00). ¿Continuar?", ConfirmKind.LIMIT),
            d.checkSave("x", "visa", l, confirmed = setOf(ConfirmKind.NEGATIVE)),
        )
        assertEquals(SaveCheck.Ok, d.checkSave("x", "visa", l, confirmed = setOf(ConfirmKind.NEGATIVE, ConfirmKind.LIMIT)))
    }

    @Test fun toMove_descarta_filas_en_cero() {
        val d = ExpenseDraft.start(l, null, COMIDA).withTotal(1000, l).addRow().withKey(1, RENTA, l)
        val m = d.toMove("id", 5, Fx.D, "Almuerzo", "", "k", null)
        assertEquals(listOf(Part(COMIDA, 1000)), m.parts)
        assertEquals(1000, m.total)
        assertEquals(MoveType.EXPENSE, m.type)
        assertEquals("k", m.kindId)
    }
}
