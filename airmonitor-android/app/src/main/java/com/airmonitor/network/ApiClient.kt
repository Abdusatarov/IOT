package com.airmonitor.network

import android.content.Context
import com.google.gson.GsonBuilder
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    fun getService(context: Context): ApiService {
        val settings = ServerSettings(context)
        val (serverUrl, key) = settings.getConnection()
        val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS).callTimeout(45, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                if (key.isNotBlank()) {
                    request.header("X-Sync-Token", key)
                    request.header("X-API-Key", key)
                }
                chain.proceed(request.build())
            }.build()
        return Retrofit.Builder().baseUrl(serverUrl).client(client)
            .addConverterFactory(GsonConverterFactory.create(GsonBuilder().serializeNulls().create()))
            .build().create(ApiService::class.java)
    }
}
