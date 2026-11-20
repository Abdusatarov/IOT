package com.airmonitor.data

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [Measurement::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun measurementDao(): MeasurementDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE measurements ADD COLUMN altitude_m REAL")
            }
        }
    }
}
