package com.hancel.home.ui.comun

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Una opción de un selector: `value` es lo que se guarda (null = ninguna) y `label` lo que se ve. */
data class Opcion(val value: String?, val label: String)

/** Selector de una lista corta en una hoja inferior (el menú nativo ignora el tema; igual que la PWA). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectorOpcion(selected: String?, options: List<Opcion>, label: String, onPick: (String?) -> Unit, modifier: Modifier = Modifier) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(
            value = options.firstOrNull { it.value == selected }?.label ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(Modifier.matchParentSize().clickable(onClickLabel = "Elegir") { open = true })
    }
    if (!open) return
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    ModalBottomSheet(onDismissRequest = { open = false }, sheetState = sheet) {
        Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp, 0.dp, 16.dp, 8.dp))
        LazyColumn {
            items(options) { o ->
                ListItem(
                    headlineContent = { Text(o.label) },
                    trailingContent = if (o.value == selected) ({ Icon(Icons.Filled.Check, contentDescription = "Elegido") }) else null,
                    modifier = Modifier.clickable {
                        onPick(o.value)
                        scope.launch { sheet.hide() }.invokeOnCompletion { open = false }
                    },
                )
            }
        }
    }
}
