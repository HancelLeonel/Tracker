package com.hancel.home.ui.finanzas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.core.DraftStatus
import com.hancel.home.core.choices
import com.hancel.home.core.showAdd
import com.hancel.home.core.status
import com.hancel.home.core.text
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.CampoFecha
import com.hancel.home.ui.comun.CampoMonto
import com.hancel.home.ui.comun.Confirmar
import com.hancel.home.ui.comun.Opcion
import com.hancel.home.ui.comun.SelectorCategoria
import com.hancel.home.ui.comun.SelectorOpcion
import com.hancel.home.ui.tema.colorNegativo
import java.time.LocalDate

@Composable
fun GastoFormScreen(vm: GastoViewModel, onDone: () -> Unit) {
    val l by vm.ledger.collectAsStateWithLifecycle()
    val d by vm.draft.collectAsStateWithLifecycle()
    val kinds by vm.kinds.collectAsStateWithLifecycle()
    val title by vm.title.collectAsStateWithLifecycle()
    val note by vm.note.collectAsStateWithLifecycle()
    val date by vm.date.collectAsStateWithLifecycle()
    val kind by vm.kind.collectAsStateWithLifecycle()
    val card by vm.card.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val pending by vm.pending.collectAsStateWithLifecycle()
    val done by vm.done.collectAsStateWithLifecycle()
    var deleting by rememberSaveable { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(done) { if (done) onDone() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.messageShown() } }
    val editing = vm.moveId != null
    val ledger = l
    val draft = d
    val ready = ledger != null && draft != null && ledger.normalKeys().isNotEmpty()

    Scaffold(
        topBar = {
            BarraVolver(if (editing) "Editar gasto" else "Nuevo gasto", onDone) {
                if (editing) IconButton(onClick = { deleting = true }) { Icon(Icons.Outlined.Delete, contentDescription = "Eliminar gasto") }
                TextButton(onClick = { vm.save() }, enabled = ready) { Text("Guardar") }
            }
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { p ->
        if (ledger == null || draft == null) return@Scaffold
        if (ledger.normalKeys().isEmpty()) {
            Text("Primero crea una cuenta con una categoría.", Modifier.padding(p).padding(16.dp))
            return@Scaffold
        }
        val cards = ledger.sortedAccounts.filter { it.isCredit }
        val status = draft.status(ledger)
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                title, vm::setTitle, label = { Text("Título") }, placeholder = { Text("Ej. Netflix, Almuerzo, Gasolina…") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
            )
            CampoMonto(draft.total.takeIf { it > 0 }, { vm.setTotal(it ?: 0) }, "Monto total", Modifier.fillMaxWidth())
            SelectorOpcion(kind, kinds.map { Opcion(it.id, it.name) }, "Tipo de gasto", vm::setKind, Modifier.fillMaxWidth())
            if (cards.isNotEmpty()) SelectorOpcion(
                card,
                listOf(Opcion(null, "Efectivo / débito (se descuenta ya)")) + cards.map { Opcion(it.id, "Tarjeta ${it.name} (se paga después)") },
                "Pagado con", vm::setCard, Modifier.fillMaxWidth(),
            )

            Text(
                if (card != null) "Categoría de la que saldrá el dinero al pagar la tarjeta" else "Se descuenta de",
                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            draft.rows.forEachIndexed { i, r ->
                Row(verticalAlignment = Alignment.Top) {
                    SelectorCategoria(
                        r.key, draft.choices(i, ledger), ledger, { ledger.availWithout(draft.editing, it) },
                        "Elegir categoría…", Modifier.weight(1f), onPick = { vm.setKey(i, it) },
                    )
                    Spacer(Modifier.width(8.dp))
                    CampoMonto(r.amount.takeIf { it > 0 }, { vm.setAmount(i, it ?: 0) }, "Monto", Modifier.width(128.dp))
                    if (draft.rows.size > 1) IconButton(onClick = { vm.removeRow(i) }, modifier = Modifier.padding(top = 4.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = "Quitar esta categoría")
                    }
                }
            }
            if (status != DraftStatus.Ok) Text(
                status.text(),
                style = MaterialTheme.typography.bodyMedium,
                color = when (status) {
                    is DraftStatus.Missing, is DraftStatus.Over -> colorNegativo()
                    is DraftStatus.Negative -> MaterialTheme.colorScheme.tertiary
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            if (draft.showAdd(ledger)) TextButton(onClick = vm::addRow) {
                Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Agregar otra categoría")
            }
            Row(
                Modifier.fillMaxWidth().toggleable(draft.allowNeg, role = Role.Checkbox, onValueChange = vm::setAllowNeg),
                verticalAlignment = Alignment.Top,
            ) {
                Checkbox(draft.allowNeg, onCheckedChange = null, modifier = Modifier.padding(12.dp))
                Column(Modifier.padding(top = 10.dp)) {
                    Text("Permitir saldo negativo", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Si la categoría no alcanza, queda por debajo de cero hasta que la regularices (un préstamo entre categorías, algo que te reintegran).",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            OutlinedTextField(
                note, vm::setNote, label = { Text("Nota (opcional)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            )
            if (date.isNotEmpty()) CampoFecha(LocalDate.parse(date), vm::setDate, Modifier.fillMaxWidth())
        }
    }

    pending?.let { pnd ->
        Confirmar("¿Guardar el gasto?", pnd.check.msg, "Continuar", onConfirm = vm::confirm, onDismiss = vm::cancelConfirm)
    }
    if (deleting) Confirmar(
        "¿Eliminar este gasto?", "El dinero vuelve a las categorías de las que salió.", "Eliminar",
        onConfirm = { deleting = false; vm.delete() }, onDismiss = { deleting = false },
    )
}
