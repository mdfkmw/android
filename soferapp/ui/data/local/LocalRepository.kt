package ro.priscom.sofer.ui.data.local

import android.content.Context
import java.time.LocalDate
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.util.Log
import ro.priscom.sofer.ui.data.remote.BackendApi
import ro.priscom.sofer.ui.data.remote.MobileReservationDto
import ro.priscom.sofer.ui.data.remote.UpdateReservationPricingRequest
import ui.data.local.DatabaseProvider
import ro.priscom.sofer.ui.data.local.TripEntity


class LocalRepository(context: Context) {

    private val db = DatabaseProvider.getDatabase(context)

    suspend fun getDriver(id: Int) =
        db.employeeDao().getDriverById(id)

    suspend fun getOperators() =
        db.operatorDao().getAll()


    suspend fun getVehiclesForOperator(operatorId: Int): List<VehicleEntity> =
        db.vehicleDao().getVehiclesForOperator(operatorId)

    suspend fun getAllVehicles(): List<VehicleEntity> =
        db.vehicleDao().getAllVehicles()

    // === RUTE / STAȚII / PREȚURI pentru UI ===

    suspend fun getAllRoutes() =
        db.routeDao().getAll()

    suspend fun getRouteById(routeId: Int): RouteEntity? {
        return db.routeDao().getById(routeId)
    }


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

        val allLists = db.priceListDao().getAll()

        val applicable = allLists.mapNotNull { list ->
            if (list.routeId != routeId || list.categoryId != categoryId) return@mapNotNull null
            val effective = try {
                LocalDate.parse(list.effectiveFrom)
            } catch (e: Exception) {
                null
            }
            if (effective != null && !effective.isAfter(date)) {
                list to effective
            } else null
        }

        val chosenList = applicable.maxByOrNull { it.second }?.first ?: return null

        // 🔵 DEBUG:
        android.util.Log.d(
            "PriceDebug",
            "routeId=$routeId, from=$fromStationId, to=$toStationId, chosenListId=${chosenList.id}, effectiveFrom=${chosenList.effectiveFrom}"
        )

        val items = db.priceListItemDao().getForList(chosenList.id)

// pot exista mai multe rânduri pentru același segment (după mai multe sync-uri);
// luăm întotdeauna rândul cu ID-ul cel mai mare = cel mai nou preț
        val item = items
            .filter { it.fromStationId == fromStationId && it.toStationId == toStationId }
            .maxByOrNull { it.id }


        android.util.Log.d(
            "PriceDebug",
            "itemId=${item?.id}, price=${item?.price}"
        )

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


    // === REZERVĂRI – sync din backend în SQLite ===

    /**
     * Ia din backend toate rezervările pentru un trip
     * și le salvează în tabela locală `reservations_local`.
     *
     * - Șterge întâi rezervările vechi pentru tripId.
     * - Apoi inserează lista nouă.
     */
    suspend fun refreshReservationsForTrip(tripId: Int) {
        try {
            val api = BackendApi.service
            val resp = api.getTripReservations(tripId)

            if (!resp.ok) {
                Log.e("LocalRepository", "refreshReservationsForTrip: backend not ok (trip=$tripId)")
                return
            }

            val list = resp.reservations.map { dto ->
                mapMobileReservationDtoToEntity(dto)
            }

            val dao = db.reservationDao()

            withContext(Dispatchers.IO) {
                // ștergem rezervările vechi pentru trip
                dao.deleteByTrip(tripId)

                // inserăm lista nouă, dacă nu e goală
                if (list.isNotEmpty()) {
                    dao.insertAll(list)
                }
            }


            Log.d(
                "LocalRepository",
                "refreshReservationsForTrip: saved ${list.size} reservations for trip=$tripId"
            )
        } catch (e: Exception) {
            Log.e("LocalRepository", "refreshReservationsForTrip error (trip=$tripId)", e)
        }
    }


    /**
     * Returnează rezervările pentru un trip din DB local.
     * (deocamdată doar pentru debug / DB Inspector)
     */
    suspend fun getReservationsForTrip(tripId: Int): List<ReservationEntity> {
        return db.reservationDao().getByTrip(tripId)
    }

