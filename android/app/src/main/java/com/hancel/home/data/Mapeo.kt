package com.hancel.home.data

import com.hancel.home.core.Account
import com.hancel.home.core.AccountType
import com.hancel.home.core.CatKey
import com.hancel.home.core.Category
import com.hancel.home.core.Freq
import com.hancel.home.core.Kind
import com.hancel.home.core.ListDoc
import com.hancel.home.core.ListItem
import com.hancel.home.core.Move
import com.hancel.home.core.MoveType
import com.hancel.home.core.Part
import com.hancel.home.core.Template
import com.hancel.home.core.TemplateItem

// Conversión entre tablas y modelos de :core.

fun assembleAccounts(accs: List<AccountEntity>, cats: List<CategoryEntity>): List<Account> {
    val byAcc = cats.groupBy { it.accountId }
    return accs.map { a ->
        Account(a.id, a.name, AccountType.valueOf(a.type), a.limit, byAcc[a.id].orEmpty().sortedBy { it.idx }.map { Category(it.id, it.name, it.balance) })
    }
}

fun Account.entity() = AccountEntity(id, name, type.name, limit)
fun Account.categoryEntities() = cats.mapIndexed { i, c -> CategoryEntity(id, c.id, i, c.name, c.balance) }

fun assembleMoves(moves: List<MoveEntity>, parts: List<PartEntity>): List<Move> {
    val byMove = parts.groupBy { it.moveId }
    return moves.map { m -> m.model(byMove[m.id].orEmpty()) }
}

fun MoveEntity.model(parts: List<PartEntity>) = Move(
    id = id, t = t, type = MoveType.valueOf(type), date = date, title = title, note = note, kindId = kindId, cardId = cardId,
    to = if (toAcc != null && toCat != null) CatKey(toAcc, toCat) else null, total = total,
    parts = parts.sortedBy { it.idx }.map { Part(CatKey(it.acc, it.cat), it.amount) },
)

fun Move.entity() = MoveEntity(id, t, type.name, date, title, note, kindId, cardId, to?.acc, to?.cat, total)
fun Move.partEntities() = parts.mapIndexed { i, p -> PartEntity(id, i, p.key.acc, p.key.cat, p.amount) }

fun KindEntity.model() = Kind(id, name)
fun Kind.entity() = KindEntity(id, name)

fun assembleLists(lists: List<ListEntity>, items: List<ListItemEntity>): List<ListDoc> {
    val byList = items.groupBy { it.listId }
    return lists.map { l ->
        ListDoc(
            id = l.id, name = l.name, tplId = l.tplId, created = l.created, t = l.t, archived = l.archived,
            pinned = l.pinned, sortDue = l.sortDue, order = l.ord,
            items = byList[l.id].orEmpty().sortedBy { it.idx }.map { ListItem(it.id, it.text, it.head, it.done, it.due, it.doneAt, it.extra) },
        )
    }
}

fun ListDoc.entity() = ListEntity(id, name, tplId, created, t, archived, pinned, sortDue, order)
fun ListDoc.itemEntities() = items.mapIndexed { i, it -> ListItemEntity(id, it.id, i, it.text, it.head, it.done, it.due, it.doneAt, it.extra) }

fun assembleTemplates(ts: List<TemplateEntity>, items: List<TemplateItemEntity>): List<Template> {
    val byT = items.groupBy { it.templateId }
    return ts.map { t -> Template(t.id, t.name, Freq.of(t.freq), byT[t.id].orEmpty().sortedBy { it.idx }.map { TemplateItem(it.text, it.head, it.dueIn) }) }
}

fun Template.entity() = TemplateEntity(id, name, freq.key)
fun Template.itemEntities() = items.mapIndexed { i, it -> TemplateItemEntity(id, i, it.text, it.head, it.dueIn) }
