package com.airmonitor.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Looper
import android.os.SystemClock
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

data class GpsPoint(val latitude: Double, val longitude: Double, val accuracy: Float, val altitude: Double?)
class LocationHelper(context: Context) {
    private val client = LocationServices.getFusedLocationProviderClient(context.applicationContext)
    @Volatile private var latest: Location? = null
    private val callback = object: LocationCallback() {
        override fun onLocationResult(result: LocationResult) { latest = result.lastLocation }
    }
    private fun fresh(location: Location?): GpsPoint? {
        val l = location ?: return null
        val age = SystemClock.elapsedRealtimeNanos() - l.elapsedRealtimeNanos
        if (age !in 0..60_000_000_000L || !l.hasAccuracy()) return null
        return GpsPoint(l.latitude, l.longitude, l.accuracy, if(l.hasAltitude()) l.altitude else null)
    }
    fun current(): GpsPoint? = fresh(latest)
    @SuppressLint("MissingPermission") fun start(onError: (String) -> Unit) {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
            .setMinUpdateIntervalMillis(5_000L).build()
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
            .addOnFailureListener { onError("GPS unavailable; measurements still saved") }
    }
    fun stop() { client.removeLocationUpdates(callback); latest = null }
    @SuppressLint("MissingPermission") suspend fun getLastLocation(): GpsPoint? = suspendCancellableCoroutine { cont ->
        val cancellation = CancellationTokenSource()
        cont.invokeOnCancellation { cancellation.cancel() }
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
            .addOnSuccessListener { if(cont.isActive) cont.resume(fresh(it)) }
            .addOnFailureListener { if(cont.isActive) cont.resume(null) }
    }
}