    /**
     * Mapare simplă DTO -> Entity (pentru Room).
     */
    private fun mapMobileReservationDtoToEntity(dto: MobileReservationDto): ReservationEntity {
        return ReservationEntity(
            id = dto.id,
            tripId = dto.tripId,
            seatId = dto.seatId,
            personId = dto.personId,
            personName = dto.personName,
            personPhone = dto.personPhone,
            status = dto.status,
            boardStationId = dto.boardStationId,
            exitStationId = dto.exitStationId,
            boarded = dto.boarded != 0,

            boardedAt = dto.boardedAt,

            // NOU – info rezervare
            reservationTime = dto.reservationTime,
            agentId = dto.agentId,
            agentName = dto.agentName,

            // NOU – prețuri + reduceri + plăți
            basePrice = dto.basePrice,
            discountAmount = dto.discountAmount,
            finalPrice = dto.finalPrice,
            paidAmount = dto.paidAmount,
            dueAmount = dto.dueAmount,
            isPaid = dto.isPaid,
            discountLabel = dto.discountLabel,
            promoCode = dto.promoCode,

            syncStatus = 1 // 1 = synced (vine din backend, nu e pending)
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


    suspend fun getStationIdByName(name: String): Int? {
        return db.stationDao().getStationIdByName(name)
    }

    suspend fun getPriceListIdForRoute(routeId: Int): Int? {
        return db.priceListDao().getPriceListIdForRoute(routeId)
    }


    suspend fun markReservationBoarded(reservationId: Long) {
        val api = BackendApi.service
        val dao = db.reservationDao()

        // 1️⃣ Trimitem spre backend
        val response = api.markReservationBoarded(reservationId)

        if (!response.ok) {
            throw Exception(response.error ?: "Eroare necunoscută la îmbarcare")
        }

        // 2️⃣ Facem update local în SQLite — DOAR UN RAND!
        val now = java.time.LocalDateTime.now().toString()

        dao.updateBoardStatus(
            reservationId = reservationId,
            boarded = true,
            boardedAt = now
        )

        // 3️⃣ Atât! Nu ștergem, nu refacem tot trip-ul.
    }

    suspend fun markReservationNoShow(reservationId: Long) {
        val api = BackendApi.service
        val dao = db.reservationDao()

        // 1️⃣ Trimitem spre backend
        val response = api.markReservationNoShow(reservationId)

        if (!response.ok) {
            throw Exception(response.error ?: "Eroare necunoscută la NO-SHOW")
        }

        // 2️⃣ Facem update local în SQLite — DOAR UN RAND!
        dao.updateStatus(
            reservationId = reservationId,
            status = "no_show"
        )
    }

    suspend fun cancelReservation(reservationId: Long) {
        val api = BackendApi.service
        val dao = db.reservationDao()

        // 1️⃣ Trimitem spre backend
        val response = api.cancelReservation(reservationId)

        if (!response.ok) {
            throw Exception(response.error ?: "Eroare necunoscută la anulare")
        }

        // 2️⃣ Facem update local în SQLite — DOAR UN RAND
        dao.updateStatus(
            reservationId = reservationId,
            status = "cancelled"
        )
    }

    suspend fun getRouteSchedule(routeScheduleId: Int?): RouteScheduleEntity? {
        if (routeScheduleId == null) return null
        return db.routeScheduleDao().getById(routeScheduleId)
    }


    suspend fun getRouteSchedulesForOperator(operatorId: Int): List<RouteScheduleEntity> {
        return db.routeScheduleDao().getByOperator(operatorId)
    }



    suspend fun getStationsForRouteSchedule(routeScheduleId: Int?): List<StationEntity> {
        val rs = getRouteSchedule(routeScheduleId) ?: return emptyList()
        return getStationsForRoute(rs.routeId, rs.direction)
    }


    suspend fun getBasePriceForRouteScheduleSegment(
        routeScheduleId: Int?,
        fromStationId: Int?,
        toStationId: Int?
    ): Double? {
        if (routeScheduleId == null || fromStationId == null || toStationId == null) return null

        val rs = getRouteSchedule(routeScheduleId) ?: return null

        return getPriceForSegment(
            routeId = rs.routeId,
            fromStationId = fromStationId,
            toStationId = toStationId
        )
    }


    /**
     * Driver: aplică modificările de preț (doar local) pentru o rezervare:
     *  - poate schimba / anula reducerea
     *  - (deocamdată nu schimbăm destinația, trimitem exitStationId existent)
     *
     * Telefonul calculează TOT (basePrice, finalPrice, discountAmount, dueAmount),
     * backend-ul doar salvează și loghează.
     */
    suspend fun applyLocalReservationPricingChange(
        reservation: ReservationEntity,
        newExitStationId: Int? = reservation.exitStationId,
        discount: DiscountTypeEntity?
    ): ReservationEntity {
        val dao = db.reservationDao()
        val api = BackendApi.service

        val base = reservation.basePrice ?: 0.0
        val alreadyPaid = reservation.paidAmount ?: 0.0

        // calculăm local reducerea nouă
        val discountValue = if (discount == null) {
            0.0
        } else {
            when (discount.type.lowercase()) {
                "percent" -> base * (discount.valueOff / 100.0)
                "fixed" -> discount.valueOff
                else -> 0.0
            }
        }.coerceAtLeast(0.0)

        val final = (base - discountValue).coerceAtLeast(0.0)
        val due = (final - alreadyPaid).coerceAtLeast(0.0)
        val isPaid = due <= 0.0001

        // 1️⃣ Încercăm să trimitem la backend – doar pentru log și DB centrală
        try {
            val body = UpdateReservationPricingRequest(
                basePrice = base,
                finalPrice = final,
                discountTypeId = discount?.id,
                exitStationId = newExitStationId
            )

            val resp = api.updateReservationPricing(reservation.id, body)
            if (!resp.ok) {
                android.util.Log.e(
                    "LocalRepository",
                    "updateReservationPricing: backend error=${resp.error}"
                )
            }
        } catch (e: Exception) {
            // offline sau eroare – nu blocăm; lucrăm local
            android.util.Log.e(
                "LocalRepository",
                "updateReservationPricing: exception ${e.message}"
            )
        }

        // 2️⃣ Actualizăm rezervarea în SQLite cu valorile CALCULATE LOCAL
        val updated = reservation.copy(
            exitStationId = newExitStationId,
            basePrice = base,
            discountAmount = discountValue,
            finalPrice = final,
            dueAmount = due,
            isPaid = isPaid,
            discountLabel = discount?.label,
            // marcam ca nesincronizat, daca vrei sa faci vreodata delta-sync
            syncStatus = 0
        )

        dao.insert(updated)

        return updated
    }



    // ================================================================
    //  REDUCERI (DISCOUNTS) – FILTRARE PE ROUTE_SCHEDULE
    // ================================================================

    /**
     * Returnează reducerile permise pentru un route_schedule_id,
     * filtrate după vizibilitatea pentru șofer (visibleDriver = true).
     *
     * Funcționează 100% offline deoarece folosește doar SQLite.
     */
    suspend fun getDiscountsForRouteSchedule(routeScheduleId: Int?): List<DiscountTypeEntity> {
        if (routeScheduleId == null) return emptyList()

        val routeDiscountDao = db.routeDiscountDao()
        val discountTypeDao = db.discountTypeDao()

        val rows = routeDiscountDao.getForSchedule(routeScheduleId)
        val driverVisible = rows.filter { it.visibleDriver }

        if (driverVisible.isEmpty()) return emptyList()

        val ids = driverVisible.map { it.discountTypeId }.distinct()
        return discountTypeDao.getByIds(ids)
    }


    // ================================================================
    //  REDUCERI – listă completă pentru aplicația șofer
    // ================================================================
    suspend fun getAllDiscountTypes(): List<DiscountTypeEntity> {
        return db.discountTypeDao().getAll()
    }

    // ================================================================
    //  TRIPS – cache local pentru o zi
    // ================================================================
    suspend fun getTripsForDate(date: String): List<TripEntity> {
        return db.tripDao().getByDate(date)
    }



    suspend fun refreshMySeatMapForTrip(tripId: Int): Pair<Int, Int>? {
        try {
            val api = BackendApi.service
            val resp = api.getMySeatMap(tripId)
            if (!resp.ok) return null

            val seats = resp.seats
                ?: throw IllegalStateException("Backend a returnat seats=null pentru trip=$tripId")
            val reservationsList = resp.reservations
                ?: throw IllegalStateException("Backend a returnat reservations=null pentru trip=$tripId")
            val vehicleId = resp.vehicleId
                ?: throw IllegalStateException("Backend a returnat vehicle_id=null pentru trip=$tripId")
            val tripVehicleId = resp.tripVehicleId
                ?: throw IllegalStateException("Backend a returnat trip_vehicle_id=null pentru trip=$tripId")

            val seatEntities = seats.map { s ->
                SeatEntity(
                    id = s.id,
                    vehicleId = s.vehicleId,
                    label = s.label,
                    row = s.row,
                    seatCol = s.seatCol,
                    seatType = s.seatType,
                    pairId = s.pairId
                )
            }

            val resEntities = reservationsList.map { dto ->
                mapMobileReservationDtoToEntity(dto)
            }

            withContext(Dispatchers.IO) {
                db.seatDao().deleteByVehicle(vehicleId)
                db.seatDao().upsertAll(seatEntities)
                db.reservationDao().deleteByTrip(tripId)
                if (resEntities.isNotEmpty()) db.reservationDao().insertAll(resEntities)
            }

            Log.d("LocalRepository", "refreshMySeatMapForTrip: seats=${seatEntities.size}, res=${resEntities.size}")
            return tripVehicleId to vehicleId

        } catch (e: retrofit2.HttpException) {
            // 404 = mașina nu e atașată la acest trip
            if (e.code() == 404) {
                Log.w("LocalRepository", "refreshMySeatMapForTrip: 404 - mașina nu e atașată la trip=$tripId")
            } else {
                Log.e("LocalRepository", "refreshMySeatMapForTrip HTTP error trip=$tripId code=${e.code()}", e)
            }
            return null
        } catch (e: Exception) {
            Log.e("LocalRepository", "refreshMySeatMapForTrip error trip=$tripId", e)
            return null
        }
    }

    suspend fun getSeatsForVehicle(vehicleId: Int): List<SeatEntity> {
        return db.seatDao().getByVehicle(vehicleId)
    }



}



