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
    val user: AuthUserDto?
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
    val visible_for_drivers: Boolean
)

data class StationDto(
    val id: Int,
    val name: String
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

// DTO-uri pentru endpointul /api/mobile/routes-with-trips

data class MobileTripDto(
    val trip_id: Int,
    val date: String,
    val time: String,
    val direction: String,
    val direction_label: String,
    val display_time: String
)

data class MobileRouteWithTripsDto(
    val route_id: Int,
    val route_name: String,
    val trips: List<MobileTripDto>
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

    @GET("/api/mobile/routes-with-trips")
    suspend fun getRoutesWithTrips(
        @Query("date") date: String
    ): List<MobileRouteWithTripsDto>

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
}

// === Singleton pentru Retrofit + cookie-uri de sesiune ===

object BackendApi {

    private const val BASE_URL = "http://10.0.2.2:5000/"

    private val cookieManager = CookieManager().apply {
        setCookiePolicy(CookiePolicy.ACCEPT_ALL)
    }

    private val okHttpClient: OkHttpClient by lazy {
        val logger = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        OkHttpClient.Builder()
            .cookieJar(JavaNetCookieJar(cookieManager))
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
