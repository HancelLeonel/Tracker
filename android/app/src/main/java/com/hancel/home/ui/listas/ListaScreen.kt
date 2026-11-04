package com.hancel.home.ui.listas

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.core.ListItem
import com.hancel.home.core.MetaTone
import com.hancel.home.core.Section
import com.hancel.home.core.dshort
import com.hancel.home.core.itemMeta
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.Confirmar
import com.hancel.home.ui.comun.DialogoFecha
import com.hancel.home.ui.tema.colorNegativo

@Composable
fun ListaScreen(vm: ListaViewModel, onBack: () -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    val gone by vm.gone.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    var menu by remember { mutableStateOf(false) }
    var renaming by rememberSaveable { mutableStateOf<String?>(null) } // texto del nombre mientras se cambia
    var editing by rememberSaveable { mutableStateOf<String?>(null) } // id del elemento que se edita en su fila
    var draft by rememberSaveable { mutableStateOf("") }
    var quitar by rememberSaveable { mutableStateOf<String?>(null) }
    var fecha by rememberSaveable { mutableStateOf<String?>(null) }
    var borrar by rememberSaveable { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(gone) { if (gone) onBack() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.messageShown() } }
    val st = s
    val l = st?.doc
    val editable = l != null && l.archived == null

    Scaffold(
        Modifier.testTag("pantalla-lista"),
        topBar = {
            BarraVolver(l?.name.orEmpty(), onBack) {
                if (editable) Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Opciones de la lista") }
                    DropdownMenu(menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text(if (l!!.pinned) "Quitar de fijadas" else "Fijar arriba") }, onClick = { menu = false; vm.togglePinned() })
                        DropdownMenuItem(
                            text = { Text("Ordenar pendientes por fecha") }, onClick = { menu = false; vm.toggleSortDue() },
                            trailingIcon = { if (l!!.sortDue) Icon(Icons.Filled.Check, contentDescription = "Activado") },
                        )
                        DropdownMenuItem(text = { Text("Renombrar") }, onClick = { menu = false; renaming = l!!.name })
                        DropdownMenuItem(text = { Text("Guardar como plantilla") }, onClick = { menu = false; vm.saveAsTemplate() })
                        DropdownMenuItem(text = { Text("Eliminar lista") }, onClick = { menu = false; borrar = true })
                    }
                }
            }
        },
        bottomBar = { if (editable) BarraAgregar(vm::add) },
        snackbarHost = { SnackbarHost(snack) },
    ) { p ->
        if (st == null || l == null) return@Scaffold
        val muted = MaterialTheme.colorScheme.onSurfaceVariant
        LazyColumn(
            Modifier.fillMaxSize().padding(p).testTag("lista-elementos"),
            contentPadding = PaddingValues(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 24.dp),
        ) {
            item(key = "avance") {
                Row(Modifier.fillMaxWidth().padding(end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${st.progress.done}/${st.progress.total}", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.width(12.dp))
                    LinearProgressIndicator(
                        progress = { if (st.progress.total == 0) 0f else st.progress.done.toFloat() / st.progress.total },
                        modifier = Modifier.weight(1f), drawStopIndicator = {},
                    )
                }
            }
            val archived = l.archived
            if (archived != null) item(key = "archivada") {
                Aviso("Lista finalizada el ${dshort(archived, st.today)}") { OutlinedButton(onClick = vm::restore) { Text("Restaurar lista") } }
            } else if (st.done) item(key = "lista") {
                Aviso("Todo listo") { Button(onClick = vm::finish) { Text("Finalizar lista") } }
            }
            renaming?.let { name ->
                item(key = "renombrar") {
                    Row(Modifier.fillMaxWidth().padding(end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            name, { renaming = it.take(60) }, Modifier.weight(1f), label = { Text("Nombre") }, singleLine = true,
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { if (vm.rename(name)) renaming = null }),
                        )
                        TextButton(onClick = { if (vm.rename(name)) renaming = null }) { Text("Guardar nombre") }
                    }
                }
            }
            fun LazyListScope.cuerpo(secs: List<Section>) = secs.forEach { sec ->
                sec.head?.let { h -> item(key = "h-${h.id}") { Encabezado(h.text) } }
                items(sec.items, key = { it.id }) { i ->
                    if (editing == i.id) FilaEdicion(
                        draft, { draft = it.take(80) },
                        onSave = { if (vm.editText(i.id, draft)) editing = null },
                        onRemove = { quitar = i.id }, text = i.text,
                    ) else FilaElemento(
                        i, st.today, editable,
                        onToggle = { vm.toggle(i.id) },
                        onEdit = { draft = i.text; editing = i.id },
                        onDate = { fecha = i.id },
                    )
                }
            }
            cuerpo(st.base)
            if (st.extras.isNotEmpty()) {
                item(key = "adicionales") { Encabezado("Adicionales", "${st.extrasProgress.done}/${st.extrasProgress.total}") }
                cuerpo(st.extras)
            }
            if (l.items.isEmpty()) item(key = "vacia") {
                Column(Modifier.padding(vertical = 24.dp)) {
                    Text("La lista está vacía.", style = MaterialTheme.typography.bodyLarge)
                    Text("Agrega elementos con el campo de abajo.", color = muted)
                }
            }
        }
    }

    l?.items?.firstOrNull { it.id == fecha }?.let { i ->
        DialogoFecha(
            i.due ?: st!!.today,
            onPick = { vm.setDue(i.id, it); fecha = null },
            onDismiss = { fecha = null },
            onClear = if (i.due != null) ({ vm.setDue(i.id, null); fecha = null }) else null,
        )
    }
    l?.items?.firstOrNull { it.id == quitar }?.let { i ->
        Confirmar(
            "¿Quitar este elemento de la lista?", "«${i.text}» sale solo de esta lista; la plantilla no cambia.", "Quitar",
            onConfirm = { quitar = null; editing = null; vm.remove(i.id) }, onDismiss = { quitar = null },
        )
    }
    if (borrar && l != null) Confirmar(
        "¿Eliminar la lista «${l.name}»?", "Se borra con todos sus elementos. No se puede deshacer.", "Eliminar",
        onConfirm = { borrar = false; vm.delete() }, onDismiss = { borrar = false },
    )
}

