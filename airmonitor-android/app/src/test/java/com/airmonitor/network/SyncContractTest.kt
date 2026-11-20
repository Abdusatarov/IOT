package com.airmonitor.network

import com.airmonitor.data.Measurement
import com.google.gson.GsonBuilder
import org.junit.Assert.*
import org.junit.Test

class SyncContractTest {
    private fun row(id: String, altitude: Double? = null) = Measurement(id, "ESP32-001", 27.9, 33.4, 62,
        null, null, altitude, null, 0L, false)
    @Test fun wireUsesBackendNamesUtcAndNullableAltitude() {
        val gson = GsonBuilder().serializeNulls().create()
        val json = gson.toJsonTree(WireMeasurement.from(row("one"))).asJsonObject
        assertEquals("1970-01-01T00:00:00Z", json["measured_at"].asString)
        assertEquals("one", json["measurement_id"].asString)
        assertEquals(27.9, json["temperature_c"].asDouble, 0.001)
        assertEquals(33.4, json["humidity_pct"].asDouble, 0.001)
        assertEquals(62, json["mq135_raw"].asInt)
        assertTrue(json["altitude_m"].isJsonNull)
        assertFalse(json.has("measurementId"))
        assertEquals(512.3, gson.toJsonTree(WireMeasurement.from(row("two", 512.3))).asJsonObject["altitude_m"].asDouble, 0.001)
    }
    @Test fun mixedResultsAcknowledgeOnlyCorrectRowsEvenWhenReordered() {
        val rows = listOf(row("a"), row("b"), row("c"))
        val results = listOf(ItemResult(2, "c", "duplicate"), ItemResult(0, "a", "rejected"), ItemResult(1, "b", "accepted"))
        assertEquals(setOf("b", "c"), acknowledgedIds(rows, SyncResponse(1, 1, 1, results)).toSet())
    }
    @Test(expected = IllegalArgumentException::class) fun wrongIdNeverAcknowledged() {
        acknowledgedIds(listOf(row("a")), SyncResponse(results = listOf(ItemResult(0, "different", "accepted"))))
    }
    @Test(expected = IllegalArgumentException::class) fun countsAloneNeverAcknowledgeRows() {
        acknowledgedIds(listOf(row("a")), SyncResponse(accepted = 1))
    }
    @Test(expected = IllegalArgumentException::class) fun repeatedIndexNeverAcknowledged() {
        acknowledgedIds(listOf(row("a"), row("b")), SyncResponse(results = listOf(ItemResult(0, "a", "accepted"), ItemResult(0, "a", "accepted"))))
    }
}
