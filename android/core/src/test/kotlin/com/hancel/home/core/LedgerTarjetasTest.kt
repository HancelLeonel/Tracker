package com.hancel.home.core

import com.hancel.home.core.Fx.COMIDA
import com.hancel.home.core.Fx.RENTA
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random
import kotlin.system.measureTimeMillis

class LedgerTarjetasTest {
    private val c1 = Fx.gasto(1000, COMIDA, card = "visa", t = 1)
    private val c2 = Fx.gasto(500, RENTA, card = "visa", t = 2)

    @Test fun compras_suman_por_categoria() {
        assertEquals(mapOf(COMIDA to 1000L, RENTA to 500L), Ledger(Fx.accounts(), listOf(c1, c2)).cardPending("visa"))
    }

    @Test fun pago_resta_primero_de_su_categoria_y_luego_de_la_mayor() {
        val pago = Fx.pago(1200, RENTA, t = 3)
        assertEquals(mapOf(COMIDA to 300L), Ledger(Fx.accounts(), listOf(c1, c2, pago)).cardPending("visa"))
    }

    @Test fun ingreso_a_tarjeta_resta_de_la_mayor() {
        val ing = Fx.move(MoveType.INCOME, 600, Part(Fx.VISA, 600), t = 3)
        assertEquals(mapOf(COMIDA to 400L, RENTA to 500L), Ledger(Fx.accounts(), listOf(c1, c2, ing)).cardPending("visa"))
    }

    @Test fun orden_por_fecha_y_t_un_pago_anterior_no_cancela_la_compra() {
        val pago = Fx.pago(1000, COMIDA, date = Fx.D.minusDays(1), t = 99)
        assertEquals(mapOf(COMIDA to 1000L), Ledger(Fx.accounts(), listOf(c1, pago)).cardPending("visa"))
    }

    @Test fun empate_de_la_mayor_toma_la_primera_insertada() {
        val a = Fx.gasto(500, RENTA, card = "visa", t = 1)
        val b = Fx.gasto(500, COMIDA, card = "visa", t = 2)
        val ing = Fx.move(MoveType.INCOME, 200, Part(Fx.VISA, 200), t = 3)
        assertEquals(mapOf(RENTA to 300L, COMIDA to 500L), Ledger(Fx.accounts(), listOf(a, b, ing)).cardPending("visa"))
    }

    @Test fun exclude_quita_el_movimiento() {
        val l = Ledger(Fx.accounts(), listOf(c1, c2))
        assertEquals(mapOf(RENTA to 500L), l.cardPending("visa", exclude = c1))
        assertEquals(mapOf(COMIDA to 1000L, RENTA to 500L), l.cardPending("visa"))
    }

    @Test fun reservedMap_suma_todas_las_tarjetas() {
        val accs = Fx.accounts() + Account("mc", "Master", AccountType.CREDIT, 0, listOf(Category("d", "Deuda", 0)))
        val c3 = Fx.gasto(250, COMIDA, card = "mc", t = 4)
        assertEquals(mapOf(COMIDA to 1250L, RENTA to 500L), Ledger(accs, listOf(c1, c2, c3)).reservedMap())
    }

    @Test fun availWithout_es_saldo_menos_apartado() {
        val l = Ledger(Fx.accounts(), listOf(c1, c2))
        assertEquals(49000, l.availWithout(null, COMIDA))
        assertEquals(50000, l.availWithout(c1, COMIDA))
    }

    @Test fun cardUntracked_es_la_deuda_sin_categoria() {
        val l = Ledger(Fx.accounts(deuda = -4500), listOf(c1, c2))
        assertEquals(3000, l.cardUntracked("visa"))
    }

    @Test fun rendimiento_60000_movimientos() {
        val rnd = Random(7)
        val cats = (1..20).map { Category("c$it", "Cat $it", 1_000_000) }
        val accs = listOf(
            Account("b", "Banco", AccountType.NORMAL, 0, cats),
            Account("v1", "Visa", AccountType.CREDIT, 0, listOf(Category("d", "Deuda", 0))),
            Account("v2", "Master", AccountType.CREDIT, 0, listOf(Category("d", "Deuda", 0))),
        )
        val start = Fx.D.minusYears(5)
        val moves = (1..60_000).map { i ->
            val k = CatKey("b", "c${rnd.nextInt(1, 21)}")
            val amt = rnd.nextLong(100, 50_000)
            val date = start.plusDays((i / 33).toLong())
            when (rnd.nextInt(10)) {
                0, 1, 2 -> Fx.move(MoveType.EXPENSE, amt, Part(k, amt), card = if (rnd.nextBoolean()) "v1" else "v2", date = date, t = i.toLong())
                3 -> Fx.move(MoveType.TRANSFER, amt, Part(k, amt), to = CatKey(if (rnd.nextBoolean()) "v1" else "v2", "d"), date = date, t = i.toLong())
                4 -> Fx.move(MoveType.INCOME, amt, Part(k, amt), date = date, t = i.toLong())
                else -> Fx.move(MoveType.EXPENSE, amt, Part(k, amt), date = date, t = i.toLong())
            }
        }
        Ledger(accs, moves).let { it.reservedMap(); it.totals() } // calentamiento
        val ms = measureTimeMillis { Ledger(accs, moves).let { it.reservedMap(); it.totals() } }
        assertTrue("reservedMap + totals tardó $ms ms", ms < 300)

        // Al editar un gasto el formulario pregunta lo libre de cada categoría muchas veces por tecla: lo apartado
        // sin ese gasto se calcula una vez, no en cada consulta.
        val l = Ledger(accs, moves)
        val editing = moves[30_000]
        l.availWithout(editing, CatKey("b", "c1"))
        val edit = measureTimeMillis { repeat(200) { i -> l.availWithout(editing, CatKey("b", "c${i % 20 + 1}")) } }
        assertTrue("200 consultas de lo libre al editar tardaron $edit ms", edit < 300)
    }
}
