package com.hancel.home.ui.finanzas

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.Account
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.money
import com.hancel.home.data.DineroRepo
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.tema.colorNegativo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.stateIn

data class CuentaState(val acc: Account?, val total: Long, val days: List<DayGroup>)

/** Detalle de una cuenta: cuánto cambió su saldo en cada movimiento; las compras con tarjeta aparecen «con tarjeta». */
class CuentaViewModel(accId: String, dinero: DineroRepo, hoy: Hoy) : ViewModel() {
    // withContext y no flowOn antes de stateIn: ver FinanzasViewModel.
    val state: StateFlow<CuentaState?> = combine(dinero.ledger, dinero.kinds, hoy.flow) { l, kinds, today ->
        withContext(Dispatchers.Default) { build(accId, l, kinds, today) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

private fun build(accId: String, l: com.hancel.home.core.Ledger, kinds: List<com.hancel.home.core.Kind>, today: java.time.LocalDate): CuentaState {
    val acc = l.account(accId)
    val rows = l.accountRows(accId).map { r ->
        val bits = listOfNotNull(
            if (r.move.type == MoveType.EXPENSE && r.move.kindId != null) kindName(kinds, r.move.kindId) else null,
            r.cats.joinToString(", "),
            if (r.viaCard) "con tarjeta" else null,
        )
        val (amount, tono) = when {
            r.viaCard -> r.viaCardAmount to Tono.NEUTRAL
            r.delta < 0 -> -r.delta to Tono.OUT
            else -> r.delta to Tono.IN
        }
        MoveRow(r.move, l.moveTitle(r.move), bits.joinToString(" · "), amount, tono)
    }
    val days = groupByDay(rows, today) { it.move.date }.map { (h, rs) -> DayGroup(h.first, h.second, rs) }
    return CuentaState(acc, acc?.cats?.sumOf { it.balance } ?: 0, days)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CuentaScreen(vm: CuentaViewModel, onBack: () -> Unit, onMove: (Move) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val s = state
    Scaffold(Modifier.testTag("pantalla-cuenta"), topBar = { BarraVolver(s?.acc?.name ?: "", onBack) }) { p ->
        if (s == null) return@Scaffold
        LazyColumn(Modifier.fillMaxSize().padding(p).testTag("lista-cuenta"), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Column(Modifier.padding(16.dp)) {
                    Text(if (s.acc?.isCredit == true) "Saldo" else "Total", style = MaterialTheme.typography.labelLarge)
                    Text(money(s.total), style = MaterialTheme.typography.headlineMedium.merge(Tabular), color = if (s.total < 0) colorNegativo() else MaterialTheme.colorScheme.onSurface)
                }
            }
            if (s.days.isEmpty()) item { Text("Esta cuenta aún no tiene movimientos.", Modifier.padding(16.dp)) }
            for (d in s.days) {
                stickyHeader(key = "dia-${d.date}") { EncabezadoDia(d.label) }
                items(d.rows, key = { it.move.id }) { r -> FilaMovimiento(r.title, r.sub, r.amount, r.tono) { onMove(r.move) } }
            }
        }
    }
}
