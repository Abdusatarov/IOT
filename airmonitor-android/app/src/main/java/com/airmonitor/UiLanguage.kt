package com.airmonitor

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

object UiLanguage {
    fun current(context: Context): String = context.getSharedPreferences("ui_prefs", Context.MODE_PRIVATE).getString("language", "ru") ?: "ru"
    fun toggle(context: Context) { context.getSharedPreferences("ui_prefs", Context.MODE_PRIVATE).edit().putString("language", if (current(context) == "ru") "en" else "ru").apply() }
    fun wrap(context: Context): Context {
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(current(context)))
        return context.createConfigurationContext(configuration)
    }
    fun status(context: Context, text: String): String {
        val normalized = text.replace("вЂ”", "—")
        val exact = mapOf(
            "Disconnected" to R.string.ble_disconnected,
            "Disconnected — retry scan" to R.string.ble_retry,
            "ESP32 found — connecting..." to R.string.ble_found,
            "Connected — discovering services..." to R.string.ble_services,
            "Connected — requesting MTU..." to R.string.ble_mtu,
            "Connected — subscribing..." to R.string.ble_subscribing,
            "Connected — notifications enabled" to R.string.ble_ready,
            "Connected - receiving data" to R.string.ble_receiving,
            "Permissions required" to R.string.ble_permissions,
            "Bluetooth is off" to R.string.ble_off,
            "Scanning for ESP32-AIR-QUALITY..." to R.string.ble_scanning,
            "Scanning already started..." to R.string.ble_already_scanning,
            "GPS unavailable; measurements still saved" to R.string.gps_unavailable,
            "Background collection stopped" to R.string.collection_stopped,
            "Background collection active: every 10 seconds" to R.string.collection_active,
            "Allow location and nearby devices, then start again" to R.string.allow_permissions,
            "Saved automatically with GPS" to R.string.auto_saved,
            "Saved automatically; fresh GPS unavailable" to R.string.auto_saved_no_gps,
            "Not synced yet" to R.string.not_synced
        )
        exact[normalized]?.let { return context.getString(it) }
        Regex("Synced: ([0-9]+); rejected and kept locally: ([0-9]+)").matchEntire(text)?.let { return context.getString(R.string.sync_counts, it.groupValues[1], it.groupValues[2]) }
        Regex("Synced: ([0-9]+); remaining records will be retried").matchEntire(text)?.let { return context.getString(R.string.sync_remaining, it.groupValues[1]) }
        if (text.startsWith("Sync pending: ") && text.endsWith(". Will retry with network.")) return context.getString(R.string.sync_wait, text.removePrefix("Sync pending: ").removeSuffix(". Will retry with network."))
        return normalized
    }
}
