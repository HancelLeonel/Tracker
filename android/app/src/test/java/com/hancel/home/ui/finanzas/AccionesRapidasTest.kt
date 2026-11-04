package com.hancel.home.ui.finanzas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.ui.tema.HomeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Los botones Gasto / Ingreso / Mover no deben partir su texto en dos líneas en un teléfono angosto con letra grande. */
@Config(qualifiers = "w360dp-h780dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@RunWith(AndroidJUnit4::class)
class AccionesRapidasTest {
    @get:Rule val rule = createComposeRule()

    private fun lineas(text: String): Int {
        val r = mutableListOf<TextLayoutResult>()
        rule.onNodeWithText(text, useUnmergedTree = true).fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!(r)
        return r.first().lineCount
    }

    @Test fun una_linea_con_letra_grande_en_360dp() {
        rule.setContent {
            val d = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale = 1.3f)) {
                HomeTheme {
                    // 360 dp de pantalla menos el margen de 16 dp de la lista a cada lado.
                    Box(Modifier.width(360.dp).padding(horizontal = 16.dp)) { AccionesRapidas(FinanzasAcciones(onGasto = { _, _ -> }, onIngreso = {}, onMover = {})) }
                }
            }
        }
        for (t in listOf("Gasto", "Ingreso", "Mover")) assertEquals("«$t» en una línea", 1, lineas(t))
    }
}
