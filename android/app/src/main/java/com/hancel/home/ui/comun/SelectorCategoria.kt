package com.hancel.home.ui.comun

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hancel.home.core.CatKey
import com.hancel.home.core.Ledger
import com.hancel.home.core.money
import com.hancel.home.ui.tema.colorNegativo
import kotlinx.coroutines.launch

/**
 * Elegir una categoría en dos pasos, como en la PWA: primero la cuenta (con lo que suman sus opciones) y luego sus
 * categorías con su monto. Con una sola cuenta va directo a las categorías. El campo muestra «Cuenta · Categoría».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectorCategoria(
    selected: CatKey?,
    options: List<CatKey>,
    ledger: Ledger,
    amountOf: (CatKey) -> Long,
    placeholder: String,
    modifier: Modifier = Modifier,
    label: String? = null,
    error: String? = null,
    onPick: (CatKey) -> Unit,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val text = selected?.let { k ->
        val a = ledger.account(k.acc)
        val c = ledger.category(k)
        if (a == null || c == null) "(eliminada)" else "${a.name} · ${c.name}"
    }
    Box(modifier) {
        OutlinedTextField(
            value = text ?: "",
            onValueChange = {},
            readOnly = true,
            label = label?.let { { Text(it) } },
            placeholder = { Text(placeholder) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
            isError = error != null,
            supportingText = error?.let { { Text(it) } },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        // Capa encima del campo: tocar en cualquier parte abre el selector (un campo de solo lectura no siempre avisa del toque).
        Box(Modifier.matchParentSize().clickable(onClickLabel = "Elegir") { open = true })
    }
    if (!open) return

    val accounts = options.map { it.acc }.distinct()
    var acc by rememberSaveable { mutableStateOf(if (accounts.size == 1) accounts[0] else null) }
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    fun close() = scope.launch { sheet.hide() }.invokeOnCompletion { open = false }
    ModalBottomSheet(onDismissRequest = { open = false }, sheetState = sheet) {
        val current = acc
        if (current == null) {
            Text(label ?: placeholder, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp, 0.dp, 16.dp, 8.dp))
            LazyColumn {
                items(accounts) { a ->
                    val sum = options.filter { it.acc == a }.sumOf(amountOf)
                    ListItem(
                        headlineContent = { Text(ledger.account(a)?.name ?: "(eliminada)") },
                        trailingContent = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Monto(sum)
                                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
                            }
                        },
                        modifier = Modifier.clickable { acc = a },
                    )
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
                if (accounts.size > 1) IconButton(onClick = { acc = null }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver a las cuentas")
                }
                Text(
                    ledger.account(current)?.name ?: "(eliminada)", style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = if (accounts.size > 1) 0.dp else 12.dp, bottom = 8.dp, top = 8.dp),
                )
            }
            LazyColumn {
                items(options.filter { it.acc == current }) { k ->
                    ListItem(
                        headlineContent = { Text(ledger.category(k)?.name ?: "(eliminada)") },
                        trailingContent = { Monto(amountOf(k)) },
                        modifier = Modifier.clickable { onPick(k); close() },
                    )
                }
            }
        }
    }
}

@Composable
private fun Monto(cents: Long) = Text(
    money(cents),
    style = MaterialTheme.typography.bodyLarge.merge(androidx.compose.ui.text.TextStyle(fontFeatureSettings = "tnum")),
    color = if (cents < 0) colorNegativo() else MaterialTheme.colorScheme.onSurfaceVariant,
)
