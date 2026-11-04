package com.hancel.home.core

import com.hancel.home.core.Fx.COMIDA
import com.hancel.home.core.Fx.RENTA
import com.hancel.home.core.Fx.VISA
import org.junit.Assert.assertEquals
import org.junit.Test

class LedgerSaldosTest {
    private val l = Ledger(Fx.accounts(), emptyList())

    @Test fun gasto_sin_tarjeta_resta_de_cada_parte() {
        val g = Fx.move(MoveType.EXPENSE, 1500, Part(COMIDA, 1000), Part(RENTA, 500))
        assertEquals(listOf(Effect(COMIDA, -1000), Effect(RENTA, -500)), l.effects(g))
    }

    @Test fun gasto_con_tarjeta_solo_suma_deuda() {
        assertEquals(listOf(Effect(VISA, -1500)), l.effects(Fx.gasto(1500, COMIDA, card = "visa")))
    }

    @Test fun gasto_con_tarjeta_inexistente_no_tiene_efectos() {
        assertEquals(emptyList<Effect>(), l.effects(Fx.gasto(1500, COMIDA, card = "otra")))
    }

    @Test fun ingreso_suma_y_transferencia_mueve() {
        assertEquals(listOf(Effect(RENTA, 1000)), l.effects(Fx.move(MoveType.INCOME, 1000, Part(RENTA, 1000))))
        val x = Fx.move(MoveType.TRANSFER, 700, Part(COMIDA, 700), to = RENTA)
        assertEquals(listOf(Effect(COMIDA, -700), Effect(RENTA, 700)), l.effects(x))
    }

    @Test fun balanceWithout_descuenta_el_propio_movimiento() {
        val g = Fx.gasto(1500, COMIDA)
        val after = Ledger(Fx.accounts(comida = 48500), listOf(g))
        assertEquals(48500, after.balanceWithout(null, COMIDA))
        assertEquals(50000, after.balanceWithout(g, COMIDA))
        assertEquals(20000, after.balanceWithout(g, RENTA))
    }

    @Test fun applyEffects_aplica_y_revierte() {
        val accs = applyEffects(Fx.accounts(), listOf(Effect(COMIDA, -1500), Effect(VISA, -200)), 1)
        val l2 = Ledger(accs, emptyList())
        assertEquals(48500, l2.category(COMIDA)!!.balance)
        assertEquals(-3200, l2.category(VISA)!!.balance)
        assertEquals(Fx.accounts(), applyEffects(accs, listOf(Effect(COMIDA, -1500), Effect(VISA, -200)), -1))
    }

    @Test fun applyEffects_ignora_categorias_borradas() {
        assertEquals(Fx.accounts(), applyEffects(Fx.accounts(), listOf(Effect(CatKey("banco", "borrada"), -100)), 1))
    }

    @Test fun catLabel_normal_tarjeta_y_eliminada() {
        assertEquals("Banco / Comida", l.catLabel(COMIDA))
        assertEquals("Visa (tarjeta)", l.catLabel(VISA))
        assertEquals("(eliminada)", l.catLabel(CatKey("banco", "zzz")))
    }

    @Test fun totals_neto() {
        assertEquals(Totals(cash = 70000, debt = -3000, net = 67000), l.totals())
    }

    @Test fun normalKeys_sin_tarjetas_en_orden_alfabetico() {
        val accs = listOf(
            Account("z", "Zeta", AccountType.NORMAL, 0, listOf(Category("b", "beta", 0), Category("a", "Alfa", 0))),
        ) + Fx.accounts()
        assertEquals(listOf(COMIDA, RENTA, CatKey("z", "a"), CatKey("z", "b")), Ledger(accs, emptyList()).normalKeys())
    }

    @Test fun sortedMoves_por_fecha_y_t_desc() {
        val a = Fx.gasto(1, COMIDA, date = Fx.D.minusDays(1), t = 50)
        val b = Fx.gasto(1, COMIDA, date = Fx.D, t = 10)
        val c = Fx.gasto(1, COMIDA, date = Fx.D, t = 20)
        assertEquals(listOf(c, b, a), Ledger(Fx.accounts(), listOf(a, b, c)).sortedMoves())
    }

    @Test fun accountRows_tarjeta_aparece_via_la_cuenta_y_en_la_tarjeta() {
        val compra = Fx.gasto(1500, COMIDA, card = "visa")
        val interna = Fx.move(MoveType.TRANSFER, 700, Part(COMIDA, 700), to = RENTA)
        val ajena = Fx.move(MoveType.INCOME, 100, Part(CatKey("otra", "x"), 100))
        val lg = Ledger(Fx.accounts(), listOf(compra, interna, ajena))
        val banco = lg.accountRows("banco").associateBy { it.move.id }
        assertEquals(setOf(compra.id, interna.id), banco.keys)
        assertEquals(AccountRow(compra, delta = 0, viaCard = true, viaCardAmount = 1500, cats = listOf("Comida")), banco[compra.id])
        assertEquals(0L, banco[interna.id]!!.delta)
        assertEquals(listOf("Comida", "Renta"), banco[interna.id]!!.cats)
        val visa = lg.accountRows("visa").single()
        assertEquals(-1500L, visa.delta)
        assertEquals(false, visa.viaCard)
    }

    @Test fun moveTitle_y_moveWhere() {
        val g = Fx.gasto(1500, COMIDA, card = "visa")
        assertEquals("Gasto", l.moveTitle(g))
        assertEquals("Banco / Comida · tarjeta Visa", l.moveWhere(g))
        val x = Fx.move(MoveType.TRANSFER, 700, Part(COMIDA, 700), to = RENTA)
        assertEquals("Transferencia", l.moveTitle(x))
        assertEquals("Banco / Comida → Banco / Renta", l.moveWhere(x))
        assertEquals("Almuerzo", l.moveTitle(g.copy(title = "Almuerzo")))
        assertEquals("Pago Visa", l.moveTitle(x.copy(note = "Pago Visa")))
    }
}
