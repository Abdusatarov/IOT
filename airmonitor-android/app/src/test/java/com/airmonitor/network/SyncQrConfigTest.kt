package com.airmonitor.network

import org.junit.Assert.*
import org.junit.Test

class SyncQrConfigTest {
    private val key = "test-only-not-a-real-key-1234567890"
    private fun qr(url: String = "https://example.test/", version: String = "1", type: String = "airmonitor.sync", syncKey: String = key) =
        """{"type":"$type","version":$version,"server_url":"$url","sync_key":"$syncKey"}"""
    @Test fun parsesPrivatePanelQrAndHidesKey() {
        val parsed = SyncQrConfig.parse(qr("https://example.test"))
        assertEquals("https://example.test/", parsed.serverUrl)
        assertEquals(key, parsed.syncKey)
        assertFalse(parsed.toString().contains(key))
    }
    @Test fun permitsPrivateLanButRejectsPublicHttp() {
        assertEquals("http://192.168.137.1:8002/", SyncQrConfig.parse(qr("http://192.168.137.1:8002")).serverUrl)
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse(qr("http://example.test/")) }
    }
    @Test fun rejectsWebsiteQrAndUnexpectedTypes() {
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse("https://example.test/") }
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse(qr(type = "website")) }
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse(qr(version = "1.5")) }
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse(qr(version = "2")) }
    }
    @Test fun rejectsUnsafeOrIncompleteConfiguration() {
        for (url in listOf("https://user:pass@example.test/", "https://example.test/?secret=x", "https://example.test/#x", "file:///etc/test", "")) {
            assertThrows(Exception::class.java) { SyncQrConfig.parse(qr(url)) }
        }
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse(qr(syncKey = "short")) }
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse("{}") }
        assertThrows(IllegalArgumentException::class.java) { SyncQrConfig.parse("x".repeat(8193)) }
    }
    @Test fun decodesTheActualPanelQrImage() {
        val input = java.io.DataInputStream(javaClass.getResourceAsStream("/panel-sync-qr.bin")!!)
        val width = input.readInt()
        val height = input.readInt()
        val pixels = IntArray(width * height) { if (input.readUnsignedByte() == 0) 0xff000000.toInt() else 0xffffffff.toInt() }
        input.close()
        val source = com.google.zxing.RGBLuminanceSource(width, height, pixels)
        val bitmap = com.google.zxing.BinaryBitmap(com.google.zxing.common.HybridBinarizer(source))
        val decoded = com.google.zxing.MultiFormatReader().decode(bitmap)
        val config = SyncQrConfig.parse(decoded.text)
        assertEquals("https://example.test/", config.serverUrl)
        assertEquals(key, config.syncKey)
    }
}
