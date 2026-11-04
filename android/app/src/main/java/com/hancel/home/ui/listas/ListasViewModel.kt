package com.hancel.home.ui.listas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.ListDoc
import java.time.Clock
import com.hancel.home.core.toggle
import com.hancel.home.core.newList
import com.hancel.home.core.newId
import com.hancel.home.core.dueInfo
import com.hancel.home.core.byName
import com.hancel.home.core.agenda
import com.hancel.home.core.Template
import com.hancel.home.core.Task
import com.hancel.home.core.DueInfo
import com.hancel.home.core.Bucket
import com.hancel.home.core.ListSort
import com.hancel.home.core.Progress
import com.hancel.home.core.lateCount
import com.hancel.home.core.nextDue
import com.hancel.home.core.orderedActive
import com.hancel.home.core.progress
import com.hancel.home.core.reorder
import com.hancel.home.core.seedOrder
import com.hancel.home.data.Ajustes
import com.hancel.home.data.ListasRepo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

/** Una lista activa como se pinta: avance, vencidas y la próxima fecha límite pendiente. */
data class FilaLista(val doc: ListDoc, val progress: Progress, val late: Int, val next: LocalDate?)

data class ListasState(val sort: ListSort, val activas: List<FilaLista>, val archivadas: List<ListDoc>, val today: LocalDate)

fun buildListas(lists: List<ListDoc>, sort: ListSort, today: LocalDate) = ListasState(
    sort = sort,
    activas = orderedActive(lists, sort).map { FilaLista(it, it.progress(), it.lateCount(today), it.nextDue()) },
    archivadas = lists.filter { it.archived != null }
        .sortedWith(compareByDescending<ListDoc> { it.archived }.thenByDescending { it.created }.thenByDescending { it.t }),
    today = today,
)

/** Una plantilla como tarjeta: cuántos elementos, cuándo se usó por última vez y si ya toca repetirla. */
data class FilaPlantilla(val t: Template, val count: Int, val lastUsed: LocalDate?, val due: DueInfo?)

fun buildPlantillas(ts: List<Template>, lists: List<ListDoc>, today: LocalDate) = ts.sortedWith(compareBy(byName) { it.name }).map { t ->
    FilaPlantilla(t, t.items.count { !it.head }, lists.filter { it.tplId == t.id }.maxOfOrNull { it.created }, dueInfo(t, lists, today))
}

class ListasViewModel(private val listas: ListasRepo, private val ajustes: Ajustes, private val hoy: Hoy, private val clock: Clock) : ViewModel() {
    // «Hoy» entra al combine: si cambia el día con la app abierta, las vencidas se recalculan.
    val state: StateFlow<ListasState?> = combine(listas.lists, ajustes.portable, hoy.flow) { ls, s, today ->
        withContext(Dispatchers.Default) { buildListas(ls, s.listSort, today) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val plantillas: StateFlow<List<FilaPlantilla>?> = combine(listas.templates, listas.lists, hoy.flow) { ts, ls, today ->
        withContext(Dispatchers.Default) { buildPlantillas(ts, ls, today) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Tareas con fecha agrupadas. «Hoy» sale de `hoy.flow`, que se refresca al volver a la app (Review Focus 3). */
    val agenda: StateFlow<Map<Bucket, List<Task>>?> = combine(listas.lists, hoy.flow) { ls, today ->
        withContext(Dispatchers.Default) { agenda(ls, today) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Marca (o desmarca, para «Deshacer») una tarea de la Agenda: lee la lista al día y guarda solo ese cambio. */
    fun toggleTask(listId: String, itemId: String) {
        viewModelScope.launch {
            val l = listas.lists.first().firstOrNull { it.id == listId } ?: return@launch
            listas.saveList(l.toggle(itemId, hoy.flow.value))
        }
    }

    /** «Crear lista» de una plantilla: con el nombre por defecto («Súper · 3 nov»), y se abre. */
    fun createFrom(tplId: String, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val t = listas.templates.first().firstOrNull { it.id == tplId } ?: return@launch
            val l = newList(t, null, hoy.flow.value, clock.millis(), listas.lists.first(), ::newId)
            listas.saveList(l)
            onCreated(l.id)
        }
    }

    /**
     * La primera vez que se elige Manual se toma como orden propio el que se estaba viendo (`seedOrder`). Primero se
     * guardan los `order` y después el modo, para que la vista no salte a «más recientes» entre una cosa y otra.
     */
    fun setSort(sort: ListSort) {
        val cur = state.value ?: return
        viewModelScope.launch {
            if (sort == ListSort.MANUAL && !ajustes.portable.first().listManualSeeded) {
                listas.saveLists(seedOrder(cur.activas.map { it.doc }))
            }
            ajustes.update { it.copy(listSort = sort, listManualSeeded = it.listManualSeeded || sort == ListSort.MANUAL) }
        }
    }

    /** Al soltar una lista arrastrada: su posición dentro de su grupo (fijadas o no). Solo se guardan las que cambiaron. */
    fun move(id: String, toIndexInGroup: Int) {
        viewModelScope.launch {
            val all = listas.lists.first()
            val before = all.associate { it.id to it.order }
            val changed = reorder(all, ListSort.MANUAL, id, toIndexInGroup).filter { before[it.id] != it.order }
            if (changed.isNotEmpty()) listas.saveLists(changed)
        }
    }

    fun restore(id: String) {
        val l = state.value?.archivadas?.firstOrNull { it.id == id } ?: return
        viewModelScope.launch { listas.saveList(l.copy(archived = null)) }
    }

    fun delete(id: String) {
        viewModelScope.launch { listas.deleteList(id) }
    }
}
