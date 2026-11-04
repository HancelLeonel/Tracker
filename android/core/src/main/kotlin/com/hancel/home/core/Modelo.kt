package com.hancel.home.core

import java.time.LocalDate

// Tipos de dominio de Home. Todos los montos son centavos (Long): Q12.50 = 1250.

enum class AccountType { NORMAL, CREDIT }

/** Una categoría guarda dinero real (no presupuesto). En una tarjeta, su única categoría es la deuda (≤ 0). */
data class Category(val id: String, val name: String, val balance: Long)

data class Account(val id: String, val name: String, val type: AccountType, val limit: Long, val cats: List<Category>) {
    val isCredit get() = type == AccountType.CREDIT
}

/** Identidad de una categoría dentro de su cuenta ("acc|cat" en la PWA). */
data class CatKey(val acc: String, val cat: String) {
    override fun toString() = "$acc|$cat"

    companion object {
        fun parse(s: String?): CatKey? {
            val i = s?.indexOf('|') ?: -1
            return if (s == null || i <= 0 || i == s.length - 1) null else CatKey(s.substring(0, i), s.substring(i + 1))
        }
    }
}

enum class MoveType { EXPENSE, INCOME, TRANSFER }

data class Part(val key: CatKey, val amount: Long)

data class Move(
    val id: String,
    val t: Long,
    val type: MoveType,
    val date: LocalDate,
    val title: String,
    val note: String,
    val kindId: String?,
    val cardId: String?,
    val to: CatKey?,
    val total: Long,
    val parts: List<Part>,
)

/** Tipo de gasto (en qué se usó el dinero). */
data class Kind(val id: String, val name: String)

data class ListItem(
    val id: String,
    val text: String,
    val head: Boolean = false,
    val done: Boolean = false,
    val due: LocalDate? = null,
    val doneAt: LocalDate? = null,
    val extra: Boolean = false,
)

data class ListDoc(
    val id: String,
    val name: String,
    val tplId: String?,
    val created: LocalDate,
    val t: Long,
    val archived: LocalDate? = null,
    val pinned: Boolean = false,
    val sortDue: Boolean = false,
    val order: Int? = null,
    val items: List<ListItem>,
)

/** Cada cuánto se repite una plantilla. `key` es el valor en los respaldos. */
enum class Freq(val key: String, val label: String) {
    NONE("", "Sin periodo"),
    WEEKLY("weekly", "Cada semana"),
    BIWEEKLY("biweekly", "Cada 15 días"),
    MONTHLY("monthly", "Cada mes");

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key } ?: NONE
    }
}

data class TemplateItem(val text: String, val head: Boolean = false, val dueIn: Int? = null)

data class Template(val id: String, val name: String, val freq: Freq, val items: List<TemplateItem>)

enum class ListSort(val key: String) {
    RECENT("recent"), DUE("due"), MANUAL("manual");

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key } ?: RECENT
    }
}

/** Ajustes que viajan en el respaldo. */
data class PortableSettings(
    val listSort: ListSort = ListSort.RECENT,
    val listManualSeeded: Boolean = false,
    val lastKind: String? = null,
    val lastFrom: CatKey? = null,
    val lastIncomeTo: CatKey? = null,
)

/** Todos los datos de la app: lo que se importa, exporta y reemplaza de una vez. */
data class Snapshot(
    val accounts: List<Account>,
    val moves: List<Move>,
    val kinds: List<Kind>,
    val lists: List<ListDoc>,
    val templates: List<Template>,
    val settings: PortableSettings,
)
