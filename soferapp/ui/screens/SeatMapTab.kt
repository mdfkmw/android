package ro.priscom.sofer.ui.screens

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch

import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.data.local.ReservationEntity
import ro.priscom.sofer.ui.data.local.SeatEntity
import ro.priscom.sofer.ui.data.local.StationEntity

// ======================= DATA CLASS pentru navigare la EmiteBilet =======================

data class SellTicketParams(
    val seatId: Int,
    val fromStationId: Int,
    val toStationId: Int
)

// ======================= COMPOSABLE PRINCIPAL =======================

@Composable
fun SeatMapTab(
    tripId: Int,
    currentStationId: Int?,
    routeScheduleId: Int?,
    repo: LocalRepository,
    refreshTrigger: Int = 0,
    onSellTicket: (seatId: Int, fromStationId: Int, toStationId: Int) -> Unit,
    onOpenReservationDetails: (ReservationEntity) -> Unit
) {
    val graySeat  = Color(0xFFBDBDBD)
    val redSeat   = Color(0xFFE53935)
    val yellowSeat = Color(0xFFFFD54F)
    val greenSeat = Color(0xFF66BB6A)

    val coroutineScope = rememberCoroutineScope()

    var vehicleId by remember { mutableStateOf<Int?>(null) }
    var seats by remember { mutableStateOf<List<SeatEntity>>(emptyList()) }
    var reservations by remember { mutableStateOf<List<ReservationEntity>>(emptyList()) }
    var stations by remember { mutableStateOf<List<StationEntity>>(emptyList()) }
    var stationIndexById by remember { mutableStateOf<Map<Int, Int>>(emptyMap()) }

    // ID-urile capetelor de traseu (prima și ultima stație)
    var routeFirstStationId by remember { mutableStateOf<Int?>(null) }
    var routeLastStationId by remember { mutableStateOf<Int?>(null) }

    var openSeat by remember { mutableStateOf<SeatEntity?>(null) }

    fun stationName(id: Int?): String {
        if (id == null) return "-"
        return stations.firstOrNull { it.id == id }?.name ?: "#$id"
    }

    suspend fun reloadLocal(forceVehicleId: Int? = null) {
        reservations = repo.getReservationsForTrip(tripId)
        val vId = forceVehicleId ?: vehicleId
        seats = if (vId != null) repo.getSeatsForVehicle(vId) else emptyList()
    }

    suspend fun ensureRouteData() {
        val schedule = repo.getRouteSchedule(routeScheduleId) ?: return
        val routeId = schedule.routeId
        val direction = schedule.direction

        val rs = repo.getRouteStationsForRoute(routeId)
        stationIndexById = rs.associate { it.stationId to it.orderIndex }

        stations = repo.getStationsForRoute(routeId, direction)

        if (stations.isNotEmpty()) {
            routeFirstStationId = stations.first().id
            routeLastStationId  = stations.last().id
        }
    }

    suspend fun refreshFromBackend() {
        val pair = repo.refreshMySeatMapForTrip(tripId)
        if (pair != null) {
            val newVehicleId = pair.second
            vehicleId = newVehicleId
            // Pasăm vehicleId direct ca să nu depindem de recompoziția Compose
            reloadLocal(forceVehicleId = newVehicleId)
        }
        // Dacă backend-ul nu răspunde, vehicleId rămâne null → UI afișează eroare clară.
    }

    LaunchedEffect(tripId) {
        try {
            ensureRouteData()
            refreshFromBackend()
        } catch (e: Exception) {
            Log.e("SeatMapTab", "LaunchedEffect init error", e)
        }
    }

    // Trigger extern din butonul SINCRONIZEAZĂ al ecranului părinte
    LaunchedEffect(refreshTrigger) {
        if (refreshTrigger > 0) {
            try {
                reloadLocal()
            } catch (e: Exception) {
                Log.e("SeatMapTab", "refreshTrigger reload error", e)
            }
        }
    }

    // ======================= UI =======================

    if (vehicleId == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(24.dp)
            ) {
                Text(
                    "Mașina nu este atașată la această cursă.",
                    color = Color.Gray,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Pornește cursa din ecranul principal pentru a atașa mașina.",
                    color = Color.Gray,
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        coroutineScope.launch {
                            try { refreshFromBackend() } catch (e: Exception) { Log.e("SeatMapTab", "refresh error", e) }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF5BC21E))
                ) {
                    Text("REÎNCEARCĂ", color = Color.Black)
                }
            }
        }
        return
    }

    if (seats.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Nu există locuri configurate pentru această mașină.", color = Color.Gray)
        }
        return
    }

    val grid = remember(seats) { buildSeatGrid(seats) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(10.dp)
    ) {
        for (r in 0..grid.maxRow) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                for (c in 0..grid.maxCol) {
                    val seat = grid.byPos[r to c]
                    if (seat == null) {
                        Spacer(modifier = Modifier.size(52.dp))
                    } else {
                        // Culoarea locului se calculează pe întregul traseu (first->last)
                        val state = computeSeatState(
                            seat = seat,
                            reservations = reservations,
                            selectedFromId = routeFirstStationId,
                            selectedToId = routeLastStationId,
                            stationIndexById = stationIndexById
                        )

                        val bg = when {
                            isGraySeat(seat) -> graySeat
                            state == SeatState.FREE    -> greenSeat
                            state == SeatState.PARTIAL -> yellowSeat
                            state == SeatState.FULL    -> redSeat
                            else -> greenSeat
                        }

                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .background(bg)
                                .clickable {
                                    if (!isGraySeat(seat)) openSeat = seat
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    text = seat.label ?: seat.id.toString(),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.Black
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
        }
    }

    // ======================= DIALOG SEAT =======================

    val seat = openSeat
    if (seat != null) {
        val seatReservations = reservations
            .filter { it.seatId == seat.id && it.status == "active" }
            .sortedBy { stationIndexById[it.boardStationId] ?: 0 }

        // Găsim intervalul liber care conține stația curentă GPS
        val currentIdx = stationIndexById[currentStationId] ?: -1
        val sellInfo = computeSellInfoForSeat(
            seat = seat,
            reservations = reservations,
            selectedFromId = routeFirstStationId,
            selectedToId = routeLastStationId,
            stations = stations,
            stationIndexById = stationIndexById,
            currentStationIdx = currentIdx
        )

        Dialog(onDismissRequest = { openSeat = null }) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {

                    // --- TITLU ---
                    Text(
                        text = "Loc ${seat.label ?: seat.id}",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Divider(modifier = Modifier.padding(vertical = 8.dp))

                    // --- REZERVĂRI EXISTENTE ---
                    if (seatReservations.isEmpty()) {
                        Text(
                            text = "Nicio rezervare activă pe acest loc.",
                            color = Color.Gray,
                            fontSize = 14.sp
                        )
                    } else {
                        Text(
                            text = "Rezervări active:",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                        Spacer(Modifier.height(6.dp))

                        seatReservations.forEach { res ->
                            val isPaid = res.isPaid
                            val paidBg = if (isPaid) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
                            val paidText = if (isPaid) "ACHITAT" else "NEACHITAT"

                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        openSeat = null
                                        onOpenReservationDetails(res)
                                    }
                                    .background(paidBg)
                                    .padding(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = res.personName ?: "Fără nume",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp
                                    )
                                    Text(
                                        text = paidText,
                                        fontSize = 11.sp,
                                        color = if (isPaid) Color(0xFF388E3C) else Color(0xFFE65100)
                                    )
                                }
                                Text(
                                    text = "${stationName(res.boardStationId)} → ${stationName(res.exitStationId)}",
                                    fontSize = 12.sp,
                                    color = Color.DarkGray
                                )
                                if (res.finalPrice != null) {
                                    Text(
                                        text = "%.2f RON".format(res.finalPrice),
                                        fontSize = 12.sp,
                                        color = Color.DarkGray
                                    )
                                }
                                Text(
                                    text = "▶ Apasă pentru detalii",
                                    fontSize = 11.sp,
                                    color = Color(0xFF1565C0)
                                )
                            }

                            Spacer(Modifier.height(4.dp))
                        }
                    }

                    // --- SEGMENT LIBER + PICKER DESTINATIE ---
                    if (sellInfo.canSell) {
                        val freeToId   = sellInfo.suggestedToId
                        val freeToIdx  = stationIndexById[freeToId] ?: -1

                        // Stațiile disponibile ca destinație:
                        // - strict după stația curentă GPS
                        // - cel mult până la capătul intervalului liber (freeToIdx)
                        val destOptions = stations.filter { st ->
                            val idx = stationIndexById[st.id] ?: -1
                            idx > currentIdx && idx <= freeToIdx
                        }

                        if (destOptions.isNotEmpty()) {
                            var selectedToId by remember(seat.id) {
                                mutableStateOf(destOptions.last().id)
                            }
                            var expandedTo by remember { mutableStateOf(false) }

                            Spacer(Modifier.height(10.dp))
                            Divider()
                            Spacer(Modifier.height(8.dp))

                            Text(
                                text = "Vinde bilet pe loc ${seat.label ?: seat.id}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Spacer(Modifier.height(6.dp))

                            // DE LA — fix din GPS
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("De la: ", fontSize = 13.sp, color = Color.Gray)
                                Text(
                                    text = stationName(currentStationId),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Spacer(Modifier.height(6.dp))

                            // PÂNĂ LA — dropdown
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Până la: ", fontSize = 13.sp, color = Color.Gray)

                                Box {
                                    Button(
                                        onClick = { expandedTo = true },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = Color(0xFFEFEFEF)
                                        ),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = stationName(selectedToId),
                                            color = Color.Black,
                                            fontSize = 13.sp
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = expandedTo,
                                        onDismissRequest = { expandedTo = false }
                                    ) {
                                        destOptions.forEach { st ->
                                            DropdownMenuItem(
                                                text = { Text(st.name) },
                                                onClick = {
                                                    selectedToId = st.id
                                                    expandedTo = false
                                                }
                                            )
                                        }
                                    }
                                }
                            }

                            Spacer(Modifier.height(10.dp))

                            Button(
                                onClick = {
                                    val fromId = currentStationId
                                    val toId   = selectedToId
                                    if (fromId != null) {
                                        openSeat = null
                                        onSellTicket(seat.id, fromId, toId)
                                    }
                                },
                                enabled = currentStationId != null,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF5BC21E))
                            ) {
                                Text("VINDE BILET", color = Color.Black)
                            }
                        } else {
                            // currentStationId e după intervalul liber — nu se poate vinde
                            Spacer(Modifier.height(8.dp))
                            Divider()
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Nu se poate vinde bilet de la stația curentă pe acest loc.",
                                color = Color.Gray,
                                fontSize = 13.sp
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    // --- BUTON ÎNCHIDE ---
                    OutlinedButton(
                        onClick = { openSeat = null },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("ÎNCHIDE")
                    }
                }
            }
        }
    }
}

