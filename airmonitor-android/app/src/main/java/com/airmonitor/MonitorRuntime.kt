package com.airmonitor

import android.content.Context
import androidx.room.Room
import com.airmonitor.bluetooth.BleManager
import com.airmonitor.data.AppDatabase
import com.airmonitor.network.ServerSettings
import kotlinx.coroutines.flow.MutableStateFlow

class MonitorRuntime private constructor(context: Context) {
    val ble = BleManager(context.applicationContext)
    val db = Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "air_monitor.db")
        .addMigrations(AppDatabase.MIGRATION_1_2).build()
    val collecting = MutableStateFlow(false)
    val collectionStatus = MutableStateFlow("Background collection stopped")
    val syncStatus = MutableStateFlow(ServerSettings(context).getSyncStatus())
    companion object {
        @Volatile private var instance: MonitorRuntime? = null
        fun get(context: Context): MonitorRuntime = instance ?: synchronized(this) {
            instance ?: MonitorRuntime(context.applicationContext).also { instance = it }
        }
    }
}
