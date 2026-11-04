package com.hancel.home.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface DineroDao {
    @Query("SELECT * FROM accounts ORDER BY rowid") fun accountsFlow(): Flow<List<AccountEntity>>
    @Query("SELECT * FROM categories ORDER BY accountId, idx") fun categoriesFlow(): Flow<List<CategoryEntity>>
    @Query("SELECT * FROM moves ORDER BY rowid") fun movesFlow(): Flow<List<MoveEntity>>
    @Query("SELECT * FROM move_parts ORDER BY moveId, idx") fun partsFlow(): Flow<List<PartEntity>>
    @Query("SELECT * FROM kinds ORDER BY rowid") fun kindsFlow(): Flow<List<KindEntity>>

    @Query("SELECT * FROM accounts ORDER BY rowid") suspend fun accounts(): List<AccountEntity>
    @Query("SELECT * FROM categories ORDER BY accountId, idx") suspend fun categories(): List<CategoryEntity>
    @Query("SELECT * FROM moves ORDER BY rowid") suspend fun moves(): List<MoveEntity>
    @Query("SELECT * FROM move_parts ORDER BY moveId, idx") suspend fun parts(): List<PartEntity>
    @Query("SELECT * FROM kinds ORDER BY rowid") suspend fun kinds(): List<KindEntity>

    @Query("SELECT * FROM moves WHERE id = :id") suspend fun move(id: String): MoveEntity?
    @Query("SELECT * FROM move_parts WHERE moveId = :id ORDER BY idx") suspend fun partsOf(id: String): List<PartEntity>

    @Upsert suspend fun upsertAccount(a: AccountEntity)
    @Upsert suspend fun upsertCategories(c: List<CategoryEntity>)
    @Query("DELETE FROM categories WHERE accountId = :accId AND id NOT IN (:keep)") suspend fun deleteCategoriesExcept(accId: String, keep: List<String>)
    @Query("UPDATE categories SET balance = :balance WHERE accountId = :acc AND id = :cat") suspend fun setBalance(acc: String, cat: String, balance: Long)
    @Query("DELETE FROM accounts WHERE id = :id") suspend fun deleteAccount(id: String)

    @Upsert suspend fun upsertMove(m: MoveEntity)
    @Query("DELETE FROM move_parts WHERE moveId = :id") suspend fun deleteParts(id: String)
    @Insert suspend fun insertParts(p: List<PartEntity>)
    @Query("DELETE FROM moves WHERE id = :id") suspend fun deleteMove(id: String)

    @Upsert suspend fun upsertKind(k: KindEntity)
    @Query("DELETE FROM kinds WHERE id = :id") suspend fun deleteKind(id: String)

    @Insert suspend fun insertAccounts(a: List<AccountEntity>)
    @Insert suspend fun insertCategories(c: List<CategoryEntity>)
    @Insert suspend fun insertMoves(m: List<MoveEntity>)
    @Insert suspend fun insertKinds(k: List<KindEntity>)
}

@Dao
interface ListasDao {
    @Query("SELECT * FROM lists ORDER BY rowid") fun listsFlow(): Flow<List<ListEntity>>
    @Query("SELECT * FROM list_items ORDER BY listId, idx") fun itemsFlow(): Flow<List<ListItemEntity>>
    @Query("SELECT * FROM templates ORDER BY rowid") fun templatesFlow(): Flow<List<TemplateEntity>>
    @Query("SELECT * FROM template_items ORDER BY templateId, idx") fun templateItemsFlow(): Flow<List<TemplateItemEntity>>

    @Query("SELECT * FROM lists ORDER BY rowid") suspend fun lists(): List<ListEntity>
    @Query("SELECT * FROM list_items ORDER BY listId, idx") suspend fun items(): List<ListItemEntity>
    @Query("SELECT * FROM templates ORDER BY rowid") suspend fun templates(): List<TemplateEntity>
    @Query("SELECT * FROM template_items ORDER BY templateId, idx") suspend fun templateItems(): List<TemplateItemEntity>

    @Upsert suspend fun upsertList(l: ListEntity)
    @Query("DELETE FROM list_items WHERE listId = :id") suspend fun deleteItems(id: String)
    @Insert suspend fun insertItems(i: List<ListItemEntity>)
    @Query("DELETE FROM lists WHERE id = :id") suspend fun deleteList(id: String)

    @Upsert suspend fun upsertTemplate(t: TemplateEntity)
    @Query("DELETE FROM template_items WHERE templateId = :id") suspend fun deleteTemplateItems(id: String)
    @Insert suspend fun insertTemplateItems(i: List<TemplateItemEntity>)
    @Query("DELETE FROM templates WHERE id = :id") suspend fun deleteTemplate(id: String)

    @Insert suspend fun insertLists(l: List<ListEntity>)
    @Insert suspend fun insertTemplates(t: List<TemplateEntity>)
}
