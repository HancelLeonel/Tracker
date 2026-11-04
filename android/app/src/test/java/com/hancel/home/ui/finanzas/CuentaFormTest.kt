package com.hancel.home.ui.finanzas

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.SavedStateHandle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.AccountType
import com.hancel.home.core.Category
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class CuentaFormTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()
    private var listo = false

    @After fun cerrar() = modelos.limpiar()

    private fun cuenta(id: String) = bloquear { deps.dinero.account(id) }

    private fun abrirCuenta(id: String?) {
        val vm = modelos.crear { CuentaFormViewModel(SavedStateHandle(), deps.dinero, id) }
        rule.setContent { HomeTheme { CuentaFormScreen(vm, onDone = { listo = true }) } }
    }

    private fun abrirCategoria(acc: String, cat: String?) {
        val vm = modelos.crear { CategoriaFormViewModel(SavedStateHandle(), deps.dinero, acc, cat) }
        rule.setContent { HomeTheme { CategoriaFormScreen(vm, onDone = { listo = true }) } }
    }

    @Test fun crear_tarjeta_con_deuda() {
        abrirCuenta(null)
        rule.onNodeWithText("Nombre").performTextInput("Visa Oro")
        rule.onNodeWithText("Tarjeta de crédito", substring = true).performClick()
        rule.onNodeWithText("Deuda actual").performTextInput("250,50")
        rule.onNodeWithText("Límite de crédito (opcional)").performTextInput("5000")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val a = bloquear { deps.dinero.accounts.first() }.single()
        assertEquals("Visa Oro", a.name)
        assertEquals(AccountType.CREDIT, a.type)
        assertEquals(500000L, a.limit)
        assertEquals("Deuda", a.cats.single().name)
        assertEquals(-25050L, a.cats.single().balance)
    }

    @Test fun cuenta_sin_nombre_no_se_guarda() {
        abrirCuenta(null)
        rule.onNodeWithText("Guardar").performClick()
        rule.esperarTexto("Escribe un nombre.")
        assertTrue(!listo)
    }

    @Test fun editar_cuenta_conserva_categorias_y_no_cambia_el_tipo() {
        deps.sembrarCuentas()
        abrirCuenta("banco")
        rule.esperarTexto("Editar cuenta")
        rule.esperar { rule.onAllNodes(androidx.compose.ui.test.hasText("Banco")).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Tarjeta de crédito", substring = true).assertIsNotEnabled()
        rule.onNodeWithText("Nombre").performTextReplacement("Banco Industrial")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val a = cuenta("banco")!!
        assertEquals("Banco Industrial", a.name)
        assertEquals(listOf(50000L, 20000L), a.cats.map { it.balance })
    }

    @Test fun editar_deuda_de_tarjeta() {
        deps.sembrarCuentas()
        abrirCuenta("visa")
        rule.esperar { rule.onAllNodes(androidx.compose.ui.test.hasText("30")).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Deuda actual").performTextReplacement("45")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        assertEquals(listOf(Category("deuda", "Deuda", -4500)), cuenta("visa")!!.cats)
    }

    @Test fun borrar_cuenta_pide_confirmacion() {
        deps.sembrarCuentas()
        abrirCuenta("visa")
        rule.esperarTexto("Editar cuenta")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperarTexto("¿Eliminar la cuenta «Visa»?")
        rule.onNodeWithText("Eliminar cuenta").performClick()
        rule.esperar { listo }
        assertNull(cuenta("visa"))
    }

    @Test fun editar_saldo_de_categoria() {
        deps.sembrarCuentas()
        abrirCategoria("banco", "comida")
        rule.esperarTexto("Esto corrige el saldo directamente")
        rule.esperar { rule.onAllNodes(androidx.compose.ui.test.hasText("500")).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Dinero real que hay ahora").performTextReplacement("450")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        assertEquals(listOf(Category("comida", "Comida", 45000), Category("renta", "Renta", 20000)), cuenta("banco")!!.cats)
    }

    @Test fun nueva_categoria_en_la_cuenta() {
        deps.sembrarCuentas()
        abrirCategoria("banco", null)
        rule.esperarTexto("Nueva categoría en Banco")
        rule.onNodeWithText("Para qué es el dinero").performTextInput("Ahorro")
        rule.onNodeWithText("Dinero real que hay ahora").performTextInput("100")
        rule.onNodeWithText("Guardar").performClick()
        rule.esperar { listo }
        val c = cuenta("banco")!!.cats
        assertEquals(listOf("Comida", "Renta", "Ahorro"), c.map { it.name })
        assertEquals(10000L, c.last().balance)
    }

    @Test fun borrar_categoria_pide_confirmacion() {
        deps.sembrarCuentas()
        abrirCategoria("banco", "comida")
        rule.esperarTexto("Editar categoría")
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperarTexto("¿Eliminar la categoría «Comida»?")
        rule.onNodeWithText("Cancelar").performClick()
        rule.waitForIdle()
        assertEquals(2, cuenta("banco")!!.cats.size)
        rule.onNodeWithText("Eliminar").performClick()
        rule.esperarTexto("¿Eliminar la categoría «Comida»?")
        rule.onNodeWithText("Eliminar categoría").performClick()
        rule.esperar { listo }
        assertEquals(listOf("Renta"), cuenta("banco")!!.cats.map { it.name })
    }
}
