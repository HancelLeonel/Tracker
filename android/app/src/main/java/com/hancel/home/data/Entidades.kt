package com.hancel.home.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import java.time.LocalDate

// Tablas de Home. El orden de los registros de primer nivel es el de inserción (rowid); el de los hijos, `idx`.
// move_parts NO tiene clave foránea hacia categories ni accounts: la PWA permite borrar una categoría con historial
// y esos movimientos se conservan (sus efectos se ignoran, como applyMove).

@Entity(tableName = "accounts")
data class AccountEntity(@PrimaryKey val id: String, val name: String, val type: String, val limit: Long)

@Entity(
    tableName = "categories",
    primaryKeys = ["accountId", "id"],
    foreignKeys = [ForeignKey(entity = AccountEntity::class, parentColumns = ["id"], childColumns = ["accountId"], onDelete = ForeignKey.CASCADE)],
)
data class CategoryEntity(val accountId: String, val id: String, val idx: Int, val name: String, val balance: Long)

@Entity(tableName = "moves", indices = [Index("date")])
data class MoveEntity(
    @PrimaryKey val id: String,
    val t: Long,
    val type: String,
    val date: LocalDate,
    val title: String,
    val note: String,
    val kindId: String?,
    val cardId: String?,
    val toAcc: String?,
    val toCat: String?,
    val total: Long,
)

@Entity(
    tableName = "move_parts",
    primaryKeys = ["moveId", "idx"],
    foreignKeys = [ForeignKey(entity = MoveEntity::class, parentColumns = ["id"], childColumns = ["moveId"], onDelete = ForeignKey.CASCADE)],
)
data class PartEntity(val moveId: String, val idx: Int, val acc: String, val cat: String, val amount: Long)

@Entity(tableName = "kinds")
data class KindEntity(@PrimaryKey val id: String, val name: String)

@Entity(tableName = "lists")
data class ListEntity(
    @PrimaryKey val id: String,
    val name: String,
    val tplId: String?,
    val created: LocalDate,
    val t: Long,
    val archived: LocalDate?,
    val pinned: Boolean,
    val sortDue: Boolean,
    val ord: Int?,
)

@Entity(
    tableName = "list_items",
    primaryKeys = ["listId", "id"],
    foreignKeys = [ForeignKey(entity = ListEntity::class, parentColumns = ["id"], childColumns = ["listId"], onDelete = ForeignKey.CASCADE)],
)
data class ListItemEntity(
    val listId: String,
    val id: String,
    val idx: Int,
    val text: String,
    val head: Boolean,
    val done: Boolean,
    val due: LocalDate?,
    val doneAt: LocalDate?,
    val extra: Boolean,
)

@Entity(tableName = "templates")
data class TemplateEntity(@PrimaryKey val id: String, val name: String, val freq: String)

@Entity(
    tableName = "template_items",
    primaryKeys = ["templateId", "idx"],
    foreignKeys = [ForeignKey(entity = TemplateEntity::class, parentColumns = ["id"], childColumns = ["templateId"], onDelete = ForeignKey.CASCADE)],
)
data class TemplateItemEntity(val templateId: String, val idx: Int, val text: String, val head: Boolean, val dueIn: Int?)

class Convertidores {
    @TypeConverter fun fromDate(d: LocalDate?): String? = d?.toString()
    @TypeConverter fun toDate(s: String?): LocalDate? = s?.let(LocalDate::parse)
}
