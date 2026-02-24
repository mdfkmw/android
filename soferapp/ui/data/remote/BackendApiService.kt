package ro.priscom.sofer.ui.data.remote

import com.google.gson.annotations.SerializedName
import okhttp3.JavaNetCookieJar
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import java.net.CookieManager
import java.net.CookiePolicy
import retrofit2.http.Path
import ro.priscom.sofer.BuildConfig


// === DTO-uri pentru /api/auth/login ===

data class LoginRequest(
    val identifier: String,
    val password: String
)

data class AuthUserDto(
    val id: Int,
    val role: String,
    val operator_id: Int?,
    val name: String?,
    val email: String?,
    val username: String?
)

data class LoginResponse(
    val ok: Boolean,
    val user: AuthUserDto?,
    val token: String?
)

// === DTO-uri pentru master data ===

data class OperatorDto(
    val id: Int,
    val name: String
)

data class EmployeeDto(
    val id: Int,
    val name: String,
    val role: String?,
    val operator_id: Int?
)

data class VehicleDto(
    val id: Int,
    @SerializedName("plate_number") val plateNumber: String,
    @SerializedName("operator_id") val operatorId: Int
)

data class RouteDto(
    val id: Int,
    val name: String,
    val order_index: Int,
    val visible_for_drivers: Boolean,

    // ✅ NOI – necesare pentru logica offline
    @SerializedName("visible_in_reservations")
    val visible_in_reservations: Boolean = false,

    @SerializedName("visible_online")
    val visible_online: Boolean = false
)

data class StationDto(
    val id: Int,
    val name: String,
    val latitude: Double?,
    val longitude: Double?
)

data class RouteScheduleDto(
    val id: Int,
    @SerializedName("route_id") val routeId: Int,
    @SerializedName("operator_id") val operatorId: Int,
    val departure: String,
    val direction: String
)


data class RouteStationDto(
    val id: Int,
    val route_id: Int,
    val station_id: Int,
    val order_index: Int,
    @SerializedName("station_name") val stationName: String? = null,
    val geofence_type: String?,        // "circle" / "polygon" / null
    val geofence_radius: Double?,      // pentru circle
    val geofence_polygon: List<List<Double>>? // [[lat, lng], [lat, lng], ...]
)

data class PriceListDto(
    val id: Int,
    val route_id: Int,
    val category_id: Int,
    val effective_from: String
)

data class PriceListItemDto(
    val id: Int,
    val price: Double,
    val currency: String,
    val price_list_id: Int,
    val from_station_id: Int,
    val to_station_id: Int
)

data class MobileReservationDto(
    val id: Long,
    @SerializedName("trip_id") val tripId: Int?,
    @SerializedName("seat_id") val seatId: Int?,
    @SerializedName("person_id") val personId: Long?,
    @SerializedName("person_name") val personName: String?,
    @SerializedName("person_phone") val personPhone: String?,
    val status: String,
    @SerializedName("board_station_id") val boardStationId: Int?,
    @SerializedName("exit_station_id") val exitStationId: Int?,
    val boarded: Int,

    @SerializedName("boarded_at") val boardedAt: String? = null,

    // 🔹 NOU – info rezervare
    @SerializedName("reservation_time") val reservationTime: String? = null,
    @SerializedName("agent_id") val agentId: Int? = null,
    @SerializedName("agent_name") val agentName: String? = null,

    // 🔹 NOU – prețuri + reduceri + plăți
    @SerializedName("base_price") val basePrice: Double? = null,
    @SerializedName("discount_amount") val discountAmount: Double? = null,
    @SerializedName("final_price") val finalPrice: Double? = null,
    @SerializedName("paid_amount") val paidAmount: Double? = null,
    @SerializedName("due_amount") val dueAmount: Double? = null,
    @SerializedName("is_paid") val isPaid: Boolean = false,
    @SerializedName("discount_label") val discountLabel: String? = null,
    @SerializedName("promo_code") val promoCode: String? = null
)


data class MobileTripReservationsResponse(
    val ok: Boolean,
    @SerializedName("trip_id") val tripId: Int,
    val reservations: List<MobileReservationDto>
)


// DTO-uri pentru endpointul /api/mobile/routes-with-trips

data class MobileTripDto(
    val trip_id: Int,
    val date: String,
    val time: String,
    val direction: String,
    val direction_label: String,
    val display_time: String,
    val route_schedule_id: Int?
)

data class MobileRouteWithTripsDto(
    val route_id: Int,
    val route_name: String,
    val trips: List<MobileTripDto>
)



// DTO-uri pentru validarea pornirii cursei (mașină corectă / rută critică)
data class ValidateTripStartRequest(
    @SerializedName("route_id") val routeId: Int,
    @SerializedName("trip_id") val tripId: Int?,
    @SerializedName("vehicle_id") val vehicleId: Int
)

data class ValidateTripStartResponse(
    val ok: Boolean,
    val critical: Boolean,
    val error: String?
)

// DTO-uri pentru atașarea vehiculului șoferului la un trip (curse scurte)
data class AttachDriverVehicleRequest(
    @SerializedName("vehicle_id") val vehicleId: Int
)

