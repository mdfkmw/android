package ro.priscom.sofer.ui.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface TripDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(trips: List<TripEntity>)

    @Query("DELETE FROM trips")
    suspend fun clearAll()

    @Query("SELECT * FROM trips WHERE id = :id LIMIT 1")
    suspend fun getById(id: Int): TripEntity?

    @Query("SELECT * FROM trips WHERE date = :date")
    suspend fun getByDate(date: String): List<TripEntity>

    @Query("SELECT * FROM trips WHERE date = :date AND routeScheduleId = :routeScheduleId")
    suspend fun getByDateAndRouteSchedule(
        date: String,
        routeScheduleId: Int
    ): List<TripEntity>

    @Query("SELECT COUNT(*) FROM trips")
    suspend fun countAll(): Int

}
