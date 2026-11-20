package com.airmonitor

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.airmonitor.network.SyncQrConfig
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.airmonitor.network.SyncScheduler
import androidx.room.Room
import com.airmonitor.bluetooth.BleManager
import com.airmonitor.data.AppDatabase
import com.airmonitor.data.Measurement
import com.airmonitor.location.LocationHelper
import com.airmonitor.network.ApiClient
import com.airmonitor.network.ServerSettings
import com.airmonitor.network.SyncRequest
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : ComponentActivity() {
    private lateinit var ble: BleManager
    private lateinit var db: AppDatabase
    private lateinit var location: LocationHelper
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }

    override fun attachBaseContext(newBase: Context) { super.attachBaseContext(UiLanguage.wrap(newBase)) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val runtime = MonitorRuntime.get(this)
        ble = runtime.ble
        db = runtime.db
        SyncScheduler.schedule(this)
        location = LocationHelper(this)

        val p = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 31) {
            p += Manifest.permission.BLUETOOTH_SCAN
            p += Manifest.permission.BLUETOOTH_CONNECT
        }
        if (Build.VERSION.SDK_INT >= 33) p += Manifest.permission.POST_NOTIFICATIONS
        permissions.launch(p.toTypedArray())

        setContent { AirMonitorApp(ble, db, location) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AirMonitorApp(ble: BleManager, db: AppDatabase, location: LocationHelper) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val status by ble.status.collectAsState()
    val reading by ble.reading.collectAsState()
    val rawPayload by ble.rawPayload.collectAsState()
    val list by db.measurementDao().observeAll().collectAsState(initial = emptyList())
    val pending by db.measurementDao().observePendingCount().collectAsState(initial = 0)
    val total by db.measurementDao().observeTotalCount().collectAsState(initial = 0)
    val runtime = remember { MonitorRuntime.get(context) }
    val collecting by runtime.collecting.collectAsState()
    val collectionStatus by runtime.collectionStatus.collectAsState()
    val syncStatus by runtime.syncStatus.collectAsState()
    var apiKeyInput by remember { mutableStateOf(ServerSettings(context).getApiKey()) }
    var message by remember { mutableStateOf("") }

    val serverSettings = remember { ServerSettings(context) }
    var serverUrlInput by remember { mutableStateOf(serverSettings.getServerUrl()) }
    var isTestingServer by remember { mutableStateOf(false) }
    var scannedConnection by remember { mutableStateOf<SyncQrConfig?>(null) }
    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        val content = result.contents
        if (content != null) {
            try { scannedConnection = SyncQrConfig.parse(content) }
            catch (error: IllegalArgumentException) { message = error.message ?: "Не удалось прочитать QR" }
            catch (_: Exception) { message = "Не удалось прочитать QR настроек" }
        }
    }


    MaterialTheme {
        scannedConnection?.let { connection ->
            AlertDialog(
                onDismissRequest = { scannedConnection = null },
                title = { Text(stringResource(R.string.qr_title)) },
                text = { Text(stringResource(R.string.qr_consent, connection.serverUrl)) },
                confirmButton = { TextButton(onClick = {
                    try {
                        serverUrlInput = serverSettings.saveConnection(connection.serverUrl, connection.syncKey)
                        apiKeyInput = connection.syncKey
                        SyncScheduler.now(context)
                        message = context.getString(R.string.qr_connected)
                        scannedConnection = null
                    } catch (_: Exception) { message = context.getString(R.string.qr_save_failed) }
                }) { Text(stringResource(R.string.connect)) } },
                dismissButton = { TextButton(onClick = { scannedConnection = null }) { Text(stringResource(R.string.cancel)) } }
            )
        }

        Scaffold(
            topBar = {
                TopAppBar(title = { Text(stringResource(R.string.app_title)) }, actions = {
                    TextButton(onClick = { UiLanguage.toggle(context); (context as? android.app.Activity)?.recreate() }) {
                        Text(if (UiLanguage.current(context) == "ru") "English" else "Русский")
                    }
                })
            }
        ) { pad ->
            LazyColumn(
                Modifier
                    .padding(pad)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // BLE Section with Indicator and Raw Log Box
                item {
                    val indicatorColor = when {
                        status.startsWith("Connected", ignoreCase = true) || status.contains("receiving", ignoreCase = true) -> Color(0xFF4CAF50) // Green
                        status.contains("found", ignoreCase = true) || status.contains("connecting", ignoreCase = true) || status.contains("Scanning", ignoreCase = true) || status.contains("started", ignoreCase = true) -> Color(0xFFFFC107) // Yellow
                        else -> Color(0xFFF44336) // Red
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(14.dp)
                                .background(indicatorColor, CircleShape)
                        )
                        Text(stringResource(R.string.ble_label, UiLanguage.status(context, status)), style = MaterialTheme.typography.titleMedium)
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !collecting, onClick = {
                            try { ContextCompat.startForegroundService(context, Intent(context, MonitoringService::class.java)) }
                            catch(e: Exception) { message = context.getString(R.string.could_not_start, e.javaClass.simpleName) }
                        }) { Text(stringResource(R.string.start_background)) }
                        OutlinedButton(onClick = {
                            context.stopService(Intent(context, MonitoringService::class.java))
                            ble.disconnect()
                        }) { Text(stringResource(R.string.stop)) }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(UiLanguage.status(context, collectionStatus))
                    Text(stringResource(R.string.background_help))
                    // Code Log Box (Full Raw JSON or Error)
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(stringResource(R.string.raw_log), style = MaterialTheme.typography.labelMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (rawPayload.isBlank()) context.getString(R.string.no_ble_data) else rawPayload,
                                fontFamily = FontFamily.Monospace,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }

                // Live Sensor Card
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(stringResource(R.string.live_sensor), style = MaterialTheme.typography.titleLarge)
                            Text(stringResource(R.string.temperature_label, reading?.temperature?.let { "%.1f °C".format(it) } ?: "--"))
                            Text(stringResource(R.string.humidity_label, reading?.humidity?.let { "%.1f %%".format(it) } ?: "--"))
                            Text("MQ-135 RAW: ${reading?.mq135Raw ?: "--"}")
                            Text(stringResource(R.string.device_label, reading?.deviceId ?: "--"))
                        }
                    }
                }

                // Save Measurement Button
                item {
                    Button(
                        enabled = reading != null && !collecting,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            scope.launch {
                                try {
                                    val r = reading ?: return@launch
                                    val gps = location.getLastLocation()
                                    val measurement = Measurement(
                                        measurementId = UUID.randomUUID().toString(),
                                        deviceId = r.deviceId,
                                        temperatureC = r.temperature,
                                        humidityPct = r.humidity,
                                        mq135Raw = r.mq135Raw,
                                        latitude = gps?.latitude,
                                        longitude = gps?.longitude,
                                        gpsAccuracyM = gps?.accuracy,
                                        altitudeM = gps?.altitude,
                                        measuredAt = System.currentTimeMillis(),
                                        synced = false
                                    )
                                    db.measurementDao().insert(measurement)
                                    SyncScheduler.now(context)
                                    message = if (gps == null) context.getString(R.string.saved_no_gps) else context.getString(R.string.saved_ok)
                                } catch (e: Exception) {
                                    message = context.getString(R.string.save_error, e.javaClass.simpleName)
                                }
                            }
                        }
                    ) {
                        Text(stringResource(R.string.save_measurement))
                    }
                }

                // Storage & Server Settings Card
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(stringResource(R.string.storage_title), style = MaterialTheme.typography.titleLarge)
                            Text(stringResource(R.string.total_label, total.toString()))
                            Text(stringResource(R.string.pending_label, pending.toString()))
                            OutlinedButton(onClick = {
                                try {
                                    scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                                        .setPrompt(context.getString(R.string.qr_prompt))
                                        .setBeepEnabled(false).setBarcodeImageEnabled(false)
                                        .setOrientationLocked(false).setCaptureActivity(QrCaptureActivity::class.java))
                                } catch (_: Exception) { message = context.getString(R.string.camera_error) }
                            }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.scan_qr)) }


                            OutlinedTextField(
                                value = serverUrlInput,
                                onValueChange = { serverUrlInput = it },
                                label = { Text(stringResource(R.string.server_url_label)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )
                            Text(stringResource(R.string.server_hint), style = MaterialTheme.typography.bodySmall)

                            OutlinedTextField(value = apiKeyInput, onValueChange = { apiKeyInput = it }, label = { Text(stringResource(R.string.key_label)) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
                            Text(UiLanguage.status(context, syncStatus))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                Button(
                                    modifier = Modifier.weight(1f),
                                    onClick = {
                                        try {
                                            val saved = serverSettings.saveConnection(serverUrlInput, apiKeyInput)
                                            serverUrlInput = saved
                                            SyncScheduler.now(context)
                                            message = context.getString(R.string.server_saved)
                                        } catch(e: Exception) { message = e.localizedMessage ?: "Invalid server URL" }
                                    }
                                ) {
                                    Text(stringResource(R.string.save_url))
                                }

                                Button(
                                    modifier = Modifier.weight(1f),
                                    onClick = {
                                        scope.launch {
                                            isTestingServer = true
                                            try {
                                                val service = ApiClient.getService(context)
                                                val res = service.healthCheck()
                                                message = if (res.status.equals("ok", ignoreCase = true)) {
                                                    context.getString(R.string.server_connected)
                                                } else {
                                                    context.getString(R.string.server_responded, res.status)
                                                }
                                            } catch (e: Exception) {
                                                message = context.getString(R.string.server_unavailable, e.javaClass.simpleName)
                                            } finally {
                                                isTestingServer = false
                                            }
                                        }
                                    }
                                ) {
                                    Text(stringResource(if (isTestingServer) R.string.testing else R.string.test_server))
                                }
                            }

                            if (message.isNotBlank()) {
                                Text(UiLanguage.status(context, message), color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }

                // Sync and Export Actions
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(
                            enabled = pending > 0,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                scope.launch {
                                    try {
                                        SyncScheduler.now(context)
                                        message = context.getString(R.string.sync_queued)
                                    } catch (e: Exception) {
                                        message = context.getString(R.string.sync_error, e.javaClass.simpleName)
                                    }
                                }
                            }
                        ) {
                            Text(stringResource(R.string.sync_now))
                        }

                        Button(
                            modifier = Modifier.weight(1f),
                            onClick = {
                                scope.launch {
                                    try {
                                        val allMeasurements = db.measurementDao().getAll()
                                        exportMeasurementsAsJson(context, allMeasurements)
                                        message = "Exported ${allMeasurements.size} measurements"
                                    } catch (e: Exception) {
                                        message = "Export error: ${e.localizedMessage ?: "Unknown error"}"
                                    }
                                }
                            }
                        ) {
                            Text(stringResource(R.string.export_json))
                        }
                    }
                }

                item {
                    HorizontalDivider()
                    Text(stringResource(R.string.saved_measurements), style = MaterialTheme.typography.titleLarge)
                }

                items(list.take(100)) { MeasurementRow(it) }
            }
        }
    }
}

