package com.hancel.home.ui.listas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.ListDoc
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

class ListasViewModel(private val listas: ListasRepo, private val ajustes: Ajustes, hoy: Hoy) : ViewModel() {
    // «Hoy» entra al combine: si cambia el día con la app abierta, las vencidas se recalculan.
    val state: StateFlow<ListasState?> = combine(listas.lists, ajustes.portable, hoy.flow) { ls, s, today ->
        withContext(Dispatchers.Default) { buildListas(ls, s.listSort, today) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

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
