package com.hancel.home.core

import java.time.LocalDate

/** Datos de prueba compartidos: Banco (Comida 500.00, Renta 200.00) y la tarjeta Visa (debe 30.00, límite 1000.00). */
object Fx {
    val COMIDA = CatKey("banco", "comida")
    val RENTA = CatKey("banco", "renta")
    val VISA = CatKey("visa", "deuda")
    val D = LocalDate.of(2026, 11, 3)

    fun accounts(comida: Long = 50000, renta: Long = 20000, deuda: Long = -3000) = listOf(
        Account("banco", "Banco", AccountType.NORMAL, 0, listOf(Category("comida", "Comida", comida), Category("renta", "Renta", renta))),
        Account("visa", "Visa", AccountType.CREDIT, 100000, listOf(Category("deuda", "Deuda", deuda))),
    )

    private var seq = 0L
    fun move(
        type: MoveType, total: Long, vararg parts: Part, card: String? = null, to: CatKey? = null,
        date: LocalDate = D, t: Long = ++seq, id: String = "m$t", title: String = "",
    ) = Move(id, t, type, date, title, "", null, card, to, total, parts.toList())

    fun gasto(amount: Long, from: CatKey, card: String? = null, date: LocalDate = D, t: Long = ++seq) =
        move(MoveType.EXPENSE, amount, Part(from, amount), card = card, date = date, t = t)

    fun pago(amount: Long, from: CatKey, date: LocalDate = D, t: Long = ++seq) =
        move(MoveType.TRANSFER, amount, Part(from, amount), to = VISA, date = date, t = t)
}
