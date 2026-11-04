package com.hancel.home.ui.listas

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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Title
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.core.Freq
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.Confirmar
import com.hancel.home.ui.comun.Opcion
import com.hancel.home.ui.comun.SelectorOpcion

@Composable
fun PlantillaFormScreen(vm: PlantillaViewModel, onDone: () -> Unit) {
    val name by vm.name.collectAsStateWithLifecycle()
    val freq by vm.freq.collectAsStateWithLifecycle()
    val rs by vm.rows.collectAsStateWithLifecycle()
    val focus by vm.focus.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val done by vm.done.collectAsStateWithLifecycle()
    var focused by rememberSaveable { mutableStateOf<String?>(null) }
    var borrar by rememberSaveable { mutableStateOf(false) }
    val requesters = remember { mutableMapOf<String, FocusRequester>() }
    LaunchedEffect(done) { if (done) onDone() }
    // El foco se pide un cuadro después: la fila nueva tiene que estar compuesta para recibirlo.
    LaunchedEffect(focus) { focus?.let { f -> withFrameNanos {}; runCatching { requesters[f.id]?.requestFocus() } } }
    val edit = vm.tplId != null

    Scaffold(
        topBar = {
            BarraVolver(if (edit) "Editar plantilla" else "Nueva plantilla", onDone) {
                if (edit) IconButton(onClick = { borrar = true }) { Icon(Icons.Outlined.Delete, contentDescription = "Eliminar plantilla") }
                TextButton(onClick = vm::save, enabled = rs != null) { Text("Guardar") }
            }
        },
    ) { p ->
        val rows = rs ?: return@Scaffold
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                name, vm::setName, Modifier.fillMaxWidth(), label = { Text("Nombre") },
                placeholder = { Text("Ej. Súper quincenal, Limpieza semanal…") }, singleLine = true,
                isError = error != null, supportingText = error?.let { e -> { Text(e) } },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
            )
            SelectorOpcion(freq, Freq.entries.map { Opcion(it.key, it.label) }, "Se repite", vm::setFreq, Modifier.fillMaxWidth())
            Text("Elementos", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column {
                rows.forEachIndexed { i, r ->
                    key(r.id) {
                        FilaEditor(
                            r, focused == r.id, requesters.getOrPut(r.id) { FocusRequester() }, first = i == 0, last = i == rows.lastIndex,
                            onFocus = { focused = r.id }, vm = vm,
                        )
                    }
                }
            }
            Row {
                TextButton(onClick = { vm.addAfter(focused, head = false) }) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("Elemento") }
                TextButton(onClick = { vm.addAfter(focused, head = true) }) { Icon(Icons.Filled.Title, null); Spacer(Modifier.width(6.dp)); Text("Sección") }
            }
            Text(
                "Enter agrega otro debajo. Toca un elemento para moverlo, hacerlo sección o fijar cuándo vence. " +
                    "Si pegas varias líneas, cada una es un elemento («# Título» es una sección y «Texto @3» vence a los 3 días).",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (borrar) Confirmar(
        "¿Eliminar esta plantilla?", "Las listas que ya creaste con ella no se borran.", "Eliminar",
        onConfirm = { borrar = false; vm.delete() }, onDismiss = { borrar = false },
    )
}

/** Una fila: el campo y «Quitar»; con el foco (o con plazo) muestra Subir, Bajar, «Es una sección» y «Vence a los _ días». */
@Composable
private fun FilaEditor(
    r: FilaT, focused: Boolean, requester: FocusRequester, first: Boolean, last: Boolean, onFocus: () -> Unit, vm: PlantillaViewModel,
) {
    Column(Modifier.padding(bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                r.text, { vm.setText(r.id, it) },
                Modifier.weight(1f).testTag("fila-plantilla").focusRequester(requester)
                    .onFocusChanged { if (it.isFocused) onFocus() }
                    .onPreviewKeyEvent { e -> e.type == KeyEventType.KeyDown && e.key == Key.Backspace && vm.backspace(r.id) },
                placeholder = { Text(if (r.head) "Nombre de la sección" else "Elemento") },
                textStyle = if (r.head) MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold) else MaterialTheme.typography.bodyLarge,
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { vm.enter(r.id) }),
            )
            IconButton(onClick = { vm.remove(r.id) }) { Icon(Icons.Filled.Close, contentDescription = "Quitar") }
        }
        // Dos renglones: con «Vence a los _ días» al lado de los botones, en 360 dp «días» se partía letra por letra.
        if (focused || r.dueIn != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { vm.move(r.id, -1) }, enabled = !first) { Icon(Icons.Filled.ArrowUpward, contentDescription = "Subir") }
                IconButton(onClick = { vm.move(r.id, 1) }, enabled = !last) { Icon(Icons.Filled.ArrowDownward, contentDescription = "Bajar") }
                IconToggleButton(r.head, { vm.toggleHead(r.id) }) { Icon(Icons.Filled.Title, contentDescription = "Es una sección") }
            }
            if (!r.head) Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Vence a los", style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(
                    r.dueIn?.toString() ?: "", { vm.setDueIn(r.id, it) }, Modifier.width(96.dp), label = { Text("Días") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                )
                Spacer(Modifier.width(8.dp))
                Text("días", style = MaterialTheme.typography.bodyMedium, maxLines = 1)
            }
        }
    }
}
