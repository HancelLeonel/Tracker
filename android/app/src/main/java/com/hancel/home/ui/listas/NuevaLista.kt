package com.hancel.home.ui.listas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.Template
import com.hancel.home.core.byName
import com.hancel.home.core.dueInfo
import com.hancel.home.core.fmtDate
import com.hancel.home.core.newId
import com.hancel.home.core.newList
import com.hancel.home.data.ListasRepo
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.Opcion
import com.hancel.home.ui.comun.SelectorOpcion
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Clock

/**
 * Nueva lista (newListForm de lists.js): vacía o copiada de una plantilla. El nombre propuesto sigue a la plantilla
 * elegida hasta que la persona lo escribe a mano.
 */
class NuevaListaViewModel(
    private val h: SavedStateHandle,
    private val listas: ListasRepo,
    private val hoy: Hoy,
    private val clock: Clock,
) : ViewModel() {
    /** Plantillas en orden alfabético, con «Ya toca» / «Toca en N días» si tienen periodo y ya se usaron. */
    val opciones: StateFlow<List<Opcion>> = combine(listas.templates, listas.lists, hoy.flow) { ts, ls, today ->
        ts.sortedWith(compareBy(byName) { it.name }).map { t -> Opcion(t.id, t.name + (dueInfo(t, ls, today)?.let { " · ${it.text()}" } ?: "")) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val tpl: StateFlow<String?> = h.getStateFlow("tpl", null)
    val name: StateFlow<String> = h.getStateFlow("name", defaultName(null))
    private val _created = MutableStateFlow<String?>(null)
    val created: StateFlow<String?> = _created
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private fun defaultName(t: Template?) = "${t?.name ?: "Lista"} · ${fmtDate(hoy.flow.value)}"

    fun setTpl(id: String?) {
        h["tpl"] = id
        if (h.get<Boolean>("touched") != true) viewModelScope.launch {
            h["name"] = defaultName(listas.templates.first().firstOrNull { it.id == id })
        }
    }

    fun setName(v: String) {
        h["touched"] = true
        h["name"] = v.take(60)
        _error.value = null
    }

    fun create() {
        if (name.value.isBlank()) { _error.value = "Escribe un nombre."; return }
        viewModelScope.launch {
            val t = listas.templates.first().firstOrNull { it.id == tpl.value }
            val l = newList(t, name.value, hoy.flow.value, clock.millis(), listas.lists.first(), ::newId)
            listas.saveList(l)
            _created.value = l.id
        }
    }
}

@Composable
fun NuevaListaScreen(vm: NuevaListaViewModel, onBack: () -> Unit, onCreated: (String) -> Unit) {
    val opciones by vm.opciones.collectAsStateWithLifecycle()
    val tpl by vm.tpl.collectAsStateWithLifecycle()
    val name by vm.name.collectAsStateWithLifecycle()
    val created by vm.created.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    LaunchedEffect(created) { created?.let(onCreated) }
    Scaffold(topBar = { BarraVolver("Nueva lista", onBack) { TextButton(onClick = vm::create) { Text("Crear") } } }) { p ->
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SelectorOpcion(tpl, listOf(Opcion(null, "Lista vacía")) + opciones, "Basada en", vm::setTpl, Modifier.fillMaxWidth())
            OutlinedTextField(
                name, vm::setName, label = { Text("Nombre") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                isError = error != null, supportingText = error?.let { e -> { Text(e) } },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            )
        }
    }
}
