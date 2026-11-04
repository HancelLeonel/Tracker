package com.hancel.home.ui.finanzas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.Account
import com.hancel.home.core.CatKey
import com.hancel.home.core.Kind
import com.hancel.home.core.Ledger
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Totals
import com.hancel.home.core.byName
import com.hancel.home.core.dayLabel
import com.hancel.home.data.Ajustes
import com.hancel.home.data.DineroRepo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

/** Signo con el que se pinta un monto: gasto (texto normal, con −), ingreso (verde, con +) o neutro. */
enum class Tono { OUT, IN, NEUTRAL }

data class MoveRow(val move: Move, val title: String, val sub: String, val amount: Long, val tono: Tono)
data class DayGroup(val date: LocalDate, val label: String, val rows: List<MoveRow>)

data class CatRow(val key: CatKey, val name: String, val balance: Long, val reserved: Long)

sealed interface Tarjeta { val acc: Account; val collapsed: Boolean }
data class CuentaNormal(override val acc: Account, val total: Long, val cats: List<CatRow>, override val collapsed: Boolean) : Tarjeta
data class CuentaCredito(
    override val acc: Account,
    val balance: Long,
    val available: Long?,
    val pending: List<Pair<String, Long>>,
    val untracked: Long,
    override val collapsed: Boolean,
) : Tarjeta

data class FinanzasState(val ledger: Ledger, val totals: Totals, val cards: List<Tarjeta>, val days: List<DayGroup>)

fun kindName(kinds: List<Kind>, id: String?) = kinds.firstOrNull { it.id == id }?.name ?: "Sin tipo"

/** Fila de la lista general de movimientos: la fecha va en el encabezado del día. */
fun moveRow(l: Ledger, kinds: List<Kind>, m: Move): MoveRow {
    val bits = listOfNotNull(if (m.type == MoveType.EXPENSE && m.kindId != null) kindName(kinds, m.kindId) else null, l.moveWhere(m))
    val tono = when (m.type) { MoveType.EXPENSE -> Tono.OUT; MoveType.INCOME -> Tono.IN; MoveType.TRANSFER -> Tono.NEUTRAL }
    return MoveRow(m, l.moveTitle(m), bits.joinToString(" · "), m.total, tono)
}

/** Agrupa filas consecutivas del mismo día (ya vienen de más nuevo a más viejo). */
fun <T> groupByDay(items: List<T>, today: LocalDate, dateOf: (T) -> LocalDate): List<Pair<Pair<LocalDate, String>, List<T>>> {
    val out = mutableListOf<Pair<Pair<LocalDate, String>, MutableList<T>>>()
    for (it in items) {
        val d = dateOf(it)
        if (out.isNotEmpty() && out.last().first.first == d) out.last().second += it
        else out += (d to dayLabel(d, today)) to mutableListOf(it)
    }
    return out
}

fun buildFinanzas(l: Ledger, kinds: List<Kind>, collapsed: Set<String>, today: LocalDate): FinanzasState {
    val res = l.reservedMap()
    val cards = l.sortedAccounts.map { a ->
        if (a.isCredit) {
            val bal = a.cats.firstOrNull()?.balance ?: 0
            CuentaCredito(
                acc = a, balance = bal,
                available = if (a.limit > 0) a.limit + bal else null,
                pending = l.cardPending(a.id).entries.map { l.catLabel(it.key) to it.value }.sortedWith(compareBy(byName) { it.first }),
                untracked = l.cardUntracked(a.id),
                collapsed = a.id in collapsed,
            )
        } else {
            CuentaNormal(a, a.cats.sumOf { it.balance }, a.cats.map { c -> CatRow(CatKey(a.id, c.id), c.name, c.balance, res[CatKey(a.id, c.id)] ?: 0) }, a.id in collapsed)
        }
    }
    val days = groupByDay(l.sortedMoves(), today) { it.date }.map { (h, ms) -> DayGroup(h.first, h.second, ms.map { moveRow(l, kinds, it) }) }
    return FinanzasState(l, l.totals(), cards, days)
}

class FinanzasViewModel(dinero: DineroRepo, private val ajustes: Ajustes, hoy: Hoy) : ViewModel() {
    // El cálculo va en Default con withContext y no con un flowOn justo antes de stateIn: stateIn se fusiona con ese
    // flowOn y comparte desde Default en vez de desde viewModelScope; en las pruebas (Robolectric) eso dejaba a
    // veces la pantalla cargando para siempre.
    val state: StateFlow<FinanzasState?> = combine(dinero.ledger, dinero.kinds, ajustes.collapsed, hoy.flow) { l, k, c, d ->
        withContext(Dispatchers.Default) { buildFinanzas(l, k, c, d) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun toggle(accId: String) { viewModelScope.launch { ajustes.toggleCollapsed(accId) } }
}
