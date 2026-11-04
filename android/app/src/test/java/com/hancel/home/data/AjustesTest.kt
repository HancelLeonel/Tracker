package com.hancel.home.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.hancel.home.core.CatKey
import com.hancel.home.core.ListSort
import com.hancel.home.core.PortableSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class AjustesTest {
    @get:Rule val tmp = TemporaryFolder()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private fun ajustes() = Ajustes(PreferenceDataStoreFactory.create(scope = scope) { tmp.root.resolve("a.preferences_pb") })

    @After fun tearDown() = scope.cancel()

    @Test fun por_defecto_recent() = runTest {
        assertEquals(PortableSettings(), ajustes().portable.first())
    }

    @Test fun update_persiste() = runTest {
        val a = ajustes()
        a.update { it.copy(listSort = ListSort.MANUAL, listManualSeeded = true, lastKind = "k", lastFrom = CatKey("b", "c")) }
        assertEquals(PortableSettings(ListSort.MANUAL, true, "k", CatKey("b", "c"), null), a.portable.first())
        a.update { it.copy(lastFrom = null) }
        assertEquals(null, a.portable.first().lastFrom)
    }

    @Test fun collapsed_alterna() = runTest {
        val a = ajustes()
        a.toggleCollapsed("banco")
        assertEquals(setOf("banco"), a.collapsed.first())
        a.toggleCollapsed("banco")
        assertEquals(emptySet<String>(), a.collapsed.first())
    }
}
