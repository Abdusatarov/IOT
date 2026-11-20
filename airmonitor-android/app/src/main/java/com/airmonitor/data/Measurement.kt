package com.airmonitor.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

@Entity(tableName = "measurements")
data class Measurement(
    @PrimaryKey val measurementId: String,
    val deviceId: String,
    val temperatureC: Double?,
    val humidityPct: Double?,
    val mq135Raw: Int,
    val latitude: Double?,
    val longitude: Double?,
    @SerializedName("altitude_m")
    @ColumnInfo(name = "altitude_m")
    val altitudeM: Double?,
    val gpsAccuracyM: Float?,
    val measuredAt: Long,
    val synced: Boolean = false
)
