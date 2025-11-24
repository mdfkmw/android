package ro.priscom.sofer.ui.data.local

import androidx.room.*

@Dao
interface ReservationDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(res: ReservationEntity)

    @Query("SELECT COUNT(*) FROM reservations_local")
    suspend fun countAll(): Int
}
