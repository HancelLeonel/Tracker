package com.hancel.home.ui.finanzas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.Account
import com.hancel.home.core.CatKey
import com.hancel.home.core.Ledger
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Row
import com.hancel.home.core.buildCardPayment
import com.hancel.home.core.money
import com.hancel.home.core.newId
import com.hancel.home.core.payStatus
import com.hancel.home.core.proposeCardPayment
import com.hancel.home.data.DineroRepo
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.CampoFecha
import com.hancel.home.ui.comun.CampoMonto
import com.hancel.home.ui.comun.Confirmar
import com.hancel.home.ui.comun.SelectorCategoria
import com.hancel.home.ui.tema.colorNegativo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.LocalDate

/** Lo que el encabezado necesita: la deuda antes de este pago y cuánto de ella no viene de gastos con categoría. */
data class Deuda(val debt: Long, val untracked: Long, val proposed: Boolean)

/**
 * Pago de tarjeta (payCardForm de money.js): una transferencia desde categorías normales hacia la deuda de la tarjeta.
 * Propone pagar cada categoría con lo que se gastó de ella con la tarjeta; al guardar baja lo apartado.
 */
class PagoTarjetaViewModel(
    private val h: SavedStateHandle,
    private val dinero: DineroRepo,
    private val hoy: Hoy,
    private val clock: Clock,
    val cardId: String,
    val moveId: String?,
) : ViewModel() {
    val ledger: StateFlow<Ledger?> = dinero.ledger.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val card: StateFlow<Account?> = dinero.ledger.map { l -> l.account(cardId)?.takeIf { it.isCredit && it.cats.isNotEmpty() } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val note: StateFlow<String> = h.getStateFlow("note", "")
    val date: StateFlow<String> = h.getStateFlow("date", "")
    private val _rows = MutableStateFlow<List<Row>?>(null)
    val rows: StateFlow<List<Row>?> = _rows
    private val _deuda = MutableStateFlow<Deuda?>(null)
    val deuda: StateFlow<Deuda?> = _deuda
    private val _editing = MutableStateFlow<Move?>(null)
    val editing: StateFlow<Move?> = _editing
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done

    init {
        viewModelScope.launch {
            val l = ledger.filterNotNull().first()
            val c = l.account(cardId)?.takeIf { it.isCredit && it.cats.isNotEmpty() }
            val e = moveId?.let { id -> l.moves.firstOrNull { it.id == id && it.type == MoveType.TRANSFER && it.to?.acc == cardId } }
            if (c == null || (moveId != null && e == null)) { _done.value = true; return@launch }
            _editing.value = e
            // La deuda se calcula una vez: después de guardar el ledger cambia y no debe moverse el encabezado.
            val prop = proposeCardPayment(l, c, e)
            _deuda.value = Deuda(prop.debt, prop.untracked, l.cardPending(c.id, e).isNotEmpty())
            if (h.get<Boolean>("loaded") == true) { _rows.value = readRows(); return@launch }
            h["note"] = e?.note ?: ""
            h["date"] = (e?.date ?: hoy.flow.value).toString()
            writeRows(prop.rows)
            h["loaded"] = true
        }
    }

    private fun writeRows(rs: List<Row>) {
        _rows.value = rs
        h["rows"] = ArrayList(rs.map { "${it.key ?: ""}$SEP${it.amount}" })
    }

    private fun readRows(): List<Row> = h.get<ArrayList<String>>("rows").orEmpty().map { s ->
        val (k, a) = s.split(SEP)
        Row(CatKey.parse(k), a.toLong())
    }

    private fun change(f: (List<Row>) -> List<Row>) { _rows.value?.let { writeRows(f(it)) } }

    fun setKey(i: Int, k: CatKey) = change { rs -> rs.mapIndexed { j, r -> if (j == i) r.copy(key = k) else r } }
    fun setAmount(i: Int, v: Long?) = change { rs -> rs.mapIndexed { j, r -> if (j == i) r.copy(amount = v ?: 0) else r } }
    fun removeRow(i: Int) = change { rs -> if (rs.size > 1) rs.filterIndexed { j, _ -> j != i } else rs }

    /** «Otra categoría»: la primera categoría normal que aún no está en el pago, con Q0. */
    fun addRow() {
        val keys = ledger.value?.normalKeys() ?: return
        change { rs ->
            val used = rs.mapNotNull { it.key }.toSet()
            rs + Row(keys.firstOrNull { it !in used } ?: keys.firstOrNull(), 0)
        }
    }

    fun setNote(v: String) { h["note"] = v.take(80) }
    fun setDate(v: LocalDate) { h["date"] = v.toString() }
    fun messageShown() { _message.value = null }

    fun save() {
        val c = card.value ?: return
        val rs = _rows.value ?: return
        val e = _editing.value
        val m = buildCardPayment(rs, c, e?.id ?: newId(), e?.t ?: clock.millis(), LocalDate.parse(date.value), note.value)
            ?: run { _message.value = "Indica cuánto vas a pagar."; return }
        viewModelScope.launch { dinero.saveMove(m); _done.value = true }
    }

    fun delete() {
        val id = _editing.value?.id ?: return
        viewModelScope.launch { dinero.deleteMove(id); _done.value = true }
    }

    private companion object { const val SEP = "\u001F" }
}

@Composable
fun PagoTarjetaFormScreen(vm: PagoTarjetaViewModel, onDone: () -> Unit) {
    val l by vm.ledger.collectAsStateWithLifecycle()
    val c by vm.card.collectAsStateWithLifecycle()
    val rs by vm.rows.collectAsStateWithLifecycle()
    val dd by vm.deuda.collectAsStateWithLifecycle()
    val editing by vm.editing.collectAsStateWithLifecycle()
    val note by vm.note.collectAsStateWithLifecycle()
    val date by vm.date.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val done by vm.done.collectAsStateWithLifecycle()
    var deleting by rememberSaveable { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(done) { if (done) onDone() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.messageShown() } }
    val ledger = l
    val card = c
    val rows = rs
    val deuda = dd
    val ready = ledger != null && card != null && rows != null && deuda != null && date.isNotEmpty()
    val name = card?.name.orEmpty()

    Scaffold(
        topBar = {
            BarraVolver(if (vm.moveId != null) "Editar pago de $name" else "Pagar $name", onDone) {
                if (vm.moveId != null) IconButton(onClick = { deleting = true }) { Icon(Icons.Outlined.Delete, contentDescription = "Eliminar pago") }
                TextButton(onClick = vm::save, enabled = ready) { Text("Registrar pago") }
            }
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { p ->
        if (!ready) return@Scaffold
        val keys = ledger!!.normalKeys()
        if (keys.isEmpty()) {
            Text("Primero crea una cuenta con una categoría.", Modifier.padding(p).padding(16.dp))
            return@Scaffold
        }
        val st = payStatus(rows!!, deuda!!.debt, ledger, editing)
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                buildAnnotatedString {
                    append("Debes ")
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(money(maxOf(0, deuda.debt))) }
                    if (deuda.proposed) append(" · propuesto según los gastos hechos con la tarjeta")
                },
                style = MaterialTheme.typography.bodyLarge,
            )
            if (deuda.proposed && deuda.untracked > 0) Text(
                "${money(deuda.untracked)} son saldo inicial sin categoría.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            rows.forEachIndexed { i, r ->
                Row(verticalAlignment = Alignment.Top) {
                    SelectorCategoria(
                        r.key, keys, ledger, { ledger.balanceWithout(editing, it) }, "Elegir categoría…",
                        Modifier.weight(1f), onPick = { vm.setKey(i, it) },
                    )
                    Spacer(Modifier.width(8.dp))
                    CampoMonto(r.amount.takeIf { it > 0 }, { vm.setAmount(i, it) }, "Monto", Modifier.width(128.dp))
                    if (rows.size > 1) IconButton(onClick = { vm.removeRow(i) }, modifier = Modifier.padding(top = 4.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = "Quitar esta categoría")
                    }
                }
            }
            Text(
                st.text(), style = MaterialTheme.typography.bodyMedium,
                color = if (st.negative) colorNegativo() else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = vm::addRow) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Otra categoría") }
            OutlinedTextField(
                note, vm::setNote, label = { Text("Descripción (opcional)") }, placeholder = { Text("Pago $name") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            )
            CampoFecha(LocalDate.parse(date), vm::setDate, Modifier.fillMaxWidth())
        }
    }

    if (deleting) Confirmar(
        "¿Eliminar este pago?", "El dinero vuelve a las categorías y la deuda de la tarjeta queda como antes.", "Eliminar",
        onConfirm = { deleting = false; vm.delete() }, onDismiss = { deleting = false },
    )
}
