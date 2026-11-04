package com.hancel.home.core

import java.time.LocalDate

// Pago de tarjeta (payCardForm en money.js): propone pagar cada categoría con lo que se gastó de ella con la tarjeta.

data class PayProposal(val rows: List<Row>, val debt: Long, val untracked: Long)

/**
 * `debt` es lo que se debía antes de este pago; `untracked`, la parte que es saldo inicial sin categoría.
 * Al editar, el pago ya sumó `total` al saldo de la tarjeta, así que se resta para ver la deuda previa
 * (la PWA lo sumaba y mostraba de menos en «Debes»).
 */
fun proposeCardPayment(l: Ledger, card: Account, editing: Move?): PayProposal {
    val debt = -((card.cats.firstOrNull()?.balance ?: 0) - (editing?.total ?: 0))
    val pend = l.cardPending(card.id, editing)
    val rows = editing?.parts?.map { Row(it.key, it.amount) }
        ?: if (pend.isNotEmpty()) {
            pend.entries.sortedWith(compareBy(byName) { l.catLabel(it.key) }).map { Row(it.key, it.value) }
        } else {
            listOf(Row(l.normalKeys().firstOrNull(), maxOf(0, debt)))
        }
    return PayProposal(rows, debt, debt - pend.values.sum())
}

data class PayStatus(val total: Long, val moreThanDebt: Boolean, val negative: Boolean) {
    fun text() = "Total a pagar: ${money(total)}" +
        (if (moreThanDebt) " (más de lo que debes)" else "") +
        (if (negative) " · una categoría quedará en negativo" else "")
}

fun payStatus(rows: List<Row>, debt: Long, l: Ledger, editing: Move?): PayStatus {
    val t = rows.sumOf { it.amount }
    return PayStatus(t, t > debt, rows.any { it.key != null && it.amount > l.balanceWithout(editing, it.key) })
}

/** El pago es una transferencia hacia la deuda de la tarjeta. Devuelve null si no hay montos («Indica cuánto vas a pagar.»). */
fun buildCardPayment(rows: List<Row>, card: Account, id: String, t: Long, date: LocalDate, note: String): Move? {
    val parts = rows.filter { it.amount > 0 && it.key != null }.map { Part(it.key!!, it.amount) }
    if (parts.isEmpty()) return null
    return Move(
        id = id, t = t, type = MoveType.TRANSFER, date = date, title = "", note = note.trim().ifEmpty { "Pago ${card.name}" },
        kindId = null, cardId = null, to = CatKey(card.id, card.cats.first().id), total = parts.sumOf { it.amount }, parts = parts,
    )
}
