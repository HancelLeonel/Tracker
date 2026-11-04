package com.hancel.home.ui.ajustes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.pwaMinimo
import com.hancel.home.ui.tema.HomeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AjustesTest {
    @get:Rule val rule = createComposeRule()

    @Test fun importar_muestra_resumen_y_reemplaza() {
        val deps = depsDePrueba()
        val vm = AjustesViewModel(deps.respaldo, deps.clock)
        rule.setContent { HomeTheme { AjustesScreen(vm, onBack = {}, onTipos = {}) } }
        vm.preview(pwaMinimo())
        rule.esperar { vm.importState.value is ImportState.Preview }
        rule.onNodeWithText("2 cuentas · 3 categorías · 5 movimientos · 2 listas · 1 plantilla", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Dinero total Q640.50", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Importar").performClick()
        rule.esperar { vm.importState.value is ImportState.Done }
        assertEquals(2, bloquear { deps.respaldo.snapshot() }.accounts.size)
    }

    @Test fun importar_archivo_malo_no_toca_nada() {
        val deps = depsDePrueba()
        val vm = AjustesViewModel(deps.respaldo, deps.clock)
        rule.setContent { HomeTheme { AjustesScreen(vm, onBack = {}, onTipos = {}) } }
        vm.preview("""{"app":"otra"}""")
        rule.esperar { vm.importState.value is ImportState.Error }
        rule.onNodeWithText("El archivo no es un respaldo de esta app.").assertIsDisplayed()
        assertTrue(bloquear { deps.respaldo.snapshot() }.accounts.isEmpty())
    }

    @Test fun exportar_da_el_respaldo_de_home() {
        val deps = depsDePrueba()
        val vm = AjustesViewModel(deps.respaldo, deps.clock)
        bloquear { deps.respaldo.replaceAll(com.hancel.home.core.respaldo.parseBackup(pwaMinimo(), java.time.LocalDate.of(2026, 11, 3))) }
        val text = bloquear { vm.exportText() }
        assertTrue(text.contains("\"app\": \"home\""))
        assertEquals("home-2026-11-03.json", vm.exportName())
    }

    @Test fun borrar_todo_pide_confirmacion() {
        val deps = depsDePrueba()
        bloquear { deps.respaldo.replaceAll(com.hancel.home.core.respaldo.parseBackup(pwaMinimo(), java.time.LocalDate.of(2026, 11, 3))) }
        val vm = AjustesViewModel(deps.respaldo, deps.clock)
        rule.setContent { HomeTheme { AjustesScreen(vm, onBack = {}, onTipos = {}) } }
        rule.onNodeWithText("Borrar todo").performClick()
        rule.onNodeWithText("Se borrarán todas las cuentas, movimientos, listas y plantillas de este teléfono.", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Borrar").performClick()
        rule.esperar { bloquear { deps.respaldo.snapshot() }.accounts.isEmpty() }
    }
}
