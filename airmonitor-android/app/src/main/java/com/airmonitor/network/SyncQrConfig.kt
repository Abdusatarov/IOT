package com.airmonitor.network

import com.google.gson.JsonParser

class SyncQrConfig(val serverUrl: String, val syncKey: String) {
    override fun toString(): String = "SyncQrConfig(serverUrl=$serverUrl, syncKey=<hidden>)"
    companion object {
        fun parse(content: String): SyncQrConfig {
            require(content.length <= 8192) { "QR слишком большой" }
            require(content.trimStart().startsWith("{")) { "Это QR сайта. Сканируйте личный QR «Датчик / Android» в панели сервера." }
            val json = try { JsonParser.parseString(content).asJsonObject }
            catch (_: Exception) { throw IllegalArgumentException("Не удалось прочитать QR настроек") }
            fun text(name: String): String {
                val value = json.get(name)
                require(value != null && value.isJsonPrimitive && value.asJsonPrimitive.isString) { "Неполные настройки QR" }
                return value.asString
            }
            require(text("type") == "airmonitor.sync") { "Это не QR подключения Air Monitor" }
            val version = json.get("version")
            require(version != null && version.isJsonPrimitive && version.asJsonPrimitive.isNumber && version.asString == "1") { "Неподдерживаемая версия QR" }
            val url = text("server_url")
            require(url.isNotBlank() && (url.startsWith("https://") || url.startsWith("http://"))) { "В QR нет адреса сервера" }
            val normalized = ServerUrlPolicy.normalize(url)
            val key = text("sync_key")
            require(key.length in 32..512 && key.all { it in '!'..'~' }) { "Некорректный ключ QR" }
            return SyncQrConfig(normalized, key)
        }
    }
}
