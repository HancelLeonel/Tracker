package com.hancel.home.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hancel.home.core.Category
import com.hancel.home.core.respaldo.DEFAULT_KINDS
import com.hancel.home.core.respaldo.parseBackup
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class RespaldoRepoTest {
    @get:Rule val rule = DbRule()
    @get:Rule val tmp = TemporaryFolder()
    private val hoy = LocalDate.of(2026, 11, 3)
    private val snap by lazy { parseBackup(javaClass.getResource("/pwa-minimo.json")!!.readText(), hoy) }

    private fun repo(): RespaldoRepo {
        val store = PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)) { tmp.root.resolve("a.preferences_pb") }
        return RespaldoRepo(rule.db, Ajustes(store))
    }

    @Test fun snapshot_ida_y_vuelta() = runTest {
        val r = repo()
        r.replaceAll(snap)
        assertEquals(snap, r.snapshot())
    }

    @Test fun replaceAll_es_todo_o_nada() = runTest {
        val r = repo()
        r.replaceAll(snap)
        val roto = snap.copy(
            accounts = snap.accounts.map { a -> if (a.id == "banco") a.copy(cats = a.cats + Category("comida", "Repetida", 1)) else a },
            lists = emptyList(),
        )
        val e = runCatching { r.replaceAll(roto) }.exceptionOrNull()
        assertTrue("debió fallar", e != null)
        assertEquals(snap, r.snapshot())
    }

    @Test fun wipe_deja_vacio_con_tipos_por_defecto() = runTest {
        val r = repo()
        r.replaceAll(snap)
        r.wipe()
        val s = r.snapshot()
        assertEquals(0, s.accounts.size + s.moves.size + s.lists.size + s.templates.size)
        assertEquals(DEFAULT_KINDS, s.kinds.map { it.name })
    }
}
