package com.hancel.home.ui.inicio

import androidx.compose.ui.test.hasText
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
import com.hancel.home.ui.listas.lista
import com.hancel.home.ui.tema.HomeTheme
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.Instant
import java.time.LocalDate

@Config(qualifiers = "w411dp-h891dp")
@RunWith(AndroidJUnit4::class)
class InicioTest {
    @get:Rule val rule = createComposeRule()
    private val reloj = RelojPrueba()
    private val deps = depsDePrueba(reloj)
    private val modelos = Modelos()
    private val hoy = LocalDate.of(2026, 11, 3)
    private var abierta: String? = null
    private var agenda = false
    private lateinit var vm: InicioViewModel

    @After fun cerrar() = modelos.limpiar()

    private fun item(id: String) = bloquear { deps.listas.lists.first() }.flatMap { it.items }.first { it.id == id }
    private fun y(text: String) = rule.onNodeWithText(text).fetchSemanticsNode().positionInRoot.y

    private fun abrir() {
        vm = modelos.crear { InicioViewModel(deps.listas, deps.hoy, deps.clock) }
        rule.setContent { HomeTheme { InicioScreen(vm, InicioAcciones(onAbrirLista = { abierta = it }, onAgenda = { agenda = true })) } }
    }

    private fun cinco() = deps.lista("l", "Casa", items = listOf(
        ListItem("1", "Luz", due = hoy.minusDays(2)), ListItem("2", "Agua", due = hoy.minusDays(1)), ListItem("3", "Gas", due = hoy),
        ListItem("4", "Cable", due = hoy), ListItem("5", "Seguro", due = hoy), ListItem("6", "Mañana", due = hoy.plusDays(1)),
    ))

    @Test fun fecha_y_saludo_con_reloj_fijo() {
        abrir() // 3 nov 2026, 15:00
        rule.esperarTexto("Martes · 3 nov")
        rule.esperarTexto("Buenas tardes")
    }

    @Test fun saludo_de_la_manana() {
        reloj.now = Instant.parse("2026-11-03T08:30:00Z")
        deps.hoy.refresh()
        abrir()
        rule.esperarTexto("Buenos días")
    }

    @Test fun muestra_tres_y_ver_mas() {
        cinco()
        abrir()
        rule.esperarTexto("Tareas de hoy · 5")
        rule.esperarTexto("Luz")
        rule.esperarTexto("Gas")
        rule.onNodeWithText("Cable").assertDoesNotExist()
        rule.onNodeWithText("Mañana").assertDoesNotExist()
        rule.onNodeWithText("Ver 2 más en Listas").performClick()
        rule.esperar { agenda }
    }

    @Test fun marcar_no_salta() {
        cinco()
        abrir()
        rule.esperarTexto("Gas")
        val antes = y("Luz")
        rule.onNodeWithContentDescription("Marcar como hecha: Luz").performClick()
        rule.esperar { item("1").done }
        rule.esperarTexto("Tareas de hoy · 4")
        rule.waitForIdle()
        assertEquals(antes, y("Luz"))
        rule.onNodeWithText("Cable").assertDoesNotExist() // no entra otra en su lugar mientras sigas en Inicio
        vm.salir() // al salir de Inicio (ON_STOP) lo marcado se va
        rule.esperar { rule.onAllNodes(hasText("Luz")).fetchSemanticsNodes().isEmpty() }
        rule.esperarTexto("Cable")
    }

    @Test fun desmarcar_lo_recien_marcado() {
        cinco()
        abrir()
        rule.esperarTexto("Luz")
        rule.onNodeWithContentDescription("Marcar como hecha: Luz").performClick()
        rule.esperar { item("1").done }
        rule.onNodeWithContentDescription("Marcar como hecha: Luz").performClick()
        rule.esperar { !item("1").done }
        rule.esperarTexto("Tareas de hoy · 5")
    }

    @Test fun tocar_el_texto_abre_su_lista() {
        cinco()
        abrir()
        rule.esperarTexto("Agua")
        rule.onNodeWithText("Agua").performClick()
        rule.esperar { abierta == "l" }
    }

    @Test fun nada_pendiente() {
        abrir()
        rule.esperarTexto("Nada pendiente para hoy.")
        assertTrue(rule.onAllNodes(hasText("Ver", substring = true)).fetchSemanticsNodes().isEmpty())
    }
}
