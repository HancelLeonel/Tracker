package com.hancel.home.ui.ajustes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.hancel.home.core.Kind
import com.hancel.home.core.byName
import com.hancel.home.core.newId
import com.hancel.home.data.DineroRepo
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.Confirmar
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Tipos de gasto («en qué se usó»), en orden alfabético. Borrar uno deja sus gastos «Sin tipo». */
class TiposViewModel(private val dinero: DineroRepo) : ViewModel() {
    val kinds: StateFlow<List<Kind>> = dinero.kinds.map { ks -> ks.sortedWith(compareBy(byName) { it.name }) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** null si se guardó; si no, el motivo. */
    fun save(id: String?, name: String): String? {
        val n = name.trim()
        if (n.isEmpty()) return "Escribe un nombre."
        if (kinds.value.any { it.id != id && byName.compare(it.name, n) == 0 }) return "Ya hay un tipo con ese nombre."
        viewModelScope.launch { dinero.saveKind(Kind(id ?: newId(), n)) }
        return null
    }

    fun delete(id: String) { viewModelScope.launch { dinero.deleteKind(id) } }
}

/**
 * Se agrega en el campo de arriba y se edita en la misma fila (tocar el nombre). Sin diálogos con campos de texto:
 * así el teclado no tapa nada y la fila no salta.
 */
@Composable
fun TiposScreen(vm: TiposViewModel, onBack: () -> Unit) {
    val kinds by vm.kinds.collectAsStateWithLifecycle()
    var nuevo by rememberSaveable { mutableStateOf("") }
    var nuevoError by rememberSaveable { mutableStateOf<String?>(null) }
    var editing by rememberSaveable { mutableStateOf<String?>(null) }
    var text by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var deleting by rememberSaveable { mutableStateOf<String?>(null) }

    fun add() { nuevoError = vm.save(null, nuevo); if (nuevoError == null) nuevo = "" }
    fun rename(id: String) { error = vm.save(id, text); if (error == null) editing = null }

    Scaffold(Modifier.testTag("pantalla-tipos"), topBar = { BarraVolver("Tipos de gasto", onBack) }) { p ->
        LazyColumn(Modifier.fillMaxSize().padding(p).imePadding()) {
            item {
                Text(
                    "En qué se usó el dinero de cada gasto. Es aparte de la categoría de la que sale.",
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(Modifier.padding(16.dp, 0.dp, 8.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        nuevo, { nuevo = it.take(40); nuevoError = null }, label = { Text("Nuevo tipo") }, singleLine = true,
                        isError = nuevoError != null, supportingText = nuevoError?.let { { Text(it) } },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { add() }),
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = ::add) { Icon(Icons.Filled.Add, contentDescription = "Agregar tipo") }
                }
                HorizontalDivider()
            }
            items(kinds, key = { it.id }) { k ->
                if (editing == k.id) {
                    Row(Modifier.padding(16.dp, 8.dp, 8.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            text, { text = it.take(40); error = null }, label = { Text("Nombre") }, singleLine = true,
                            isError = error != null, supportingText = error?.let { { Text(it) } },
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { rename(k.id) }),
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { rename(k.id) }) { Icon(Icons.Filled.Check, contentDescription = "Guardar nombre") }
                        IconButton(onClick = { editing = null; deleting = k.id }) { Icon(Icons.Outlined.Delete, contentDescription = "Eliminar ${k.name}") }
                    }
                } else {
                    ListItem(
                        headlineContent = { Text(k.name) },
                        modifier = Modifier.fillMaxWidth().clickable { editing = k.id; text = k.name; error = null },
                    )
                }
                HorizontalDivider()
            }
        }
    }

    deleting?.let { d ->
        val name = kinds.firstOrNull { it.id == d }?.name ?: ""
        Confirmar(
            "¿Eliminar el tipo «$name»?", "Los gastos que lo usan quedarán «Sin tipo».", "Eliminar tipo",
            onConfirm = { deleting = null; vm.delete(d) }, onDismiss = { deleting = null },
        )
    }
}
