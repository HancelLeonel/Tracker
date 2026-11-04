package com.hancel.home.ui.finanzas

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.Hoy
import com.hancel.home.core.CatKey
import com.hancel.home.core.ConfirmKind
import com.hancel.home.core.ExpenseDraft
import com.hancel.home.core.Kind
import com.hancel.home.core.Ledger
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Row
import com.hancel.home.core.SaveCheck
import com.hancel.home.core.addRow
import com.hancel.home.core.byName
import com.hancel.home.core.checkSave
import com.hancel.home.core.newId
import com.hancel.home.core.removeRow
import com.hancel.home.core.toMove
import com.hancel.home.core.withAllowNeg
import com.hancel.home.core.withAmount
import com.hancel.home.core.withKey
import com.hancel.home.core.withTotal
import com.hancel.home.data.Ajustes
import com.hancel.home.data.DineroRepo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.LocalDate

/** Confirmación pendiente al guardar: el mensaje y lo que la persona ya aceptó antes. */
data class Pendiente(val check: SaveCheck.Confirm, val confirmed: Set<ConfirmKind>)

/**
 * Formulario de gasto. Todo lo escrito vive en el SavedStateHandle como tipos simples (si Android cierra la app,
 * el formulario vuelve igual); el reparto entre categorías es el `ExpenseDraft` de :core.
 */
class GastoViewModel(
    private val h: SavedStateHandle,
    private val dinero: DineroRepo,
    private val ajustes: Ajustes,
    private val hoy: Hoy,
    private val clock: Clock,
    val moveId: String?,
    private val preset: CatKey?,
    private val presetCard: String?,
) : ViewModel() {
    val ledger: StateFlow<Ledger?> = dinero.ledger.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val kinds: StateFlow<List<Kind>> = dinero.kinds.map { ks -> ks.sortedWith(compareBy(byName) { it.name }) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val title: StateFlow<String> = h.getStateFlow("title", "")
    val note: StateFlow<String> = h.getStateFlow("note", "")
    val date: StateFlow<String> = h.getStateFlow("date", "")
    val kind: StateFlow<String?> = h.getStateFlow("kind", null)
    val card: StateFlow<String?> = h.getStateFlow("card", null)

    private val _draft = MutableStateFlow<ExpenseDraft?>(null)
    val draft: StateFlow<ExpenseDraft?> = _draft
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message
    private val _pending = MutableStateFlow<Pendiente?>(null)
    val pending: StateFlow<Pendiente?> = _pending
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done

    private var editing: Move? = null

    init {
        viewModelScope.launch {
            val l = ledger.filterNotNull().first()
            editing = moveId?.let { id -> l.moves.firstOrNull { it.id == id && it.type == MoveType.EXPENSE } }
            if (moveId != null && editing == null) { _done.value = true; return@launch } // lo borraron en otra pantalla
            val e = editing
            if (h.get<Boolean>("loaded") == true) {
                _draft.value = readDraft(e)
                return@launch
            }
            val ks = dinero.kinds.first().sortedWith(compareBy(byName) { it.name })
            val last = ajustes.portable.first().lastKind
            h["title"] = e?.title ?: ""
            h["note"] = e?.note ?: ""
            h["date"] = (e?.date ?: hoy.flow.value).toString()
            h["kind"] = e?.kindId ?: last?.takeIf { id -> ks.any { it.id == id } } ?: ks.firstOrNull()?.id
            h["card"] = e?.cardId ?: presetCard?.takeIf { l.account(it)?.isCredit == true }
            writeDraft(ExpenseDraft.start(l, e, preset))
            h["loaded"] = true
        }
    }

    // ---------- el reparto en el SavedStateHandle ----------
    private fun writeDraft(d: ExpenseDraft) {
        _draft.value = d
        h["total"] = d.total
        h["allowNeg"] = d.allowNeg
        h["auto"] = d.auto
        h["rows"] = ArrayList(d.rows.map { r -> listOf(r.key?.acc ?: "", r.key?.cat ?: "", r.amount.toString()).joinToString(SEP) })
    }

    private fun readDraft(e: Move?): ExpenseDraft {
        val rows = h.get<ArrayList<String>>("rows").orEmpty().map { s ->
            val (acc, cat, amount) = s.split(SEP)
            Row(if (acc.isEmpty()) null else CatKey(acc, cat), amount.toLong())
        }
        return ExpenseDraft(e, h["total"] ?: 0, h["allowNeg"] ?: false, h["auto"] ?: true, rows.ifEmpty { listOf(Row(null, 0)) })
    }

    private fun change(f: (ExpenseDraft, Ledger) -> ExpenseDraft) {
        val d = _draft.value ?: return
        val l = ledger.value ?: return
        writeDraft(f(d, l))
    }

    // ---------- campos ----------
    fun setTitle(v: String) { h["title"] = v.take(60) }
    fun setNote(v: String) { h["note"] = v.take(120) }
    fun setDate(v: LocalDate) { h["date"] = v.toString() }
    fun setKind(v: String?) { h["kind"] = v }
    fun setCard(v: String?) { h["card"] = v }
    fun setTotal(v: Long) = change { d, l -> d.withTotal(v, l) }
    fun setAllowNeg(v: Boolean) = change { d, l -> d.withAllowNeg(v, l) }
    fun setKey(i: Int, k: CatKey) = change { d, l -> d.withKey(i, k, l) }
    fun setAmount(i: Int, v: Long) = change { d, _ -> d.withAmount(i, v) }
    fun removeRow(i: Int) = change { d, l -> d.removeRow(i, l) }
    fun addRow() = change { d, _ -> d.addRow() }

    // ---------- guardar ----------
    fun save(confirmed: Set<ConfirmKind> = emptySet()) {
        val l = ledger.value ?: return
        val d = _draft.value ?: return
        when (val c = d.checkSave(title.value, card.value, l, confirmed)) {
            is SaveCheck.Error -> _message.value = c.msg
            is SaveCheck.Confirm -> _pending.value = Pendiente(c, confirmed)
            SaveCheck.Ok -> viewModelScope.launch {
                val e = editing
                val k = kind.value
                val m = d.toMove(e?.id ?: newId(), e?.t ?: clock.millis(), LocalDate.parse(date.value), title.value, note.value, k, card.value)
                dinero.saveMove(m)
                if (k != null) ajustes.update { it.copy(lastKind = k) }
                _done.value = true
            }
        }
    }

    fun confirm() {
        val p = _pending.value ?: return
        _pending.value = null
        save(p.confirmed + p.check.kind)
    }

    fun cancelConfirm() { _pending.value = null }
    fun messageShown() { _message.value = null }

    fun delete() {
        val id = editing?.id ?: return
        viewModelScope.launch { dinero.deleteMove(id); _done.value = true }
    }

    private companion object { const val SEP = "\u001F" }
}
