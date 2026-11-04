package com.hancel.home.core

import com.hancel.home.core.Fx.COMIDA
import com.hancel.home.core.Fx.RENTA
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PagoTarjetaTest {
    private val c1 = Fx.gasto(1000, RENTA, card = "visa", t = 1)
    private val c2 = Fx.gasto(500, COMIDA, card = "visa", t = 2)
    private val l = Ledger(Fx.accounts(deuda = -4500), listOf(c1, c2))
    private val visa get() = l.account("visa")!!

    @Test fun propuesta_desde_lo_pendiente_en_orden_alfabetico() {
        val p = proposeCardPayment(l, visa, null)
        assertEquals(listOf(Row(COMIDA, 500), Row(RENTA, 1000)), p.rows)
        assertEquals(4500, p.debt)
        assertEquals(3000, p.untracked)
    }

    @Test fun propuesta_sin_pendiente_usa_primera_normal_con_la_deuda() {
        val lg = Ledger(Fx.accounts(), emptyList())
        assertEquals(PayProposal(listOf(Row(COMIDA, 3000)), debt = 3000, untracked = 3000), proposeCardPayment(lg, lg.account("visa")!!, null))
    }

    @Test fun propuesta_al_editar_usa_sus_partes_y_la_deuda_antes_del_pago() {
        val pago = Fx.pago(700, COMIDA, t = 3)
        val lg = Ledger(Fx.accounts(deuda = -3800), listOf(c1, c2, pago))
        val p = proposeCardPayment(lg, lg.account("visa")!!, pago)
        assertEquals(listOf(Row(COMIDA, 700)), p.rows)
        assertEquals(4500, p.debt)
    }

    @Test fun estado_mas_de_lo_que_debes_y_negativo() {
        assertEquals("Total a pagar: Q15.00", payStatus(listOf(Row(COMIDA, 500), Row(RENTA, 1000)), 4500, l, null).text())
        assertEquals("Total a pagar: Q50.00 (más de lo que debes)", payStatus(listOf(Row(COMIDA, 5000)), 4500, l, null).text())
        assertEquals(
            "Total a pagar: Q600.00 (más de lo que debes) · una categoría quedará en negativo",
            payStatus(listOf(Row(COMIDA, 60000)), 4500, l, null).text(),
        )
    }

    @Test fun movimiento_de_pago() {
        val m = buildCardPayment(listOf(Row(COMIDA, 500), Row(RENTA, 0)), visa, "p", 9, Fx.D, "")!!
        assertEquals(MoveType.TRANSFER, m.type)
        assertEquals(listOf(Part(COMIDA, 500)), m.parts)
        assertEquals(500, m.total)
        assertEquals(Fx.VISA, m.to)
        assertEquals("Pago Visa", m.note)
        assertNull(buildCardPayment(listOf(Row(COMIDA, 0)), visa, "p", 9, Fx.D, ""))
    }
}