data class AttachDriverVehicleResponse(
    val success: Boolean,
    @SerializedName("trip_id") val tripId: Int,
    @SerializedName("trip_vehicle_id") val tripVehicleId: Int?,
    @SerializedName("vehicle_id") val vehicleId: Int,
    @SerializedName("is_primary") val isPrimary: Boolean,
    val created: Boolean
)

// === DTO-uri pentru biletele șoferului (sync offline) ===

data class TicketBatchItemRequest(
    @SerializedName("local_id") val localId: Long,
    @SerializedName("trip_id") val tripId: Int?,
    @SerializedName("trip_vehicle_id") val tripVehicleId: Int?,
    @SerializedName("from_station_id") val fromStationId: Int?,
    @SerializedName("to_station_id") val toStationId: Int?,
    @SerializedName("seat_id") val seatId: Int?,
    @SerializedName("price_list_id") val priceListId: Int?,
    @SerializedName("discount_type_id") val discountTypeId: Int?,
    @SerializedName("base_price") val basePrice: Double?,
    @SerializedName("final_price") val finalPrice: Double?,
    @SerializedName("currency") val currency: String?,
    @SerializedName("payment_method") val paymentMethod: String?,
    @SerializedName("created_at") val createdAt: String
)

data class TicketsBatchRequest(
    @SerializedName("tickets") val tickets: List<TicketBatchItemRequest>
)

data class TicketBatchItemResponse(
    @SerializedName("local_id") val localId: Long?,
    val ok: Boolean,
    @SerializedName("reservation_id") val reservationId: Long?,
    @SerializedName("payment_id") val paymentId: Long?,
    val error: String?
)

data class TicketsBatchResponse(
    val ok: Boolean,
    val results: List<TicketBatchItemResponse>
)


data class BoardResponse(
    val ok: Boolean,
    val error: String? = null
)

data class NoShowResponse(
    val ok: Boolean,
    val error: String? = null
)

data class CancelResponse(
    val ok: Boolean,
    val error: String? = null
)

data class DiscountTypeDto(
    val id: Int,
    val code: String,
    val label: String,
    val value_off: Double,
    val type: String, // "percent" sau "fixed"
    val description_required: Boolean,
    val description_label: String?,
    val date_limited: Boolean,
    val valid_from: String?, // "YYYY-MM-DD" sau null
    val valid_to: String?    // "YYYY-MM-DD" sau null
)

data class RouteDiscountDto(
    @SerializedName("discount_type_id") val discountTypeId: Int,
    @SerializedName("route_schedule_id") val routeScheduleId: Int,
    @SerializedName("visible_driver") val visibleDriver: Boolean
)




data class UpdateReservationPricingRequest(
    @SerializedName("base_price") val basePrice: Double,
    @SerializedName("final_price") val finalPrice: Double,
    @SerializedName("discount_type_id") val discountTypeId: Int?,
    @SerializedName("exit_station_id") val exitStationId: Int?
)

data class SimpleOkResponse(
    val ok: Boolean,
    val error: String? = null
)


data class MobileSeatDto(
    val id: Int,
    @SerializedName("vehicle_id") val vehicleId: Int,
    val label: String?,
    val row: Int?,
    @SerializedName("seat_col") val seatCol: Int?,
    @SerializedName("seat_type") val seatType: String?,
    @SerializedName("pair_id") val pairId: Int?
)

data class MobileMySeatMapResponse(
    val ok: Boolean,
    @SerializedName("trip_id") val tripId: Int?,
    @SerializedName("trip_vehicle_id") val tripVehicleId: Int?,
    @SerializedName("vehicle_id") val vehicleId: Int?,
    val seats: List<MobileSeatDto>?,
    val reservations: List<MobileReservationDto>?
)



// === Definiția Retrofit pentru backend ===

interface BackendApiService {

    @POST("/api/auth/login")
    suspend fun login(
        @Body body: LoginRequest
    ): LoginResponse

    // --- MASTER DATA ---

    @GET("/api/operators")
    suspend fun getOperators(): List<OperatorDto>

    @GET("/api/employees")
    suspend fun getEmployees(): List<EmployeeDto>

    @GET("/api/vehicles")
    suspend fun getVehicles(): List<VehicleDto>

    // --- MASTER DATA pentru aplicația de șofer (fără autentificare) ---

    @GET("/api/mobile/operators")
    suspend fun getOperatorsApp(): List<OperatorDto>

    @GET("/api/mobile/employees")
    suspend fun getEmployeesApp(): List<EmployeeDto>

    @GET("/api/mobile/vehicles")
    suspend fun getVehiclesApp(): List<VehicleDto>

    @GET("/api/mobile/stations")
    suspend fun getStationsApp(): List<StationDto>


    // --- RUTE / STAȚII / PREȚURI pentru aplicația de șofer ---

    // Rute vizibile pentru șofer, filtrate pe o anumită zi (autentificat)
    @GET("/api/routes")
    suspend fun getRoutesForDriver(
        @retrofit2.http.Query("date") date: String,
        @retrofit2.http.Query("driver") driver: Int = 1
    ): List<RouteDto>

