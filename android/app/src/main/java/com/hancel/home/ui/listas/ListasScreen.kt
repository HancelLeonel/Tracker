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
import kotlinx.coroutines.launch
import com.hancel.home.core.itemMeta
import com.hancel.home.core.fmtDate
import com.hancel.home.core.Task
import com.hancel.home.core.MetaTone
import com.hancel.home.core.Freq
import com.hancel.home.core.DueInfo
import com.hancel.home.core.Bucket
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Button
import androidx.compose.foundation.clickable
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
    /** Editor de plantillas: null para una nueva, o el id de la que se edita. */
    val onPlantilla: ((String?) -> Unit)? = null,
)

private val SORTS = listOf(ListSort.RECENT to "Recientes", ListSort.DUE to "Por fecha", ListSort.MANUAL to "Manual")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListasScreen(vm: ListasViewModel, a: ListasAcciones) {
    val s by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var menu by remember { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }
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
            val nueva = a.onPlantilla
            if (tab == 2 && nueva != null) FloatingActionButton(onClick = { nueva(null) }) { Icon(Icons.Filled.Add, contentDescription = "Nueva plantilla") }
        },
        snackbarHost = { SnackbarHost(snack) },
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
                1 -> AgendaTab(vm, snack, a)
                2 -> PlantillasTab(vm, a)
                else -> Archivadas(st, vm, a)
            }
        }
    }
}

@Composable
private fun Vacio(text: String, hint: String? = null, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text, style = MaterialTheme.typography.bodyLarge)
        hint?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        action?.invoke()
    }
}

@Composable
private fun Activas(st: ListasState, vm: ListasViewModel, a: ListasAcciones) {
    if (st.activas.isEmpty()) return Vacio("Aún no tienes listas.", "Toca + para crear una, vacía o a partir de una plantilla.")
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
    if (st.archivadas.isEmpty()) return Vacio("No hay listas archivadas.", "Al finalizar una lista llega aquí.")
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

// ---------- Agenda ----------

@Composable
private fun AgendaTab(vm: ListasViewModel, snack: SnackbarHostState, a: ListasAcciones) {
    val ag by vm.agenda.collectAsStateWithLifecycle()
    val groups = ag ?: return
    val scope = rememberCoroutineScope()
    if (groups.isEmpty()) return Vacio(
        "No hay tareas con fecha.",
        "Toca el icono de calendario de un elemento de cualquier lista para ponerle una fecha límite y aquí las verás juntas.",
    )
    val today = vm.state.collectAsStateWithLifecycle().value?.today ?: return
    LazyColumn(
        Modifier.fillMaxSize().testTag("lista-agenda"),
        contentPadding = PaddingValues(start = 8.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
    ) {
        groups.forEach { (b, tasks) ->
            item(key = "b-${b.name}") {
                Text(
                    "${b.label} · ${tasks.size}", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 4.dp),
                    style = MaterialTheme.typography.titleSmall,
                    color = if (b == Bucket.LATE) colorNegativo() else MaterialTheme.colorScheme.primary,
                )
            }
            items(tasks, key = { "${it.list.id}/${it.item.id}" }) { t ->
                FilaTarea(t, today, onCheck = {
                    vm.toggleTask(t.list.id, t.item.id)
                    scope.launch {
                        snack.currentSnackbarData?.dismiss()
                        if (snack.showSnackbar("Tarea hecha", "Deshacer", duration = SnackbarDuration.Short) == SnackbarResult.ActionPerformed) {
                            vm.toggleTask(t.list.id, t.item.id)
                        }
                    }
                }, onOpen = { a.onAbrir(t.list.id) })
            }
        }
    }
}

/** Tarea con fecha (taskRow de la PWA): la casilla la marca y el texto abre su lista. */
@Composable
fun FilaTarea(t: Task, today: LocalDate, onCheck: () -> Unit, onOpen: () -> Unit) {
    val m = itemMeta(t.item, today)
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(48.dp).clickable(role = Role.Checkbox, onClick = onCheck)
                .semantics { contentDescription = "Marcar como hecha: ${t.item.text}" },
            contentAlignment = Alignment.Center,
        ) { Checkbox(false, onCheckedChange = null) }
        Column(Modifier.weight(1f).clickable(onClickLabel = "Abrir la lista", onClick = onOpen).padding(vertical = 8.dp, horizontal = 4.dp)) {
            Text(t.item.text, style = MaterialTheme.typography.bodyLarge)
            Text(
                (m?.let { it.text + " · " } ?: "") + t.list.name, style = MaterialTheme.typography.bodySmall,
                color = if (m?.tone == MetaTone.NEG) colorNegativo() else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ---------- Plantillas ----------

@Composable
private fun PlantillasTab(vm: ListasViewModel, a: ListasAcciones) {
    val ps by vm.plantillas.collectAsStateWithLifecycle()
    val rows = ps ?: return
    if (rows.isEmpty()) return Vacio(
        "Aún no tienes plantillas.",
        "Una plantilla es una lista que repites (el súper, la limpieza semanal…). De ahí creas una lista nueva cada vez y le agregas lo extra.",
    ) { a.onPlantilla?.let { f -> Button(onClick = { f(null) }) { Text("Crear la primera") } } }
    LazyColumn(
        Modifier.fillMaxSize().testTag("lista-plantillas"),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(rows, key = { it.t.id }) { f ->
            TarjetaPlantilla(f, onEdit = { a.onPlantilla?.invoke(f.t.id) }, onCreate = { vm.createFrom(f.t.id, a.onAbrir) })
        }
    }
}

@Composable
private fun TarjetaPlantilla(f: FilaPlantilla, onEdit: () -> Unit, onCreate: () -> Unit) {
    val meta = buildList {
        add(pl(f.count, "elemento"))
        if (f.t.freq != Freq.NONE) add(f.t.freq.label)
        f.lastUsed?.let { add("última vez ${fmtDate(it)}") }
    }.joinToString(" · ")
    Card(
        onClick = onEdit, modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(f.t.name, style = MaterialTheme.typography.titleMedium)
            Text(meta, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            f.due?.let { d ->
                Text(
                    d.text(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary,
                    fontWeight = if (d == DueInfo.Now) FontWeight.Bold else null,
                )
            }
            FilledTonalButton(
                onClick = onCreate, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Crear lista de ${f.t.name}" },
            ) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Crear lista") }
        }
    }
}
