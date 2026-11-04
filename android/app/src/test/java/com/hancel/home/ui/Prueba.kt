package com.hancel.home.ui

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.compose.ui.test.performScrollToNode
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.hancel.home.Deps
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import java.io.File
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/** Reloj de prueba que se puede adelantar. */
class RelojPrueba(var now: Instant = Instant.parse("2026-11-03T15:00:00Z"), private val zone: ZoneId = ZoneOffset.UTC) : Clock() {
    override fun getZone() = zone
    override fun withZone(z: ZoneId) = RelojPrueba(now, z)
    override fun instant() = now
    fun adelantarDias(n: Long) { now = now.plusSeconds(n * 86_400) }
}

/** Dependencias con base en memoria, ajustes en una carpeta temporal y reloj controlable. */
fun depsDePrueba(reloj: RelojPrueba = RelojPrueba()): Deps {
    val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), com.hancel.home.data.HomeDb::class.java)
        .allowMainThreadQueries().build()
    val dir: File = Files.createTempDirectory("ajustes").toFile()
    val store = PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)) { File(dir, "a.preferences_pb") }
    return Deps(db, store, reloj)
}

fun pwaMinimo(): String = object {}.javaClass.getResource("/pwa-minimo.json")!!.readText()

fun <T> bloquear(f: suspend () -> T): T = runBlocking { f() }

/**
 * Espera una condición procesando lo que el hilo principal tenga pendiente (en Robolectric está en pausa y
 * `waitUntil` solo no hace avanzar las corrutinas de viewModelScope que vuelven a Main). 10 s porque la primera
 * prueba de cada JVM carga Compose, Room y los hilos de corrutinas (~6 s).
 */
fun androidx.compose.ui.test.junit4.ComposeTestRule.esperar(ms: Long = 10_000, cond: () -> Boolean) =
    waitUntil(ms) { org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle(); cond() }

/** Espera a que aparezca un texto (o fragmento). */
fun androidx.compose.ui.test.junit4.ComposeTestRule.esperarTexto(text: String, substring: Boolean = true) =
    esperar { onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty() }

/**
 * Espera a que un texto exista dentro de una lista perezosa, desplazándola hasta él: LazyColumn solo compone lo
 * visible, así que lo que queda bajo el borde no está en el árbol hasta que se desplaza (como haría la persona).
 */
fun androidx.compose.ui.test.junit4.ComposeTestRule.verEnLista(tag: String, text: String, substring: Boolean = true) =
    esperar {
        runCatching {
            onNode(androidx.compose.ui.test.hasTestTag(tag))
                .performScrollToNode(androidx.compose.ui.test.hasText(text, substring = substring))
        }.isSuccess
    }

private fun androidx.compose.ui.test.junit4.ComposeTestRule.onAllNodesWithText(text: String, substring: Boolean) =
    onAllNodes(androidx.compose.ui.test.hasText(text, substring = substring), useUnmergedTree = true)
