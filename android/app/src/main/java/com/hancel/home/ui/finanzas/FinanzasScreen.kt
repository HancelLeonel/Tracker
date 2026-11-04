package com.hancel.home.ui.finanzas

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.RowScope
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.core.CatKey
import com.hancel.home.core.Move
import com.hancel.home.core.money
import com.hancel.home.ui.comun.BarraSeccion
import com.hancel.home.ui.tema.colorNegativo

/** Lo que se puede hacer desde Finanzas. Una acción null deja su botón deshabilitado. */
data class FinanzasAcciones(
    val onAjustes: () -> Unit = {},
    val onCuenta: (String) -> Unit = {},
    val onGasto: ((preset: CatKey?, card: String?) -> Unit)? = null,
    val onIngreso: (() -> Unit)? = null,
    val onMover: (() -> Unit)? = null,
    val onPagarTarjeta: ((String) -> Unit)? = null,
    val onEditMove: ((Move) -> Unit)? = null,
    val onNuevaCuenta: (() -> Unit)? = null,
    val onEditCuenta: ((String) -> Unit)? = null,
    val onNuevaCategoria: ((String) -> Unit)? = null,
    val onEditCategoria: ((CatKey) -> Unit)? = null,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FinanzasScreen(vm: FinanzasViewModel, a: FinanzasAcciones) {
    val state by vm.state.collectAsStateWithLifecycle()
    val list = rememberLazyListState()
    Scaffold(Modifier.testTag("pantalla-finanzas"), topBar = { BarraSeccion("Finanzas", a.onAjustes) }) { p ->
        val s = state
        if (s == null) {
            Column(Modifier.fillMaxSize().padding(p), Arrangement.Center, Alignment.CenterHorizontally) { CircularProgressIndicator() }
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(p).testTag("lista-finanzas"), state = list, contentPadding = PaddingValues(bottom = 24.dp)) {
            if (s.cards.isEmpty()) {
                item {
                    OutlinedCard(Modifier.padding(16.dp).fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Crea tu primera cuenta (banco, efectivo, tarjeta…) y luego sus categorías con el dinero que tienes en cada una.")
                            Button(onClick = { a.onNuevaCuenta?.invoke() }, enabled = a.onNuevaCuenta != null) { Text("Crear cuenta") }
                        }
                    }
                }
                return@LazyColumn
            }
            item { Total(s, a) }
            items(s.cards, key = { "acc-" + it.acc.id }) { c ->
                when (c) {
                    is CuentaNormal -> TarjetaCuenta(c, vm, a)
                    is CuentaCredito -> TarjetaCredito(c, vm, a)
                }
            }
            item {
                Row(Modifier.padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { a.onNuevaCuenta?.invoke() }, enabled = a.onNuevaCuenta != null) {
                        Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Cuenta")
                    }
                }
            }
            if (s.days.isNotEmpty()) item { Text("Movimientos", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 0.dp)) }
            for (d in s.days) {
                stickyHeader(key = "dia-${d.date}") { EncabezadoDia(d.label) }
                items(d.rows, key = { "mov-" + it.move.id }) { r ->
                    FilaMovimiento(r.title, r.sub, r.amount, r.tono) { a.onEditMove?.invoke(r.move) }
                }
            }
        }
    }
}

@Composable
private fun Total(s: FinanzasState, a: FinanzasAcciones) {
    Card(Modifier.padding(16.dp).fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(if (s.totals.debt != 0L) "Dinero total (descontando tarjetas)" else "Dinero total", style = MaterialTheme.typography.labelLarge)
            Text(
                money(s.totals.net), style = MaterialTheme.typography.displaySmall.merge(Tabular),
                color = if (s.totals.net < 0) colorNegativo() else MaterialTheme.colorScheme.onSurface,
            )
            if (s.totals.debt != 0L) Text("En cuentas ${money(s.totals.cash)} · Deuda en tarjetas ${money(-s.totals.debt)}", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.padding(4.dp))
            AccionesRapidas(a)
        }
    }
}

@Composable
fun AccionesRapidas(a: FinanzasAcciones) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Accion("Gasto", Icons.Filled.Remove, a.onGasto?.let { f -> { f(null, null) } })
        Accion("Ingreso", Icons.Filled.Add, a.onIngreso)
        Accion("Mover", Icons.AutoMirrored.Filled.CompareArrows, a.onMover)
    }
}

/**
 * Botón de acción rápida con el icono arriba y el texto debajo: con el icono al lado y el relleno lateral de un
 * botón normal, en un teléfono angosto con letra grande el texto se partía en dos líneas.
 */
