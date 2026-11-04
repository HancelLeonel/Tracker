package com.hancel.home.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.hancel.home.Deps
import com.hancel.home.core.Ledger
import com.hancel.home.core.Move
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hancel.home.ui.ajustes.AjustesScreen
import com.hancel.home.ui.ajustes.AjustesViewModel
import com.hancel.home.ui.comun.BarraSeccion
import com.hancel.home.ui.ajustes.TiposScreen
import com.hancel.home.ui.ajustes.TiposViewModel
import android.net.Uri
import androidx.navigation.NavType
import androidx.navigation.navArgument
import com.hancel.home.core.CatKey
import com.hancel.home.core.MoveType
import com.hancel.home.ui.finanzas.FlujoFormScreen
import com.hancel.home.ui.finanzas.FlujoViewModel
import com.hancel.home.ui.finanzas.GastoFormScreen
import com.hancel.home.ui.finanzas.PagoTarjetaFormScreen
import com.hancel.home.ui.finanzas.PagoTarjetaViewModel
import com.hancel.home.ui.finanzas.GastoViewModel
import com.hancel.home.ui.finanzas.CategoriaFormScreen
import com.hancel.home.ui.finanzas.CategoriaFormViewModel
import com.hancel.home.ui.finanzas.CuentaFormScreen
import com.hancel.home.ui.finanzas.CuentaFormViewModel
import com.hancel.home.ui.finanzas.CuentaScreen
import com.hancel.home.ui.finanzas.CuentaViewModel
import com.hancel.home.ui.finanzas.FinanzasAcciones
import com.hancel.home.ui.finanzas.FinanzasScreen
import com.hancel.home.ui.finanzas.FinanzasViewModel
import com.hancel.home.ui.comun.vm

/** Destinos de la barra inferior. */
enum class Tab(val route: String, val label: String, val on: ImageVector, val off: ImageVector) {
    INICIO("inicio", "Inicio", Icons.Filled.Home, Icons.Outlined.Home),
    FINANZAS("finanzas", "Finanzas", Icons.Filled.AccountBalanceWallet, Icons.Outlined.AccountBalanceWallet),
    LISTAS("listas", "Listas", Icons.Filled.Checklist, Icons.Outlined.Checklist),
}

/** Rutas de pantalla completa (formularios): sin barra inferior. */
private fun isForm(route: String?) = route?.startsWith("form/") == true

