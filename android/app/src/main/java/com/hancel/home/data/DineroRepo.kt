package com.hancel.home.data

import androidx.room.withTransaction
import com.hancel.home.core.Account
import com.hancel.home.core.Kind
import com.hancel.home.core.Ledger
import com.hancel.home.core.Move
import com.hancel.home.core.applyEffects
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map

/**
 * Cuentas, movimientos y tipos de gasto. Los saldos solo cambian aquí, por los efectos de cada movimiento, en una
 * transacción (o en el formulario de cuenta/categoría, que guarda el saldo que la persona escribe).
 */
class DineroRepo(private val db: HomeDb) {
    private val dao = db.dinero()

    val accounts: Flow<List<Account>> = combine(dao.accountsFlow(), dao.categoriesFlow(), ::assembleAccounts).flowOn(Dispatchers.Default)
    val moves: Flow<List<Move>> = combine(dao.movesFlow(), dao.partsFlow(), ::assembleMoves).flowOn(Dispatchers.Default)
    val kinds: Flow<List<Kind>> = dao.kindsFlow().map { ks -> ks.map { it.model() } }
    val ledger: Flow<Ledger> = combine(accounts, moves) { a, m -> Ledger(a, m) }.flowOn(Dispatchers.Default)

    private suspend fun loadAccounts() = assembleAccounts(dao.accounts(), dao.categories())

    /** Guarda un movimiento nuevo o editado: revierte el efecto de la versión guardada (si la hay) y aplica el nuevo. */
    suspend fun saveMove(m: Move) = db.withTransaction {
        val before = loadAccounts()
        var accs = before
        dao.move(m.id)?.let { old -> accs = applyEffects(accs, Ledger(accs, emptyList()).effects(old.model(dao.partsOf(m.id))), -1) }
        accs = applyEffects(accs, Ledger(accs, emptyList()).effects(m), 1)
        writeBalances(before, accs)
        dao.upsertMove(m.entity())
        dao.deleteParts(m.id)
        dao.insertParts(m.partEntities())
    }

    suspend fun deleteMove(id: String) = db.withTransaction {
        val old = dao.move(id) ?: return@withTransaction
        val before = loadAccounts()
        writeBalances(before, applyEffects(before, Ledger(before, emptyList()).effects(old.model(dao.partsOf(id))), -1))
        dao.deleteMove(id)
    }

    private suspend fun writeBalances(before: List<Account>, after: List<Account>) {
        val old = before.flatMap { a -> a.cats.map { (a.id to it.id) to it.balance } }.toMap()
        for (a in after) for (c in a.cats) if (old[a.id to c.id] != c.balance) dao.setBalance(a.id, c.id, c.balance)
    }

    /** Guarda una cuenta con sus categorías; las que ya no están se borran (sus movimientos se conservan). */
    suspend fun saveAccount(a: Account) = db.withTransaction {
        dao.upsertAccount(a.entity())
        dao.deleteCategoriesExcept(a.id, a.cats.map { it.id })
        dao.upsertCategories(a.categoryEntities())
    }

    suspend fun deleteAccount(id: String) = dao.deleteAccount(id)
    suspend fun saveKind(k: Kind) = dao.upsertKind(k.entity())
    suspend fun deleteKind(id: String) = dao.deleteKind(id)
}
