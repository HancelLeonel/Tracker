package com.hancel.home.core

/** Cambio que un movimiento hace al saldo de una categoría. */
data class Effect(val key: CatKey, val delta: Long)

/** Dinero en cuentas normales, deuda en tarjetas (≤ 0 normalmente) y neto. */
data class Totals(val cash: Long, val debt: Long, val net: Long)

/**
 * Fila del detalle de una cuenta: cuánto cambió el saldo de ESA cuenta. Una compra con tarjeta aparece también en la
 * cuenta de la que saldrá el dinero (`viaCard`, sin cambiar su saldo todavía) con lo que le toca (`viaCardAmount`).
 */
data class AccountRow(val move: Move, val delta: Long, val viaCard: Boolean, val viaCardAmount: Long, val cats: List<String>)

/**
 * Vista inmutable de cuentas + movimientos con todas las reglas de dinero (traducción de `state.js`).
 * Como no cambia, lo que se calcula se memoriza; tras guardar algo se construye un Ledger nuevo.
 */
class Ledger(val accounts: List<Account>, val moves: List<Move>) {
    private val byId: Map<String, Account> by lazy { accounts.associateBy { it.id } }

    fun account(id: String): Account? = byId[id]
    fun category(key: CatKey): Category? = byId[key.acc]?.cats?.firstOrNull { it.id == key.cat }
    fun isCredit(accId: String): Boolean = byId[accId]?.isCredit == true

    val sortedAccounts: List<Account> by lazy {
        accounts.sortedWith(compareBy(byName) { it.name }).map { a -> a.copy(cats = a.cats.sortedWith(compareBy(byName) { it.name })) }
    }

    /** Categorías de cuentas normales (las de tarjetas no se ofrecen para gastar ni mover), en orden alfabético. */
    fun normalKeys(): List<CatKey> = normal
    private val normal: List<CatKey> by lazy {
        sortedAccounts.filter { !it.isCredit }.flatMap { a -> a.cats.map { CatKey(a.id, it.id) } }
    }

    fun catLabel(key: CatKey): String {
        val a = account(key.acc)
        val c = category(key) ?: return "(eliminada)"
        return if (a!!.isCredit) "${a.name} (tarjeta)" else "${a.name} / ${c.name}"
    }

    fun moveTitle(m: Move): String = m.title.ifEmpty { m.note }.ifEmpty {
        when (m.type) { MoveType.EXPENSE -> "Gasto"; MoveType.INCOME -> "Ingreso"; MoveType.TRANSFER -> "Transferencia" }
    }

    fun moveWhere(m: Move): String {
        val where = m.parts.joinToString(" + ") { catLabel(it.key) }
        return when {
            m.type == MoveType.TRANSFER -> "$where → ${m.to?.let(::catLabel) ?: "(eliminada)"}"
            m.cardId != null -> "$where · tarjeta ${account(m.cardId)?.name ?: "(eliminada)"}"
            else -> where
        }
    }

    /**
     * Efecto de un movimiento sobre los saldos. Un gasto con tarjeta solo suma deuda a la tarjeta: el dinero
     * apartado sigue en su categoría hasta que se paga.
     */
    fun effects(m: Move): List<Effect> {
        if (m.type == MoveType.EXPENSE && m.cardId != null) {
            val cat = account(m.cardId)?.cats?.firstOrNull() ?: return emptyList()
            return listOf(Effect(CatKey(m.cardId, cat.id), -m.total))
        }
        val out = m.parts.map { Effect(it.key, if (m.type == MoveType.INCOME) it.amount else -it.amount) }
        return if (m.type == MoveType.TRANSFER && m.to != null) out + Effect(m.to, m.total) else out
    }

    /** Saldo de una categoría como estaba antes de aplicar `move` (para editarlo sin contarlo dos veces). */
    fun balanceWithout(move: Move?, key: CatKey): Long {
        val base = category(key)?.balance ?: 0
        if (move == null) return base
        return base - effects(move).filter { it.key == key }.sumOf { it.delta }
    }

    fun totals(): Totals = tot
    private val tot: Totals by lazy {
        val cash = accounts.filter { !it.isCredit }.sumOf { a -> a.cats.sumOf { it.balance } }
        val debt = accounts.filter { it.isCredit }.sumOf { a -> a.cats.sumOf { it.balance } }
        Totals(cash, debt, cash + debt)
    }

    /** De más nuevo a más viejo (fecha y luego hora de creación). */
    fun sortedMoves(): List<Move> = sorted
    private val sorted: List<Move> by lazy {
        moves.sortedWith(compareByDescending<Move> { it.date }.thenByDescending { it.t })
    }

    // ---------- tarjetas: lo apartado en cada categoría ----------

    /** De más viejo a más nuevo: el orden en que se recorre el historial para derivar lo apartado. */
    private val chrono: List<Move> by lazy { moves.sortedWith(compareBy<Move> { it.date }.thenBy { it.t }) }
    private val pendingCache = HashMap<String, Map<CatKey, Long>>()

