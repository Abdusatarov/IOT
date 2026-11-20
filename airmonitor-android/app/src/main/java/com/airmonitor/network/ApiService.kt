package com.airmonitor.network

import com.airmonitor.data.Measurement
import com.google.gson.annotations.SerializedName
import java.time.Instant
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class WireMeasurement(
    @SerializedName("measurement_id") val measurementId: String,
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("temperature_c") val temperatureC: Double?,
    @SerializedName("humidity_pct") val humidityPct: Double?,
    @SerializedName("mq135_raw") val mq135Raw: Int,
    val latitude: Double?, val longitude: Double?,
    @SerializedName("gps_accuracy_m") val gpsAccuracyM: Float?,
    @SerializedName("altitude_m") val altitudeM: Double?,
    @SerializedName("measured_at") val measuredAt: String,
    val synced: Boolean = false
) {
    companion object {
        fun from(m: Measurement) = WireMeasurement(m.measurementId, m.deviceId,
            m.temperatureC, m.humidityPct, m.mq135Raw, m.latitude, m.longitude,
            m.gpsAccuracyM, m.altitudeM, Instant.ofEpochMilli(m.measuredAt).toString())
    }
}
data class SyncRequest(val measurements: List<WireMeasurement>)
data class ItemResult(val index: Int = -1, @SerializedName("measurement_id") val measurementId: String? = null, val status: String = "")
data class SyncResponse(val accepted: Int = 0, val duplicates: Int = 0, val rejected: Int = 0, val results: List<ItemResult>? = null)
data class HealthResponse(val status: String? = null)

// Never infer acknowledgement from aggregate counts or response order.
fun acknowledgedIds(rows: List<Measurement>, response: SyncResponse): List<String> {
    val results = requireNotNull(response.results) { "Server did not return per-record results" }
    require(results.size == rows.size && results.map { it.index }.toSet() == rows.indices.toSet()) { "Incomplete sync acknowledgement" }
    for (result in results) {
        require(result.measurementId == rows[result.index].measurementId) { "Measurement ID mismatch" }
        require(result.status in setOf("accepted", "duplicate", "rejected")) { "Unknown sync status" }
    }
    return results.filter { it.status == "accepted" || it.status == "duplicate" }.map { rows[it.index].measurementId }
}
interface ApiService {
    @POST("api/v1/sync") suspend fun sync(@Body request: SyncRequest): SyncResponse
    @GET("api/v1/health") suspend fun healthCheck(): HealthResponse
}
