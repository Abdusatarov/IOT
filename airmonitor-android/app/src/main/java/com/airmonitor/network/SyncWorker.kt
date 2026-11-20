package com.airmonitor.network

import android.content.Context
import androidx.work.*
import com.airmonitor.MonitorRuntime
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, parameters: WorkerParameters): CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = if (SyncEngine.run(applicationContext)) Result.success() else Result.retry()
}

object SyncEngine {
    private val lock = Mutex()
    suspend fun run(context: Context): Boolean = lock.withLock {
        val runtime = MonitorRuntime.get(context)
        val settings = ServerSettings(context)
        fun report(text: String) { settings.saveSyncStatus(text); runtime.syncStatus.value = text; android.util.Log.i("AirMonitorSync", text) }
        try {
            val dao = runtime.db.measurementDao()
            val api = ApiClient.getService(context)
            var afterTime = Long.MIN_VALUE
            var afterId = ""
            var confirmed = 0
            var rejected = 0
            // Bounded work; rejected records remain pending without blocking later rows.
            repeat(20) {
                val rows = dao.pendingPage(afterTime, afterId)
                if (rows.isEmpty()) {
                    report("Synced: $confirmed; rejected and kept locally: $rejected")
                    return@withLock true
                }
                val response = api.sync(SyncRequest(rows.map(WireMeasurement::from)))
                val ids = acknowledgedIds(rows, response)
                if (ids.isNotEmpty()) dao.markSynced(ids)
                confirmed += ids.size
                rejected += rows.size - ids.size
                afterTime = rows.last().measuredAt
                afterId = rows.last().measurementId
            }
            report("Synced: $confirmed; remaining records will be retried")
            false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) {
            // Do not include server URL/key or measurement payloads in diagnostics.
            report("Sync pending: ${error.javaClass.simpleName}. Will retry with network.")
            false
        }
    }
}
object SyncScheduler {
    private fun constraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun schedule(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("airmonitor-periodic-sync", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(constraints())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
    }
    fun now(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork("airmonitor-sync", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(constraints())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
    }
}
