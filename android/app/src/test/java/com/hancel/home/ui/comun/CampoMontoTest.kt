package com.hancel.home.ui.comun

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.ui.tema.HomeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CampoMontoTest {
    @get:Rule val rule = createComposeRule()

    @Test fun campo_monto_acepta_coma() {
        var v by mutableStateOf<Long?>(null)
        rule.setContent { HomeTheme { CampoMonto(v, { v = it }, "Monto") } }
        rule.onNodeWithText("Monto").performTextInput("12,50")
        rule.waitForIdle()
        assertEquals(1250L, v)
        rule.onNodeWithText("Monto").performTextReplacement("1.250,75")
        rule.waitForIdle()
        assertEquals(125075L, v)
        rule.onNodeWithText("Monto").performTextReplacement("abc")
        rule.waitForIdle()
        assertNull(v)
    }

    @Test fun campo_monto_muestra_el_valor_inicial() {
        rule.setContent { HomeTheme { CampoMonto(50000, {}, "Saldo") } }
        rule.onNodeWithText("500").assertExists()
    }
}
