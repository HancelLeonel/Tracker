package com.hancel.home.core

import java.time.LocalDate

// Borrador del formulario de gasto (traducción de expenseForm en money.js). No se asume de dónde sale el dinero:
// al crear hay una sola fila vacía; si la categoría no alcanza se ofrece agregar otra con dinero libre. Con «Permitir
// saldo negativo» todo sale de la categoría elegida y se ofrecen todas. Al editar no se reparte de nuevo con tope.

/** Una fila del reparto: de qué categoría sale cuánto. `key` es null mientras no se elige. */
data class Row(val key: CatKey?, val amount: Long)

data class ExpenseDraft(
    val editing: Move?,
    val total: Long,
    val allowNeg: Boolean,
    /** Mientras sea verdadero, cambiar total, categoría o filas reparte de nuevo. Escribir un monto a mano lo apaga. */
    val auto: Boolean,
    val rows: List<Row>,
) {
    companion object {
        fun start(l: Ledger, editing: Move?, preset: CatKey?): ExpenseDraft {
            val keys = l.normalKeys()
            val rows = editing?.parts?.map { Row(it.key.takeIf { k -> k in keys }, it.amount) }
                ?: listOf(Row(preset?.takeIf { it in keys }, 0))
            val allowNeg = rows.any { it.key != null && it.amount > l.availWithout(editing, it.key) }
            return ExpenseDraft(editing, editing?.total ?: 0, allowNeg, editing == null || editing.parts.size == 1, rows)
        }
    }
}

sealed interface DraftStatus {
    data object Ok : DraftStatus
    data object Unpicked : DraftStatus
    data class Missing(val cents: Long, val canAdd: Boolean) : DraftStatus
    data class Over(val cents: Long) : DraftStatus
    data class Negative(val allowed: Boolean) : DraftStatus
}

/** Texto de la línea de estado, igual que en la PWA. */
fun DraftStatus.text(): String = when (this) {
    DraftStatus.Ok -> ""
    DraftStatus.Unpicked -> "Elige de qué categoría sale el dinero."
    is DraftStatus.Missing -> "Falta asignar ${money(cents)}." + if (canAdd) " Agrega otra categoría." else " No hay más categorías con dinero."
    is DraftStatus.Over -> "Te pasas por ${money(cents)}."
    is DraftStatus.Negative -> if (allowed) "Alguna categoría quedará en negativo hasta que la regularices." else "Alguna categoría quedará en negativo."
}

enum class ConfirmKind { NEGATIVE, LIMIT }

sealed interface SaveCheck {
    data class Error(val msg: String) : SaveCheck
    data class Confirm(val msg: String, val kind: ConfirmKind) : SaveCheck
    data object Ok : SaveCheck
}

private fun ExpenseDraft.cap() = editing == null && !allowNeg
private fun ExpenseDraft.avail(l: Ledger, k: CatKey) = l.availWithout(editing, k)

/** Reparte el total entre las filas sin superar lo libre de cada categoría (solo al crear y sin saldo negativo). */
private fun ExpenseDraft.autoFill(l: Ledger): ExpenseDraft {
    var rem = total
    val filled = rows.map { r ->
        val amount = if (cap() && r.key != null) minOf(rem, maxOf(0, avail(l, r.key))) else rem
        rem -= amount
        r.copy(amount = amount)
    }
    return copy(rows = filled)
}

private fun ExpenseDraft.refill(l: Ledger) = if (auto) autoFill(l) else this

fun ExpenseDraft.withTotal(total: Long, l: Ledger): ExpenseDraft = copy(total = total).refill(l)
fun ExpenseDraft.withAllowNeg(on: Boolean, l: Ledger): ExpenseDraft = copy(allowNeg = on).refill(l)
fun ExpenseDraft.withKey(i: Int, key: CatKey, l: Ledger): ExpenseDraft =
    copy(rows = rows.mapIndexed { j, r -> if (j == i) r.copy(key = key) else r }).refill(l)
fun ExpenseDraft.withAmount(i: Int, cents: Long): ExpenseDraft =
    copy(auto = false, rows = rows.mapIndexed { j, r -> if (j == i) r.copy(amount = cents) else r })
