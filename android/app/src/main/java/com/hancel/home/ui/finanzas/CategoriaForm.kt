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
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
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
 * Formulario de categoría: para qué es el dinero y cuánto hay de verdad. Editar el saldo lo corrige directamente
 * (no es un movimiento): es la única forma de cambiar un saldo además de los movimientos.
 */
class CategoriaFormViewModel(
    private val h: SavedStateHandle,
    private val dinero: DineroRepo,
    val accId: String,
    val catId: String?,
) : ViewModel() {
    val accName: StateFlow<String> = h.getStateFlow("accName", "")
    val name: StateFlow<String> = h.getStateFlow("name", "")
    val balance: StateFlow<Long?> = h.getStateFlow("balance", null)
    val nameError: StateFlow<String?> = h.getStateFlow("nameError", null)
    val balanceError: StateFlow<String?> = h.getStateFlow("balanceError", null)
    val loaded: StateFlow<Boolean> = h.getStateFlow("loaded", false)
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done

    init {
        if (!loaded.value) viewModelScope.launch {
            val a = dinero.account(accId)
            val c = catId?.let { id -> a?.cats?.firstOrNull { it.id == id } }
            if (a == null || (catId != null && c == null)) { _done.value = true; return@launch }
            h["accName"] = a.name
            if (c != null) { h["name"] = c.name; h["balance"] = c.balance }
            h["loaded"] = true
        }
    }

    fun setName(v: String) { h["name"] = v.take(40); h["nameError"] = null }
    fun setBalance(v: Long?) { h["balance"] = v; h["balanceError"] = null }

    fun save() {
        val n = name.value.trim()
        val b = balance.value
        if (n.isEmpty()) h["nameError"] = "Escribe para qué es el dinero."
        if (b == null) h["balanceError"] = "Escribe cuánto hay (puede ser 0)."
        if (n.isEmpty() || b == null) return
        viewModelScope.launch {
            val a = dinero.account(accId) ?: run { _done.value = true; return@launch }
            val cats = if (catId == null) a.cats + Category(newId(), n, b)
            else a.cats.map { if (it.id == catId) it.copy(name = n, balance = b) else it }
            dinero.saveAccount(a.copy(cats = cats))
            _done.value = true
        }
    }

    fun delete() {
        val id = catId ?: return
        viewModelScope.launch {
            dinero.account(accId)?.let { a -> dinero.saveAccount(a.copy(cats = a.cats.filter { it.id != id })) }
            _done.value = true
        }
    }
}

@Composable
fun CategoriaFormScreen(vm: CategoriaFormViewModel, onDone: () -> Unit) {
    val accName by vm.accName.collectAsStateWithLifecycle()
    val name by vm.name.collectAsStateWithLifecycle()
    val balance by vm.balance.collectAsStateWithLifecycle()
    val nameError by vm.nameError.collectAsStateWithLifecycle()
    val balanceError by vm.balanceError.collectAsStateWithLifecycle()
    val loaded by vm.loaded.collectAsStateWithLifecycle()
    val done by vm.done.collectAsStateWithLifecycle()
    var confirm by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(done) { if (done) onDone() }
    val editing = vm.catId != null

    Scaffold(
        topBar = {
            BarraVolver(if (editing) "Editar categoría" else if (loaded) "Nueva categoría en $accName" else "", onDone) {
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
                name, vm::setName, label = { Text("Para qué es el dinero") }, placeholder = { Text("Ej. Comida, Transporte…") },
                singleLine = true, isError = nameError != null, supportingText = nameError?.let { { Text(it) } },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            CampoMonto(balance, vm::setBalance, "Dinero real que hay ahora", Modifier.fillMaxWidth(), error = balanceError, imeAction = ImeAction.Done)
            if (editing) {
                Text(
                    "Esto corrige el saldo directamente. Para sumar dinero usa «Ingreso» y para repartirlo «Mover».",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedButton(onClick = { confirm = true }, modifier = Modifier.padding(top = 12.dp)) { Text("Eliminar") }
            }
        }
    }
    if (confirm) Confirmar(
        "¿Eliminar la categoría «${name.trim()}»?",
        "Sus movimientos se conservan y donde aparezcan dirán «(eliminada)».",
        "Eliminar categoría", onConfirm = { confirm = false; vm.delete() }, onDismiss = { confirm = false },
    )
}
