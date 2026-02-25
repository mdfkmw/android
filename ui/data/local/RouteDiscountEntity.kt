package ro.priscom.sofer.ui.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "route_discounts")
data class RouteDiscountEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val routeScheduleId: Int,
    val discountTypeId: Int,
    val visibleDriver: Boolean
)
