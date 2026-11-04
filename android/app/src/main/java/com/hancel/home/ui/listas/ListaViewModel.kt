package com.hancel.home.ui.listas

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.ListDoc
import com.hancel.home.core.ListItem
import com.hancel.home.core.Progress
import com.hancel.home.core.Section
import com.hancel.home.core.finish
import com.hancel.home.core.isDone
import com.hancel.home.core.newId
import com.hancel.home.core.progress
import com.hancel.home.core.sections
import com.hancel.home.core.sink
import com.hancel.home.core.templateFromList
import com.hancel.home.core.toggle
import com.hancel.home.data.ListasRepo
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.Clock
import java.time.LocalDate

/** La lista como se pinta: secciones con lo hecho abajo (`sink`), y los adicionales aparte. */
data class ListaState(
    val doc: ListDoc,
    val today: LocalDate,
    val progress: Progress,
    val base: List<Section>,
    val extras: List<Section>,
    val extrasProgress: Progress,
    val done: Boolean,
)

fun buildLista(l: ListDoc, today: LocalDate): ListaState {
    fun body(items: List<ListItem>) = sections(items).map { it.copy(items = sink(it.items, l.sortDue)) }
    val extras = l.items.filter { it.extra }
    return ListaState(
        doc = l, today = today, progress = l.progress(),
        base = body(l.items.filter { !it.extra }), extras = body(extras),
        extrasProgress = Progress(extras.count { it.done && !it.head }, extras.count { !it.head }),
        done = l.isDone(),
    )
}

/**
 * Detalle de una lista. Cada cambio se aplica primero en memoria (`local`) y se guarda en orden: marcar dos elementos
 * seguidos no debe perder el primero aunque la base aún no haya respondido. Mientras haya guardados pendientes no se
 * acepta lo que llega de la base (vendría atrasado); al terminar el último, la base trae lo mismo que ya se ve.
 */
class ListaViewModel(
    val listId: String,
    private val listas: ListasRepo,
    private val hoy: Hoy,
    private val clock: Clock,
) : ViewModel() {
    private val local = MutableStateFlow<ListDoc?>(null)
    private var pending = 0
    private val saving = Mutex()

    private val _gone = MutableStateFlow(false)
    /** La lista se eliminó o se finalizó: la pantalla vuelve atrás. */
    val gone: StateFlow<Boolean> = _gone
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message

    val state: StateFlow<ListaState?> = combine(local.filterNotNull(), hoy.flow, ::buildLista)
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        viewModelScope.launch {
            listas.lists.collect { ls ->
                if (pending > 0) return@collect
                val l = ls.firstOrNull { it.id == listId }
                if (l == null) _gone.value = true else local.value = l
            }
        }
    }

    private fun change(f: (ListDoc) -> ListDoc) {
        val cur = local.value ?: return
        val next = f(cur)
        if (next == cur) return
        local.value = next
        pending++
        viewModelScope.launch {
            // NonCancellable: si la persona vuelve atrás justo después de marcar, el guardado termina igual.
            try { withContext(NonCancellable) { saving.withLock { listas.saveList(next) } } } finally { pending-- }
        }
    }

    private fun item(id: String, f: (ListItem) -> ListItem) = change { l -> l.copy(items = l.items.map { if (it.id == id) f(it) else it }) }
    private val editable get() = local.value?.archived == null

    fun toggle(id: String) { if (editable) change { it.toggle(id, hoy.flow.value) } }

    /** Agrega un elemento adicional. Devuelve false si el texto está vacío. */
    fun add(text: String): Boolean {
        val t = text.trim().take(80)
        if (t.isEmpty() || !editable) return false
        change { it.copy(items = it.items + ListItem(newId(), t, extra = true)) }
        return true
    }

    fun setDue(id: String, d: LocalDate?) { if (editable) item(id) { it.copy(due = d) } }
    fun editText(id: String, text: String): Boolean {
        val t = text.trim().take(80)
        if (t.isEmpty() || !editable) return false
        item(id) { it.copy(text = t) }
        return true
    }
    fun remove(id: String) { if (editable) change { l -> l.copy(items = l.items.filter { it.id != id }) } }

    fun rename(name: String): Boolean {
        val n = name.trim().take(60)
        if (n.isEmpty()) return false
        change { it.copy(name = n) }
        return true
    }
    fun togglePinned() = change { it.copy(pinned = !it.pinned) }
    fun toggleSortDue() = change { it.copy(sortDue = !it.sortDue) }

    fun saveAsTemplate() {
        val l = local.value ?: return
        val t = templateFromList(l, ::newId)
        viewModelScope.launch {
            listas.saveTemplate(t)
            _message.value = "Plantilla «${t.name}» guardada."
        }
    }

    fun finish() {
        val l = local.value ?: return
        if (!l.isDone()) return
        val next = l.finish(hoy.flow.value)
        local.value = next
        pending++
        viewModelScope.launch { withContext(NonCancellable) { saving.withLock { listas.saveList(next) } }; _gone.value = true }
    }

    fun restore() = change { it.copy(archived = null) }

    fun delete() {
        pending++ // ya no se acepta nada de la base: la pantalla se va
        viewModelScope.launch { withContext(NonCancellable) { saving.withLock { listas.deleteList(listId) } }; _gone.value = true }
    }

    fun messageShown() { _message.value = null }
}
