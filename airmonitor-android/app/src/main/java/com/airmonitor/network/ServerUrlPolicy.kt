package com.airmonitor.network

object ServerUrlPolicy {
    fun normalize(url: String): String {
        val parsed = java.net.URI(url.trim().ifBlank { ServerSettings.DEFAULT_URL }.let {
            if (it.startsWith("http://") || it.startsWith("https://")) it else "http://$it"
        })
        require(parsed.scheme in listOf("http", "https") && !parsed.host.isNullOrBlank() && parsed.userInfo == null && parsed.query == null && parsed.fragment == null) { "Enter an HTTP(S) server URL" }
        val host = parsed.host.lowercase()
        val octets = host.split('.').mapNotNull { it.toIntOrNull() }
        val ipv4 = octets.size == 4 && host.split('.').size == 4 && octets.all { it in 0..255 }
        val local = host == "localhost" || (ipv4 && (octets[0] == 10 || octets[0] == 127 ||
            (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && octets[1] in 16..31)))
        require(parsed.scheme == "https" || local) { "Use HTTPS for an internet server" }
        val cleaned = parsed.toString().trimEnd('/') + "/"
        return cleaned
    }
}
