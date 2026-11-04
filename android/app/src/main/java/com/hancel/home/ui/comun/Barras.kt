package com.hancel.home.ui.comun

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable

/** Barra superior de una sección principal: título, acciones propias y Ajustes. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarraSeccion(title: String, onAjustes: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title) },
        actions = {
            actions()
            IconButton(onClick = onAjustes) { Icon(Icons.Outlined.Settings, contentDescription = "Ajustes") }
        },
    )
}

/** Barra superior de una pantalla de detalle o formulario: volver, título y acciones. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarraVolver(title: String, onBack: () -> Unit, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver") } },
        actions = actions,
    )
}