fun exportMeasurementsAsJson(context: Context, measurements: List<Measurement>) {
    val jsonObject = JSONObject()
    val isoSdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    jsonObject.put("exported_at", isoSdf.format(Date()))
    jsonObject.put("device", Build.MODEL ?: "AndroidAdminDevice")

    val jsonArray = JSONArray()
    for (m in measurements) {
        val item = JSONObject().apply {
            put("measurement_id", m.measurementId)
            put("device_id", m.deviceId)
            if (m.temperatureC != null) put("temperature_c", m.temperatureC) else put("temperature_c", JSONObject.NULL)
            if (m.humidityPct != null) put("humidity_pct", m.humidityPct) else put("humidity_pct", JSONObject.NULL)
            put("mq135_raw", m.mq135Raw)
            if (m.latitude != null) put("latitude", m.latitude) else put("latitude", JSONObject.NULL)
            if (m.longitude != null) put("longitude", m.longitude) else put("longitude", JSONObject.NULL)
            if (m.gpsAccuracyM != null) put("gps_accuracy_m", m.gpsAccuracyM) else put("gps_accuracy_m", JSONObject.NULL)
            if (m.altitudeM != null) put("altitude_m", m.altitudeM) else put("altitude_m", JSONObject.NULL)
            put("measured_at", isoSdf.format(Date(m.measuredAt)))
            put("synced", m.synced)
        }
        jsonArray.put(item)
    }
    jsonObject.put("measurements", jsonArray)

    val timeTag = SimpleDateFormat("yyyy-MM-dd_HHmmss", Locale.US).format(Date())
    val fileName = "air_measurements_$timeTag.json"

    val cacheDir = File(context.cacheDir, "exports")
    if (!cacheDir.exists()) {
        cacheDir.mkdirs()
    }
    val file = File(cacheDir, fileName)
    file.writeText(jsonObject.toString(2), Charsets.UTF_8)

    val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file
    )

    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(intent, context.getString(R.string.export_title))
    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(chooser)
}

@Composable
fun MeasurementRow(m: Measurement) {
    val context = LocalContext.current
    val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    val d = sdf.format(Date(m.measuredAt))
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(d, style = MaterialTheme.typography.labelMedium)
            Text(stringResource(R.string.climate_row, m.temperatureC?.let { "%.1f °C".format(it) } ?: "--", m.humidityPct?.let { "%.1f %%".format(it) } ?: "--"))
            Text("MQ-135: ${m.mq135Raw}")
            val gpsText = if (m.latitude != null && m.longitude != null) {
                val altStr = if (m.altitudeM != null) ", alt: %.1fm".format(m.altitudeM) else ""
                "%.4f, %.4f (±%.1fm%s)".format(m.latitude, m.longitude, m.gpsAccuracyM ?: 0f, altStr)
            } else {
                context.getString(R.string.unavailable)
            }
            Text("GPS: $gpsText")
            Text(stringResource(if (m.synced) R.string.synced else R.string.pending), color = if (m.synced) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error)
        }
    }
}
