package com.hancel.home.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class FormatoTest {
    @Test fun money_formato_quetzales() {
        assertEquals("Q1,250.00", money(125000))
        assertEquals("−Q12.00", money(-1200))
        assertEquals("Q0.00", money(0))
        assertEquals("Q0.05", money(5))
    }

    @Test fun parseMoney_punto_coma_y_miles() {
        assertEquals(1250L, parseMoney("12.50"))
        assertEquals(1250L, parseMoney("12,50"))
        assertEquals(1250L, parseMoney("12,5"))
        assertEquals(125000L, parseMoney("1,250.00"))
        assertEquals(125000L, parseMoney("1,250"))
        assertEquals(125000L, parseMoney("1 250"))
        assertEquals(125000L, parseMoney("1.250,00"))
        assertEquals(1L, parseMoney("0.005"))
        assertEquals(1200L, parseMoney(" 12 "))
    }

    @Test fun editMoney_para_campos_de_texto() {
        assertEquals("500", editMoney(50000))
        assertEquals("12.50", editMoney(1250))
        assertEquals("0.05", editMoney(5))
        assertEquals("-30", editMoney(-3000))
        assertEquals("1250.75", editMoney(125075))
        for (c in listOf(0L, 5L, 1250L, -3000L, 125075L)) assertEquals(c, parseMoney(editMoney(c)))
    }

    @Test fun parseMoney_invalido_es_null() {
        assertNull(parseMoney(""))
        assertNull(parseMoney("abc"))
        assertNull(parseMoney("-"))
    }

    @Test fun dayLabel_hoy_ayer_y_fecha() {
        val hoy = LocalDate.of(2026, 11, 3)
        assertEquals("Hoy", dayLabel(hoy, hoy))
        assertEquals("Ayer", dayLabel(LocalDate.of(2026, 11, 2), hoy))
        assertEquals("21 oct", dayLabel(LocalDate.of(2026, 10, 21), hoy))
        assertEquals("1 ene", fmtDate(LocalDate.of(2027, 1, 1)))
    }

    @Test fun greeting_por_hora() {
        assertEquals("Buenos días", greeting(11))
        assertEquals("Buenas tardes", greeting(12))
        assertEquals("Buenas tardes", greeting(18))
        assertEquals("Buenas noches", greeting(19))
    }

    @Test fun byName_sin_tildes_ni_mayusculas_y_numeros_naturales() {
        assertEquals(
            listOf("ahorro", "Cuenta 2", "Cuenta 10", "Éxito"),
            listOf("Éxito", "ahorro", "Cuenta 10", "Cuenta 2").sortedWith(byName),
        )
    }

    @Test fun dia_de_la_semana_con_mayuscula() {
        assertEquals("Martes", weekdayName(java.time.LocalDate.of(2026, 11, 3)))
        assertEquals("Domingo", weekdayName(java.time.LocalDate.of(2026, 11, 8)))
        assertEquals("Martes · 3 nov", homeDate(java.time.LocalDate.of(2026, 11, 3)))
    }
}
