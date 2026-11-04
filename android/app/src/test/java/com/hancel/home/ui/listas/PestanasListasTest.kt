package com.hancel.home.ui.listas

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDate

/** Las cuatro pestañas caben completas y en una línea en un teléfono de 360 dp, también con letra algo más grande. */
@Config(qualifiers = "w360dp-h780dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@RunWith(AndroidJUnit4::class)
class PestanasListasTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()

    @After fun cerrar() = modelos.limpiar()

    @Test fun pestanas_caben_en_360dp() {
        deps.lista("v", "Vieja", archived = LocalDate.of(2026, 11, 1))
        val vm = modelos.crear { ListasViewModel(deps.listas, deps.ajustes, deps.hoy) }
        rule.setContent {
            val d = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale = 1.15f)) {
                HomeTheme { ListasScreen(vm, ListasAcciones()) }
            }
        }
        rule.esperarTexto("Archivo 1")
        val ancho = rule.onRoot().fetchSemanticsNode().size.width
        for (t in listOf("Listas", "Agenda", "Plantillas", "Archivo 1")) {
            val n = rule.onNode(hasText(t) and hasAnyAncestor(hasTestTag("pestanas-listas")), useUnmergedTree = true).fetchSemanticsNode()
            val r = mutableListOf<TextLayoutResult>()
            n.config[SemanticsActions.GetTextLayoutResult].action!!(r)
            assertEquals("«$t» en una línea", 1, r.first().lineCount)
            assertTrue("«$t» sin recortar", !r.first().hasVisualOverflow)
            assertTrue("«$t» dentro de la pantalla", n.boundsInRoot.right <= ancho)
        }
    }
}
