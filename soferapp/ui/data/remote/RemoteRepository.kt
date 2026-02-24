package ro.priscom.sofer.ui.data.remote

import android.util.Log
import java.time.LocalDate
import org.json.JSONObject
import retrofit2.HttpException

data class LoginAttemptResult(
    val user: AuthUserDto?,
    val errorMessage: String? = null,
    val httpCode: Int? = null
)


data class TripStartValidationResult(
    val response: ValidateTripStartResponse? = null,
    val errorMessage: String? = null,
    val isConnectivityIssue: Boolean = false,
    val httpCode: Int? = null
)

class RemoteRepository {

    suspend fun login(identifier: String, password: String): LoginAttemptResult {
        return try {
            val response = BackendApi.service.login(
                LoginRequest(identifier, password)
            )

            if (response.ok && response.user != null) {
                BackendApi.authToken = response.token
                LoginAttemptResult(user = response.user)
            } else {
                LoginAttemptResult(
                    user = null,
                    errorMessage = "Serverul a refuzat autentificarea. Verifică ID-ul și parola."
                )
            }

        } catch (e: HttpException) {
            val rawError = e.response()?.errorBody()?.string().orEmpty()
            val parsedError = parseBackendError(rawError)
            val message = parsedError
                ?: "Autentificare eșuată (${e.code()}). Verifică datele și încearcă din nou."

            Log.e("RemoteRepository", "Login error ${e.code()} - $message")
            LoginAttemptResult(
                user = null,
                errorMessage = message,
                httpCode = e.code()
            )
        } catch (e: Exception) {
            Log.e("RemoteRepository", "Login error", e)
            LoginAttemptResult(
                user = null,
                errorMessage = "Nu ne-am putut conecta la server. Verifică internetul și încearcă din nou."
            )
        }
    }

    private fun parseBackendError(rawError: String): String? {
        if (rawError.isBlank()) return null

        val parsed = runCatching {
            val json = JSONObject(rawError)
            json.optString("message")
                .ifBlank { json.optString("error") }
                .ifBlank { json.optString("details") }
                .ifBlank { null }
        }.getOrNull()

        return when (parsed) {
            "csrf_invalid" -> "Sesiunea de securitate a expirat. Apasă logout și autentifică-te din nou."
            else -> parsed
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

    suspend fun getRouteStations(
        routeId: Int,
        direction: String?
    ): List<RouteStationDto>? {
        return try {
            BackendApi.service.getRouteStationsApp(routeId, direction)
        } catch (e: Exception) {
            Log.e("RemoteRepository", "getRouteStations error", e)
            null
        }
    }

    suspend fun validateTripStart(
        routeId: Int,
        tripId: Int?,
        vehicleId: Int
    ): TripStartValidationResult {
        return try {
            val response = BackendApi.service.validateTripStart(
                ValidateTripStartRequest(
                    routeId = routeId,
                    tripId = tripId,
                    vehicleId = vehicleId
                )
            )
            TripStartValidationResult(response = response)
        } catch (e: HttpException) {
            val rawError = e.response()?.errorBody()?.string().orEmpty()
            val parsedError = parseBackendError(rawError)
            val message = when (e.code()) {
                401 -> "Sesiunea a expirat sau nu ești autentificat. Reintră în aplicație."
                else -> parsedError
                    ?: "Nu pot valida pornirea cursei (${e.code()}). Încearcă din nou."
            }

            Log.e("RemoteRepository", "validateTripStart HTTP ${e.code()} - $message")
            TripStartValidationResult(
                errorMessage = message,
                httpCode = e.code()
            )
        } catch (e: Exception) {
            Log.e("RemoteRepository", "validateTripStart error", e)
            TripStartValidationResult(
                errorMessage = "Nu mă pot conecta la server pentru validarea cursei.",
                isConnectivityIssue = true
            )
        }
    }
    suspend fun attachDriverVehicle(
        tripId: Int,
        vehicleId: Int
    ) {
        try {
            BackendApi.service.attachDriverVehicle(
                tripId = tripId,
                body = AttachDriverVehicleRequest(
                    vehicleId = vehicleId
                )
            )
            // Nu ne interesează răspunsul, scopul e doar să se trimită către backend.
            // Dacă backend-ul refuză (ex: cursă cu rezervări), e ok, nu blocăm șoferul.
        } catch (e: Exception) {
            Log.e("RemoteRepository", "attachDriverVehicle error", e)
            // Nu afișăm eroare la șofer, doar log în aplicație.
        }
    }
}


