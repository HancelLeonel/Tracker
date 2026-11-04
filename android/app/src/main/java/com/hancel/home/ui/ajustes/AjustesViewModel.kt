package com.hancel.home.ui.ajustes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hancel.home.core.Snapshot
import com.hancel.home.core.money
import com.hancel.home.core.pl
import com.hancel.home.core.respaldo.ImportError
import com.hancel.home.core.respaldo.ImportSummary
import com.hancel.home.core.respaldo.exportHome
import com.hancel.home.core.respaldo.parseBackup
import com.hancel.home.core.respaldo.summary
import com.hancel.home.data.RespaldoRepo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Clock
import java.time.LocalDate

sealed interface ImportState {
    data object Idle : ImportState
    data object Reading : ImportState
    data class Preview(val summary: ImportSummary, val snapshot: Snapshot) : ImportState
    data class Error(val msg: String) : ImportState
    data object Done : ImportState
}

/** «2 412 movimientos»: miles con espacio fino, como se escriben en español. */
fun cuenta(n: Int, one: String, many: String = one + "s") =
    pl(n, one, many).replaceFirst(n.toString(), String.format(java.util.Locale.US, "%,d", n).replace(',', ' '))

fun ImportSummary.lineas(): Pair<String, String> =
    listOf(
        cuenta(accounts, "cuenta"), cuenta(categories, "categoría"), cuenta(moves, "movimiento"),
        cuenta(lists, "lista"), cuenta(templates, "plantilla"),
    ).joinToString(" · ") to "Dinero total ${money(net)}"

class AjustesViewModel(private val respaldo: RespaldoRepo, private val clock: Clock) : ViewModel() {
    private val state = MutableStateFlow<ImportState>(ImportState.Idle)
    val importState: StateFlow<ImportState> = state

    /** Lee y valida el archivo sin tocar nada; muestra el resumen para confirmar. */
    fun preview(text: String) {
        state.value = ImportState.Reading
        viewModelScope.launch {
            state.value = withContext(Dispatchers.Default) {
                try {
                    val s = parseBackup(text, LocalDate.now(clock))
                    ImportState.Preview(s.summary(), s)
                } catch (e: ImportError) {
                    ImportState.Error(e.message ?: "El archivo no se pudo leer.")
                }
            }
        }
    }

    fun confirmImport() {
        val p = state.value as? ImportState.Preview ?: return
        state.value = ImportState.Reading
        viewModelScope.launch {
            state.value = try {
                respaldo.replaceAll(p.snapshot)
                ImportState.Done
            } catch (e: Exception) {
                ImportState.Error("No se pudo importar; no se cambió nada. (${e.message})")
            }
        }
    }

    fun readError(e: Throwable) { state.value = ImportState.Error("No se pudo abrir el archivo. (${e.message})") }
    fun dismiss() { state.value = ImportState.Idle }

    suspend fun exportText(): String = exportHome(respaldo.snapshot(), clock.instant())
    fun exportName() = "home-${LocalDate.now(clock)}.json"

    fun wipe() { viewModelScope.launch { respaldo.wipe() } }
}
