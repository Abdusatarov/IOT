package com.airmonitor.network

import android.content.Context
import android.content.SharedPreferences

class ServerSettings(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("server_prefs", Context.MODE_PRIVATE)

    companion object {
        const val DEFAULT_URL = "http://192.168.1.100:8002/"
        private const val KEY_SERVER_URL = "server_url"
    }

    fun getServerUrl(): String {
        return prefs.getString(KEY_SERVER_URL, DEFAULT_URL) ?: DEFAULT_URL
    }

    fun getConnection(): Pair<String, String> {
        val snapshot = prefs.all
        return (snapshot[KEY_SERVER_URL] as? String ?: DEFAULT_URL) to (snapshot["api_key"] as? String ?: "")
    }
    fun getApiKey(): String = prefs.getString("api_key", "") ?: ""
    fun saveApiKey(value: String) { prefs.edit().putString("api_key", value.trim()).apply() }
    fun getSyncStatus(): String = prefs.getString("sync_status", "Not synced yet") ?: "Not synced yet"
    fun saveSyncStatus(value: String) { prefs.edit().putString("sync_status", value).apply() }
    fun saveConnection(url: String, key: String): String {
        val cleaned = ServerUrlPolicy.normalize(url)
        prefs.edit().putString(KEY_SERVER_URL, cleaned).putString("api_key", key.trim()).apply()
        return cleaned
    }
    fun saveServerUrl(url: String): String {
        val cleaned = ServerUrlPolicy.normalize(url)
        prefs.edit().putString(KEY_SERVER_URL, cleaned).apply()
        return cleaned
    }
}
