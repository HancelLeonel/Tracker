package com.hancel.home.core

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Collator
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.util.Locale
import java.util.UUID

private val MONEY_FMT = ThreadLocal.withInitial { DecimalFormat("#,##0.00", DecimalFormatSymbols(Locale.US)) }

/** Quetzales como en la PWA: Q1,250.00 y, en negativo, con el signo menos (U+2212): −Q12.00. */
fun money(cents: Long): String {
    val s = "Q" + MONEY_FMT.get().format(BigDecimal.valueOf(Math.abs(cents), 2))
    return if (cents < 0) "−$s" else s
}

/**
 * Lee un monto escrito a mano. Acepta punto o coma decimal (el teclado de Android en español puede dar coma)
 * y separadores de miles (coma, punto o espacio). Con los dos signos, el último es el decimal; con uno solo,
 * la coma es decimal si le siguen 1 o 2 dígitos, y el punto es decimal si aparece una sola vez.
 * Redondea a centavos (mitad hacia arriba). Devuelve null si no es un número.
 */
fun parseMoney(text: String): Long? {
    var s = text.replace(" ", "").replace(" ", "").replace('−', '-').trim()
    if (s.isEmpty()) return null
    val neg = s.startsWith("-")
    if (neg) s = s.substring(1)
    if (s.isEmpty() || !s.all { it.isDigit() || it == '.' || it == ',' }) return null
    val lastDot = s.lastIndexOf('.')
    val lastComma = s.lastIndexOf(',')
    val normalized = when {
        lastDot >= 0 && lastComma >= 0 -> {
            val dec = if (lastDot > lastComma) '.' else ','
            val thousands = if (dec == '.') ',' else '.'
            s.replace(thousands.toString(), "").replace(dec, '.')
        }
        lastComma >= 0 -> {
            val decimal = s.count { it == ',' } == 1 && s.length - lastComma - 1 in 1..2
            if (decimal) s.replace(',', '.') else s.replace(",", "")
        }
        lastDot >= 0 && s.count { it == '.' } > 1 -> s.replace(".", "")
        else -> s
    }
    if (normalized.none { it.isDigit() }) return null
    val cents = try {
        BigDecimal(normalized).setScale(2, RoundingMode.HALF_UP).unscaledValue().toLong()
    } catch (e: NumberFormatException) {
        return null
    }
    return if (neg) -cents else cents
}

val MONTHS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

/** «3 nov». */
fun fmtDate(d: LocalDate): String = "${d.dayOfMonth} ${MONTHS[d.monthValue - 1]}"

/** «3 nov 2026». */
fun fmtDateY(d: LocalDate): String = "${fmtDate(d)} ${d.year}"

/** Encabezado de día de los movimientos: «Hoy», «Ayer» o «21 oct». */
fun dayLabel(d: LocalDate, today: LocalDate): String = when (d) {
    today -> "Hoy"
    today.minusDays(1) -> "Ayer"
    else -> fmtDate(d)
}

fun greeting(hour: Int): String = when {
    hour < 12 -> "Buenos días"
    hour < 19 -> "Buenas tardes"
    else -> "Buenas noches"
}

private val COLLATOR = ThreadLocal.withInitial { Collator.getInstance(Locale("es")).apply { strength = Collator.PRIMARY } }
private val CHUNKS = Regex("\\d+|\\D+")

/** Orden alfabético de la PWA (`localeCompare('es', { sensitivity: 'base', numeric: true })`): sin tildes ni mayúsculas y con números naturales. */
val byName: Comparator<String> = Comparator { a, b ->
    val xa = CHUNKS.findAll(a).map { it.value }.toList()
    val xb = CHUNKS.findAll(b).map { it.value }.toList()
    for (i in 0 until minOf(xa.size, xb.size)) {
        val p = xa[i]; val q = xb[i]
        val c = if (p[0].isDigit() && q[0].isDigit()) {
            p.trimStart('0').length.compareTo(q.trimStart('0').length).takeIf { it != 0 }
                ?: p.trimStart('0').compareTo(q.trimStart('0'))
        } else {
            COLLATOR.get().compare(p, q)
        }
        if (c != 0) return@Comparator c
    }
    xa.size.compareTo(xb.size)
}

fun newId(): String = UUID.randomUUID().toString()
