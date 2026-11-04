package com.hancel.home.ui.ajustes

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.ui.comun.Aviso
import com.hancel.home.ui.comun.BarraVolver
import com.hancel.home.ui.comun.Confirmar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun AjustesScreen(vm: AjustesViewModel, onBack: () -> Unit, onTipos: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snack = remember { SnackbarHostState() }
    val state by vm.importState.collectAsStateWithLifecycle()
    var confirmWipe by rememberSaveable { mutableStateOf(false) }

    val abrir = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { context.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() } } }
                .onSuccess(vm::preview).onFailure(vm::readError)
        }
    }
    val guardar = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        if (uri != null) scope.launch {
            val ok = runCatching {
                val text = vm.exportText()
                withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)!!.use { it.write(text.toByteArray()) } }
            }.isSuccess
            snack.showSnackbar(if (ok) "Respaldo guardado" else "No se pudo guardar el respaldo")
        }
    }

    LaunchedEffect(state) {
        if (state is ImportState.Done) {
            vm.dismiss()
            snack.showSnackbar("Respaldo importado")
        }
    }

    Scaffold(topBar = { BarraVolver("Ajustes", onBack) }, snackbarHost = { SnackbarHost(snack) }) { p ->
        Column(Modifier.fillMaxSize().padding(p).verticalScroll(rememberScrollState()).testTag("pantalla-ajustes")) {
            Fila(Icons.Outlined.Category, "Tipos de gasto", "En qué se usa el dinero", onTipos)
            HorizontalDivider()
            Fila(Icons.Outlined.Share, "Compartir respaldo", "Envíalo a Drive, correo o donde lo guardes") {
                scope.launch { compartir(context, vm.exportName(), vm.exportText()) }
            }
            Fila(Icons.Outlined.FileDownload, "Guardar respaldo en Archivos", null) { guardar.launch(vm.exportName()) }
            Fila(Icons.Outlined.FileUpload, "Importar respaldo", "De Home o de Tracker; reemplaza todo") {
                abrir.launch(arrayOf("application/json", "text/plain", "application/octet-stream"))
            }
            HorizontalDivider()
            Fila(Icons.Outlined.DeleteForever, "Borrar todo", null) { confirmWipe = true }
            HorizontalDivider()
            val info = remember { context.packageManager.getPackageInfo(context.packageName, 0) }
            Fila(Icons.Outlined.Info, "Versión ${info.versionName} (${info.longVersionCode})", null, null)
        }
    }

    when (val s = state) {
        is ImportState.Preview -> {
            val (cuentas, total) = s.summary.lineas()
            AlertDialog(
                onDismissRequest = vm::dismiss,
                title = { Text("¿Importar este respaldo?") },
                text = { Text("$cuentas\n$total\n\nReemplaza todo lo que hay ahora en este teléfono.") },
                confirmButton = { TextButton(onClick = vm::confirmImport) { Text("Importar") } },
                dismissButton = { TextButton(onClick = vm::dismiss) { Text("Cancelar") } },
            )
        }
        is ImportState.Error -> Aviso("No se pudo importar", s.msg, vm::dismiss)
        else -> Unit
    }
    if (confirmWipe) {
        Confirmar(
            title = "¿Borrar todo?",
            text = "Se borrarán todas las cuentas, movimientos, listas y plantillas de este teléfono. Exporta un respaldo antes si lo necesitas.",
            confirm = "Borrar",
            onConfirm = { confirmWipe = false; vm.wipe() },
            onDismiss = { confirmWipe = false },
        )
    }
}

@Composable
private fun Fila(icon: ImageVector, title: String, sub: String?, onClick: (() -> Unit)?) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = sub?.let { { Text(it) } },
        leadingContent = { Icon(icon, contentDescription = null) },
        modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
    )
}

/** Comparte el respaldo como un .json real por la hoja de compartir de Android. */
private suspend fun compartir(context: Context, name: String, text: String) {
    val file = withContext(Dispatchers.IO) {
        File(context.cacheDir, "respaldos").apply { mkdirs() }.resolve(name).apply { writeText(text) }
    }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.archivos", file)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, "Respaldo de Home")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, "Compartir respaldo"))
}
