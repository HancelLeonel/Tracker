package com.hancel.home.ui.listas

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.lifecycle.SavedStateHandle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Freq
import com.hancel.home.core.Template
import com.hancel.home.core.TemplateItem
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Las herramientas de una fila («Vence a los _ días») no se parten letra por letra en un teléfono de 360 dp. */
@Config(qualifiers = "w360dp-h780dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@RunWith(AndroidJUnit4::class)
class EditorPlantillaAnchoTest {
    @get:Rule val rule = createComposeRule()
    private val deps = depsDePrueba()
    private val modelos = Modelos()

    @After fun cerrar() = modelos.limpiar()

    private fun lineas(t: String): Int {
        val r = mutableListOf<TextLayoutResult>()
        rule.onNodeWithText(t, useUnmergedTree = true).fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!(r)
        return r.first().lineCount
    }

    @Test fun vence_a_los_dias_en_una_linea() {
        bloquear { deps.listas.saveTemplate(Template("t", "Súper", Freq.NONE, listOf(TemplateItem("Pagar luz", dueIn = 2)))) }
        val vm = modelos.crear { PlantillaViewModel(SavedStateHandle(), deps.listas, "t", null) }
        rule.setContent {
            val d = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale = 1.15f)) { HomeTheme { PlantillaFormScreen(vm, onDone = {}) } }
        }
        rule.esperarTexto("Vence a los")
        rule.onAllNodesWithTag("fila-plantilla")[0].performClick()
        assertEquals(1, lineas("Vence a los"))
        assertEquals(1, lineas("días"))
    }
}
