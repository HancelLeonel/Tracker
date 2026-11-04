package com.hancel.home.core

import java.time.LocalDate

enum class Bucket(val label: String) {
    LATE("Vencidas"), TODAY("Hoy"), TOMORROW("Mañana"), WEEK("Esta semana"), LATER("Más adelante")
}

/** Un elemento pendiente con fecha, junto con su lista. */
data class Task(val list: ListDoc, val item: ListItem)

private val taskOrder = compareBy<Task> { it.item.due }.thenBy { it.list.created }

private fun pendingDated(lists: List<ListDoc>) = lists.filter { it.archived == null }
    .flatMap { l -> l.items.filter { !it.head && !it.done && it.due != null }.map { Task(l, it) } }

/** Todas las tareas con fecha, agrupadas; solo aparecen los grupos con algo, en el orden de `Bucket`. */
fun agenda(lists: List<ListDoc>, today: LocalDate): Map<Bucket, List<Task>> {
    val week = today.plusDays(7)
    val byBucket = pendingDated(lists).sortedWith(taskOrder).groupBy { t ->
        val d = t.item.due!!
        when {
            d < today -> Bucket.LATE
            d == today -> Bucket.TODAY
            d == today.plusDays(1) -> Bucket.TOMORROW
            d <= week -> Bucket.WEEK
            else -> Bucket.LATER
        }
    }
    return Bucket.entries.filter { it in byBucket }.associateWith { byBucket.getValue(it) }
}

/** Vencidas y de hoy, para Inicio. */
fun todayTasks(lists: List<ListDoc>, today: LocalDate): List<Task> =
    pendingDated(lists).filter { it.item.due!! <= today }.sortedWith(taskOrder)