fun ExpenseDraft.removeRow(i: Int, l: Ledger): ExpenseDraft = copy(rows = rows.filterIndexed { j, _ -> j != i }).refill(l)
fun ExpenseDraft.addRow(): ExpenseDraft = copy(rows = rows + Row(null, maxOf(0, total - rows.sumOf { it.amount })))

/** Categorías que se ofrecen en la fila i: las que tienen dinero libre (o todas, si ninguna tiene), sin repetir. */
fun ExpenseDraft.choices(i: Int, l: Ledger): List<CatKey> {
    val used = rows.filterIndexed { j, _ -> j != i }.mapNotNull { it.key }.toSet()
    val keys = l.normalKeys()
    if (allowNeg) return keys.filter { it !in used }
    val free = keys.filter { it !in used && (it == rows[i].key || avail(l, it) > 0) }
    return free.ifEmpty { keys.filter { it !in used } }
}

fun ExpenseDraft.canAdd(l: Ledger): Boolean = l.normalKeys().any { k -> rows.none { it.key == k } && avail(l, k) > 0 }

fun ExpenseDraft.status(l: Ledger): DraftStatus {
    val diff = total - rows.sumOf { it.amount }
    val unpicked = rows.any { it.key == null }
    val neg = rows.any { it.key != null && it.amount > avail(l, it.key) }
    return when {
        total > 0 && unpicked -> DraftStatus.Unpicked
        diff > 0 -> DraftStatus.Missing(diff, canAdd(l))
        diff < 0 -> DraftStatus.Over(-diff)
        neg -> DraftStatus.Negative(allowNeg)
        else -> DraftStatus.Ok
    }
}

/** «Agregar otra categoría» solo aparece cuando falta asignar, hay otra con dinero y no hay filas sin elegir. */
fun ExpenseDraft.showAdd(l: Ledger): Boolean =
    total - rows.sumOf { it.amount } > 0 && canAdd(l) && rows.none { it.key == null }

/** Validación al guardar. `confirmed` son las confirmaciones que la persona ya aceptó. */
fun ExpenseDraft.checkSave(title: String, cardId: String?, l: Ledger, confirmed: Set<ConfirmKind> = emptySet()): SaveCheck {
    if (title.isBlank()) return SaveCheck.Error("El gasto necesita un título.")
    if (total <= 0) return SaveCheck.Error("Escribe el monto del gasto.")
    val used = rows.filter { it.amount > 0 }
    if (used.isEmpty() || used.any { it.key == null }) return SaveCheck.Error("Elige de qué categoría sale el dinero.")
    if (used.sumOf { it.amount } != total) return SaveCheck.Error("Los montos de las categorías deben sumar el total del gasto.")
    if (!allowNeg && ConfirmKind.NEGATIVE !in confirmed && used.any { avail(l, it.key!!) < it.amount }) {
        return SaveCheck.Confirm("Una categoría quedará en negativo. ¿Continuar?", ConfirmKind.NEGATIVE)
    }
    val card = cardId?.let(l::account)
    if (card != null && card.limit > 0 && ConfirmKind.LIMIT !in confirmed) {
        val room = card.limit + (card.cats.firstOrNull()?.balance ?: 0) + (if (editing?.cardId == cardId) editing.total else 0)
        if (total > room) {
            return SaveCheck.Confirm("Esta compra supera el crédito disponible de ${card.name} (${money(maxOf(0, room))}). ¿Continuar?", ConfirmKind.LIMIT)
        }
    }
    return SaveCheck.Ok
}

fun ExpenseDraft.toMove(id: String, t: Long, date: LocalDate, title: String, note: String, kindId: String?, cardId: String?): Move =
    Move(
        id = id, t = t, type = MoveType.EXPENSE, date = date, title = title.trim(), note = note.trim(),
        kindId = kindId, cardId = cardId, to = null, total = total,
        parts = rows.filter { it.amount > 0 && it.key != null }.map { Part(it.key!!, it.amount) },
    )
