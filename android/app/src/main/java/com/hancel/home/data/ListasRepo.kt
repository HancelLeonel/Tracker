package com.hancel.home.data

import androidx.room.withTransaction
import com.hancel.home.core.ListDoc
import com.hancel.home.core.Template
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn

class ListasRepo(private val db: HomeDb) {
    private val dao = db.listas()

    val lists: Flow<List<ListDoc>> = combine(dao.listsFlow(), dao.itemsFlow(), ::assembleLists).flowOn(Dispatchers.Default)
    val templates: Flow<List<Template>> = combine(dao.templatesFlow(), dao.templateItemsFlow(), ::assembleTemplates).flowOn(Dispatchers.Default)

    suspend fun saveList(l: ListDoc) = saveLists(listOf(l))

    suspend fun saveLists(ls: List<ListDoc>) = db.withTransaction {
        for (l in ls) {
            dao.upsertList(l.entity())
            dao.deleteItems(l.id)
            dao.insertItems(l.itemEntities())
        }
    }

    suspend fun deleteList(id: String) = dao.deleteList(id)

    suspend fun saveTemplate(t: Template) = db.withTransaction {
        dao.upsertTemplate(t.entity())
        dao.deleteTemplateItems(t.id)
        dao.insertTemplateItems(t.itemEntities())
    }

    suspend fun deleteTemplate(id: String) = dao.deleteTemplate(id)
}
