package ro.priscom.sofer.ui.data.remote

import android.util.Log
import ui.data.local.AppDatabase
import ro.priscom.sofer.ui.data.local.DiscountTypeEntity
import ro.priscom.sofer.ui.data.local.EmployeeEntity
import ro.priscom.sofer.ui.data.local.OperatorEntity
import ro.priscom.sofer.ui.data.local.PriceListEntity
import ro.priscom.sofer.ui.data.local.PriceListItemEntity
import ro.priscom.sofer.ui.data.local.RouteDiscountEntity
import ro.priscom.sofer.ui.data.local.RouteEntity
import ro.priscom.sofer.ui.data.local.RouteStationEntity
import ro.priscom.sofer.ui.data.local.StationEntity
import ro.priscom.sofer.ui.data.local.VehicleEntity
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ro.priscom.sofer.ui.data.local.RouteScheduleEntity
import ro.priscom.sofer.ui.data.local.TripEntity

class RemoteSyncRepository {

    suspend fun syncMasterData(db: AppDatabase, loggedIn: Boolean): MasterSyncResult {
        return withContext(Dispatchers.IO) {
            try {
                // === 1. MASTER DATA EXISTENTE (operators / employees / vehicles) ===

                val operators = BackendApi.service.getOperatorsApp()
                val employees = BackendApi.service.getEmployeesApp()
                val vehicles = BackendApi.service.getVehiclesApp()

                val routeSchedulesDto = BackendApi.service.getRouteSchedulesApp()

                val discountTypes = syncDiscountTypes(db)
                val routeDiscounts = syncRouteDiscounts(db)

                db.operatorDao().insertAll(
                    operators.map {
                        OperatorEntity(
                            id = it.id,
                            name = it.name
                        )
                    }
                )

                db.employeeDao().insertAll(
                    employees.map {
                        EmployeeEntity(
                            id = it.id,
                            name = it.name,
                            role = it.role ?: "",
                            operatorId = it.operator_id ?: 0,
                            password = ""
                        )
                    }
                )

                db.vehicleDao().insertAll(
                    vehicles.map {
                        VehicleEntity(
                            id = it.id,
                            plateNumber = it.plateNumber,
                            operatorId = it.operatorId
                        )
                    }
                )

                db.routeScheduleDao().clearAll()
                db.routeScheduleDao().insertAll(
                    routeSchedulesDto.map { rs ->
                        RouteScheduleEntity(
                            id = rs.id,
                            routeId = rs.routeId,
                            departure = rs.departure,
                            operatorId = rs.operatorId,
                            direction = rs.direction
                        )
                    }
                )

                // === 1b. TRIPS (pe 7 zile, pentru cache offline) ===
                try {
                    val todayBase = LocalDate.now()
                    val allTrips = mutableListOf<TripEntity>()

                    // luăm trips pentru azi + următoarele 6 zile
                    for (offset in 0..6) {
                        val dateStr = todayBase.plusDays(offset.toLong()).toString() // "YYYY-MM-DD"

                        try {
                            val routesWithTrips = BackendApi.service.getRoutesWithTrips(dateStr)

                            routesWithTrips.forEach { routeDto ->
                                routeDto.trips.forEach { t ->
                                    allTrips.add(
                                        TripEntity(
                                            id = t.trip_id,
                                            date = t.date,
                                            time = t.time,
                                            direction = t.direction,
                                            directionLabel = t.direction_label,
                                            displayTime = t.display_time,
                                            routeScheduleId = t.route_schedule_id
                                        )
                                    )
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(
                                "RemoteSync",
                                "getRoutesWithTrips error for date=$dateStr",
                                e
                            )
                        }
                    }

                    db.tripDao().clearAll()
                    if (allTrips.isNotEmpty()) {
                        db.tripDao().insertAll(allTrips)
                    }
                    Log.d("RemoteSync", "sync trips: saved ${allTrips.size} rows")
                } catch (e: Exception) {
                    Log.e("RemoteSync", "sync trips error", e)
                }

                // === 2. RUTE / STAȚII / ROUTE_STATIONS ===

                val todayStr = LocalDate.now().toString()

                val routesDto = if (loggedIn) {
                    BackendApi.service.getRoutesForDriver(date = todayStr)
                } else {
                    BackendApi.service.getRoutesApp()
                }

                val stationsDto = BackendApi.service.getStationsApp()
                val routeStationsDto = BackendApi.service.getRouteStationsApp(null)

                db.routeDao().insertAll(
                    routesDto.map {
                        RouteEntity(
                            id = it.id,
                            name = it.name,
                            orderIndex = it.order_index,
                            visibleForDrivers = it.visible_for_drivers,
                            visibleInReservations = it.visible_in_reservations,
                            visibleOnline = it.visible_online
                        )
                    }
                )


                db.stationDao().insertAll(
                    stationsDto.map {
                        StationEntity(
                            id = it.id,
                            name = it.name,
                            latitude = it.latitude,
                            longitude = it.longitude
                        )
                    }
                )

                db.routeStationDao().insertAll(
                    routeStationsDto.map { rs ->
                        RouteStationEntity(
                            id = rs.id,
                            routeId = rs.route_id,
                            stationId = rs.station_id,
                            orderIndex = rs.order_index,
                            geofenceType = rs.geofence_type,
                            geofenceRadius = rs.geofence_radius,
                            geofencePolygon = rs.geofence_polygon?.let { poly ->
                                poly.joinToString(prefix = "[", postfix = "]") { pair ->
                                    "[${pair[0]},${pair[1]}]"
                                }
                            }
                        )
                    }
                )

                // === 3. LISTE DE PREȚ ȘI ITEM-URI (filtrate Normal + azi/viitor) ===

// === 3. LISTE DE PREȚ ȘI ITEM-URI (Normal: lista de azi + modificări viitoare) ===

                val today = LocalDate.now()

                val priceListsDto = BackendApi.service.getPriceListsApp()

// 1) Păstrăm doar categoria NORMAL (category_id = 1).
                val normalLists = priceListsDto.filter { dto ->
                    dto.category_id == 1
                }

// 2) Grupăm pe (route_id, category_id), ca să lucrăm separat pe fiecare rută.
                val groupedByRouteAndCategory = normalLists.groupBy { dto ->
                    dto.route_id to dto.category_id
                }

                val filteredLists = mutableListOf<PriceListDto>()

                for ((key, lists) in groupedByRouteAndCategory) {
                    // list -> (dto, data_parsată) ; ignorăm liniile cu dată invalidă
                    val withParsedDates = lists.mapNotNull { dto ->
                        val eff = try {
                            LocalDate.parse(dto.effective_from)
                        } catch (e: Exception) {
                            null
                        }
                        if (eff != null) dto to eff else null
                    }

                    if (withParsedDates.isEmpty()) continue

                    // 2.a) Lista valabilă ASTĂZI: cea cu effective_from <= azi și data cea mai mare
                    val validToday = withParsedDates
                        .filter { (_, eff) -> !eff.isAfter(today) } // eff <= azi
                        .maxByOrNull { (_, eff) -> eff }            // data cea mai mare

                    if (validToday != null) {
                        filteredLists.add(validToday.first)
                    }

                    // 2.b) TOATE listele VIITOARE (effective_from > azi)
                    withParsedDates
                        .filter { (_, eff) -> eff.isAfter(today) }
                        .sortedBy { (_, eff) -> eff } // nu e obligatoriu, dar e frumos să fie ordonate
                        .forEach { (dto, _) ->
                            filteredLists.add(dto)
                        }
                }

// ID-urile listelor păstrate; doar pentru ele vom salva item-urile de preț.
                val keepListIds = filteredLists.map { it.id }.toSet()


                db.priceListItemDao().clearAll()
                db.priceListDao().clearAll()

                db.priceListDao().insertAll(
                    filteredLists.map {
                        PriceListEntity(
                            id = it.id,
                            routeId = it.route_id,
                            categoryId = it.category_id,
                            effectiveFrom = it.effective_from
                        )
                    }
                )

                val priceListItemsDto = BackendApi.service.getPriceListItemsApp()

                val filteredItems = priceListItemsDto.filter { item ->
                    item.price_list_id != null && keepListIds.contains(item.price_list_id)
                }

                db.priceListItemDao().insertAll(
                    filteredItems.map { item ->
                        PriceListItemEntity(
                            id = item.id,
                            price = item.price,
                            currency = item.currency,
                            priceListId = item.price_list_id,
                            fromStationId = item.from_station_id,
                            toStationId = item.to_station_id
                        )
                    }
                )

                // === 4. REZULTAT ===

                MasterSyncResult(
                    operators = operators.size,
                    employees = employees.size,
                    vehicles = vehicles.size,
                    routes = routesDto.size,
                    stations = stationsDto.size,
                    routeStations = routeStationsDto.size,
                    priceLists = filteredLists.size,
                    priceListItems = filteredItems.size,
                    discountTypes = discountTypes,
                    routeDiscounts = routeDiscounts,
                    routeSchedules = routeSchedulesDto.size,
                    error = null
                )

            } catch (e: Exception) {
                Log.e("RemoteSync", "syncMasterData error", e)
                MasterSyncResult(
                    operators = 0,
                    employees = 0,
                    vehicles = 0,
                    routes = 0,
                    stations = 0,
                    routeStations = 0,
                    priceLists = 0,
                    priceListItems = 0,
                    discountTypes = 0,
                    routeDiscounts = 0,
                    routeSchedules = 0,
                    error = e.localizedMessage
                )
            }

        }
    }


    // 👇 NOU: sincronizarea biletelor salvate local în tickets_local
    suspend fun syncTickets(db: AppDatabase): TicketSyncResult {
        return try {
            val ticketDao = db.ticketDao()
            val pending = ticketDao.getPendingTickets()

            if (pending.isEmpty()) {
                return TicketSyncResult(
                    total = 0,
                    synced = 0,
                    failed = 0,
                    error = null
                )
            }

            val payload = pending.map { t ->
                TicketBatchItemRequest(
                    localId = t.id,
                    tripId = t.tripId,
                    tripVehicleId = t.tripVehicleId,
                    fromStationId = t.fromStationId,
                    toStationId = t.toStationId,
                    seatId = t.seatId,
                    priceListId = t.priceListId,
                    discountTypeId = t.discountTypeId,
                    basePrice = t.basePrice,
                    finalPrice = t.finalPrice,
                    currency = t.currency,
                    paymentMethod = t.paymentMethod,
                    createdAt = t.createdAt
                )
            }

            val response = BackendApi.service.sendTicketsBatch(
                TicketsBatchRequest(tickets = payload)
            )

            var synced = 0
            var failed = 0

            if (response.ok) {
                response.results.forEach { item ->
                    val localId = item.localId
                    if (localId == null) {
                        failed++
                        return@forEach
                    }

                    if (item.ok && item.reservationId != null) {
                        // 1 = synced
                        ticketDao.updateSyncStatus(
                            localId = localId,
                            syncStatus = 1,
                            remoteReservationId = item.reservationId
                        )
                        synced++
                    } else {
                        // 2 = failed
                        ticketDao.updateSyncStatus(
                            localId = localId,
                            syncStatus = 2,
                            remoteReservationId = null
                        )
                        failed++
                    }
                }
            } else {
                // tot batch-ul a eșuat
                pending.forEach { t ->
                    ticketDao.updateSyncStatus(
                        localId = t.id,
                        syncStatus = 2,
                        remoteReservationId = null
                    )
                }
                return TicketSyncResult(
                    total = pending.size,
                    synced = 0,
                    failed = pending.size,
                    error = "Batch response not ok"
                )
            }

            TicketSyncResult(
                total = pending.size,
                synced = synced,
                failed = failed,
                error = null
            )
        } catch (e: Exception) {
            Log.e("RemoteSyncRepository", "syncTickets error", e)
            TicketSyncResult(
                total = 0,
                synced = 0,
                failed = 0,
                error = e.message
            )
        }
    }

    // ================================================================
    //  SYNC DISCOUNT TYPES
    // ================================================================
    suspend fun syncDiscountTypes(db: AppDatabase): Int {
        return try {
            val api = BackendApi.service
            val dtoList = api.getDiscountTypes()

            val entities = dtoList.map { dto ->
                DiscountTypeEntity(
                    id = dto.id,
                    code = dto.code,
                    label = dto.label,
                    valueOff = dto.value_off,
                    type = dto.type,
                    descriptionRequired = dto.description_required,
                    descriptionLabel = dto.description_label,
                    dateLimited = dto.date_limited,
                    validFrom = dto.valid_from,
                    validTo = dto.valid_to
                )
            }

            val dao = db.discountTypeDao()
            dao.clearAll()
            dao.insertAll(entities)

            Log.d("RemoteSync", "syncDiscountTypes: ${entities.size} rows")
            entities.size
        } catch (e: Exception) {
            Log.e("RemoteSync", "syncDiscountTypes error", e)
            0
        }
    }

    // ================================================================
//  SYNC ROUTE DISCOUNTS (route_schedule_discounts)
// ================================================================
    suspend fun syncRouteDiscounts(db: AppDatabase): Int {
        return try {
            val api = BackendApi.service
            val dtoList = api.getRouteDiscounts()

            val entities = dtoList.map { dto ->
                RouteDiscountEntity(
                    // id – autogenerat de Room
                    routeScheduleId = dto.routeScheduleId,
                    discountTypeId = dto.discountTypeId,
                    visibleDriver = dto.visibleDriver
                )
            }

            val dao = db.routeDiscountDao()
            dao.clearAll()
            dao.insertAll(entities)

            android.util.Log.d("RemoteSync", "syncRouteDiscounts: ${entities.size} rows")
            entities.size
        } catch (e: Exception) {
            android.util.Log.e("RemoteSync", "syncRouteDiscounts error", e)
            0
        }
    }




}

class TicketSyncResult(
    val total: Int,
    val synced: Int,
    val failed: Int,
    val error: String? = null
)

data class MasterSyncResult(
    val operators: Int,
    val employees: Int,
    val vehicles: Int,
    val routes: Int,
    val stations: Int,
    val routeStations: Int,
    val priceLists: Int,
    val priceListItems: Int,
    val discountTypes: Int,
    val routeDiscounts: Int,
    val routeSchedules: Int,
    val error: String? = null
)

