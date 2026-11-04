package com.hancel.home.ui.inicio

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.core.CatKey
import com.hancel.home.core.pl
import com.hancel.home.ui.comun.BarraSeccion
import com.hancel.home.ui.finanzas.AccionesRapidas
import com.hancel.home.ui.finanzas.FinanzasAcciones
import com.hancel.home.ui.listas.FilaTarea

/** Lo que se puede hacer desde Inicio. */
data class InicioAcciones(
    val onAjustes: () -> Unit = {},
    val onAbrirLista: (String) -> Unit = {},
    val onAgenda: () -> Unit = {},
    val onGasto: ((preset: CatKey?, card: String?) -> Unit)? = null,
    val onIngreso: (() -> Unit)? = null,
    val onMover: (() -> Unit)? = null,
)

@Composable
fun InicioScreen(vm: InicioViewModel, a: InicioAcciones) {
    val s by vm.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { vm.salir() }
    Scaffold(Modifier.testTag("pantalla-inicio"), topBar = { BarraSeccion("", a.onAjustes) }) { p ->
        val st = s ?: return@Scaffold
        Column(
            Modifier.fillMaxSize().padding(p).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column {
                Text(st.date, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(st.greeting, style = MaterialTheme.typography.headlineMedium)
            }
            Card(
                Modifier.fillMaxWidth().testTag("tareas-de-hoy"),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
            ) {
                Column(Modifier.padding(start = 8.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)) {
                    Text(
                        "Tareas de hoy" + if (st.pending > 0) " · ${st.pending}" else "",
                        Modifier.padding(start = 8.dp, bottom = 4.dp), style = MaterialTheme.typography.titleMedium,
                    )
                    if (st.shown.isEmpty()) Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("Nada pendiente para hoy.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    st.shown.forEach { t ->
                        FilaTarea(
                            t.task, st.today, done = t.done,
                            onCheck = { vm.toggle(t.task.list.id, t.task.item.id) },
                            onOpen = { a.onAbrirLista(t.task.list.id) },
                        )
                    }
                    if (st.more > 0) TextButton(onClick = a.onAgenda, modifier = Modifier.fillMaxWidth()) {
                        Text("Ver ${pl(st.more, "más", "más")} en Listas")
                    }
                }
            }
            AccionesRapidas(FinanzasAcciones(onGasto = a.onGasto, onIngreso = a.onIngreso, onMover = a.onMover))
            Spacer(Modifier.padding(8.dp))
        }
    }
}
