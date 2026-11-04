package com.hancel.home.ui.comun

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Account
import com.hancel.home.core.AccountType
import com.hancel.home.core.CatKey
import com.hancel.home.core.Category
import com.hancel.home.core.Ledger
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class SelectorCategoriaTest {
    @get:Rule val rule = createComposeRule()

    private val banco = Account("banco", "Banco", AccountType.NORMAL, 0, listOf(Category("comida", "Comida", 50000), Category("renta", "Renta", 20000)))
    private val efectivo = Account("efe", "Efectivo", AccountType.NORMAL, 0, listOf(Category("bolsa", "Bolsillo", 1500)))

    private fun abrir(accounts: List<Account>): () -> CatKey? {
        val l = Ledger(accounts, emptyList())
        var picked by mutableStateOf<CatKey?>(null)
        rule.setContent {
            HomeTheme {
                SelectorCategoria(picked, l.normalKeys(), l, { l.category(it)!!.balance }, "Elige de dónde sale", onPick = { picked = it })
            }
        }
        return { picked }
    }

    /**
     * Dentro de la hoja (su propia ventana) Robolectric no entrega los toques simulados a las filas; la acción de
     * clic de accesibilidad sí llega y ejecuta lo mismo. El toque real se comprueba en el teléfono.
     */
    private fun SemanticsNodeInteraction.tocar() = performSemanticsAction(SemanticsActions.OnClick)

    @Test fun selector_dos_pasos() {
        val picked = abrir(listOf(banco, efectivo))
        rule.onNodeWithText("Elige de dónde sale").performClick()
        rule.esperarTexto("Efectivo")
        rule.onNodeWithText("Q700.00").assertIsDisplayed() // Banco suma sus categorías
        rule.onNodeWithText("Banco").tocar()
        rule.esperarTexto("Renta")
        rule.onNodeWithText("Q500.00").assertIsDisplayed()
        rule.onNodeWithContentDescription("Volver a las cuentas").tocar()
        rule.esperarTexto("Efectivo")
        rule.onNodeWithText("Banco").tocar()
        rule.esperarTexto("Comida")
        rule.onNodeWithText("Comida").tocar()
        rule.waitForIdle()
        assertEquals(CatKey("banco", "comida"), picked())
        rule.onNodeWithText("Banco · Comida").assertIsDisplayed()
    }

    @Test fun selector_una_cuenta_salta_a_categorias() {
        val picked = abrir(listOf(banco))
        rule.onNodeWithText("Elige de dónde sale").performClick()
        rule.esperarTexto("Renta")
        rule.onNodeWithText("Renta").tocar()
        rule.waitForIdle()
        assertEquals(CatKey("banco", "renta"), picked())
        rule.onNodeWithText("Banco · Renta").assertIsDisplayed()
    }
}
