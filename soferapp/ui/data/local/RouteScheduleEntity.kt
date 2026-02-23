package ro.priscom.sofer.ui.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Mirror simplu pentru tabela route_schedules din DB-ul mare.
 */
@Entity(tableName = "route_schedules")
data class RouteScheduleEntity(
    @PrimaryKey val id: Int,      // route_schedule_id din hosting
    val routeId: Int,
    val departure: String,        // "HH:mm"
    val operatorId: Int,
    val direction: String         // "tur" / "retur"
)
