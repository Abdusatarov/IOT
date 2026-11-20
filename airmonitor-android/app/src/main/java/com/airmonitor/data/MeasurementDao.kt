package com.airmonitor.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface MeasurementDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(item: Measurement)
    @Query("SELECT * FROM measurements ORDER BY measuredAt DESC") fun observeAll(): Flow<List<Measurement>>
    @Query("SELECT * FROM measurements ORDER BY measuredAt DESC") suspend fun getAll(): List<Measurement>
    @Query("SELECT * FROM measurements WHERE synced = 0 ORDER BY measuredAt ASC") suspend fun pending(): List<Measurement>
    @Query("SELECT * FROM measurements WHERE synced = 0 AND (measuredAt > :afterTime OR (measuredAt = :afterTime AND measurementId > :afterId)) ORDER BY measuredAt, measurementId LIMIT 500")
    suspend fun pendingPage(afterTime: Long, afterId: String): List<Measurement>
    @Query("UPDATE measurements SET synced = 1 WHERE measurementId IN (:ids)") suspend fun markSynced(ids: List<String>)
    @Query("SELECT COUNT(*) FROM measurements WHERE synced = 0") fun observePendingCount(): Flow<Int>
    @Query("SELECT COUNT(*) FROM measurements") fun observeTotalCount(): Flow<Int>
}
