package com.airmonitor

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.airmonitor.data.Measurement
import com.airmonitor.location.LocationHelper
import com.airmonitor.network.SyncScheduler
import com.airmonitor.network.SyncEngine
import kotlinx.coroutines.*
import java.util.UUID

class MonitoringService: Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var runtime: MonitorRuntime
    private lateinit var location: LocationHelper
    private var wakeLock: PowerManager.WakeLock? = null
    private var started = false
    private var lastSample = 0L
    override fun onBind(intent: Intent?) = null
    override fun onCreate() {
        super.onCreate()
        runtime = MonitorRuntime.get(this)
        location = LocationHelper(this)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { stopSelf(); return START_NOT_STICKY }
        if (started) return START_NOT_STICKY
        val gps = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            .any { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
        val ble = Build.VERSION.SDK_INT < 31 || listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
            .all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
        if (!gps || !ble) { runtime.collectionStatus.value = "Allow location and nearby devices, then start again"; stopSelf(); return START_NOT_STICKY }
        try {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL, UiLanguage.wrap(this).getString(R.string.collection_channel), NotificationManager.IMPORTANCE_LOW))
            val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val stop = PendingIntent.getService(this, 1, Intent(this, MonitoringService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val notification = NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth).setContentTitle(UiLanguage.wrap(this).getString(R.string.notification_title))
                .setContentText(UiLanguage.wrap(this).getString(R.string.notification_text))
                .setContentIntent(open).setOngoing(true).addAction(android.R.drawable.ic_media_pause, UiLanguage.wrap(this).getString(R.string.stop), stop).build()
            ServiceCompat.startForeground(this, 101, notification,
                if(Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0)
            wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AirMonitor:collection").also { it.acquire() }
            started = true
            runtime.collecting.value = true
            runtime.collectionStatus.value = "Background collection active: every 10 seconds"
            location.start { runtime.collectionStatus.value = it }
            scope.launch {
                runtime.ble.status.collect { status ->
                    android.util.Log.i("AirMonitorBLE", if (status.startsWith("Invalid JSON")) "Invalid sensor JSON" else status)
                }
            }
            runtime.ble.onReading = { reading, receivedAt ->
                val now = SystemClock.elapsedRealtime()
                if (lastSample == 0L || now - lastSample >= 10_000L) {
                    lastSample = now
                    val gpsPoint = location.current()
                    val row = Measurement(UUID.randomUUID().toString(), reading.deviceId, reading.temperature,
                        reading.humidity, reading.mq135Raw, gpsPoint?.latitude, gpsPoint?.longitude,
                        gpsPoint?.altitude, gpsPoint?.accuracy, receivedAt, false)
                    scope.launch {
                        try {
                            runtime.db.measurementDao().insert(row)
                            android.util.Log.i("AirMonitorCollection", "Measurement saved automatically; gps=${gpsPoint != null}")
                            runtime.collectionStatus.value = if(gpsPoint == null) "Saved automatically; fresh GPS unavailable" else "Saved automatically with GPS"
                            SyncScheduler.now(applicationContext)
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch(error: Exception) { runtime.collectionStatus.value = "Save failed: ${error.javaClass.simpleName}" }
                    }
                }
            }
            SyncScheduler.schedule(this)
            SyncScheduler.now(this)
            scope.launch {
                var retryDelay = 30_000L
                while (isActive) {
                    val network = getSystemService(android.net.ConnectivityManager::class.java)
                    if (network.getNetworkCapabilities(network.activeNetwork)?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true) {
                        retryDelay = if (SyncEngine.run(applicationContext)) 30_000L else (retryDelay * 2).coerceAtMost(300_000L)
                    }
                    delay(retryDelay)
                }
            }
            scope.launch {
                while(isActive) {
                    val status = runtime.ble.status.value
                    if (status.startsWith("Disconnected") || status.startsWith("Scan failed")) runtime.ble.startScan()
                    delay(30_000)
                }
            }
        } catch(error: Exception) {
            runtime.collectionStatus.value = "Could not start collection: ${error.javaClass.simpleName}"
            stopSelf()
        }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        runtime.ble.onReading = null
        if (started) runtime.ble.disconnect()
        location.stop()
        scope.cancel()
        if (wakeLock?.isHeld == true) wakeLock?.release()
        runtime.collecting.value = false
        if (started) runtime.collectionStatus.value = "Background collection stopped"
        super.onDestroy()
    }
    companion object {
        const val STOP = "com.airmonitor.STOP_COLLECTION"
        private const val CHANNEL = "airmonitor-collection"
    }
}