// ======================= LOGICĂ OCUPARE =======================

private enum class SeatState { FREE, PARTIAL, FULL }

private fun isGraySeat(seat: SeatEntity): Boolean {
    val t = (seat.seatType ?: "").lowercase()
    return t == "driver" || t == "guide" || t == "sofer" || t == "ghid"
}

private fun computeSeatState(
    seat: SeatEntity,
    reservations: List<ReservationEntity>,
    selectedFromId: Int?,
    selectedToId: Int?,
    stationIndexById: Map<Int, Int>
): SeatState {
    if (isGraySeat(seat)) return SeatState.FREE
    if (selectedFromId == null || selectedToId == null) return SeatState.FREE

    val sel = toInterval(selectedFromId, selectedToId, stationIndexById) ?: return SeatState.FREE
    if (sel.first >= sel.second) return SeatState.FREE

    val seatRes = reservations
        .filter { it.seatId == seat.id }
        .filter { it.status == "active" }

    val occ = seatRes.mapNotNull { r ->
        toInterval(r.boardStationId, r.exitStationId, stationIndexById)
    }.filter { overlaps(it, sel) }
        .map { clampTo(it, sel) }

    if (occ.isEmpty()) return SeatState.FREE

    val covered = coveredLength(mergeIntervals(occ))
    val need = sel.second - sel.first

    return if (covered >= need) SeatState.FULL else SeatState.PARTIAL
}

