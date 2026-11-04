package com.hancel.home.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.junit.rules.ExternalResource

/** Base Room en memoria para las pruebas. */
class DbRule : ExternalResource() {
    lateinit var db: HomeDb
    override fun before() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), HomeDb::class.java)
            .allowMainThreadQueries()
            .build()
    }
    override fun after() = db.close()
}
