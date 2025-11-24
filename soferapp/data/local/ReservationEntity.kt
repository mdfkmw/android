package ro.priscom.sofer.ui.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "reservations_local")
data class ReservationEntity(
    @PrimaryKey val id: Long,        // ID-ul rezervării de pe server

    val tripId: Int?,
    val seatId: Int?,

    val personId: Long?,
    val personName: String?,
    val personPhone: String?,

    val status: String,              // "active", "cancelled", "no_show"
    val boardStationId: Int?,
    val exitStationId: Int?,

    val boarded: Boolean,
    val boardedAt: String?,          // datetime sau null

    val syncStatus: Int              // 0=pending,1=synced,2=failed
)
