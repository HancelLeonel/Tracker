package com.hancel.home.ui.finanzas

import com.hancel.home.Deps
import com.hancel.home.core.Account
import com.hancel.home.core.AccountType
import com.hancel.home.core.CatKey
import com.hancel.home.core.Category
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
import com.hancel.home.ui.bloquear
import java.time.LocalDate

val COMIDA = CatKey("banco", "comida")
val RENTA = CatKey("banco", "renta")

/** Banco (Comida Q500, Renta Q200) y Visa (debe Q30, límite Q1,000). */
fun Deps.sembrarCuentas(deuda: Long = -3000) = bloquear {
    dinero.saveAccount(Account("banco", "Banco", AccountType.NORMAL, 0, listOf(Category("comida", "Comida", 50000), Category("renta", "Renta", 20000))))
    dinero.saveAccount(Account("visa", "Visa", AccountType.CREDIT, 100000, listOf(Category("deuda", "Deuda", deuda))))
}

fun Deps.gasto(id: String, amount: Long, from: CatKey, date: LocalDate, card: String? = null, title: String = "Gasto $id", t: Long = 1) = bloquear {
    dinero.saveMove(Move(id, t, MoveType.EXPENSE, date, title, "", null, card, null, amount, listOf(Part(from, amount))))
}
