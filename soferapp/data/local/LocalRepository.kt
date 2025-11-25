package ro.priscom.sofer.ui.data.local

import android.content.Context
import java.time.LocalDate
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

    suspend fun getStationsForRoute(routeId: Int, direction: String? = null): List<StationEntity> {
        val stations = db.stationDao().getForRoute(routeId)

        return if (direction?.lowercase() == "retur") stations.reversed() else stations
    }

    suspend fun getRouteStationsForRoute(routeId: Int) =
        db.routeStationDao().getForRoute(routeId)

    suspend fun getAllPriceLists() =
        db.priceListDao().getAll()

    suspend fun getPriceListItemsForList(listId: Int) =
        db.priceListItemDao().getForList(listId)

    /**
     * Găsește prețul de bază pentru un segment (stație -> stație),
     * din lista de prețuri a unei rute, pentru categoria NORMAL (id = 1),
     * ținând cont de data de azi (effective_from <= azi, se ia ultima).
     */
    suspend fun getPriceForSegment(
        routeId: Int,
        fromStationId: Int,
        toStationId: Int,
        categoryId: Int = 1,
        date: LocalDate = LocalDate.now()
    ): Double? {
        // 1. toate listele de preț
        val allLists = db.priceListDao().getAll()

        // 2. păstrăm doar pentru ruta + categoria cerute
        //    și doar cele care au intrat în vigoare până la data cerută
        val applicable = allLists.mapNotNull { list ->
            if (list.routeId != routeId || list.categoryId != categoryId) return@mapNotNull null
            val effective = try {
                LocalDate.parse(list.effectiveFrom)
            } catch (e: Exception) {
                null
            }
            if (effective != null && !effective.isAfter(date)) {
                list to effective
            } else {
                null
            }
        }

        // 3. luăm lista de preț "cea mai nouă" (cea mai mare effective_from)
        val chosenList = applicable.maxByOrNull { it.second }?.first ?: return null

        // 4. din lista aleasă, căutăm item-ul de preț pentru segmentul dorit
        val items = db.priceListItemDao().getForList(chosenList.id)
        val item = items.firstOrNull { it.fromStationId == fromStationId && it.toStationId == toStationId }

        return item?.price
    }

    /**
     * Variantă helper: căutăm prețul după numele stațiilor,
     * folosind stațiile din ruta curentă (ca să nu ne încurcăm cu nume duplicate).
     */
    suspend fun getPriceForSegmentByStationNames(
        routeId: Int,
        fromStationName: String,
        toStationName: String,
        categoryId: Int = 1,
        date: LocalDate = LocalDate.now()
    ): Double? {
        // luăm stațiile pentru rută (fără să inversăm pentru retur,
        // ne interesează doar id-urile pentru mapare nume -> id)
        val stations = getStationsForRoute(routeId, direction = null)

        val from = stations.firstOrNull { it.name == fromStationName } ?: return null
        val to = stations.firstOrNull { it.name == toStationName } ?: return null

        return getPriceForSegment(
            routeId = routeId,
            fromStationId = from.id,
            toStationId = to.id,
            categoryId = categoryId,
            date = date
        )
    }


    /**
     * Găsește numele stației curente pentru o rută,
     * pe baza coordonatelor GPS și a geofence-urilor.
     *
     * @param routeId      ruta curentă
     * @param direction    "tur" / "retur" sau null
     * @param currentLat   latitudinea telefonului
     * @param currentLng   longitudinea telefonului
     */
    suspend fun findCurrentStationNameForRoute(
        routeId: Int,
        direction: String?,
        currentLat: Double,
        currentLng: Double
    ): String? {

        // 1. toate stațiile pentru rută (cu lat/lng)
        val stations = getStationsForRoute(routeId, direction)

        // 2. route_stations pentru rută (geofence info)
        val routeStations = getRouteStationsForRoute(routeId)

        // map stationId -> StationEntity
        val stationById = stations.associateBy { it.id }

        // 3. construim lista de StationWithGeofence
        val withGeofence = routeStations.mapNotNull { rs ->
            val st = stationById[rs.stationId] ?: return@mapNotNull null
            StationWithGeofence(
                station = st,
                geofenceType = rs.geofenceType,
                geofenceRadiusMeters = rs.geofenceRadius,
                geofencePolygon = parseGeofencePolygon(rs.geofencePolygon)
            )
        }

        // 4. întâi căutăm stațiile la care suntem "în geofence"
        val inside = withGeofence.filter {
            isInsideGeofence(currentLat, currentLng, it)
        }

        // Dacă suntem în raza/poligonul uneia sau mai multor stații,
        // luăm prima stație găsită (ordinea e cea din route_stations)
        if (inside.isNotEmpty()) {
            return inside.first().station.name
        }

        // 5. dacă NU suntem în niciun geofence, nu returnăm nicio stație
        // -> funcția întoarce null, iar UI-ul va afișa "necunoscută"
        return null


    }



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
