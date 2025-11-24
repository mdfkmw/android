package ro.priscom.sofer.ui.data.local

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext



class LocalRepository(context: Context) {

    private val db = DatabaseProvider.getDatabase(context)

    suspend fun getDriver(id: Int) =
        db.employeeDao().getDriverById(id)

    suspend fun getOperators() =
        db.operatorDao().getAll()

    // Seed de test: băgăm operatori + un șofer în DB local dacă e gol
    suspend fun seedDemoDataIfEmpty() {
        // operatori
        if (db.operatorDao().getAll().isEmpty()) {
            db.operatorDao().insertAll(
                listOf(
                    OperatorEntity(id = 1, name = "Pris-Com"),
                    OperatorEntity(id = 2, name = "Auto-Dimas")
                )
            )
        }

        // șofer de test, ID = 25
        val demoId = 25
        val existing = db.employeeDao().getDriverById(demoId)
        if (existing == null) {
            db.employeeDao().insertAll(
                listOf(
                    EmployeeEntity(
                        id = demoId,
                        name = "Hotaran Cristi",
                        role = "driver",
                        operatorId = 2,
                        password = "1234"
                    )
                )
            )
        }
    }
    suspend fun seedVehiclesIfEmpty() {
        val vehicles = db.vehicleDao().getVehiclesForOperator(2)

        if (vehicles.isEmpty()) {
            db.vehicleDao().insertAll(
                listOf(
                    VehicleEntity(id = 101, plateNumber = "BT22DMS", operatorId = 2),
                    VehicleEntity(id = 102, plateNumber = "BT10PRS", operatorId = 2),
                    VehicleEntity(id = 103, plateNumber = "B200XYZ", operatorId = 1)
                )
            )
        }
    }
    suspend fun getVehiclesForOperator(operatorId: Int): List<VehicleEntity> =
        db.vehicleDao().getVehiclesForOperator(operatorId)

    suspend fun getAllVehicles(): List<VehicleEntity> =
        db.vehicleDao().getAllVehicles()

    // === RUTE / STAȚII / PREȚURI pentru UI ===

    suspend fun getAllRoutes() =
        db.routeDao().getAll()

    suspend fun getAllStations() =
        db.stationDao().getAll()

    suspend fun getRouteStationsForRoute(routeId: Int) =
        db.routeStationDao().getForRoute(routeId)

    suspend fun getAllPriceLists() =
        db.priceListDao().getAll()

    suspend fun getPriceListItemsForList(listId: Int) =
        db.priceListItemDao().getForList(listId)


    // Test simplu spre backend: apel GET la /api/ping (sau ce endpoint de test ai)
    suspend fun testBackendPing(): String? = withContext(Dispatchers.IO) {
        try {
            // ATENȚIE:
            // - pe emulator: 10.0.2.2 e calculatorul tău (unde merge backend-ul pe port 5000)
            // - dacă folosești un telefon real: vei schimba asta cu IP-ul PC-ului tău în rețea
            val url = URL("http://10.0.2.2:5000/api/ping")

            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream.bufferedReader().use { it.readText() }

            conn.disconnect()

            "HTTP $code: $text"
        } catch (e: Exception) {
            e.printStackTrace()
            "ERROR: ${e.message}"
        }
    }

}
