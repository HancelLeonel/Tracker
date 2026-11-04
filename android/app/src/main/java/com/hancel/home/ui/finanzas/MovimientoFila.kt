package com.hancel.home.ui.finanzas

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hancel.home.core.money
import com.hancel.home.ui.tema.LocalSemantica

/** Números alineados (cifras del mismo ancho). */
val Tabular = TextStyle(fontFeatureSettings = "tnum")

@Composable
fun Monto(cents: Long, tono: Tono, style: TextStyle = MaterialTheme.typography.bodyLarge) {
    val (text, color) = when (tono) {
        Tono.OUT -> "−${money(cents)}" to MaterialTheme.colorScheme.onSurface
        Tono.IN -> "+${money(cents)}" to LocalSemantica.current.income
        Tono.NEUTRAL -> money(cents) to MaterialTheme.colorScheme.onSurface
    }
    Text(text, style = style.merge(Tabular), color = color, maxLines = 1)
}

@Composable
fun FilaMovimiento(title: String, sub: String, amount: Long, tono: Tono, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = if (sub.isNotEmpty()) ({ Text(sub, maxLines = 2, overflow = TextOverflow.Ellipsis) }) else null,
        trailingContent = { Monto(amount, tono) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@Composable
fun EncabezadoDia(label: String) {
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
    }
}