@Composable
private fun Aviso(text: String, action: @Composable () -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(end = 8.dp, bottom = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Row(Modifier.padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            action()
        }
    }
}

@Composable
private fun Encabezado(text: String, count: String? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 4.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        count?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun FilaElemento(i: ListItem, today: java.time.LocalDate, editable: Boolean, onToggle: () -> Unit, onEdit: () -> Unit, onDate: () -> Unit) {
    val meta = itemMeta(i, today)
    val due = i.due
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        val check = Modifier.size(48.dp)
        if (editable) Box(
            check.toggleable(i.done, role = Role.Checkbox, onValueChange = { onToggle() }).semantics { contentDescription = "Marcar ${i.text}" },
            contentAlignment = Alignment.Center,
        ) { Checkbox(i.done, onCheckedChange = null) }
        else Box(check, contentAlignment = Alignment.Center) { Checkbox(i.done, onCheckedChange = null, enabled = false) }
        Column(
            Modifier.weight(1f).then(if (editable) Modifier.clickable(onClickLabel = "Editar", onClick = onEdit) else Modifier)
                .padding(vertical = 10.dp, horizontal = 4.dp),
        ) {
            Text(
                i.text, style = MaterialTheme.typography.bodyLarge,
                color = if (i.done) muted else Color.Unspecified,
                textDecoration = if (i.done) TextDecoration.LineThrough else null,
            )
            meta?.let { m ->
                Text(
                    m.text, style = MaterialTheme.typography.bodySmall,
                    color = when (m.tone) { MetaTone.NEG -> colorNegativo(); MetaTone.WARN -> MaterialTheme.colorScheme.primary; MetaTone.MUTED -> muted },
                )
            }
        }
        if (editable && !i.done) IconButton(onClick = onDate) {
            Icon(
                Icons.Outlined.CalendarMonth, contentDescription = "Fecha límite de ${i.text}",
                tint = when {
                    due != null && due < today -> colorNegativo()
                    due != null -> MaterialTheme.colorScheme.primary
                    else -> muted
                },
            )
        }
    }
}

@Composable
private fun FilaEdicion(draft: String, onDraft: (String) -> Unit, onSave: () -> Unit, onRemove: () -> Unit, text: String) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            draft, onDraft, Modifier.weight(1f).focusRequester(focus), label = { Text("Texto") }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSave() }),
        )
        IconButton(onClick = onSave) { Icon(Icons.Filled.Check, contentDescription = "Guardar cambios") }
        IconButton(onClick = onRemove) { Icon(Icons.Outlined.Delete, contentDescription = "Quitar $text") }
    }
}

/**
 * Campo fijo abajo para agregar elementos adicionales. Al agregar, el texto se limpia y el foco se queda en el campo
 * (onDone propio: así el teclado no se cierra y se pueden anotar varias cosas seguidas).
 */
@Composable
private fun BarraAgregar(onAdd: (String) -> Boolean) {
    var text by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val submit = { if (onAdd(text)) { text = ""; focus.requestFocus() } }
    Surface(tonalElevation = 3.dp, modifier = Modifier.imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                text, { text = it.take(80) }, Modifier.weight(1f).focusRequester(focus),
                placeholder = { Text("Agregar algo adicional…") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            Spacer(Modifier.width(8.dp))
            FilledIconButton(onClick = submit) { Icon(Icons.Filled.Add, contentDescription = "Agregar") }
        }
    }
}
