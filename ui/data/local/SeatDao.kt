package ro.priscom.sofer.ui.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface SeatDao {

    @Query("SELECT * FROM seats_local WHERE vehicleId = :vehicleId ORDER BY `row` ASC, seatCol ASC, id ASC")
    suspend fun getByVehicle(vehicleId: Int): List<SeatEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(list: List<SeatEntity>)

    @Query("DELETE FROM seats_local WHERE vehicleId = :vehicleId")
    suspend fun deleteByVehicle(vehicleId: Int)

    @Query("SELECT * FROM seats_local WHERE id = :seatId LIMIT 1")
    suspend fun getById(seatId: Int): SeatEntity?
}
