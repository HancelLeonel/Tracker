package com.hancel.home

import android.app.Application
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import com.hancel.home.data.Ajustes
import com.hancel.home.data.DineroRepo
import com.hancel.home.data.HomeDb
import com.hancel.home.data.ListasRepo
import com.hancel.home.data.RespaldoRepo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.time.Clock
import java.time.LocalDate

private val Context.ajustesStore by preferencesDataStore(name = "ajustes")

/** La fecha de hoy como estado: se refresca al volver a la app y al cambiar el día, para que «Hoy» nunca quede viejo. */
class Hoy(private val clock: Clock) {
    private val state = MutableStateFlow(LocalDate.now(clock))
    val flow: StateFlow<LocalDate> = state
    fun refresh() { state.value = LocalDate.now(clock) }
}

/** Dependencias de la app (en las pruebas: base en memoria y reloj controlable). */
class Deps(val db: HomeDb, store: DataStore<Preferences>, val clock: Clock) {
    val ajustes = Ajustes(store)
    val dinero = DineroRepo(db)
    val listas = ListasRepo(db)
    val respaldo = RespaldoRepo(db, ajustes)
    val hoy = Hoy(clock)
}

class HomeApp : Application() {
    val deps: Deps by lazy { Deps(HomeDb.open(this), ajustesStore, Clock.systemDefaultZone()) }
}
