package com.hancel.home.ui.finanzas

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.CatKey
import com.hancel.home.ui.RelojPrueba
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.verEnLista
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate

/** Pantalla de un teléfono común (la de Robolectric por omisión mide 320×470 dp y la lista perezosa no compone lo de abajo). */
@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class FinanzasTest {
    @get:Rule val rule = createComposeRule()
    private val reloj = RelojPrueba()
    private val deps = depsDePrueba(reloj)
    private val hoy = LocalDate.of(2026, 11, 3)

    private val store = androidx.lifecycle.ViewModelStore()
    private inline fun <reified T : androidx.lifecycle.ViewModel> modelo(crossinline f: () -> T): T =
        androidx.lifecycle.ViewModelProvider(store, object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST") override fun <V : androidx.lifecycle.ViewModel> create(modelClass: Class<V>) = f() as V
        })[T::class.java]

    /** Los modelos van en un ViewModelStore que se limpia: si no, sus corrutinas siguen vivas en la prueba siguiente. */
    @org.junit.After fun cerrar() = store.clear()

    private fun abrir(onCuenta: (String) -> Unit = {}) {
        val vm = modelo { FinanzasViewModel(deps.dinero, deps.ajustes, deps.hoy) }
        rule.setContent { HomeTheme { FinanzasScreen(vm, FinanzasAcciones(onCuenta = onCuenta)) } }
    }

    private fun ver(text: String, substring: Boolean = true) = rule.verEnLista("lista-finanzas", text, substring)

    @Test fun sin_cuentas_invita_a_crear_una() {
        abrir()
        rule.esperarTexto("Crea tu primera cuenta")
    }

    @Test fun muestra_total_y_deuda() {
        deps.sembrarCuentas()
        abrir()
        rule.esperarTexto("Q670.00")
        rule.onNodeWithText("En cuentas Q700.00 · Deuda en tarjetas Q30.00", substring = true).assertIsDisplayed()
    }

    @Test fun categoria_con_apartado_muestra_libre() {
        deps.sembrarCuentas()
        deps.gasto("g", 1000, COMIDA, hoy, card = "visa")
        abrir()
        ver("Q10.00 por pagar a tarjeta · libre Q490.00")
    }

    @Test fun tarjeta_muestra_desglose_y_saldo_inicial() {
        deps.sembrarCuentas()
        deps.gasto("g", 1000, COMIDA, hoy, card = "visa")
        abrir()
        ver("Debes Q40.00 · Crédito disponible Q960.00")
        ver("Banco / Comida", substring = false)
        ver("Sin categoría (saldo inicial)")
    }

    @Test fun encabezados_hoy_ayer_y_hoy_se_actualiza_al_cambiar_el_dia() {
        deps.sembrarCuentas()
        deps.gasto("a", 100, COMIDA, hoy, title = "Pan")
        deps.gasto("b", 100, COMIDA, hoy.minusDays(1), title = "Café")
        abrir()
        ver("Hoy", substring = false)
        ver("Ayer", substring = false)
        reloj.adelantarDias(1)
        deps.hoy.refresh()
        ver("2 nov", substring = false)
        ver("Ayer", substring = false)
        rule.esperar { rule.onAllNodes(hasText("Hoy", substring = false), useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
    }

    @Test fun plegar_cuenta() {
        deps.sembrarCuentas()
        abrir()
        rule.esperarTexto("Renta")
        rule.onNodeWithContentDescription("Ocultar categorías de Banco").performClick()
        rule.esperar { rule.onAllNodes(hasText("Renta")).fetchSemanticsNodes().isEmpty() }
        assertEquals(setOf("banco"), com.hancel.home.ui.bloquear { deps.ajustes.collapsed.first() })
    }

    @Test fun nombre_de_cuenta_abre_su_detalle() {
        deps.sembrarCuentas()
        var abierta: String? = null
        abrir(onCuenta = { abierta = it })
        rule.esperarTexto("Renta")
        rule.onNodeWithContentDescription("Ver movimientos de Banco").performClick()
        assertEquals("banco", abierta)
    }

    @Test fun detalle_de_cuenta() {
        deps.sembrarCuentas()
        deps.gasto("g", 1500, COMIDA, hoy, card = "visa", title = "Súper")
        deps.gasto("h", 200, RENTA, hoy, title = "Luz")
        val vm = modelo { CuentaViewModel("banco", deps.dinero, deps.hoy) }
        rule.setContent { HomeTheme { CuentaScreen(vm, onBack = {}, onMove = {}) } }
        rule.esperarTexto("Súper")
        rule.onNodeWithText("Comida · con tarjeta", substring = true).assertIsDisplayed()
        rule.onNodeWithText("−Q2.00").assertIsDisplayed()
        rule.onNodeWithText("Q15.00").assertIsDisplayed()
        rule.onNodeWithText("Q698.00").assertIsDisplayed() // total de la cuenta: 500 + 198
    }

    @Test fun movimiento_de_categoria_borrada_dice_eliminada() {
        deps.sembrarCuentas()
        deps.gasto("g", 100, CatKey("banco", "borrada"), hoy, title = "Viejo")
        abrir()
        ver("(eliminada)")
    }
}
