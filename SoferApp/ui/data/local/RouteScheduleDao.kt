package ro.priscom.sofer.ui.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface RouteScheduleDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<RouteScheduleEntity>)

    @Query("DELETE FROM route_schedules")
    suspend fun clearAll()

    @Query("SELECT * FROM route_schedules WHERE id = :id LIMIT 1")
    suspend fun getById(id: Int): RouteScheduleEntity?

    @Query("SELECT * FROM route_schedules WHERE operatorId = :operatorId")
    suspend fun getByOperator(operatorId: Int): List<RouteScheduleEntity>

    @Query("SELECT * FROM route_schedules WHERE routeId = :routeId AND operatorId = :operatorId")
    suspend fun getByRouteAndOperator(routeId: Int, operatorId: Int): List<RouteScheduleEntity>
}
