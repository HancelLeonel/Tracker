package com.hancel.home.ui.finanzas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.hancel.home.core.Account
import com.hancel.home.core.AccountType
import com.hancel.home.core.Category
import com.hancel.home.core.newId
import com.hancel.home.data.DineroRepo
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.CampoMonto
import com.hancel.home.ui.comun.Confirmar
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Formulario de cuenta. El estado vive en el SavedStateHandle (sobrevive a que Android cierre la app). Al editar no
 * se cambia el tipo; en una tarjeta, «Deuda actual» escribe el saldo de su única categoría («Deuda») en negativo.
 */
class CuentaFormViewModel(private val h: SavedStateHandle, private val dinero: DineroRepo, val accId: String?) : ViewModel() {
    val name: StateFlow<String> = h.getStateFlow("name", "")
    val credit: StateFlow<Boolean> = h.getStateFlow("credit", false)
    val debt: StateFlow<Long?> = h.getStateFlow("debt", null)
    val limit: StateFlow<Long?> = h.getStateFlow("limit", null)
    val nameError: StateFlow<String?> = h.getStateFlow("nameError", null)
    val amountError: StateFlow<String?> = h.getStateFlow("amountError", null)
    val loaded: StateFlow<Boolean> = h.getStateFlow("loaded", accId == null)
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done

    init {
        if (!loaded.value) viewModelScope.launch {
            val a = dinero.account(accId!!)
            if (a == null) { _done.value = true; return@launch }
            h["name"] = a.name
            h["credit"] = a.isCredit
            if (a.isCredit) {
                h["debt"] = -(a.cats.firstOrNull()?.balance ?: 0)
                h["limit"] = a.limit.takeIf { it > 0 }
            }
            h["loaded"] = true
        }
    }

    fun setName(v: String) { h["name"] = v.take(40); h["nameError"] = null }
    fun setCredit(v: Boolean) { if (accId == null) h["credit"] = v }
    fun setDebt(v: Long?) { h["debt"] = v; h["amountError"] = null }
    fun setLimit(v: Long?) { h["limit"] = v; h["amountError"] = null }

    fun save() {
        val n = name.value.trim()
        if (n.isEmpty()) { h["nameError"] = "Escribe un nombre."; return }
        val isCredit = credit.value
        val d = debt.value ?: 0
        val lim = limit.value ?: 0
        if (isCredit && (d < 0 || lim < 0)) { h["amountError"] = "La deuda y el límite no pueden ser negativos."; return }
        viewModelScope.launch {
            val old = accId?.let { dinero.account(it) }
            if (accId != null && old == null) { _done.value = true; return@launch } // la borraron en otra pantalla
            val base = old ?: Account(newId(), n, if (isCredit) AccountType.CREDIT else AccountType.NORMAL, 0, emptyList())
            val acc = if (base.isCredit) {
                val cats = base.cats.ifEmpty { listOf(Category(newId(), "Deuda", 0)) }
                base.copy(name = n, limit = lim, cats = listOf(cats[0].copy(balance = -d)) + cats.drop(1))
            } else base.copy(name = n)
            dinero.saveAccount(acc)
            _done.value = true
        }
    }

    fun delete() {
        val id = accId ?: return
        viewModelScope.launch { dinero.deleteAccount(id); _done.value = true }
    }
}

@Composable
fun CuentaFormScreen(vm: CuentaFormViewModel, onDone: () -> Unit) {
    val name by vm.name.collectAsStateWithLifecycle()
    val credit by vm.credit.collectAsStateWithLifecycle()
    val debt by vm.debt.collectAsStateWithLifecycle()
    val limit by vm.limit.collectAsStateWithLifecycle()
    val nameError by vm.nameError.collectAsStateWithLifecycle()
    val amountError by vm.amountError.collectAsStateWithLifecycle()
    val loaded by vm.loaded.collectAsStateWithLifecycle()
    val done by vm.done.collectAsStateWithLifecycle()
    var confirm by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(done) { if (done) onDone() }
    val editing = vm.accId != null

    Scaffold(
        topBar = {
            BarraVolver(if (editing) "Editar cuenta" else "Nueva cuenta", onDone) {
                TextButton(onClick = vm::save, enabled = loaded) { Text("Guardar") }
            }
        },
    ) { p ->
        if (!loaded) return@Scaffold
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                name, vm::setName, label = { Text("Nombre") }, placeholder = { Text("Ej. Banco, Efectivo, Visa…") },
                singleLine = true, isError = nameError != null, supportingText = nameError?.let { { Text(it) } },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            Column(Modifier.selectableGroup()) {
                Tipo("Cuenta normal", "Dinero que tengo. Después le agregas categorías con lo que hay en cada una.", !credit, !editing) { vm.setCredit(false) }
                Tipo("Tarjeta de crédito", "Dinero que debo. Los gastos con tarjeta suman deuda; al pagarla con «Pagar tarjeta» no se vuelven a contar como gasto.", credit, !editing) { vm.setCredit(true) }
            }
            if (credit) {
                CampoMonto(debt, vm::setDebt, "Deuda actual", Modifier.fillMaxWidth(), error = amountError)
                CampoMonto(limit, vm::setLimit, "Límite de crédito (opcional)", Modifier.fillMaxWidth(), imeAction = ImeAction.Done)
            }
            if (editing) OutlinedButton(onClick = { confirm = true }, modifier = Modifier.padding(top = 12.dp)) { Text("Eliminar") }
        }
    }
    if (confirm) Confirmar(
        "¿Eliminar la cuenta «${name.trim()}»?",
        "Se borran la cuenta y sus categorías. Sus movimientos se conservan y donde aparezcan dirán «(eliminada)».",
        "Eliminar cuenta", onConfirm = { confirm = false; vm.delete() }, onDismiss = { confirm = false },
    )
}

@Composable
private fun Tipo(title: String, sub: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected, enabled = enabled, role = Role.RadioButton, onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected, onClick = null, enabled = enabled)
        Column(Modifier.padding(start = 8.dp, top = 2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
