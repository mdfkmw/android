package ro.priscom.sofer.ui.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "seats_local")
data class SeatEntity(
    @PrimaryKey val id: Int,      // seat_id din server
    val vehicleId: Int,
    val label: String?,
    val row: Int?,
    val seatCol: Int?,
    val seatType: String?,        // "seat" / "driver" / "guide" ...
    val pairId: Int?              // din DB (optional)
)