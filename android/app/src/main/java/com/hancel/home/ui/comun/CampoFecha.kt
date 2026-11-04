package com.hancel.home.ui.comun

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.hancel.home.core.fmtDateY
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Campo de fecha de calendario: tocarlo abre `DialogoFecha`. */
@Composable
fun CampoFecha(value: LocalDate, onChange: (LocalDate) -> Unit, modifier: Modifier = Modifier, label: String = "Fecha") {
    var open by rememberSaveable { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(
            value = fmtDateY(value),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { Icon(Icons.Outlined.CalendarMonth, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        // Capa encima del campo: tocar en cualquier parte abre el selector (un campo de solo lectura no siempre avisa del toque).
        Box(Modifier.matchParentSize().clickable(onClickLabel = "Elegir") { open = true })
    }
    if (open) DialogoFecha(value, onPick = { onChange(it); open = false }, onDismiss = { open = false })
}

/**
 * Selector de fecha en un diálogo. Con `onClear` aparece «Quitar fecha» (fechas límite opcionales de Listas).
 * El DatePicker trabaja en milisegundos UTC: la conversión se hace en UTC para que la fecha no se corra un día.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DialogoFecha(initial: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit, onClear: (() -> Unit)? = null) {
    val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) } ?: onDismiss()
            }) { Text("Aceptar") }
        },
        dismissButton = {
            Row {
                if (onClear != null) TextButton(onClick = onClear) { Text("Quitar fecha") }
                TextButton(onClick = onDismiss) { Text("Cancelar") }
            }
        },
    ) { DatePicker(state) }
}