private data class SellInfo(
    val canSell: Boolean,
    val suggestedFromId: Int?,  // capătul stânga al intervalului liber relevant
    val suggestedToId: Int?,    // capătul dreapta al intervalului liber relevant
    val isPartialSuggested: Boolean
)

// Returnează intervalul liber care CONȚINE currentStationIdx (sau null dacă nu există)
private fun computeSellInfoForSeat(
    seat: SeatEntity,
    reservations: List<ReservationEntity>,
    selectedFromId: Int?,   // = routeFirstStationId
    selectedToId: Int?,     // = routeLastStationId
    stations: List<StationEntity>,
    stationIndexById: Map<Int, Int>,
    currentStationIdx: Int = -1  // indexul stației curente GPS
): SellInfo {
    if (isGraySeat(seat)) return SellInfo(false, null, null, false)
    if (selectedFromId == null || selectedToId == null) return SellInfo(false, null, null, false)
    if (stations.isEmpty()) return SellInfo(false, null, null, false)

    val sel = toInterval(selectedFromId, selectedToId, stationIndexById)
        ?: return SellInfo(false, null, null, false)
    if (sel.first >= sel.second) return SellInfo(false, null, null, false)

    val seatRes = reservations
        .filter { it.seatId == seat.id }
        .filter { it.status == "active" }

    val occ = seatRes
        .mapNotNull { r -> toInterval(r.boardStationId, r.exitStationId, stationIndexById) }
        .filter { overlaps(it, sel) }
        .map { clampTo(it, sel) }

    // Construim lista tuturor intervalelor libere pe întregul traseu
    val freeIntervals: List<Pair<Int, Int>> = if (occ.isEmpty()) {
        listOf(sel)
    } else {
        val mergedOcc = mergeIntervals(occ)
        val freeList = mutableListOf<Pair<Int, Int>>()
        var cursor = sel.first
        for (o in mergedOcc) {
            if (cursor < o.first) freeList.add(cursor to o.first)
            cursor = maxOf(cursor, o.second)
        }
        if (cursor < sel.second) freeList.add(cursor to sel.second)
        freeList
    }

    if (freeIntervals.isEmpty()) return SellInfo(false, null, null, false)

    // Găsim intervalul liber care conține currentStationIdx
    // (adică freeFrom <= currentIdx < freeTo)
    val relevantFree = if (currentStationIdx >= 0) {
        freeIntervals.firstOrNull { it.first <= currentStationIdx && currentStationIdx < it.second }
    } else {
        // fără GPS — folosim primul interval liber
        freeIntervals.firstOrNull()
    } ?: return SellInfo(false, null, null, false)

    val indexToStationId = buildIndexToStationId(stations, stationIndexById)
    val fromId = indexToStationId[relevantFree.first]
    val toId   = indexToStationId[relevantFree.second]

    if (fromId == null || toId == null) return SellInfo(false, null, null, false)

    return SellInfo(true, fromId, toId, relevantFree.first != sel.first || relevantFree.second != sel.second)
}

