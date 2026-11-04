package com.hancel.home.ui.listas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.core.ListDoc
import com.hancel.home.core.ListSort
import com.hancel.home.core.dshort
import com.hancel.home.core.pl
import com.hancel.home.ui.comun.BarraSeccion
import com.hancel.home.ui.comun.Confirmar
import com.hancel.home.ui.tema.colorNegativo
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import java.time.LocalDate

/** Lo que se puede hacer desde Listas. */
data class ListasAcciones(
    val onAjustes: () -> Unit = {},
    val onAbrir: (String) -> Unit = {},
    val onNueva: (() -> Unit)? = null,
)

private val SORTS = listOf(ListSort.RECENT to "Recientes", ListSort.DUE to "Por fecha", ListSort.MANUAL to "Manual")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListasScreen(vm: ListasViewModel, a: ListasAcciones) {
    val s by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var menu by remember { mutableStateOf(false) }
    val st = s
    Scaffold(
        Modifier.testTag("pantalla-listas"),
        topBar = {
            BarraSeccion("Listas", a.onAjustes) {
                if (tab == 0 && st != null) Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Ordenar listas") }
                    DropdownMenu(menu, onDismissRequest = { menu = false }) {
                        SORTS.forEach { (k, label) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = { menu = false; vm.setSort(k) },
                                leadingIcon = { if (st.sort == k) Icon(Icons.Filled.Check, null) else Spacer(Modifier.size(24.dp)) },
                            )
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            if (tab == 0 && a.onNueva != null) FloatingActionButton(onClick = a.onNueva) { Icon(Icons.Filled.Add, contentDescription = "Nueva lista") }
        },
    ) { p ->
        if (st == null) return@Scaffold
        Column(Modifier.fillMaxSize().padding(p)) {
            // Pestañas fijas de ancho igual y sin el relleno lateral de Tab(text = …): así las cuatro caben en 360 dp.
            // Como en la PWA, el archivo lleva el número pequeño al lado («Archivo 2»).
            val n = st.archivadas.size
            val tabs = listOf(
                AnnotatedString("Listas"), AnnotatedString("Agenda"), AnnotatedString("Plantillas"),
                buildAnnotatedString {
                    append("Archivo")
                    if (n > 0) withStyle(SpanStyle(fontSize = MaterialTheme.typography.labelMedium.fontSize, color = MaterialTheme.colorScheme.onSurfaceVariant)) { append(" $n") }
                },
            )
            PrimaryTabRow(selectedTabIndex = tab, modifier = Modifier.testTag("pestanas-listas")) {
                tabs.forEachIndexed { i, t ->
                    Tab(selected = tab == i, onClick = { tab = i }, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(t, Modifier.padding(horizontal = 2.dp), style = MaterialTheme.typography.titleSmall, maxLines = 1, softWrap = false)
                    }
                }
            }
            when (tab) {
                0 -> Activas(st, vm, a)
                1 -> Vacio("Aquí verás las tareas con fecha de todas tus listas.")
                2 -> Vacio("Aquí verás tus plantillas.")
                else -> Archivadas(st, vm, a)
            }
        }
    }
}

@Composable
private fun Vacio(text: String) {
    Text(text, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Activas(st: ListasState, vm: ListasViewModel, a: ListasAcciones) {
    if (st.activas.isEmpty()) return Vacio("Aún no tienes listas. Toca + para crear una.")
    val manual = st.sort == ListSort.MANUAL
    // Copia local mientras se arrastra: se mueve en vivo y al soltar se guarda; cuando la base responde, vuelve a mandar.
    var filas by remember(st.activas) { mutableStateOf(st.activas) }
    val lazy = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(lazy) { from, to ->
        val f = filas
        val a1 = f.getOrNull(from.index) ?: return@rememberReorderableLazyListState
        val b1 = f.getOrNull(to.index) ?: return@rememberReorderableLazyListState
        if (a1.doc.pinned != b1.doc.pinned) return@rememberReorderableLazyListState // no cruza de grupo
        filas = f.toMutableList().apply { add(to.index, removeAt(from.index)) }
    }
    LazyColumn(
        Modifier.fillMaxSize().testTag("lista-listas"), state = lazy,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(filas, key = { it.doc.id }) { f ->
            ReorderableItem(reorder, key = f.doc.id, enabled = manual) { dragging ->
                val handle = if (manual) Modifier.longPressDraggableHandle(onDragStopped = {
                    val group = filas.filter { it.doc.pinned == f.doc.pinned }
                    vm.move(f.doc.id, group.indexOfFirst { it.doc.id == f.doc.id })
                }) else Modifier
                TarjetaLista(f, st.today, handle.then(if (dragging) Modifier.shadow(8.dp, MaterialTheme.shapes.medium) else Modifier)) { a.onAbrir(f.doc.id) }
            }
        }
    }
}

@Composable
private fun TarjetaLista(f: FilaLista, today: LocalDate, modifier: Modifier, onClick: () -> Unit) {
    Card(
        onClick = onClick, modifier = modifier.fillMaxWidth().testTag("lista-${f.doc.id}"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (f.doc.pinned) {
                    Icon(Icons.Filled.PushPin, contentDescription = "Fijada", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(6.dp))
                }
                Text(f.doc.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(8.dp))
                Text("${f.progress.done}/${f.progress.total}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            LinearProgressIndicator(
                progress = { if (f.progress.total == 0) 0f else f.progress.done.toFloat() / f.progress.total },
                modifier = Modifier.fillMaxWidth(), drawStopIndicator = {},
            )
            when {
                f.late > 0 -> Text(pl(f.late, "vencida"), style = MaterialTheme.typography.bodyMedium, color = colorNegativo())
                f.next != null -> Text("Próxima: ${dshort(f.next, today)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Archivadas(st: ListasState, vm: ListasViewModel, a: ListasAcciones) {
    if (st.archivadas.isEmpty()) return Vacio("No hay listas archivadas. Al finalizar una lista llega aquí.")
    var borrar by rememberSaveable { mutableStateOf<String?>(null) }
    LazyColumn(
        Modifier.fillMaxSize().testTag("lista-archivadas"),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(st.archivadas, key = { it.id }) { l -> TarjetaArchivada(l, st.today, { a.onAbrir(l.id) }, { vm.restore(l.id) }, { borrar = l.id }) }
    }
    st.archivadas.firstOrNull { it.id == borrar }?.let { l ->
        Confirmar(
            "¿Eliminar la lista «${l.name}»?", "Se borra con todos sus elementos. No se puede deshacer.", "Eliminar lista",
            onConfirm = { borrar = null; vm.delete(l.id) }, onDismiss = { borrar = null },
        )
    }
}

@Composable
private fun TarjetaArchivada(l: ListDoc, today: LocalDate, onOpen: () -> Unit, onRestore: () -> Unit, onDelete: () -> Unit) {
    Card(
        onClick = onOpen, modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Row(Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(l.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("Finalizada el ${dshort(l.archived!!, today)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = onRestore) { Text("Restaurar") }
            IconButton(onClick = onDelete) { Icon(Icons.Outlined.Delete, contentDescription = "Eliminar ${l.name}") }
        }
    }
}
