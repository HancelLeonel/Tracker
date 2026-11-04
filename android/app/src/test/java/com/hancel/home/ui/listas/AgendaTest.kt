package com.hancel.home.ui.listas

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.ListItem
import com.hancel.home.ui.Modelos
import com.hancel.home.ui.RelojPrueba
import com.hancel.home.ui.bloquear
import com.hancel.home.ui.depsDePrueba
import com.hancel.home.ui.esperar
import com.hancel.home.ui.esperarTexto
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class AgendaTest {
    @get:Rule val rule = createComposeRule()
    private val reloj = RelojPrueba()
    private val deps = depsDePrueba(reloj)
    private val modelos = Modelos()
    private val hoy = LocalDate.of(2026, 11, 3)
    private var abierta: String? = null

    @After fun cerrar() = modelos.limpiar()

    private fun item(id: String) = bloquear { deps.listas.lists.first() }.flatMap { it.items }.first { it.id == id }

    private fun abrirAgenda() {
        val vm = modelos.crear { ListasViewModel(deps.listas, deps.ajustes, deps.hoy, deps.clock) }
        rule.setContent { HomeTheme { ListasScreen(vm, ListasAcciones(onAbrir = { abierta = it })) } }
        rule.esperarTexto("Agenda")
        rule.onNodeWithText("Agenda").performClick()
    }

    @Test fun agenda_grupos_y_marcar() {
        deps.lista("l", "Casa", items = listOf(
            ListItem("1", "Luz", due = hoy.minusDays(1)), ListItem("2", "Agua", due = hoy), ListItem("3", "Gas", due = hoy.plusDays(1)),
            ListItem("4", "Cable", due = hoy.plusDays(3)), ListItem("5", "Seguro", due = hoy.plusDays(20)), ListItem("6", "Sin fecha"),
        ))
        abrirAgenda()
        rule.esperarTexto("Vencidas · 1")
        for (g in listOf("Hoy · 1", "Mañana · 1", "Esta semana · 1", "Más adelante · 1")) rule.esperarTexto(g)
        rule.onNodeWithText("Sin fecha").assertDoesNotExist()
        rule.onNodeWithContentDescription("Marcar como hecha: Agua").performClick()
        rule.esperar { item("2").done }
        rule.esperarTexto("Tarea hecha")
        rule.esperar { rule.onAllNodes(androidx.compose.ui.test.hasText("Agua")).fetchSemanticsNodes().isEmpty() }
        rule.onNodeWithText("Deshacer").performClick()
        rule.esperar { !item("2").done }
        rule.esperarTexto("Agua")
        rule.onNodeWithText("Gas").performClick()
        rule.esperar { abierta == "l" }
    }

    @Test fun agenda_cambia_de_dia() {
        deps.lista("l", "Casa", items = listOf(ListItem("2", "Agua", due = hoy)))
        abrirAgenda()
        rule.esperarTexto("Hoy · 1")
        reloj.adelantarDias(1)
        deps.hoy.refresh()
        rule.esperarTexto("Vencidas · 1")
        assertTrue(rule.onAllNodes(androidx.compose.ui.test.hasText("Hoy · 1")).fetchSemanticsNodes().isEmpty())
    }

    @Test fun agenda_vacia() {
        abrirAgenda()
        rule.esperarTexto("No hay tareas con fecha.")
    }
}
