package com.hancel.home.ui

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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
 * `waitUntil` solo no hace avanzar las corrutinas de viewModelScope que vuelven a Main).
 */
fun androidx.compose.ui.test.junit4.ComposeTestRule.esperar(ms: Long = 5_000, cond: () -> Boolean) =
    waitUntil(ms) { org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle(); cond() }