private fun toInterval(fromId: Int?, toId: Int?, stationIndexById: Map<Int, Int>): Pair<Int, Int>? {
    if (fromId == null || toId == null) return null
    val a = stationIndexById[fromId] ?: return null
    val b = stationIndexById[toId] ?: return null
    return minOf(a, b) to maxOf(a, b)
}

private fun overlaps(a: Pair<Int, Int>, b: Pair<Int, Int>): Boolean =
    a.first < b.second && b.first < a.second

private fun clampTo(a: Pair<Int, Int>, bounds: Pair<Int, Int>): Pair<Int, Int> =
    maxOf(a.first, bounds.first) to minOf(a.second, bounds.second)

private fun mergeIntervals(list: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
    if (list.isEmpty()) return emptyList()
    val sorted = list.sortedBy { it.first }
    val out = mutableListOf<Pair<Int, Int>>()
    var cur = sorted[0]
    for (i in 1 until sorted.size) {
        val nxt = sorted[i]
        cur = if (nxt.first <= cur.second) cur.first to maxOf(cur.second, nxt.second)
              else { out.add(cur); nxt }
    }
    out.add(cur)
    return out
}

private fun coveredLength(list: List<Pair<Int, Int>>): Int =
    list.sumOf { it.second - it.first }

private fun biggestFreeInterval(
    selStart: Int, selEnd: Int,
    occMerged: List<Pair<Int, Int>>
): Pair<Int, Int>? {
    var best: Pair<Int, Int>? = null
    var cursor = selStart
    for (o in occMerged) {
        if (cursor < o.first) best = chooseBigger(best, cursor to o.first)
        cursor = maxOf(cursor, o.second)
        if (cursor >= selEnd) break
    }
    if (cursor < selEnd) best = chooseBigger(best, cursor to selEnd)
    return best
}

private fun chooseBigger(a: Pair<Int, Int>?, b: Pair<Int, Int>): Pair<Int, Int> {
    if (a == null) return b
    return if ((b.second - b.first) > (a.second - a.first)) b else a
}

private fun buildIndexToStationId(
    stations: List<StationEntity>,
    stationIndexById: Map<Int, Int>
): Map<Int, Int> {
    val out = mutableMapOf<Int, Int>()
    stations.forEach { st ->
        val idx = stationIndexById[st.id]
        if (idx != null) out[idx] = st.id
    }
    return out
}

private data class SeatGrid(
    val byPos: Map<Pair<Int, Int>, SeatEntity>,
    val maxRow: Int,
    val maxCol: Int
)

private fun buildSeatGrid(seats: List<SeatEntity>): SeatGrid {
    val map = mutableMapOf<Pair<Int, Int>, SeatEntity>()
    var maxR = 0; var maxC = 0
    seats.forEach { s ->
        val r = s.row ?: 0
        val c = s.seatCol ?: 0
        map[r to c] = s
        if (r > maxR) maxR = r
        if (c > maxC) maxC = c
    }
    return SeatGrid(map, maxR, maxC)
}
