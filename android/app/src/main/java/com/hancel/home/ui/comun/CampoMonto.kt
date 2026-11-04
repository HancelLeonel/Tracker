package com.hancel.home.ui.comun

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.hancel.home.core.editMoney
import com.hancel.home.core.parseMoney

/**
 * Campo de monto en quetzales: acepta coma o punto decimal. Guarda el texto tal como se escribe (si no, «12,» se
 * volvería «12» bajo el dedo) y solo lo reescribe cuando el valor cambia desde fuera.
 */
@Composable
fun CampoMonto(
    value: Long?,
    onChange: (Long?) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    enabled: Boolean = true,
    imeAction: ImeAction = ImeAction.Next,
) {
    var text by rememberSaveable { mutableStateOf(value?.let(::editMoney) ?: "") }
    LaunchedEffect(value) { if (parseMoney(text) != value) text = value?.let(::editMoney) ?: "" }
    val invalid = text.isNotBlank() && parseMoney(text) == null
    OutlinedTextField(
        value = text,
        onValueChange = { t -> text = t.take(16); onChange(parseMoney(text)) },
        label = { Text(label) },
        prefix = { Text("Q") },
        singleLine = true,
        enabled = enabled,
        isError = invalid || error != null,
        supportingText = (if (invalid) "Escribe un monto válido." else error)?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = imeAction),
        modifier = modifier,
    )
}