    /**
     * Por cada categoría, cuánto de lo que debe una tarjeta saldrá de ella. Se deriva del historial: las compras
     * suman a su categoría y los pagos restan primero de la categoría desde la que se paga y luego (si sobra) de las
     * de mayor pendiente; un ingreso a la tarjeta resta de las de mayor pendiente. Así editar o borrar siempre cuadra.
     */
    fun cardPending(cardId: String, exclude: Move? = null): Map<CatKey, Long> {
        if (exclude == null) synchronized(pendingCache) { pendingCache[cardId]?.let { return it } }
        val out = computePending(cardId, exclude?.id)
        if (exclude == null) synchronized(pendingCache) { pendingCache[cardId] = out }
        return out
    }

    private fun computePending(cardId: String, excludeId: String?): Map<CatKey, Long> {
        val pend = LinkedHashMap<CatKey, Long>() // el orden de inserción desempata «la mayor», como el Map de JS
        fun take(k: CatKey, rem: Long): Long {
            val v = pend[k] ?: 0
            val t = minOf(v, rem)
            if (t > 0) pend[k] = v - t
            return rem - maxOf(0, t)
        }
        fun pay(key: CatKey?, amount: Long) {
            var rem = if (key != null) take(key, amount) else amount
            while (rem > 0) {
                val big = pend.entries.filter { it.value > 0 }.maxByOrNull { it.value } ?: break
                rem = take(big.key, rem)
            }
        }
        for (m in chrono) {
            if (m.id == excludeId) continue
            when {
                m.type == MoveType.EXPENSE && m.cardId == cardId -> m.parts.forEach { pend[it.key] = (pend[it.key] ?: 0) + it.amount }
                m.type == MoveType.TRANSFER && m.to?.acc == cardId -> m.parts.forEach { pay(it.key, it.amount) }
                m.type == MoveType.INCOME -> m.parts.filter { it.key.acc == cardId }.forEach { pay(null, it.amount) }
            }
        }
        return pend.filterValues { it > 0 }
    }

    private val reservedAll: Map<CatKey, Long> by lazy { computeReserved(null) }

    /** Categoría → dinero apartado para pagar tarjetas (todas las tarjetas juntas). */
    fun reservedMap(exclude: Move? = null): Map<CatKey, Long> = if (exclude == null) reservedAll else computeReserved(exclude)

    private fun computeReserved(exclude: Move?): Map<CatKey, Long> {
        val out = LinkedHashMap<CatKey, Long>()
        for (a in accounts.filter { it.isCredit }) {
            for ((k, v) in cardPending(a.id, exclude)) out[k] = (out[k] ?: 0) + v
        }
        return out
    }

    /** Cuánto se puede gastar de una categoría: su saldo (sin `move`) menos lo apartado para tarjetas. */
    fun availWithout(move: Move?, key: CatKey): Long = balanceWithout(move, key) - (reservedMap(move)[key] ?: 0)

    /** Deuda de una tarjeta que no viene de compras registradas (saldo inicial): se pinta «Sin categoría». */
    fun cardUntracked(cardId: String): Long {
        val debt = -(account(cardId)?.cats?.firstOrNull()?.balance ?: 0)
        return debt - cardPending(cardId).values.sum()
    }

    fun accountRows(accId: String): List<AccountRow> = sortedMoves().mapNotNull { m ->
        val eff = effects(m).filter { it.key.acc == accId }
        val mine = m.parts.filter { it.key.acc == accId }
        val viaCard = eff.isEmpty() && m.type == MoveType.EXPENSE && m.cardId != null && mine.isNotEmpty()
        if (eff.isEmpty() && !viaCard) return@mapNotNull null
        val catIds = (if (eff.isNotEmpty()) eff.map { it.key.cat } else mine.map { it.key.cat }).distinct()
        AccountRow(
            move = m,
            delta = eff.sumOf { it.delta },
            viaCard = viaCard,
            viaCardAmount = if (viaCard) mine.sumOf { it.amount } else 0,
            cats = catIds.map { category(CatKey(accId, it))?.name ?: "(eliminada)" },
        )
    }
}

/** Aplica (sign = 1) o revierte (sign = -1) efectos sobre las cuentas. Una categoría que ya no existe se ignora. */
fun applyEffects(accounts: List<Account>, effects: List<Effect>, sign: Int): List<Account> {
    if (effects.isEmpty()) return accounts
    val delta = effects.groupBy { it.key }.mapValues { (_, es) -> es.sumOf { it.delta } * sign }
    return accounts.map { a ->
        if (delta.keys.none { it.acc == a.id }) a
        else a.copy(cats = a.cats.map { c -> delta[CatKey(a.id, c.id)]?.let { c.copy(balance = c.balance + it) } ?: c })
    }
}
