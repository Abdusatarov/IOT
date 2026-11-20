package com.airmonitor.bluetooth



import android.Manifest

import android.annotation.SuppressLint

import android.bluetooth.*

import android.bluetooth.le.*

import android.content.Context

import android.content.pm.PackageManager

import android.os.Build

import android.os.ParcelUuid

import androidx.core.content.ContextCompat

import kotlinx.coroutines.flow.MutableStateFlow

import kotlinx.coroutines.flow.StateFlow

import org.json.JSONObject

import java.util.UUID



data class SensorReading(val deviceId: String, val temperature: Double?, val humidity: Double?, val mq135Raw: Int)



class BleManager(private val context: Context) {

    companion object {

        val SERVICE_UUID: UUID = UUID.fromString("4fafc201-1fb5-459e-8fcc-c5c9c331914b")

        val CHARACTERISTIC_UUID: UUID = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26a8")

        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    }

    private val _status = MutableStateFlow("Disconnected")

    val status: StateFlow<String> = _status

    private val _reading = MutableStateFlow<SensorReading?>(null)

    val reading: StateFlow<SensorReading?> = _reading

    private val _rawPayload = MutableStateFlow("")

    val rawPayload: StateFlow<String> = _rawPayload



    @Volatile var onReading: ((SensorReading, Long) -> Unit)? = null

    private val scanHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private val scanTimeout = Runnable { stopScan(); if (_status.value.startsWith("Scanning")) _status.value = "Disconnected — retry scan" }



    private var gatt: BluetoothGatt? = null

    private var scanner: BluetoothLeScanner? = null



    private val scanCallback = object : ScanCallback() {

        @SuppressLint("MissingPermission") override fun onScanResult(type: Int, result: ScanResult) {

            if (result.device.name == "ESP32-AIR-QUALITY") {

                if (gatt != null) return

                stopScan()

                _status.value = "ESP32 found вЂ” connecting..."

                _rawPayload.value = "Device ESP32-AIR-QUALITY found (RSSI: ${result.rssi}), connecting..."

                gatt = result.device.connectGatt(context, false, gattCallback)

            }

        }

        override fun onScanFailed(code: Int) {

            val err = "Scan failed with error code: $code"

            if (code == 1) {

                _status.value = "Scanning already started..."

            } else {

                _status.value = err

            }

            _rawPayload.value = err

        }

    }

    private fun reportError(message: String) {

        _status.value = message

        _rawPayload.value = message

    }



    @SuppressLint("MissingPermission")

    private fun discoverServices(g: BluetoothGatt) {

        _status.value = "Connected вЂ” discovering services..."

        if (!g.discoverServices()) reportError("Could not start service discovery")

    }



    private val gattCallback = object : BluetoothGattCallback() {

        @SuppressLint("MissingPermission")

        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, state: Int) {

            if (status == BluetoothGatt.GATT_SUCCESS && state == BluetoothProfile.STATE_CONNECTED) {

                _reading.value = null

                _status.value = "Connected вЂ” requesting MTU..."

                _rawPayload.value = "BLE connected. Requesting MTU 256..."

                // Wait for onMtuChanged before starting another GATT operation.

                if (!g.requestMtu(256)) discoverServices(g)

            } else if (state == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {

                reportError("Disconnected from device (GATT status: $status)")

                _reading.value = null

                g.close()

                if (gatt === g) gatt = null

            }

        }



        override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {

            _rawPayload.value = "MTU result: $mtu bytes, GATT status: $status"

            discoverServices(g)

        }



        @SuppressLint("MissingPermission")

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {

            if (status != BluetoothGatt.GATT_SUCCESS) {

                reportError("Service discovery failed: $status")

                return

            }

            val c = g.getService(SERVICE_UUID)?.getCharacteristic(CHARACTERISTIC_UUID)

            if (c == null) {

                reportError("BLE service or characteristic not found")

                return

            }

            if (!g.setCharacteristicNotification(c, true)) {

                reportError("Could not enable local notifications")

                return

            }

            val descriptor = c.getDescriptor(CCCD_UUID)

            if (descriptor == null) {

                reportError("Notification descriptor CCCD not found")

                return

            }

            _status.value = "Connected вЂ” subscribing..."

            _rawPayload.value = "Writing notification subscription to CCCD..."

            val started = if (Build.VERSION.SDK_INT >= 33) {

                g.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS

            } else {

                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE

                g.writeDescriptor(descriptor)

            }

            if (!started) reportError("Could not start CCCD write вЂ” notifications not enabled")

        }



        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {

            if (descriptor.uuid != CCCD_UUID) return

            if (status == BluetoothGatt.GATT_SUCCESS) {

                // A notification may arrive before this callback; preserve that reading.

                if (_reading.value == null) {

                    _status.value = "Connected вЂ” notifications enabled"

                    _rawPayload.value = "Subscription confirmed. Waiting for sensor JSON..."

                }

            } else {

                reportError("Notification subscription failed: $status")

            }

        }



        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {

            if (c.uuid == CHARACTERISTIC_UUID) parse(c.value)

        }



        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {

            if (c.uuid == CHARACTERISTIC_UUID) parse(value)

        }

    }

    @SuppressLint("MissingPermission") fun startScan() {

        if (gatt != null) return

        if (!hasPermissions()) {

            _status.value = "Permissions required"

            _rawPayload.value = "Error: Bluetooth scan/connect or Location permissions not granted."

            return

        }

        val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

        if (!adapter.isEnabled) {

            _status.value = "Bluetooth is off"

            _rawPayload.value = "Error: Bluetooth adapter is disabled. Please turn on Bluetooth."

            return

        }

        scanner = adapter.bluetoothLeScanner

        try {

            scanner?.stopScan(scanCallback)

        } catch (e: Exception) {}

        _status.value = "Scanning for ESP32-AIR-QUALITY..."

        _rawPayload.value = "Scanning started with filter UUID: $SERVICE_UUID"

        scanHandler.removeCallbacks(scanTimeout)

        scanHandler.postDelayed(scanTimeout, 12_000)

        scanner?.startScan(listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()), ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback)

    }

    @SuppressLint("MissingPermission") fun stopScan() {

        scanHandler.removeCallbacks(scanTimeout)

        try {

            scanner?.stopScan(scanCallback)

        } catch (e: Exception) {}

    }

    @SuppressLint("MissingPermission") fun disconnect() {

        stopScan()

        try {

            gatt?.disconnect()

            gatt?.close()

        } catch (_: Exception) {}

        gatt = null

        _status.value = "Disconnected"

        _rawPayload.value = "Manually disconnected."

    }

    private fun parse(bytes: ByteArray) {

        val rawStr = try { String(bytes, Charsets.UTF_8).trim() } catch (_: Exception) { "" }

        _rawPayload.value = rawStr

        try {

            val o = JSONObject(rawStr)

            _reading.value = SensorReading(

                o.optString("device_id", "ESP32-001"),

                if (o.isNull("temperature")) null else o.optDouble("temperature"),

                if (o.isNull("humidity")) null else o.optDouble("humidity"),

                o.optInt("mq135_raw", 0)

            )

            _status.value = "Connected - receiving data"
            _reading.value?.let { onReading?.invoke(it, System.currentTimeMillis()) }

        } catch (e: Exception) {

            _status.value = "Invalid JSON: $rawStr"

        }

    }

    private fun hasPermissions(): Boolean = if (Build.VERSION.SDK_INT >= 31) ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED else ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

}
