package com.hancel.home.ui

import android.os.Bundle
import android.os.Parcel
import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.HomeApp
import com.hancel.home.MainActivity
import com.hancel.home.core.ListItem
import com.hancel.home.ui.finanzas.sembrarCuentas
import com.hancel.home.ui.listas.lista
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config

/**
 * Lo que pasa cuando Android mata el proceso con la app en segundo plano: se guarda el estado en un Bundle (que
 * pasa por un Parcel, como en el sistema), se destruye la actividad con sus ViewModel y se crea otra con ese
 * estado. La app debe volver a la misma pantalla, con lo que estaba a medias.
 */
@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class RestauracionTest {
    @get:Rule val rule = createEmptyComposeRule()
    private val deps get() = ApplicationProvider.getApplicationContext<HomeApp>().deps
    private var c: ActivityController<MainActivity>? = null

    @After fun fin() {
        c?.let { cerrar(it.pause().stop()) }
        deps.db.close()
    }

    /**
     * Destruye como el sistema. En Android, al quitar la ventana la ComposeView se desprende y desecha su
     * composición; Robolectric no la desprende, así que se desecha a mano para que la pantalla muerta no siga viva
     * junto a la restaurada. Aun así queda estado en la JVM que afecta a otras clases: por eso esta corre aparte
     * (tarea `testRestauracion` en app/build.gradle.kts).
     */
    private fun cerrar(a: ActivityController<MainActivity>) {
        (a.get().findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as ComposeView).disposeComposition()
        a.destroy()
    }

    private fun iniciar(estado: Bundle? = null) {
        val b = Robolectric.buildActivity(MainActivity::class.java)
        c = if (estado == null) b.setup() else b.setup(estado)
    }

    private fun matarYVolver() {
        val b = Bundle()
        cerrar(c!!.pause().saveInstanceState(b).stop())
        val p = Parcel.obtain()
        p.writeBundle(b)
        p.setDataPosition(0)
        val restaurado = p.readBundle(javaClass.classLoader)!!
        p.recycle()
        c = null
        iniciar(restaurado)
    }

    private fun hay(m: androidx.compose.ui.test.SemanticsMatcher) = rule.onAllNodes(m).fetchSemanticsNodes().isNotEmpty()

    @Test fun restaura_lista_abierta_y_scroll() {
        deps.lista("l", "Larga", items = (1..40).map { ListItem("$it", "Elemento $it") })
        iniciar()
        rule.onNodeWithText("Listas").performClick()
        rule.esperarTexto("Larga")
        rule.onNodeWithText("Larga").performClick()
        rule.esperar { hay(hasTestTag("lista-elementos")) }
        rule.onNodeWithTag("lista-elementos").performScrollToNode(hasText("Elemento 30"))
        matarYVolver()
        rule.esperar { hay(hasTestTag("pantalla-lista")) && hay(hasText("Elemento 30")) }
        rule.onNodeWithText("Elemento 30").assertIsDisplayed()
        rule.onNodeWithText("Elemento 1").assertDoesNotExist()
    }

    @Test fun restaura_pestana_de_listas() {
        iniciar()
        rule.onNodeWithText("Listas").performClick()
        rule.esperarTexto("Agenda")
        rule.onNodeWithText("Agenda").performClick()
        rule.esperarTexto("No hay tareas con fecha.")
        matarYVolver()
        rule.esperarTexto("No hay tareas con fecha.")
    }

    @Test fun restaura_detalle_de_cuenta() {
        deps.sembrarCuentas()
        iniciar()
        rule.onNodeWithText("Finanzas").performClick()
        rule.esperar { hay(hasContentDescription("Ver movimientos de Banco")) }
        rule.onNodeWithContentDescription("Ver movimientos de Banco").performClick()
        rule.esperar { hay(hasTestTag("pantalla-cuenta")) }
        matarYVolver()
        rule.esperar { hay(hasTestTag("pantalla-cuenta")) }
        rule.esperarTexto("Banco")
    }

    @Test fun restaura_formulario_de_mover_a_medias() {
        deps.sembrarCuentas()
        iniciar()
        rule.onNodeWithText("Finanzas").performClick()
        rule.esperarTexto("Mover")
        rule.onNodeWithText("Mover").performClick()
        rule.esperarTexto("Banco · Renta")
        rule.onNodeWithText("Monto").performTextInput("50")
        rule.onNodeWithText("Descripción (opcional)").performTextInput("Ahorro")
        matarYVolver()
        rule.esperarTexto("Mover dinero")
        rule.esperar { hay(hasSetTextAction() and hasText("50")) && hay(hasSetTextAction() and hasText("Ahorro")) }
        rule.esperarTexto("Banco · Renta")
    }

    @Test fun restaura_editor_de_plantilla_a_medias() {
        iniciar()
        rule.onNodeWithText("Listas").performClick()
        rule.esperarTexto("Plantillas")
        rule.onNodeWithText("Plantillas").performClick()
        rule.esperar { hay(hasContentDescription("Nueva plantilla")) }
        rule.onNodeWithContentDescription("Nueva plantilla").performClick()
        rule.esperar { hay(hasTestTag("fila-plantilla")) }
        rule.onNode(hasSetTextAction() and hasText("Nombre")).performTextInput("Súper")
        rule.onAllNodesWithTag("fila-plantilla")[0].performTextInput("Leche")
        rule.onAllNodesWithTag("fila-plantilla")[0].performImeAction()
        rule.esperar { rule.onAllNodesWithTag("fila-plantilla").fetchSemanticsNodes().size == 2 }
        rule.onAllNodesWithTag("fila-plantilla")[1].performTextInput("Pan")
        matarYVolver()
        rule.esperarTexto("Nueva plantilla")
        rule.esperar { hay(hasSetTextAction() and hasText("Leche")) && hay(hasSetTextAction() and hasText("Pan")) && hay(hasSetTextAction() and hasText("Súper")) }
    }
}
