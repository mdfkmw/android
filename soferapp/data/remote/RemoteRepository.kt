package ro.priscom.sofer.ui.data.remote

import android.util.Log
import java.time.LocalDate

class RemoteRepository {

    suspend fun login(identifier: String, password: String): AuthUserDto? {
        return try {
            val response = BackendApi.service.login(
                LoginRequest(identifier, password)
            )

            if (response.ok && response.user != null) {
                response.user
            } else {
                null
            }

        } catch (e: Exception) {
            Log.e("RemoteRepository", "Login error", e)
            null
        }
    }

    suspend fun getRoutesWithTripsForToday(): List<MobileRouteWithTripsDto>? {
        return try {
            val today = LocalDate.now().toString() // "YYYY-MM-DD"
            BackendApi.service.getRoutesWithTrips(today)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
