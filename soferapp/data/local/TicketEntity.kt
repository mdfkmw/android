package ro.priscom.sofer.ui.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tickets_local")
data class TicketEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,

    val remoteReservationId: Long?,
    val syncStatus: Int,             // 0=pending, 1=synced, 2=failed

    val operatorId: Int?,
    val employeeId: Int?,
    val tripId: Int?,
    val tripVehicleId: Int?,
    val routeId: Int?,

    val fromStationId: Int?,
    val toStationId: Int?,
    val seatId: Int?,
    val priceListId: Int?,
    val discountTypeId: Int?,

    val basePrice: Double?,
    val finalPrice: Double?,
    val currency: String?,
    val paymentMethod: String?,      // "cash", "card"

    val createdAt: String            // "yyyy-MM-dd HH:mm:ss"
)
