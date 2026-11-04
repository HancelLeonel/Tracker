package com.hancel.home.core.respaldo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class RespaldoHomeTest {
    private val hoy = LocalDate.of(2026, 11, 3)
    private val pwa = parseBackup(javaClass.getResource("/pwa-minimo.json")!!.readText(), hoy)

    @Test fun ida_y_vuelta_home() {
        val text = exportHome(pwa, Instant.parse("2026-11-03T20:00:00Z"))
        assertTrue(text.contains("\"app\": \"home\""))
        assertTrue(text.contains("\"version\": 1"))
        assertEquals(pwa, parseBackup(text, hoy))
    }

    @Test fun montos_en_centavos_enteros() {
        val text = exportHome(pwa, Instant.EPOCH)
        assertTrue(text.contains("\"balance\": 48550"))
        assertTrue(!text.contains("485.5"))
    }

    @Test fun version_futura_se_rechaza() {
        val text = exportHome(pwa, Instant.EPOCH).replace("\"version\": 1", "\"version\": 2")
        assertEquals(
            "Este respaldo es de una versión más nueva de Home. Actualiza la app.",
            runCatching { parseBackup(text, hoy) }.exceptionOrNull()?.message,
        )
    }
}
