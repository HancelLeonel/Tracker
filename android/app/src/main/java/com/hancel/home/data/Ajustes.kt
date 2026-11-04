package com.hancel.home.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import com.hancel.home.core.CatKey
import com.hancel.home.core.ListSort
import com.hancel.home.core.PortableSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Ajustes en DataStore. `portable` viaja en el respaldo; `collapsed` (cuentas plegadas en Finanzas) es de este
 * teléfono y no viaja.
 */
class Ajustes(private val store: DataStore<Preferences>) {
    private object K {
        val listSort = stringPreferencesKey("listSort")
        val listManualSeeded = booleanPreferencesKey("listManualSeeded")
        val lastKind = stringPreferencesKey("lastKind")
        val lastFrom = stringPreferencesKey("lastFrom")
        val lastIncomeTo = stringPreferencesKey("lastIncomeTo")
        val collapsed = stringSetPreferencesKey("collapsed")
    }

    val portable: Flow<PortableSettings> = store.data.map { p ->
        PortableSettings(
            listSort = ListSort.of(p[K.listSort]),
            listManualSeeded = p[K.listManualSeeded] ?: false,
            lastKind = p[K.lastKind],
            lastFrom = CatKey.parse(p[K.lastFrom]),
            lastIncomeTo = CatKey.parse(p[K.lastIncomeTo]),
        )
    }.distinctUntilChanged()

    val collapsed: Flow<Set<String>> = store.data.map { it[K.collapsed] ?: emptySet() }.distinctUntilChanged()

    suspend fun update(f: (PortableSettings) -> PortableSettings) {
        store.edit { p -> write(p, f(read(p))) }
    }

    suspend fun setPortable(s: PortableSettings) = update { s }

    suspend fun toggleCollapsed(accId: String) {
        store.edit { p ->
            val cur = p[K.collapsed] ?: emptySet()
            p[K.collapsed] = if (accId in cur) cur - accId else cur + accId
        }
    }

    private fun read(p: Preferences) = PortableSettings(
        ListSort.of(p[K.listSort]), p[K.listManualSeeded] ?: false, p[K.lastKind], CatKey.parse(p[K.lastFrom]), CatKey.parse(p[K.lastIncomeTo]),
    )

    private fun write(p: MutablePreferences, s: PortableSettings) {
        p[K.listSort] = s.listSort.key
        p[K.listManualSeeded] = s.listManualSeeded
        fun opt(k: Preferences.Key<String>, v: String?) { if (v == null) p.remove(k) else p[k] = v }
        opt(K.lastKind, s.lastKind)
        opt(K.lastFrom, s.lastFrom?.toString())
        opt(K.lastIncomeTo, s.lastIncomeTo?.toString())
    }
}