@Composable
private fun RowScope.Accion(text: String, icon: ImageVector, onClick: (() -> Unit)?) {
    FilledTonalButton(
        onClick = { onClick?.invoke() }, enabled = onClick != null, modifier = Modifier.weight(1f),
        shape = MaterialTheme.shapes.medium,
        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 10.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null)
            Text(text, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Cabecera(name: String, sub: @Composable () -> Unit, collapsed: Boolean, label: String, accId: String, vm: FinanzasViewModel, a: FinanzasAcciones) {
    Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(
            Modifier.weight(1f).clickable { a.onCuenta(accId) }.semantics { contentDescription = "Ver movimientos de $name" }.padding(12.dp),
        ) {
            Text(name, style = MaterialTheme.typography.titleMedium)
            sub()
        }
        IconButton(onClick = { vm.toggle(accId) }) {
            Icon(if (collapsed) Icons.Filled.ExpandMore else Icons.Filled.ExpandLess, contentDescription = "${if (collapsed) "Mostrar" else "Ocultar"} $label de $name")
        }
        IconButton(onClick = { a.onEditCuenta?.invoke(accId) }, enabled = a.onEditCuenta != null) { Icon(Icons.Outlined.Edit, contentDescription = "Editar $name") }
    }
}

@Composable
private fun TarjetaCuenta(c: CuentaNormal, vm: FinanzasViewModel, a: FinanzasAcciones) {
    OutlinedCard(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth()) {
        Cabecera(
            c.acc.name,
            {
                Row {
                    Text("Total ", style = MaterialTheme.typography.bodyMedium)
                    Text(money(c.total), style = MaterialTheme.typography.bodyMedium.merge(Tabular), color = if (c.total < 0) colorNegativo() else MaterialTheme.colorScheme.onSurface)
                    Text(" · ${c.cats.size} ${if (c.cats.size == 1) "categoría" else "categorías"}", style = MaterialTheme.typography.bodyMedium)
                }
            },
            c.collapsed, "categorías", c.acc.id, vm, a,
        )
        if (!c.collapsed) {
            if (c.cats.isEmpty()) Text("Sin categorías todavía.", Modifier.padding(16.dp, 0.dp, 16.dp, 8.dp), style = MaterialTheme.typography.bodyMedium)
            c.cats.forEach { r ->
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).clickable(enabled = a.onGasto != null) { a.onGasto?.invoke(r.key, null) }.padding(16.dp, 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(r.name, Modifier.weight(1f))
                            Text(money(r.balance), style = MaterialTheme.typography.bodyLarge.merge(Tabular), color = if (r.balance < 0) colorNegativo() else MaterialTheme.colorScheme.onSurface)
                        }
                        if (r.reserved != 0L) Text(
                            "${money(r.reserved)} por pagar a tarjeta · libre ${money(r.balance - r.reserved)}",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = { a.onEditCategoria?.invoke(r.key) }, enabled = a.onEditCategoria != null) {
                        Icon(Icons.Outlined.Edit, contentDescription = "Editar ${r.name}")
                    }
                }
            }
            Row(Modifier.padding(12.dp, 4.dp, 12.dp, 12.dp)) {
                OutlinedButton(onClick = { a.onNuevaCategoria?.invoke(c.acc.id) }, enabled = a.onNuevaCategoria != null) {
                    Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Categoría")
                }
            }
        }
    }
}

@Composable
private fun TarjetaCredito(c: CuentaCredito, vm: FinanzasViewModel, a: FinanzasAcciones) {
    OutlinedCard(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth()) {
        Cabecera(
            c.acc.name,
            {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CreditCard, null, Modifier.padding(end = 6.dp))
                    val owe = c.balance < 0
                    Text(
                        (if (owe) "Debes " else "A favor ") + money(Math.abs(c.balance)) + (c.available?.let { " · Crédito disponible ${money(it)}" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            },
            c.collapsed, "detalle", c.acc.id, vm, a,
        )
        if (!c.collapsed && (c.pending.isNotEmpty() || c.untracked > 0)) {
            (c.pending + if (c.untracked > 0) listOf("Sin categoría (saldo inicial)" to c.untracked) else emptyList()).forEach { (label, v) ->
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp)) {
                    Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text(money(v), style = MaterialTheme.typography.bodyMedium.merge(Tabular))
                }
            }
        }
        Row(Modifier.padding(12.dp, 4.dp, 12.dp, 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { a.onPagarTarjeta?.invoke(c.acc.id) }, enabled = a.onPagarTarjeta != null) { Text("Pagar tarjeta") }
            OutlinedButton(onClick = { a.onGasto?.invoke(null, c.acc.id) }, enabled = a.onGasto != null) {
                Icon(Icons.Filled.Remove, null); Spacer(Modifier.width(4.dp)); Text("Compra")
            }
        }
    }
}
