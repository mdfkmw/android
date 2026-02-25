package ro.priscom.sofer.ui.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cache local pentru trips generate de backend (/api/mobile/routes-with-trips).
 * Ne ajută să lucrăm offline (ex: o săptămână) folosind tripId.
 */
@Entity(tableName = "trips")
data class TripEntity(
    @PrimaryKey val id: Int,      // trip_id din backend
    val date: String,             // "YYYY-MM-DD"
    val time: String,             // "HH:mm"
    val direction: String,        // "tur" / "retur" etc.
    val directionLabel: String,   // ex: "Tur" / "Retur"
    val displayTime: String,      // ex: "TUR 07:00"
    val routeScheduleId: Int?     // legătura cu route_schedules.id, dacă există
)
