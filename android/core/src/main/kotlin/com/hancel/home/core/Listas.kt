package com.hancel.home.core

import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Reglas de listas (traducción de lists.js). `today` siempre llega como parámetro: nada de aquí lee el reloj.

data class Section(val head: ListItem?, val items: List<ListItem>)
data class Progress(val done: Int, val total: Int)

fun pl(n: Int, one: String, many: String = one + "s") = "$n ${if (n == 1) one else many}"

/** Fecha corta: «3 nov», o con año si no es el de hoy. */
fun dshort(d: LocalDate, today: LocalDate) = if (d.year == today.year) fmtDate(d) else fmtDateY(d)

fun daysBetween(from: LocalDate, to: LocalDate): Int = ChronoUnit.DAYS.between(from, to).toInt()

/**
 * Los pendientes conservan su orden (o van por fecha límite si `byDue`), y lo hecho baja al final ordenado por el día
 * en que se marcó. Solo es para pintar: el orden guardado no cambia, así desmarcar devuelve el elemento a su lugar.
 */
fun sink(items: List<ListItem>, byDue: Boolean): List<ListItem> {
    var pending = items.filter { !it.done }
    if (byDue) pending = pending.filter { it.due != null }.sortedBy { it.due } + pending.filter { it.due == null }
    val done = items.filter { it.done }.sortedWith(compareBy(nullsFirst()) { it.doneAt }) // sortedWith es estable
    return pending + done
}

/** Parte los elementos en secciones, una por encabezado (la primera puede no tenerlo). */
fun sections(items: List<ListItem>): List<Section> {
    val out = mutableListOf(Section(null, emptyList()))
    for (i in items) {
        if (i.head) out += Section(i, emptyList()) else out[out.lastIndex] = out.last().let { it.copy(items = it.items + i) }
    }
    return out.filter { it.head != null || it.items.isNotEmpty() }
}

private val ListDoc.real get() = items.filter { !it.head }

fun ListDoc.progress() = real.let { r -> Progress(r.count { it.done }, r.size) }
fun ListDoc.isDone() = real.let { r -> r.isNotEmpty() && r.all { it.done } }
fun ListDoc.nextDue(): LocalDate? = real.filter { !it.done && it.due != null }.minOfOrNull { it.due!! }
fun ListDoc.lateCount(today: LocalDate) = real.count { !it.done && it.due != null && it.due < today }

private val byNewest = compareByDescending<ListDoc> { it.created }.thenByDescending { it.t }

private fun comparator(sort: ListSort): Comparator<ListDoc> = when (sort) {
    ListSort.DUE -> compareBy<ListDoc> { it.nextDue() ?: LocalDate.MAX }.then(byNewest)
    ListSort.MANUAL -> compareBy<ListDoc> { it.order ?: Int.MAX_VALUE }.then(byNewest)
    ListSort.RECENT -> byNewest
}

/** Listas no archivadas en el orden de la vista; las fijadas siempre primero. */
fun orderedActive(lists: List<ListDoc>, sort: ListSort): List<ListDoc> {
    val cmp = comparator(sort)
    val act = lists.filter { it.archived == null }
    return act.filter { it.pinned }.sortedWith(cmp) + act.filter { !it.pinned }.sortedWith(cmp)
}

/** Da un `order` único en el orden que se ve ahora (al pasar a manual por primera vez y al reordenar). */
fun seedOrder(visible: List<ListDoc>): List<ListDoc> = visible.mapIndexed { i, l -> l.copy(order = i) }

/**
 * Mueve la lista `id` a la posición `toIndexInGroup` dentro de su grupo (fijadas o no fijadas) y devuelve todas las
 * listas con su `order` nuevo. No cruza de grupo.
 */
fun reorder(lists: List<ListDoc>, sort: ListSort, id: String, toIndexInGroup: Int): List<ListDoc> {
    val visible = orderedActive(lists, sort)
    val me = visible.firstOrNull { it.id == id } ?: return lists
    val group = visible.filter { it.pinned == me.pinned }.toMutableList()
    group.remove(me)
    group.add(toIndexInGroup.coerceIn(0, group.size), me)
    val full = if (me.pinned) group + visible.filter { !it.pinned } else visible.filter { it.pinned } + group
    val orders = full.mapIndexed { i, l -> l.id to i }.toMap()
    return lists.map { l -> orders[l.id]?.let { l.copy(order = it) } ?: l }
}

/** Al marcar se guarda el día; al desmarcar se borra. */
fun ListDoc.toggle(itemId: String, today: LocalDate): ListDoc = copy(items = items.map {
    if (it.id != itemId) it else if (it.done) it.copy(done = false, doneAt = null) else it.copy(done = true, doneAt = today)
})

/** Archivar es explícito y solo con todo marcado. */
fun ListDoc.finish(today: LocalDate): ListDoc = if (isDone()) copy(archived = today) else this

enum class MetaTone { MUTED, WARN, NEG }
data class ItemMeta(val tone: MetaTone, val text: String)

/** Línea bajo un elemento: cuándo se hizo o cuándo vence. */
fun itemMeta(i: ListItem, today: LocalDate): ItemMeta? {
    if (i.done) return i.doneAt?.let { ItemMeta(MetaTone.MUTED, "Hecho el ${dshort(it, today)}") }
    val due = i.due ?: return null
    val n = daysBetween(today, due)
    return when {
        n < 0 -> ItemMeta(MetaTone.NEG, "Venció el ${dshort(due, today)} (hace ${pl(-n, "día")})")
        n == 0 -> ItemMeta(MetaTone.WARN, "Vence hoy")
        n == 1 -> ItemMeta(MetaTone.WARN, "Vence mañana")
        else -> ItemMeta(MetaTone.MUTED, "Vence el ${dshort(due, today)} (en $n días)")
    }
}
