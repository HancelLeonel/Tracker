package com.hancel.home.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.ui.tema.HomeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

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

    @Test fun estado_se_conserva_al_recrear() {
        val deps = depsDePrueba()
        val tester = StateRestorationTester(rule)
        tester.setContent { HomeTheme { HomeRoot(deps) } }
        rule.onNodeWithText("Finanzas").performClick()
        tester.emulateSavedInstanceStateRestore()
        rule.onNodeWithTag("pantalla-finanzas").assertIsDisplayed()
    }
}
