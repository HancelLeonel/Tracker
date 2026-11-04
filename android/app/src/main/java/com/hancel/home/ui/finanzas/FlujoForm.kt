package com.hancel.home.ui.finanzas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.CatKey
import com.hancel.home.core.Ledger
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
import com.hancel.home.core.newId
import com.hancel.home.data.Ajustes
import com.hancel.home.data.DineroRepo
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.CampoFecha
import com.hancel.home.ui.comun.CampoMonto
import com.hancel.home.ui.comun.Confirmar
import com.hancel.home.ui.comun.SelectorCategoria
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.LocalDate

/**
 * Ingreso (`INCOME`: el dinero entra a una categoría) o mover dinero (`TRANSFER`: de una categoría a otra), como
 * flowForm de money.js. Las tarjetas nunca se ofrecen: su pago tiene formulario propio.
 */
class FlujoViewModel(
    private val h: SavedStateHandle,
    private val dinero: DineroRepo,
    private val ajustes: Ajustes,
    private val hoy: Hoy,
    private val clock: Clock,
    val type: MoveType,
    val moveId: String?,
) : ViewModel() {
    val ledger: StateFlow<Ledger?> = dinero.ledger.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val from: StateFlow<String?> = h.getStateFlow("from", null)
    val to: StateFlow<String?> = h.getStateFlow("to", null)
    val amount: StateFlow<Long> = h.getStateFlow("amount", 0L)
    val note: StateFlow<String> = h.getStateFlow("note", "")
    val date: StateFlow<String> = h.getStateFlow("date", "")

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done
    private val _editing = MutableStateFlow<Move?>(null)
    val editing: StateFlow<Move?> = _editing

    val isTransfer get() = type == MoveType.TRANSFER

    init {
        viewModelScope.launch {
            val l = ledger.filterNotNull().first()
            val e = moveId?.let { id -> l.moves.firstOrNull { it.id == id && it.type == type } }
            if (moveId != null && e == null) { _done.value = true; return@launch }
            _editing.value = e
            if (h.get<Boolean>("loaded") == true) return@launch
            val keys = l.normalKeys()
            val s = ajustes.portable.first()
            fun pick(k: CatKey?, fallback: CatKey?) = if (k != null && k in keys) k else fallback
            val first = keys.firstOrNull()
            if (isTransfer) {
                val defFrom = pick(s.lastFrom, first)
                h["from"] = (e?.parts?.firstOrNull()?.key ?: defFrom)?.toString()
                h["to"] = (e?.to ?: keys.firstOrNull { it != defFrom } ?: first)?.toString()
            } else {
                h["to"] = (e?.parts?.firstOrNull()?.key ?: pick(s.lastIncomeTo, first))?.toString()
            }
            h["amount"] = e?.total ?: 0L
            h["note"] = e?.note ?: ""
            h["date"] = (e?.date ?: hoy.flow.value).toString()
            h["loaded"] = true
        }
    }

    fun setFrom(k: CatKey) { h["from"] = k.toString() }
    fun setTo(k: CatKey) { h["to"] = k.toString() }
    fun setAmount(v: Long?) { h["amount"] = v ?: 0L }
    fun setNote(v: String) { h["note"] = v.take(80) }
    fun setDate(v: LocalDate) { h["date"] = v.toString() }
    fun messageShown() { _message.value = null }

    fun save() {
        val to = CatKey.parse(to.value)
        val from = CatKey.parse(from.value)
        val amt = amount.value
        when {
            to == null || (isTransfer && from == null) -> { _message.value = "Elige la categoría."; return }
            amt <= 0 -> { _message.value = "Escribe el monto."; return }
            isTransfer && from == to -> { _message.value = "Elige categorías distintas."; return }
        }
        val e = _editing.value
        val m = Move(
            id = e?.id ?: newId(), t = e?.t ?: clock.millis(), type = type, date = LocalDate.parse(date.value),
            title = "", note = note.value.trim(), kindId = null, cardId = null,
            to = if (isTransfer) to else null, total = amt,
            parts = listOf(Part(if (isTransfer) from!! else to!!, amt)),
        )
        viewModelScope.launch {
            dinero.saveMove(m)
            ajustes.update { if (isTransfer) it.copy(lastFrom = from) else it.copy(lastIncomeTo = to) }
            _done.value = true
        }
    }

    fun delete() {
        val id = _editing.value?.id ?: return
        viewModelScope.launch { dinero.deleteMove(id); _done.value = true }
    }
}

@Composable
fun FlujoFormScreen(vm: FlujoViewModel, onDone: () -> Unit) {
    val l by vm.ledger.collectAsStateWithLifecycle()
    val from by vm.from.collectAsStateWithLifecycle()
    val to by vm.to.collectAsStateWithLifecycle()
    val amount by vm.amount.collectAsStateWithLifecycle()
    val note by vm.note.collectAsStateWithLifecycle()
    val date by vm.date.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val done by vm.done.collectAsStateWithLifecycle()
    val editing by vm.editing.collectAsStateWithLifecycle()
    var deleting by rememberSaveable { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(done) { if (done) onDone() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.messageShown() } }
    val name = if (vm.isTransfer) "Mover dinero" else "Ingreso"
    val ledger = l

    Scaffold(
        topBar = {
            BarraVolver(if (vm.moveId != null) "Editar: ${name.lowercase()}" else name, onDone) {
                if (vm.moveId != null) IconButton(onClick = { deleting = true }) { Icon(Icons.Outlined.Delete, contentDescription = "Eliminar movimiento") }
                TextButton(onClick = vm::save, enabled = ledger != null && date.isNotEmpty()) { Text("Guardar") }
            }
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { p ->
        if (ledger == null || date.isEmpty()) return@Scaffold
        val keys = ledger.normalKeys()
        if (keys.isEmpty()) {
            Text("Primero crea una cuenta con una categoría.", Modifier.padding(p).padding(16.dp))
            return@Scaffold
        }
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Desde muestra lo libre (saldo − apartado para tarjetas); Hacia y Entra a, el saldo.
            if (vm.isTransfer) SelectorCategoria(
                CatKey.parse(from), keys, ledger, { ledger.availWithout(editing, it) }, "Elegir categoría…",
                Modifier.fillMaxWidth(), label = "Desde", onPick = vm::setFrom,
            )
            SelectorCategoria(
                CatKey.parse(to), keys, ledger, { ledger.balanceWithout(editing, it) }, "Elegir categoría…",
                Modifier.fillMaxWidth(), label = if (vm.isTransfer) "Hacia" else "Entra a", onPick = vm::setTo,
            )
            CampoMonto(amount.takeIf { it > 0 }, vm::setAmount, "Monto", Modifier.fillMaxWidth(), imeAction = ImeAction.Next)
            OutlinedTextField(
                note, vm::setNote, label = { Text("Descripción (opcional)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            )
            CampoFecha(LocalDate.parse(date), vm::setDate, Modifier.fillMaxWidth())
        }
    }

    if (deleting) Confirmar(
        "¿Eliminar este movimiento?", "Los saldos vuelven a como estaban antes.", "Eliminar",
        onConfirm = { deleting = false; vm.delete() }, onDismiss = { deleting = false },
    )
}
