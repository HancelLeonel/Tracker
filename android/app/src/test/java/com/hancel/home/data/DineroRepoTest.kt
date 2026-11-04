package com.hancel.home.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Account
import com.hancel.home.core.AccountType
import com.hancel.home.core.CatKey
import com.hancel.home.core.Category
import com.hancel.home.core.Kind
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class DineroRepoTest {
    @get:Rule val rule = DbRule()
    private lateinit var repo: DineroRepo
    private val comida = CatKey("banco", "comida")
    private val renta = CatKey("banco", "renta")
    private val d = LocalDate.of(2026, 11, 3)

    @Before fun setUp() = runTest {
        repo = DineroRepo(rule.db)
        repo.saveAccount(Account("banco", "Banco", AccountType.NORMAL, 0, listOf(Category("comida", "Comida", 50000), Category("renta", "Renta", 20000))))
        repo.saveAccount(Account("visa", "Visa", AccountType.CREDIT, 100000, listOf(Category("deuda", "Deuda", 0))))
    }

    private fun gasto(id: String, vararg parts: Part, card: String? = null) =
        Move(id, 1, MoveType.EXPENSE, d, "x", "", null, card, null, parts.sumOf { it.amount }, parts.toList())
    private suspend fun saldo(k: CatKey) = repo.ledger.first().category(k)!!.balance

    @Test fun siembra_tipos_solo_si_no_hay() = runTest {
        repo.seedKindsIfEmpty()
        assertEquals(listOf("Comida", "Transporte", "Servicios", "Suscripciones", "Salud", "Ocio", "Hogar", "Otros"), repo.kinds.first().map { it.name })
        repo.deleteKind(repo.kinds.first().first().id)
        repo.seedKindsIfEmpty()
        assertEquals(7, repo.kinds.first().size)
    }

    @Test fun cuenta_por_id() = runTest {
        assertEquals("Banco", repo.account("banco")!!.name)
        assertEquals(null, repo.account("nada"))
    }

    @Test fun guardar_gasto_cuadra_saldos() = runTest {
        repo.saveMove(gasto("g", Part(comida, 1500), Part(renta, 500)))
        assertEquals(48500, saldo(comida))
        assertEquals(19500, saldo(renta))
        assertEquals(listOf("g"), repo.moves.first().map { it.id })
    }

    @Test fun editar_gasto_revierte_y_aplica() = runTest {
        repo.saveMove(gasto("g", Part(comida, 1500)))
        repo.saveMove(gasto("g", Part(renta, 700)))
        assertEquals(50000, saldo(comida))
        assertEquals(19300, saldo(renta))
        assertEquals(listOf(Part(renta, 700)), repo.moves.first().single().parts)
    }

    @Test fun borrar_gasto_devuelve_el_dinero() = runTest {
        repo.saveMove(gasto("g", Part(comida, 1500)))
        repo.deleteMove("g")
        assertEquals(50000, saldo(comida))
        assertEquals(emptyList<Move>(), repo.moves.first())
    }

    @Test fun gasto_con_tarjeta_no_toca_la_categoria() = runTest {
        repo.saveMove(gasto("g", Part(comida, 1500), card = "visa"))
        assertEquals(50000, saldo(comida))
        assertEquals(-1500, saldo(CatKey("visa", "deuda")))
        assertEquals(mapOf(comida to 1500L), repo.ledger.first().reservedMap())
    }

    @Test fun borrar_categoria_conserva_movimientos() = runTest {
        repo.saveMove(gasto("g", Part(renta, 500)))
        val banco = repo.accounts.first().first { it.id == "banco" }
        repo.saveAccount(banco.copy(cats = banco.cats.filter { it.id != "renta" }))
        assertEquals(listOf("comida"), repo.accounts.first().first { it.id == "banco" }.cats.map { it.id })
        assertEquals(1, repo.moves.first().size)
        repo.deleteMove("g") // revertir sobre una categoría que ya no existe no falla
        assertEquals(50000, saldo(comida))
    }

    @Test fun borrar_cuenta_conserva_movimientos() = runTest {
        repo.saveMove(gasto("g", Part(comida, 500)))
        repo.deleteAccount("banco")
        assertEquals(listOf("visa"), repo.accounts.first().map { it.id })
        assertEquals(1, repo.moves.first().size)
    }

    @Test fun kinds() = runTest {
        repo.saveKind(Kind("k1", "Comida"))
        repo.saveKind(Kind("k1", "Comidas"))
        repo.saveKind(Kind("k2", "Ocio"))
        repo.deleteKind("k2")
        assertEquals(listOf(Kind("k1", "Comidas")), repo.kinds.first())
    }
}