    @GET("/api/mobile/discount_types")
    suspend fun getDiscountTypes(): List<DiscountTypeDto>

    @GET("/api/mobile/route_discounts")
    suspend fun getRouteDiscounts(): List<RouteDiscountDto>


    @GET("/api/mobile/route_schedules")
    suspend fun getRouteSchedulesApp(): List<RouteScheduleDto>


    @GET("/api/mobile/routes-with-trips")
    suspend fun getRoutesWithTrips(
        @Query("date") date: String
    ): List<MobileRouteWithTripsDto>

    @POST("/api/mobile/validate-trip-start")
    suspend fun validateTripStart(
        @Body body: ValidateTripStartRequest
    ): ValidateTripStartResponse

    @POST("/api/mobile/trips/{trip_id}/driver-vehicle")
    suspend fun attachDriverVehicle(
        @Path("trip_id") tripId: Int,
        @Body body: AttachDriverVehicleRequest
    ): AttachDriverVehicleResponse


    @GET("/api/mobile/routes")
    suspend fun getRoutesApp(): List<RouteDto>

    @GET("/api/mobile/route_stations")
    suspend fun getRouteStationsApp(
        @Query("route_id") routeId: Int? = null,
        @Query("direction") direction: String? = null
    ): List<RouteStationDto>

    @GET("/api/mobile/price_lists")
    suspend fun getPriceListsApp(): List<PriceListDto>

    @GET("/api/mobile/price_list_items")
    suspend fun getPriceListItemsApp(): List<PriceListItemDto>

    @GET("/api/mobile/trips/{tripId}/reservations")
    suspend fun getTripReservations(
        @Path("tripId") tripId: Int
    ): MobileTripReservationsResponse

    @POST("/api/mobile/reservations/{id}/board")
    suspend fun markReservationBoarded(
        @Path("id") reservationId: Long
    ): BoardResponse

    @POST("/api/mobile/reservations/{id}/noshow")
    suspend fun markReservationNoShow(
        @Path("id") reservationId: Long
    ): NoShowResponse

    @POST("/api/mobile/reservations/{id}/cancel")
    suspend fun cancelReservation(
        @Path("id") reservationId: Long
    ): CancelResponse



    @POST("/api/mobile/tickets/batch")
    suspend fun sendTicketsBatch(
        @Body body: TicketsBatchRequest
    ): TicketsBatchResponse



    @POST("/api/mobile/reservations/{id}/update-pricing")
    suspend fun updateReservationPricing(
        @Path("id") reservationId: Long,
        @Body body: UpdateReservationPricingRequest
    ): SimpleOkResponse

    @GET("/api/mobile/trips/{tripId}/my-seatmap")
    suspend fun getMySeatMap(
        @Path("tripId") tripId: Int
    ): MobileMySeatMapResponse
}

// === Singleton pentru Retrofit + cookie-uri de sesiune ===

object BackendApi {

    private const val DEFAULT_DEV_BASE_URL = "http://10.0.2.2:5000/"
    private const val DEFAULT_PROD_BASE_URL = "https://api.pris-com.ro/"

    private fun normalizeBaseUrl(raw: String): String {
        val trimmed = raw.trim()
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }

    private fun resolveBaseUrl(): String {
        // 1) runtime override (util pentru teste pe telefon fizic)
        val envOverride = System.getenv("SOFER_BACKEND_URL")?.trim().orEmpty()
        if (envOverride.startsWith("http://") || envOverride.startsWith("https://")) {
            return normalizeBaseUrl(envOverride)
        }

        // 2) dacă există BuildConfig/BACKEND_BASE_URL din flavor, îl folosim
        try {
            val clazz = Class.forName("ro.priscom.sofer.BuildConfig")

            val backendFieldValue = runCatching {
                clazz.getField("BACKEND_BASE_URL").get(null) as? String
            }.getOrNull()

            if (!backendFieldValue.isNullOrBlank()) {
                return normalizeBaseUrl(backendFieldValue)
            }

            val flavor = runCatching {
                clazz.getField("FLAVOR").get(null) as? String
            }.getOrNull().orEmpty()

            if (flavor.contains("prod", ignoreCase = true)) {
                return DEFAULT_PROD_BASE_URL
            }
        } catch (_: Exception) {
            // BuildConfig poate să nu fie disponibil în acest snapshot
        }

        // 3) fallback local emulator
        return DEFAULT_DEV_BASE_URL
    }

    private val BASE_URL: String by lazy { resolveBaseUrl() }

    var authToken: String? = null

    private val cookieManager = CookieManager().apply {
        setCookiePolicy(CookiePolicy.ACCEPT_ALL)
    }

    private val okHttpClient: OkHttpClient by lazy {
        val logger = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val authInterceptor = okhttp3.Interceptor { chain ->
            val request = authToken?.let {
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $it")
                    .build()
            } ?: chain.request()
            chain.proceed(request)
        }

        OkHttpClient.Builder()
            .cookieJar(JavaNetCookieJar(cookieManager))
            .addInterceptor(authInterceptor)
            .addInterceptor(logger)
            .build()
    }

    val service: BackendApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(BackendApiService::class.java)
    }
}
