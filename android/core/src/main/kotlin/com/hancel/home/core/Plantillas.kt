package com.hancel.home.core

import java.time.LocalDate

sealed interface DueInfo {
    data object Now : DueInfo
    data class In(val days: Int) : DueInfo

    fun text() = when (this) {
        Now -> "Ya toca"
        is In -> "Toca en ${pl(days, "día")}"
    }
}

private fun Freq.next(d: LocalDate): LocalDate? = when (this) {
    Freq.NONE -> null
    Freq.WEEKLY -> d.plusDays(7)
    Freq.BIWEEKLY -> d.plusDays(15)
    Freq.MONTHLY -> d.plusMonths(1)
}

/** Cuándo toca repetir una plantilla, según la última lista creada con ella. Null si no tiene periodo o nunca se usó. */
fun dueInfo(t: Template, lists: List<ListDoc>, today: LocalDate): DueInfo? {
    val last = lists.filter { it.tplId == t.id }.maxOfOrNull { it.created } ?: return null
    val next = t.freq.next(last) ?: return null
    val left = daysBetween(today, next)
    return if (left <= 0) DueInfo.Now else DueInfo.In(left)
}

private val DUE_SUFFIX = Regex("^(.*?)\\s+@(\\d{1,3})$")

/** Cada línea pegada es una fila: «# Texto» es una sección y «Texto @3» vence 3 días después de crear la lista. */
fun parseItems(text: String): List<TemplateItem> = text.split('\n').map { it.trim() }.filter { it.isNotEmpty() }.mapNotNull { l ->
    if (l.startsWith("#")) return@mapNotNull l.replace(Regex("^#+\\s*"), "").takeIf { it.isNotEmpty() }?.let { TemplateItem(it, head = true) }
    val m = DUE_SUFFIX.find(l)
    if (m != null && m.groupValues[1].trim().isNotEmpty()) TemplateItem(m.groupValues[1].trim(), dueIn = m.groupValues[2].toInt().coerceIn(0, 365))
    else TemplateItem(l)
}

/**
 * Lista nueva, vacía o copiada de una plantilla (ids nuevos; `due = hoy + dueIn`). Después son independientes.
 * En orden manual queda arriba de todas.
 */
fun newList(tpl: Template?, name: String?, today: LocalDate, t: Long, lists: List<ListDoc>, newId: () -> String): ListDoc {
    val id = newId()
    val items = tpl?.items.orEmpty().map { i ->
        if (i.head) ListItem(newId(), i.text, head = true) else ListItem(newId(), i.text, due = i.dueIn?.let { today.plusDays(it.toLong()) })
    }
    return ListDoc(
        id = id,
        name = name?.trim()?.takeIf { it.isNotEmpty() } ?: "${tpl?.name ?: "Lista"} · ${fmtDate(today)}",
        tplId = tpl?.id,
        created = today,
        t = t,
        order = minOf(0, lists.minOfOrNull { it.order ?: 0 } ?: 0) - 1,
        items = items,
    )
}

private val DATE_SUFFIX = Regex(" · \\d{1,2} [a-z]{3}$")

/** Plantilla a partir de una lista: los elementos fijos (sin adicionales ni estado) y el nombre sin la fecha. */
fun templateFromList(l: ListDoc, newId: () -> String): Template = Template(
    id = newId(),
    name = l.name.replace(DATE_SUFFIX, ""),
    freq = Freq.NONE,
    items = l.items.filter { !it.extra }.map { TemplateItem(it.text, head = it.head) },
)
