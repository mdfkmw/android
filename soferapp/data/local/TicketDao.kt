package ro.priscom.sofer.ui.data.local

import androidx.room.*

@Dao
interface TicketDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(ticket: TicketEntity)

    @Query("SELECT COUNT(*) FROM tickets_local")
    suspend fun countAll(): Int
}
