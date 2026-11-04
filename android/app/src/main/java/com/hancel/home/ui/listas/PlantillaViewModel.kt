package com.hancel.home.ui.listas

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.core.Freq
import com.hancel.home.core.Template
import com.hancel.home.core.TemplateItem
import com.hancel.home.core.newId
import com.hancel.home.core.parseItems
import com.hancel.home.core.templateFromList
import com.hancel.home.data.ListasRepo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Una fila del editor. `id` es solo del editor (para el foco y para moverla); no se guarda. */
data class FilaT(val id: String, val text: String = "", val head: Boolean = false, val dueIn: Int? = null)

/** Pedido de foco para una fila; `n` cambia en cada pedido para que se repita aunque sea la misma fila. */
data class Foco(val id: String, val n: Int)

/**
 * Editor de plantilla (templateForm de lists.js). Las filas viven aquí y en el SavedStateHandle, no en la pantalla:
 * agregar, quitar o mover filas no debe perder lo escrito ni cerrar el teclado, y sobrevive a que Android cierre la app.
 * `fromList` rellena una plantilla nueva con los elementos fijos de una lista («Guardar como plantilla»).
 */
class PlantillaViewModel(
    private val h: SavedStateHandle,
    private val listas: ListasRepo,
    val tplId: String?,
    private val fromList: String?,
) : ViewModel() {
    val name: StateFlow<String> = h.getStateFlow("name", "")
    val freq: StateFlow<String> = h.getStateFlow("freq", Freq.NONE.key)
    private val _rows = MutableStateFlow<List<FilaT>?>(null)
    val rows: StateFlow<List<FilaT>?> = _rows
    private val _focus = MutableStateFlow<Foco?>(null)
    val focus: StateFlow<Foco?> = _focus
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done
    private var n = 0

    init {
        viewModelScope.launch {
            if (h.get<Boolean>("loaded") == true) { _rows.value = readRows(); return@launch }
            val t = tplId?.let { id -> listas.templates.first().firstOrNull { it.id == id } }
            if (tplId != null && t == null) { _done.value = true; return@launch }
            val src = t ?: fromList?.let { id -> listas.lists.first().firstOrNull { it.id == id } }?.let { templateFromList(it, ::newId) }
            h["name"] = src?.name ?: ""
            h["freq"] = src?.freq?.key ?: Freq.NONE.key
            writeRows(src?.items?.map { FilaT(newId(), it.text, it.head, it.dueIn) }.orEmpty().ifEmpty { listOf(FilaT(newId())) })
            h["loaded"] = true
        }
    }

    private fun writeRows(rs: List<FilaT>) {
        _rows.value = rs
        h["rows"] = ArrayList(rs.map { listOf(it.id, it.text, if (it.head) "1" else "", it.dueIn?.toString() ?: "").joinToString(SEP) })
    }

    private fun readRows(): List<FilaT> = h.get<ArrayList<String>>("rows").orEmpty().map { s ->
        val (id, text, head, due) = s.split(SEP)
        FilaT(id, text, head == "1", due.toIntOrNull())
    }.ifEmpty { listOf(FilaT(newId())) }

    private fun change(f: (List<FilaT>) -> List<FilaT>) { _rows.value?.let { writeRows(f(it)) } }
    private fun focusOn(id: String) { _focus.value = Foco(id, ++n) }
    private fun update(id: String, f: (FilaT) -> FilaT) = change { rs -> rs.map { if (it.id == id) f(it) else it } }

    fun setName(v: String) { h["name"] = v.take(40); _error.value = null }
    fun setFreq(v: String?) { h["freq"] = Freq.of(v).key }

    /** Texto de una fila. Si trae saltos de línea (pegar una lista de otra app), cada línea pasa a ser una fila. */
    fun setText(id: String, v: String) {
        if ('\n' !in v) return update(id) { it.copy(text = v.take(200)) }
        val rs = _rows.value ?: return
        val i = rs.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: return
        val old = rs[i].text
        val keep = old.isNotBlank() && v.startsWith(old) // se pegó al final de una fila con texto: esa fila se queda
        val parsed = parseItems(if (keep) v.substring(old.length) else v).map { FilaT(newId(), it.text, it.head, it.dueIn) }
        if (parsed.isEmpty()) return
        writeRows(rs.subList(0, if (keep) i + 1 else i) + parsed + rs.subList(i + 1, rs.size))
        focusOn(parsed.last().id)
    }

    /** Enter: fila nueva debajo, con el foco. */
    fun enter(id: String) = addAfter(id, head = false)

    /** «+ Elemento» / «+ Sección»: debajo de la fila con el foco, o al final. */
    fun addAfter(id: String?, head: Boolean) {
        val row = FilaT(newId(), head = head)
        change { rs ->
            val i = rs.indexOfFirst { it.id == id }
            if (i < 0) rs + row else rs.subList(0, i + 1) + row + rs.subList(i + 1, rs.size)
        }
        focusOn(row.id)
    }

    /** Backspace en una fila vacía la quita y devuelve el foco a la anterior. Devuelve si se usó la tecla. */
    fun backspace(id: String): Boolean {
        val rs = _rows.value ?: return false
        val i = rs.indexOfFirst { it.id == id }
        if (i < 0 || rs[i].text.isNotEmpty() || rs.size == 1) return false
        val next = rs.getOrNull(i - 1) ?: rs[i + 1]
        writeRows(rs.filterIndexed { j, _ -> j != i })
        focusOn(next.id)
        return true
    }

    fun remove(id: String) {
        val rs = _rows.value ?: return
        val i = rs.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: return
        if (rs.size == 1) { writeRows(listOf(FilaT(newId()))); return focusOn(_rows.value!!.first().id) }
        val next = rs.getOrNull(i + 1) ?: rs[i - 1]
        writeRows(rs.filterIndexed { j, _ -> j != i })
        focusOn(next.id)
    }

    fun move(id: String, delta: Int) = change { rs ->
        val i = rs.indexOfFirst { it.id == id }
        val j = i + delta
        if (i < 0 || j !in rs.indices) rs else rs.toMutableList().apply { add(j, removeAt(i)) }
    }

    fun toggleHead(id: String) = update(id) { it.copy(head = !it.head) }

    /** «Vence a los _ días»: vacío quita el plazo; se acota a 0–365. */
    fun setDueIn(id: String, v: String) {
        val d = v.filter { it.isDigit() }.take(3)
        update(id) { it.copy(dueIn = d.toIntOrNull()?.coerceIn(0, 365)) }
    }

    fun save() {
        val nm = name.value.trim()
        if (nm.isEmpty()) { _error.value = "Escribe un nombre."; return }
        val items = _rows.value.orEmpty().filter { it.text.isNotBlank() }
            .map { TemplateItem(it.text.trim(), it.head, if (it.head) null else it.dueIn) }
        viewModelScope.launch {
            listas.saveTemplate(Template(tplId ?: newId(), nm, Freq.of(freq.value), items))
            _done.value = true
        }
    }

    fun delete() {
        val id = tplId ?: return
        viewModelScope.launch { listas.deleteTemplate(id); _done.value = true }
    }

    private companion object { const val SEP = "\u001F" }
}
