package com.hancel.home.ui.inicio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.ListDoc
import com.hancel.home.core.Task
import com.hancel.home.core.greeting
import com.hancel.home.core.homeDate
import com.hancel.home.core.toggle
import com.hancel.home.core.todayTasks
import com.hancel.home.data.ListasRepo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Clock
import java.time.LocalDate
import java.time.LocalTime

/** Una tarea de hoy y si se acaba de marcar (se pinta tachada en su sitio). */
data class TareaHoy(val task: Task, val done: Boolean)

data class InicioState(
    val date: String,
    val greeting: String,
    val today: LocalDate,
    /** Pendientes de verdad (sin contar lo recién marcado), para «Tareas de hoy · N». */
    val pending: Int,
    val shown: List<TareaHoy>,
    val more: Int,
)

const val MAX_TAREAS = 3

/**
 * Lo recién marcado (`just`, claves «lista/elemento») cuenta como pendiente para elegir qué se ve: así la fila no
 * desaparece ni entra otra en su lugar bajo el dedo. Se pinta tachada y se va al salir de Inicio (`salir()`).
 */
fun buildInicio(lists: List<ListDoc>, today: LocalDate, hour: Int, just: Set<String>): InicioState {
    val kept = lists.map { l ->
        if (just.none { it.startsWith("${l.id}/") }) l
        else l.copy(items = l.items.map { if ("${l.id}/${it.id}" in just) it.copy(done = false) else it })
    }
    val real = lists.associate { it.id to it.items.associateBy { i -> i.id } }
    val all = todayTasks(kept, today).map { t -> TareaHoy(t, real[t.list.id]?.get(t.item.id)?.done == true) }
    val shown = all.take(MAX_TAREAS)
    return InicioState(homeDate(today), greeting(hour), today, all.count { !it.done }, shown, all.size - shown.size)
}

class InicioViewModel(private val listas: ListasRepo, private val hoy: Hoy, private val clock: Clock) : ViewModel() {
    private val just = MutableStateFlow<Set<String>>(emptySet())

    // El saludo usa la hora del momento en que se calcula; `hoy` se refresca al volver a la app, y con él esto.
    val state: StateFlow<InicioState?> = combine(listas.lists, hoy.flow, just) { ls, today, j ->
        withContext(Dispatchers.Default) { buildInicio(ls, today, LocalTime.now(clock).hour, j) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun toggle(listId: String, itemId: String) {
        val key = "$listId/$itemId"
        viewModelScope.launch {
            val l = listas.lists.first().firstOrNull { it.id == listId } ?: return@launch
            val next = l.toggle(itemId, hoy.flow.value)
            val done = next.items.firstOrNull { it.id == itemId }?.done == true
            just.update { if (done) it + key else it - key }
            listas.saveList(next)
        }
    }

    /** Al salir de Inicio (ON_STOP): lo marcado deja de mostrarse. */
    fun salir() { just.value = emptySet() }
}
