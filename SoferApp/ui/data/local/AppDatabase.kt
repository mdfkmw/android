package ui.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import ro.priscom.sofer.ui.data.local.DiscountTypeDao
import ro.priscom.sofer.ui.data.local.DiscountTypeEntity
import ro.priscom.sofer.ui.data.local.EmployeeDao
import ro.priscom.sofer.ui.data.local.EmployeeEntity
import ro.priscom.sofer.ui.data.local.OperatorDao
import ro.priscom.sofer.ui.data.local.OperatorEntity
import ro.priscom.sofer.ui.data.local.PriceListDao
import ro.priscom.sofer.ui.data.local.PriceListEntity
import ro.priscom.sofer.ui.data.local.PriceListItemDao
import ro.priscom.sofer.ui.data.local.PriceListItemEntity
import ro.priscom.sofer.ui.data.local.ReservationDao
import ro.priscom.sofer.ui.data.local.ReservationEntity
import ro.priscom.sofer.ui.data.local.RouteDao
import ro.priscom.sofer.ui.data.local.RouteDiscountDao
import ro.priscom.sofer.ui.data.local.RouteDiscountEntity
import ro.priscom.sofer.ui.data.local.RouteEntity
import ro.priscom.sofer.ui.data.local.RouteScheduleDao
import ro.priscom.sofer.ui.data.local.RouteScheduleEntity
import ro.priscom.sofer.ui.data.local.RouteStationDao
import ro.priscom.sofer.ui.data.local.RouteStationEntity
import ro.priscom.sofer.ui.data.local.StationDao
import ro.priscom.sofer.ui.data.local.StationEntity
import ro.priscom.sofer.ui.data.local.SubscriptionDao
import ro.priscom.sofer.ui.data.local.SubscriptionEntity
import ro.priscom.sofer.ui.data.local.TicketDao
import ro.priscom.sofer.ui.data.local.TicketEntity
import ro.priscom.sofer.ui.data.local.VehicleDao
import ro.priscom.sofer.ui.data.local.VehicleEntity
import ro.priscom.sofer.ui.data.local.TripDao
import ro.priscom.sofer.ui.data.local.TripEntity
import ro.priscom.sofer.ui.data.local.SeatEntity
import ro.priscom.sofer.ui.data.local.SeatDao
@Database(
    entities = [
        EmployeeEntity::class,
        OperatorEntity::class,
        RouteEntity::class,
        VehicleEntity::class,
        TicketEntity::class,
        ReservationEntity::class,
        SeatEntity::class,
        SubscriptionEntity::class,
        StationEntity::class,
        RouteStationEntity::class,
        PriceListEntity::class,
        PriceListItemEntity::class,
        DiscountTypeEntity::class,
        RouteDiscountEntity::class,
        RouteScheduleEntity::class,
        TripEntity::class
    ],
    version = 11,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun employeeDao(): EmployeeDao
    abstract fun operatorDao(): OperatorDao
    abstract fun routeDao(): RouteDao
    abstract fun vehicleDao(): VehicleDao

    abstract fun ticketDao(): TicketDao
    abstract fun reservationDao(): ReservationDao

    abstract fun seatDao(): SeatDao

    abstract fun subscriptionDao(): SubscriptionDao

    abstract fun stationDao(): StationDao
    abstract fun routeStationDao(): RouteStationDao

    abstract fun priceListDao(): PriceListDao
    abstract fun priceListItemDao(): PriceListItemDao

    abstract fun discountTypeDao(): DiscountTypeDao
    abstract fun routeDiscountDao(): RouteDiscountDao

    abstract fun routeScheduleDao(): RouteScheduleDao
    abstract fun tripDao(): TripDao
}
