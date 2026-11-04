package com.hancel.home.ui.tema

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/** Colores con significado que Material no trae: el ingreso va en verde (el gasto, en el color de texto normal). */
data class Semantica(val income: Color)

val LocalSemantica = staticCompositionLocalOf { Semantica(income = Color(0xFF1B6E3A)) }

/** Material You: los colores salen del fondo de pantalla (Android 12+); claro u oscuro según el sistema. */
@Composable
fun HomeTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val context = LocalContext.current
    val scheme = if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    val sem = Semantica(income = if (dark) Color(0xFF8AD5A3) else Color(0xFF1B6E3A))
    CompositionLocalProvider(LocalSemantica provides sem) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** Rojo solo para problemas (saldo negativo, vencido). */
@Composable fun colorNegativo() = MaterialTheme.colorScheme.error
