package com.hancel.home.data

import androidx.room.withTransaction
import com.hancel.home.core.Kind
import com.hancel.home.core.PortableSettings
import com.hancel.home.core.Snapshot
import com.hancel.home.core.newId
import com.hancel.home.core.respaldo.DEFAULT_KINDS
import kotlinx.coroutines.flow.first

/** Leer todo, reemplazar todo (importar) y borrar todo. */
class RespaldoRepo(private val db: HomeDb, private val ajustes: Ajustes) {
    suspend fun snapshot(): Snapshot = db.withTransaction {
        val d = db.dinero(); val l = db.listas()
        Snapshot(
            accounts = assembleAccounts(d.accounts(), d.categories()),
            moves = assembleMoves(d.moves(), d.parts()),
            kinds = d.kinds().map { it.model() },
            lists = assembleLists(l.lists(), l.items()),
            templates = assembleTemplates(l.templates(), l.templateItems()),
            settings = ajustes.portable.first(),
        )
    }

    /** Importar reemplaza todo en una sola transacción: si algo falla, queda lo que había. */
    suspend fun replaceAll(s: Snapshot) {
        db.withTransaction {
            db.clearAllTables()
            val d = db.dinero(); val l = db.listas()
            d.insertAccounts(s.accounts.map { it.entity() })
            d.insertCategories(s.accounts.flatMap { it.categoryEntities() })
            d.insertKinds(s.kinds.map { it.entity() })
            d.insertMoves(s.moves.map { it.entity() })
            d.insertParts(s.moves.flatMap { it.partEntities() })
            l.insertLists(s.lists.map { it.entity() })
            l.insertItems(s.lists.flatMap { it.itemEntities() })
            l.insertTemplates(s.templates.map { it.entity() })
            l.insertTemplateItems(s.templates.flatMap { it.itemEntities() })
        }
        ajustes.setPortable(s.settings)
    }

    suspend fun wipe() = replaceAll(
        Snapshot(emptyList(), emptyList(), DEFAULT_KINDS.map { Kind(newId(), it) }, emptyList(), emptyList(), PortableSettings()),
    )
}
