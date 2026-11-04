package com.hancel.home.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.ui.finanzas.sembrarCuentas
import com.hancel.home.ui.tema.HomeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@org.robolectric.annotation.Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class NavegacionTest {
    @get:Rule val rule = createComposeRule()

    @Test fun arranca_en_inicio_y_la_barra_cambia_de_destino() {
        val deps = depsDePrueba()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithTag("pantalla-inicio").assertIsDisplayed()
        rule.onNodeWithText("Finanzas").performClick()
        rule.onNodeWithTag("pantalla-finanzas").assertIsDisplayed()
        rule.onNodeWithText("Listas").performClick()
        rule.onNodeWithTag("pantalla-listas").assertIsDisplayed()
        rule.onNodeWithText("Inicio").performClick()
        rule.onNodeWithTag("pantalla-inicio").assertIsDisplayed()
    }

    @Test fun ajustes_desde_la_barra_superior_y_volver() {
        val deps = depsDePrueba()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithContentDescription("Ajustes").performClick()
        rule.onNodeWithTag("pantalla-ajustes").assertIsDisplayed()
        rule.onNodeWithContentDescription("Volver").performClick()
        rule.onNodeWithTag("pantalla-inicio").assertIsDisplayed()
    }

    @Test fun cuenta_abre_su_detalle_y_vuelve_a_finanzas() {
        val deps = depsDePrueba()
        deps.sembrarCuentas()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        rule.esperar { rule.onAllNodes(hasContentDescription("Ver movimientos de Banco")).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithContentDescription("Ver movimientos de Banco").performClick()
        rule.onNodeWithTag("pantalla-cuenta").assertIsDisplayed()
        rule.esperarTexto("Total")
        rule.onNodeWithContentDescription("Volver").performClick()
        rule.onNodeWithTag("pantalla-finanzas").assertIsDisplayed()
    }

    @Test fun crear_cuenta_y_categoria_desde_finanzas() {
        val deps = depsDePrueba()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        rule.esperarTexto("Crear cuenta")
        rule.onNodeWithText("Crear cuenta").performClick()
        rule.onNodeWithText("Nombre").performTextInput("Efectivo")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("Sin categorías todavía.")
        rule.onNodeWithText("Categoría").performClick()
        rule.esperarTexto("Nueva categoría en Efectivo")
        rule.onNodeWithText("Para qué es el dinero").performTextInput("Bolsillo")
        rule.onNodeWithText("Dinero real que hay ahora").performTextInput("120")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { rule.onAllNodes(hasTestTag("lista-finanzas")).fetchSemanticsNodes().isNotEmpty() }
        rule.esperarTexto("Bolsillo")
        rule.esperarTexto("Q120.00", substring = false)
    }

    @Test fun tipos_de_gasto_se_siembran_y_se_abren_desde_ajustes() {
        val deps = depsDePrueba()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithContentDescription("Ajustes").performClick()
        rule.onNodeWithText("Tipos de gasto").performClick()
        rule.esperarTexto("Suscripciones")
        rule.onNodeWithTag("pantalla-tipos").assertIsDisplayed()
    }

    @Test fun botones_de_finanzas_abren_sus_formularios() {
        val deps = depsDePrueba()
        deps.sembrarCuentas()
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        rule.esperarTexto("Ingreso")
        for ((boton, titulo) in listOf("Gasto" to "Nuevo gasto", "Ingreso" to "Ingreso", "Mover" to "Mover dinero")) {
            rule.onNodeWithText(boton).performClick()
            rule.esperar { rule.onAllNodes(hasText("Guardar")).fetchSemanticsNodes().isNotEmpty() }
            rule.esperarTexto(titulo, substring = false)
            rule.onNodeWithContentDescription("Volver").performClick()
            rule.esperar { rule.onAllNodes(hasTestTag("lista-finanzas")).fetchSemanticsNodes().isNotEmpty() }
        }
        rule.verEnLista("lista-finanzas", "Pagar tarjeta")
        rule.onNodeWithText("Pagar tarjeta").performClick()
        rule.esperarTexto("Pagar Visa")
    }

    @Test fun tocar_un_pago_de_tarjeta_abre_su_formulario() {
        val deps = depsDePrueba()
        deps.sembrarCuentas()
        bloquear {
            deps.dinero.saveMove(com.hancel.home.core.Move("p", 1, com.hancel.home.core.MoveType.TRANSFER, deps.hoy.flow.value, "", "Abono",
                null, null, com.hancel.home.core.CatKey("visa", "deuda"), 1000, listOf(com.hancel.home.core.Part(com.hancel.home.ui.finanzas.COMIDA, 1000))))
        }
        rule.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        rule.verEnLista("lista-finanzas", "Abono")
        rule.onNodeWithText("Abono").performClick()
        rule.esperarTexto("Editar pago de Visa")
    }

    @Test fun estado_se_conserva_al_recrear() {
        val deps = depsDePrueba()
        val tester = StateRestorationTester(rule)
        tester.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        tester.emulateSavedInstanceStateRestore()
        rule.onNodeWithTag("pantalla-finanzas").assertIsDisplayed()
    }
}
