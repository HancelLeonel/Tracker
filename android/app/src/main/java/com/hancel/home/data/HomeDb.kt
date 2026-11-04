package com.hancel.home.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    version = 1,
    exportSchema = true,
    entities = [
        AccountEntity::class, CategoryEntity::class, MoveEntity::class, PartEntity::class, KindEntity::class,
        ListEntity::class, ListItemEntity::class, TemplateEntity::class, TemplateItemEntity::class,
    ],
)
@TypeConverters(Convertidores::class)
abstract class HomeDb : RoomDatabase() {
    abstract fun dinero(): DineroDao
    abstract fun listas(): ListasDao

    companion object {
        /** Nombre del archivo de la base. Si cambias el esquema, sube `version` y agrega una migración: nunca la borres. */
        fun open(context: Context): HomeDb = Room.databaseBuilder(context, HomeDb::class.java, "home.db").build()
    }
}