/** Cambia de pestaña como la barra inferior: sin apilar y conservando el estado de cada una. */
fun NavHostController.irATab(tab: Tab) = navigate(tab.route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@Composable
fun HomeRoot(deps: Deps) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route

    // Una instalación nueva recibe los tipos de gasto de siempre (un respaldo importado trae los suyos).
    LaunchedEffect(Unit) { deps.dinero.seedKindsIfEmpty() }

    // «Hoy» se recalcula al volver a la app y cuando el sistema avisa que cambió el día.
    LifecycleResumeEffect(Unit) { deps.hoy.refresh(); onPauseOrDispose { } }
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val r = object : BroadcastReceiver() { override fun onReceive(c: Context?, i: Intent?) = deps.hoy.refresh() }
        val f = IntentFilter().apply { addAction(Intent.ACTION_DATE_CHANGED); addAction(Intent.ACTION_TIMEZONE_CHANGED) }
        context.registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED)
        onDispose { context.unregisterReceiver(r) }
    }

    Scaffold(
        bottomBar = {
            if (!isForm(route)) NavigationBar {
                val current = entry?.destination?.hierarchy()?.firstNotNullOfOrNull { d -> Tab.entries.firstOrNull { it.route == d } }
                Tab.entries.forEach { t ->
                    val sel = current == t
                    NavigationBarItem(
                        selected = sel,
                        onClick = { nav.irATab(t) },
                        icon = { Icon(if (sel) t.on else t.off, contentDescription = null) },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { pad ->
        NavHost(nav, startDestination = Tab.INICIO.route, modifier = Modifier.padding(bottom = pad.calculateBottomPadding())) {
            grafo(nav, deps)
        }
    }
}

/** Rutas que pertenecen a cada pestaña (por prefijo), para marcar la barra en las pantallas de detalle. */
private fun androidx.navigation.NavDestination.hierarchy(): List<String> {
    val r = route ?: return emptyList()
    return listOf(r.substringBefore('/').substringBefore('?'))
}

private fun androidx.navigation.NavGraphBuilder.grafo(nav: NavHostController, deps: Deps) {
    val ajustes = { nav.navigate("ajustes") }
    composable(Tab.INICIO.route) { Seccion("pantalla-inicio", "Inicio", ajustes) }
    composable(Tab.FINANZAS.route) {
        val model = vm { FinanzasViewModel(deps.dinero, deps.ajustes, deps.hoy) }
        val ledger by deps.dinero.ledger.collectAsStateWithLifecycle(null)
        FinanzasScreen(
            model,
            FinanzasAcciones(
                onAjustes = ajustes,
                onCuenta = { nav.navigate("finanzas/cuenta/$it") },
                onNuevaCuenta = { nav.navigate("form/cuenta") },
                onEditCuenta = { nav.navigate("form/cuenta/$it") },
                onNuevaCategoria = { nav.navigate("form/categoria/$it") },
                onEditCategoria = { nav.navigate("form/categoria/${it.acc}/${it.cat}") },
                onGasto = { preset, card -> nav.navigate(rutaGasto(preset = preset, card = card)) },
                onIngreso = { nav.navigate("form/flujo/ingreso") },
                onMover = { nav.navigate("form/flujo/mover") },
                onPagarTarjeta = { nav.navigate("form/pago/${Uri.encode(it)}") },
                onEditMove = { m -> nav.navigate(rutaMovimiento(m, ledger)) },
            ),
        )
    }
    composable(
        "form/gasto?id={id}&acc={acc}&cat={cat}&card={card}",
        arguments = listOf("id", "acc", "cat", "card").map { n -> navArgument(n) { type = NavType.StringType; nullable = true; defaultValue = null } },
    ) { e ->
        val a = e.arguments
        val id = a?.getString("id")
        val preset = a?.getString("acc")?.let { acc -> a.getString("cat")?.let { CatKey(acc, it) } }
        val card = a?.getString("card")
        val model = vm(e.id) { h -> GastoViewModel(h, deps.dinero, deps.ajustes, deps.hoy, deps.clock, id, preset, card) }
        GastoFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable(
        "form/flujo/{type}?id={id}",
        arguments = listOf(navArgument("id") { type = NavType.StringType; nullable = true; defaultValue = null }),
    ) { e ->
        val type = if (e.arguments?.getString("type") == "mover") MoveType.TRANSFER else MoveType.INCOME
        val id = e.arguments?.getString("id")
        val model = vm(e.id) { h -> FlujoViewModel(h, deps.dinero, deps.ajustes, deps.hoy, deps.clock, type, id) }
        FlujoFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable(
        "form/pago/{card}?id={id}",
        arguments = listOf(navArgument("id") { type = NavType.StringType; nullable = true; defaultValue = null }),
    ) { e ->
        val card = e.arguments?.getString("card").orEmpty()
        val id = e.arguments?.getString("id")
        val model = vm(e.id) { h -> PagoTarjetaViewModel(h, deps.dinero, deps.hoy, deps.clock, card, id) }
        PagoTarjetaFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable("form/cuenta") {
        val model = vm { h -> CuentaFormViewModel(h, deps.dinero, null) }
        CuentaFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable("form/cuenta/{id}") { e ->
        val id = e.arguments?.getString("id").orEmpty()
        val model = vm(id) { h -> CuentaFormViewModel(h, deps.dinero, id) }
        CuentaFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable("form/categoria/{acc}") { e ->
        val acc = e.arguments?.getString("acc").orEmpty()
        val model = vm(acc) { h -> CategoriaFormViewModel(h, deps.dinero, acc, null) }
        CategoriaFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable("form/categoria/{acc}/{cat}") { e ->
        val acc = e.arguments?.getString("acc").orEmpty()
        val cat = e.arguments?.getString("cat").orEmpty()
        val model = vm("$acc/$cat") { h -> CategoriaFormViewModel(h, deps.dinero, acc, cat) }
        CategoriaFormScreen(model, onDone = { nav.popBackStack() })
    }
    composable("finanzas/cuenta/{id}") { e ->
        val id = e.arguments?.getString("id").orEmpty()
        val model = vm(id) { CuentaViewModel(id, deps.dinero, deps.hoy) }
        val ledger by deps.dinero.ledger.collectAsStateWithLifecycle(null)
        CuentaScreen(model, onBack = { nav.popBackStack() }, onMove = { m -> nav.navigate(rutaMovimiento(m, ledger)) })
    }
    composable(Tab.LISTAS.route) { Seccion("pantalla-listas", "Listas", ajustes) }
    composable("ajustes") {
        val model = vm { AjustesViewModel(deps.respaldo, deps.clock) }
        AjustesScreen(model, onBack = { nav.popBackStack() }, onTipos = { nav.navigate("ajustes/tipos") })
    }
    composable("ajustes/tipos") {
        val model = vm { TiposViewModel(deps.dinero) }
        TiposScreen(model, onBack = { nav.popBackStack() })
    }
}

/**
 * Formulario para editar un movimiento según su tipo. Una transferencia hacia una tarjeta es su pago (como en la PWA,
 * que abre payCardForm); si el ledger aún no cargó se trata como mover dinero.
 */
fun rutaMovimiento(m: Move, l: Ledger?): String {
    val id = Uri.encode(m.id)
    val to = m.to
    return when (m.type) {
        MoveType.EXPENSE -> rutaGasto(id = m.id)
        MoveType.INCOME -> "form/flujo/ingreso?id=$id"
        MoveType.TRANSFER ->
            if (to != null && l?.account(to.acc)?.isCredit == true) "form/pago/${Uri.encode(to.acc)}?id=$id" else "form/flujo/mover?id=$id"
    }
}

/** Ruta del formulario de gasto: nuevo (con categoría o tarjeta ya elegidas) o para editar `id`. */
fun rutaGasto(id: String? = null, preset: CatKey? = null, card: String? = null): String {
    val q = listOfNotNull(
        id?.let { "id=${Uri.encode(it)}" },
        preset?.let { "acc=${Uri.encode(it.acc)}&cat=${Uri.encode(it.cat)}" },
        card?.let { "card=${Uri.encode(it)}" },
    )
    return "form/gasto" + if (q.isEmpty()) "" else "?" + q.joinToString("&")
}

/** Pantalla provisional de una sección (se reemplaza en las tareas siguientes). */
@Composable
private fun Seccion(tag: String, title: String, onAjustes: () -> Unit) {
    Scaffold(topBar = { BarraSeccion(title, onAjustes) }) { p ->
        Box(Modifier.fillMaxSize().padding(p).testTag(tag))
    }
}
