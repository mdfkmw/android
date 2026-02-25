package ro.priscom.sofer.ui.screens

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import ro.priscom.sofer.ui.data.DriverLocalStore
import ro.priscom.sofer.ui.data.local.DiscountTypeEntity
import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.data.local.ReservationEntity
import ro.priscom.sofer.ui.screens.SeatMapTab
private enum class ReservationsTab {
    URCARI_AICI,
    TOATE,
    ISTORIC,
    HARTA
}

@Composable
fun DriverReservationsScreen(
    tripId: Int,
    currentStopName: String?,
    boardingStarted: Boolean,
    routeScheduleId: Int?,
    syncRefreshToken: Int,
    repo: LocalRepository,
    onBack: () -> Unit
) {
    val activeGreen = Color(0xFF5BC21E)
    val headerBlue = Color(0xFFB0D4FF)

    val coroutineScope = rememberCoroutineScope()

    var allReservations by remember { mutableStateOf<List<ReservationEntity>>(emptyList()) }
    var stationNameById by remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    var seatLabelBySeatId by remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    var currentStationId by remember { mutableStateOf<Int?>(null) }

    var selectedTab by remember { mutableStateOf(ReservationsTab.URCARI_AICI) }
    var seatMapRefreshTrigger by remember { mutableStateOf(0) }
    var hasSeatReservations by remember { mutableStateOf(false) }
    var routeDiscounts by remember { mutableStateOf<List<DiscountTypeEntity>>(emptyList()) }
    var syncResultDialog by remember { mutableStateOf<Pair<String, String>?>(null) }
    var noShowResultDialog by remember { mutableStateOf<Pair<String, String>?>(null) }
    val dateFormatter = remember { DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss") }

    // când intrăm în ecran: citim rezervările din SQLite
    LaunchedEffect(tripId, syncRefreshToken) {
        allReservations = repo.getReservationsForTrip(tripId)
    }

    // încărcăm toate stațiile (ca să afișăm numele, nu ID-ul)
    LaunchedEffect(syncRefreshToken) {
        val stations = repo.getAllStations()
        stationNameById = stations.associate { it.id to it.name }
    }

    // determinăm stationId pentru stația curentă (din nume)
    LaunchedEffect(currentStopName, syncRefreshToken) {
        currentStationId = currentStopName?.let { repo.getStationIdByName(it) }
    }

    LaunchedEffect(routeScheduleId, syncRefreshToken) {
        val routeId = repo.getRouteSchedule(routeScheduleId)?.routeId
        val routeEntity = routeId?.let { repo.getRouteById(it) }
        hasSeatReservations =
            (routeEntity?.visibleInReservations == true) ||
                    (routeEntity?.visibleOnline == true)

        routeDiscounts = repo.getDiscountsForRouteSchedule(routeScheduleId)

        if (!hasSeatReservations && selectedTab == ReservationsTab.HARTA) {
            selectedTab = ReservationsTab.URCARI_AICI
        }
    }

    fun resolveDiscountLabel(reservation: ReservationEntity): String? {
        if (!reservation.discountLabel.isNullOrBlank()) return reservation.discountLabel
        val base = reservation.basePrice
        val final = reservation.finalPrice
        val amount = reservation.discountAmount

        if (base != null && final != null && base > 0.0 && final >= 0.0 && final <= base) {
            val percent = ((base - final) / base) * 100.0
            routeDiscounts.firstOrNull {
                it.type.equals("percent", ignoreCase = true) && kotlin.math.abs(it.valueOff - percent) < 0.01
            }?.let { return it.label }
        }

        if (amount != null) {
            routeDiscounts.firstOrNull {
                it.type.equals("fixed", ignoreCase = true) && kotlin.math.abs(it.valueOff - amount) < 0.01
            }?.let { return it.label }
        }

        return null
    }

    // funcție helper: nume stație din id
    fun stationName(id: Int?): String {
        if (id == null) return "-"
        return stationNameById[id] ?: "#$id"
    }

    // filtrări
    val reservationsSorted = remember(allReservations) {
        allReservations.sortedWith(
            compareBy<ReservationEntity>(
                { it.seatId == null },   // cele fără loc la final
                { it.seatId },
                { it.boardStationId }
            )
        )
    }

    val reservationsHere = remember(reservationsSorted, currentStationId) {
        if (currentStationId == null) emptyList()
        else reservationsSorted.filter {
            it.boardStationId == currentStationId &&
                    it.status != "cancelled"
        }
    }

    LaunchedEffect(allReservations) {
        val seatIds = allReservations.mapNotNull { it.seatId }.distinct()
        if (seatIds.isEmpty()) {
            seatLabelBySeatId = emptyMap()
            return@LaunchedEffect
        }

        // dăm timp scurt sync-ului de seats_local să termine
        repeat(10) { attempt ->
            val labels = mutableMapOf<Int, String>()
            seatIds.forEach { seatId ->
                val label = repo.getSeatLabelById(seatId)
                if (!label.isNullOrBlank()) labels[seatId] = label
            }
            seatLabelBySeatId = labels

            val allResolved = seatIds.all { labels[it] != null }
            if (allResolved) return@LaunchedEffect

            if (attempt < 9) delay(500)
        }
    }

    fun seatDisplay(seatId: Int?): String {
        if (seatId == null) return "-"
        return seatLabelBySeatId[seatId] ?: "Se încarcă nr de loc..."
    }


    // pentru ecranul de detalii
    var selectedReservation by remember { mutableStateOf<ReservationEntity?>(null) }

    // pentru ecranul de încasare
    var openPaymentFor by remember { mutableStateOf<ReservationEntity?>(null) }
    // pentru emitere bilet din rezervare
    var openEmitBiletFor by remember { mutableStateOf<ReservationEntity?>(null) }

    // pentru vânzare bilet din harta locurilor
    data class SeatMapSell(val seatId: Int, val fromStationId: Int, val toStationId: Int)
    var openSellFromSeatMap by remember { mutableStateOf<SeatMapSell?>(null) }


    // dacă avem o rezervare pentru încasare, afișăm direct ecranul de încasare
    val paymentReservation = openPaymentFor
    if (paymentReservation != null) {
        PaymentScreen(
            reservation = paymentReservation,
            tripRouteScheduleId = routeScheduleId,
            syncRefreshToken = syncRefreshToken,
            repo = repo,
            onBack = { openPaymentFor = null },
            onConfirmPayment = { newExitId, discount, description ->
                val current = paymentReservation

                coroutineScope.launch {
                    try {
                        // 1️⃣ aplicăm LOCAL modificarea de pricing
                        val updated = repo.applyLocalReservationPricingChange(
                            reservation = current,
                            newExitStationId = newExitId,
                            discount = discount
                        )

                        // 2️⃣ actualizăm lista de rezervări din ecran
                        allReservations = allReservations.map { r ->
                            if (r.id == updated.id) updated else r
                        }

                        Log.d(
                            "DriverReservationsScreen",
                            "Update pricing OK: id=${updated.id}, final=${updated.finalPrice}, due=${updated.dueAmount}"
                        )
                    } catch (e: Exception) {
                        Log.e("DriverReservationsScreen", "Eroare la update pricing", e)
                    } finally {
                        // 3️⃣ închidem ecranul de plată
                        openPaymentFor = null
                    }
                }
            }
        )
        return
    }

// dacă emitem bilet direct din rezervare
    val emitRes = openEmitBiletFor
    if (emitRes != null) {
        val emitBasePrice = emitRes.basePrice ?: emitRes.finalPrice
        val emitDiscountAmount = emitRes.discountAmount
        val emitDiscountLabel = resolveDiscountLabel(emitRes)
        val emitDiscountPercent = if (
            emitRes.basePrice != null &&
            emitRes.finalPrice != null &&
            emitRes.basePrice > 0.0 &&
            emitRes.finalPrice >= 0.0 &&
            emitRes.finalPrice <= emitRes.basePrice
        ) {
            ((emitRes.basePrice - emitRes.finalPrice) / emitRes.basePrice) * 100.0
        } else {
            null
        }

        BiletDetaliiScreen(
            destination = stationName(emitRes.exitStationId), // direct din rezervare
            currentStopName = stationName(emitRes.boardStationId),
            ticketPrice = emitBasePrice,
            tripId = emitRes.tripId,
            fromStationId = emitRes.boardStationId,
            toStationId = emitRes.exitStationId,
            seatId = emitRes.seatId,
            operatorId = DriverLocalStore.getOperatorId(),
            employeeId = DriverLocalStore.getEmployeeId(),
            syncRefreshToken = syncRefreshToken,
            routeScheduleId = routeScheduleId,
            repo = repo,
            initialDiscountLabel = emitDiscountLabel,
            initialDiscountAmount = emitDiscountAmount,
            initialPromoCode = emitRes.promoCode,
            initialFinalPrice = emitRes.finalPrice,
            initialDiscountPercent = emitDiscountPercent,
            onBack = { openEmitBiletFor = null },
            onIncasare = { openEmitBiletFor = null }
        )
        return
    }


    // dacă vindem bilet din harta locurilor
    val seatMapSell = openSellFromSeatMap
    if (seatMapSell != null) {
        BiletDetaliiScreen(
            destination = stationName(seatMapSell.toStationId),
            currentStopName = stationName(seatMapSell.fromStationId),
            ticketPrice = null,
            tripId = tripId,
            fromStationId = seatMapSell.fromStationId,
            toStationId = seatMapSell.toStationId,
            seatId = seatMapSell.seatId,
            operatorId = DriverLocalStore.getOperatorId(),
            employeeId = DriverLocalStore.getEmployeeId(),
            syncRefreshToken = syncRefreshToken,
            routeScheduleId = routeScheduleId,
            repo = repo,
            onBack = { openSellFromSeatMap = null },
            onIncasare = { openSellFromSeatMap = null }
        )
        return
    }

    // dacă avem selecție, afișăm direct ecranul de detalii
    val sel = selectedReservation
    if (sel != null) {
        ReservationDetailsScreen(
            reservation = sel,
            resolvedDiscountLabel = resolveDiscountLabel(sel),
            seatDisplay = seatDisplay(sel.seatId),
            fromStationName = stationName(sel.boardStationId),
            toStationName = stationName(sel.exitStationId),
            canCollectDifference = boardingStarted && currentStationId != null,
            onBack = { selectedReservation = null },
            onMarkBoarded = {
                val current = sel   // rezervarea selectată acum

                coroutineScope.launch {
                    try {
                        // 1️⃣ apelăm repo – update pe server + SQLite
                        repo.markReservationBoarded(current.id)

                        // 2️⃣ recitim rezervările din DB local
                        val newList = repo.getReservationsForTrip(tripId)
                        allReservations = newList

                        // 3️⃣ găsim rezervarea actualizată și o punem în selectedReservation
                        val updated = newList.firstOrNull { it.id == current.id }
                        selectedReservation = updated

                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            },
            onMarkNoShow = {
                val current = sel

                coroutineScope.launch {
                    try {
                        repo.markReservationNoShow(current.id)

                        val updated = current.copy(status = "no_show")

                        allReservations = allReservations.map { r ->
                            if (r.id == updated.id) updated else r
                        }

                        selectedReservation = updated

                        val finishedAt = LocalDateTime.now().format(dateFormatter)
                        noShowResultDialog = "NO-SHOW salvat" to
                                "Rezervarea a fost marcată NO-SHOW cu succes la $finishedAt."

                    } catch (e: Exception) {
                        Log.e("DriverReservationsScreen", "Eroare la NO-SHOW", e)
                        val finishedAt = LocalDateTime.now().format(dateFormatter)
                        val msg = e.localizedMessage ?: "Eroare necunoscută"
                        noShowResultDialog = "NO-SHOW eșuat" to
                                "Nu am putut marca rezervarea ca NO-SHOW la $finishedAt.\nDetalii: $msg"
                    }
                }
            },
            onCancel = {
                val current = sel

                coroutineScope.launch {
                    try {
                        repo.cancelReservation(current.id)

                        val updated = current.copy(status = "cancelled")

                        allReservations = allReservations.map { r ->
                            if (r.id == updated.id) updated else r
                        }

                        selectedReservation = updated

                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            },
            onOpenIncasare = {
                openEmitBiletFor = sel
            }

        )
        return
    }





    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        // header sus
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(headerBlue)
                .padding(12.dp)
        ) {
            Column {
                Text("Rezervări", fontSize = 18.sp)
                Text(
                    text = "Stație curentă: ${currentStopName ?: "-"}",
                    fontSize = 14.sp
                )
            }
        }

        // tab-uri
        TabRow(
            selectedTabIndex = selectedTab.ordinal,
            containerColor = Color(0xFFEFEFEF)
        ) {
            Tab(
                selected = selectedTab == ReservationsTab.URCARI_AICI,
                onClick = { selectedTab = ReservationsTab.URCARI_AICI },
                text = { Text("URCĂRI AICI") }
            )
            Tab(
                selected = selectedTab == ReservationsTab.TOATE,
                onClick = { selectedTab = ReservationsTab.TOATE },
                text = { Text("TOATE") }
            )
            Tab(
                selected = selectedTab == ReservationsTab.ISTORIC,
                onClick = { selectedTab = ReservationsTab.ISTORIC },
                text = { Text("ISTORIC") }
            )
            if (hasSeatReservations) {
                Tab(
                    selected = selectedTab == ReservationsTab.HARTA,
                    onClick = { selectedTab = ReservationsTab.HARTA },
                    text = { Text("HARTĂ") }
                )
            }
        }

        // conținut tab-uri – ocupă tot spațiul rămas
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when (selectedTab) {
                ReservationsTab.URCARI_AICI -> {
                    ReservationsList(
                        reservations = reservationsHere,
                        seatDisplay = ::seatDisplay,
                        stationName = ::stationName,
                        emptyMessage = if (currentStationId == null)
                            "Nu avem ID pentru stația curentă (GPS)."
                        else
                            "Nu există rezervări care urcă din această stație.",
                        onReservationClick = { selectedReservation = it }
                    )
                }

                ReservationsTab.TOATE -> {
                    ReservationsList(
                        reservations = reservationsSorted.filter { it.status != "cancelled" },
                        seatDisplay = ::seatDisplay,
                        stationName = ::stationName,
                        emptyMessage = "Nu există rezervări pentru această cursă.",
                        onReservationClick = { selectedReservation = it }
                    )
                }

                ReservationsTab.ISTORIC -> {
                    ReservationsHistoryTab(
                        reservations = allReservations.filter {
                            it.status == "cancelled" || it.status == "no_show"
                        },
                        seatDisplay = ::seatDisplay,
                        stationName = ::stationName
                    )
                }
                ReservationsTab.HARTA -> {
                    if (hasSeatReservations) {
                        SeatMapTab(
                            tripId = tripId,
                            currentStationId = currentStationId,
                            allowTicketSell = boardingStarted,
                            routeScheduleId = routeScheduleId,
                            repo = repo,
                            refreshTrigger = seatMapRefreshTrigger,
                            onSellTicket = { seatId, fromStationId, toStationId ->
                                openSellFromSeatMap = SeatMapSell(seatId, fromStationId, toStationId)
                            },
                            onOpenReservationDetails = { res ->
                                selectedReservation = res
                            }
                        )
                    } else {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("Harta locurilor este disponibilă doar la cursele cu rezervări.", color = Color.Gray)
                        }
                    }
                }

            }
        }

// rând jos: ÎNAPOI + SINCRONIZARE
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(55.dp)
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {

            // ⬅️ ÎNAPOI
            Button(
                onClick = onBack,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeGreen
                )
            ) {
                Text("ÎNAPOI")
            }

            // 🔄 SINCRONIZARE REZERVĂRI
            Button(
                onClick = {
                    coroutineScope.launch {
                        try {
                            if (selectedTab == ReservationsTab.HARTA) {
                                // pe tabul HARTA: refresh complet seatmap (seats + rezervări)
                                repo.refreshMySeatMapForTrip(tripId)
                                seatMapRefreshTrigger++
                            } else {
                                // pe celelalte taburi: doar rezervările
                                repo.refreshReservationsForTrip(tripId)
                            }
                            // reîncărcăm lista din DB local (pentru taburile cu liste)
                            allReservations = repo.getReservationsForTrip(tripId)

                            val finishedAt = LocalDateTime.now().format(dateFormatter)
                            syncResultDialog = "Sincronizare reușită" to
                                    "Sincronizarea rezervărilor s-a efectuat cu succes la $finishedAt."

                        } catch (e: Exception) {
                            Log.e(
                                "DriverReservationsScreen",
                                "Eroare la sincronizare",
                                e
                            )

                            val finishedAt = LocalDateTime.now().format(dateFormatter)
                            val msg = e.localizedMessage ?: "Eroare necunoscută"
                            syncResultDialog = "Sincronizare eșuată" to
                                    "Sincronizarea rezervărilor a eșuat la $finishedAt.\nDetalii: $msg"
                        }
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF1976D2)
                )
            ) {
                Text("SINCRONIZEAZĂ")
            }
        }

        if (syncResultDialog != null) {
            val (title, message) = syncResultDialog!!
            AlertDialog(
                onDismissRequest = { syncResultDialog = null },
                title = { Text(title) },
                text = { Text(message) },
                confirmButton = {
                    TextButton(onClick = { syncResultDialog = null }) {
                        Text("OK")
                    }
                }
            )
        }

        if (noShowResultDialog != null) {
            val (title, message) = noShowResultDialog!!
            AlertDialog(
                onDismissRequest = { noShowResultDialog = null },
                title = { Text(title) },
                text = { Text(message) },
                confirmButton = {
                    TextButton(onClick = { noShowResultDialog = null }) {
                        Text("OK")
                    }
                }
            )
        }


    }
}



/**
 * Lista simplă: doar loc, nume, telefon, segment.
 * FĂRĂ butoane, FĂRĂ "status: active".
 */
@Composable
private fun ReservationsList(
    reservations: List<ReservationEntity>,
    seatDisplay: (Int?) -> String,
    stationName: (Int?) -> String,
    emptyMessage: String,
    onReservationClick: (ReservationEntity) -> Unit
) {
    if (reservations.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(emptyMessage, color = Color.Gray)
        }
        return
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(8.dp)
    ) {
        items(reservations) { res ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onReservationClick(res) }
                    .padding(vertical = 8.dp)
            ) {
                Text(
                    text = "Loc ${seatDisplay(res.seatId)} – ${res.personName ?: "Fără nume"}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )

                Text(
                    text = "${stationName(res.boardStationId)} → ${stationName(res.exitStationId)}",
                    fontSize = 13.sp
                )

                if (!res.status.equals("active", ignoreCase = true)) {
                    val statusLabel = when (res.status) {
                        "cancelled" -> "ANULATĂ"
                        "no_show" -> "NO-SHOW"
                        else -> res.status.uppercase()
                    }

                    Text(
                        text = statusLabel,
                        color = if (res.status == "cancelled") Color.Red else Color(0xFFFF9800),
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }

            Divider(color = Color(0xFFDDDDDD))
        }
    }
}





/**
 * Tab-ul ISTORIC – deocamdată simplu: arată biletele emise local
 * pe cursa curentă. Mai târziu aici combinăm:
 *   - plăți pentru rezervări
 *   - imbarcări / no-show / anulări
 */

@Composable
private fun ReservationsHistoryTab(
    reservations: List<ReservationEntity>,
    seatDisplay: (Int?) -> String,
    stationName: (Int?) -> String
) {
    val tickets = DriverLocalStore.getTickets()

    if (reservations.isEmpty() && tickets.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text("Încă nu există istoric pentru această cursă.", color = Color.Gray)
        }
        return
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(8.dp)
    ) {
        // 1️⃣ Rezervări în istoric (ANULATE / NO-SHOW)
        if (reservations.isNotEmpty()) {
            item {
                Text(
                    "Rezervări",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }

            items(reservations) { res ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                ) {
                    Text(
                        text = "Loc ${seatDisplay(res.seatId)} – ${res.personName ?: "Fără nume"}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "${stationName(res.boardStationId)} → ${stationName(res.exitStationId)}",
                        fontSize = 13.sp
                    )

                    if (!res.status.equals("active", ignoreCase = true)) {
                        val statusLabel = when (res.status) {
                            "cancelled" -> "ANULATĂ"
                            "no_show" -> "NO-SHOW"
                            else -> res.status.uppercase()
                        }

                        Text(
                            text = statusLabel,
                            color = if (res.status == "cancelled") Color.Red else Color(0xFFFF9800),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                }
                Divider(color = Color(0xFFDDDDDD))
            }
        }

        // 2️⃣ Bilete în istoric (dacă există)
        if (tickets.isNotEmpty()) {
            item {
                Spacer(Modifier.height(12.dp))
                Text(
                    "Bilete",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }

            items(tickets) { t ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                ) {
                    Text("Bilet: ${t.destination}", fontSize = 14.sp)
                    Text(
                        "Cantitate: ${t.quantity}, Final: %.2f".format(t.finalPrice),
                        fontSize = 13.sp,
                        color = Color.DarkGray
                    )
                }
                Divider(color = Color(0xFFDDDDDD))
            }
        }
    }
}



@Composable
fun ReservationDetailsScreen(
    reservation: ReservationEntity,
    resolvedDiscountLabel: String?,
    seatDisplay: String,
    fromStationName: String,
    toStationName: String,
    canCollectDifference: Boolean,
    onBack: () -> Unit,
    onMarkBoarded: () -> Unit,
    onMarkNoShow: () -> Unit,
    onCancel: () -> Unit,
    onOpenIncasare: () -> Unit
) {
    val activeGreen = Color(0xFF5BC21E)
    val headerBlue = Color(0xFFB0D4FF)

    // 🔹 Poți marca îmbarcat DOAR dacă rezervarea este plătită și încă nu e îmbarcată
    val canMarkBoarded = reservation.isPaid && !reservation.boarded

    // 🔹 Poți anula doar dacă NU e îmbarcată și nu e deja anulată
    val canCancel = !reservation.boarded && reservation.status != "cancelled"


    var showConfirmBoarded by remember { mutableStateOf(false) }
    var showConfirmNoShow by remember { mutableStateOf(false) }
    var showConfirmCancel by remember { mutableStateOf(false) }

    val statusLabel = when (reservation.status) {
        "cancelled" -> "Anulată"
        "no_show" -> "No-show"
        else -> "Activă"
    }

    val boardedLabel = if (reservation.boarded) "Da" else "Nu"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        // HEADER
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(headerBlue)
                .padding(12.dp)
        ) {
            Column {
                Text("Detalii rezervare", fontSize = 18.sp)
                Text(
                    "Loc $seatDisplay – ${reservation.personName ?: ""}",
                    fontSize = 14.sp
                )
            }
        }

        // CONȚINUT
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text("Informații generale", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            DetailRow("Nume", reservation.personName ?: "—")
            DetailRow("Telefon", reservation.personPhone ?: "—")
            DetailRow("Loc", seatDisplay)
            DetailRow("Segment", "$fromStationName → $toStationName")

            Spacer(Modifier.height(8.dp))

            DetailRow("Status rezervare", statusLabel)
            DetailRow("Îmbarcat", boardedLabel)
            DetailRow("Boarded at", reservation.boardedAt ?: "—")

            Spacer(Modifier.height(8.dp))

            DetailRow("Creată la", reservation.reservationTime ?: "—")
            DetailRow("Creată de", reservation.agentName ?: "—")

            val achitataText = when {
                reservation.finalPrice == null -> "—"
                reservation.isPaid -> "DA (${reservation.paidAmount ?: 0.0} lei)"
                else -> "NU (${reservation.paidAmount ?: 0.0} / ${reservation.finalPrice ?: 0.0} lei)"
            }
            DetailRow("Achitată", achitataText)

            val reducereText = when {
                !resolvedDiscountLabel.isNullOrBlank() &&
                        !reservation.promoCode.isNullOrBlank() &&
                        reservation.discountAmount != null ->
                    "$resolvedDiscountLabel | promo ${reservation.promoCode} (-${"%.2f".format(reservation.discountAmount)} lei)"
                !resolvedDiscountLabel.isNullOrBlank() && reservation.discountAmount != null ->
                    "$resolvedDiscountLabel (-${"%.2f".format(reservation.discountAmount)} lei)"
                !resolvedDiscountLabel.isNullOrBlank() ->
                    resolvedDiscountLabel
                !reservation.promoCode.isNullOrBlank() && reservation.discountAmount != null ->
                    "Promo ${reservation.promoCode} (-${"%.2f".format(reservation.discountAmount)} lei)"
                !reservation.promoCode.isNullOrBlank() ->
                    "Promo ${reservation.promoCode}"
                reservation.discountAmount != null ->
                    "Reducere (-${"%.2f".format(reservation.discountAmount)} lei)"
                else -> "—"
            }
            DetailRow("Reducere", reducereText)

            if (!reservation.promoCode.isNullOrBlank()) {
                DetailRow("Cod promo", reservation.promoCode)
            }

            Spacer(Modifier.height(24.dp))

            Text("Acțiuni șofer", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))

            // 🔵 ÎNCASEAZĂ / DIFERENȚĂ – FĂRĂ POPUP
            Button(
                onClick = onOpenIncasare,
                enabled = canCollectDifference,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeGreen
                )
            ) {
                Text("ÎNCASEAZĂ / DIFERENȚĂ")
            }

            Spacer(Modifier.height(8.dp))

            // RÂND: ÎMBARCAT + NO-SHOW (ambele cu popup)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // 🟢 ÎMBARCAT – cu confirmare + activ doar dacă e plătită
                Button(
                    onClick = { showConfirmBoarded = true },
                    enabled = canMarkBoarded,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                ) {
                    Text("ÎMBARCAT")
                }

                // 🟡 NO-SHOW – cu confirmare
                val isNoShowEnabled =
                    reservation.status != "no_show" &&
                            reservation.status != "cancelled" &&
                            !reservation.boarded

                Button(
                    onClick = { showConfirmNoShow = true },
                    enabled = isNoShowEnabled,   // 🔴 AICI lipsise
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFFFC107) // galben
                    )
                ) {
                    Text("NO-SHOW")
                }

            }

            Spacer(Modifier.height(8.dp))

            // 🔴 ANULEAZĂ REZERVAREA – cu confirmare
            Button(
                onClick = { showConfirmCancel = true },
                enabled = canCancel,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFDD2C00) // roșu
                )
            ) {
                Text("ANULEAZĂ REZERVAREA")
            }

        }

        // BUTON ÎNAPOI
        Button(
            onClick = onBack,
            modifier = Modifier
                .fillMaxWidth()
                .height(55.dp)
                .padding(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = activeGreen
            )
        ) {
            Text("ÎNAPOI")
        }
    }

    // 🔹 Popup confirmare ÎMBARCAT
    if (showConfirmBoarded) {
        AlertDialog(
            onDismissRequest = { showConfirmBoarded = false },
            title = { Text("Confirmare") },
            text = { Text("Ești sigur că vrei să marchezi rezervarea ca ÎMBARCATĂ?") },
            confirmButton = {
                TextButton(onClick = {
                    showConfirmBoarded = false
                    onMarkBoarded()
                }) {
                    Text("DA")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmBoarded = false }) {
                    Text("NU")
                }
            }
        )
    }

    // 🔹 Popup confirmare NO-SHOW
    if (showConfirmNoShow) {
        AlertDialog(
            onDismissRequest = { showConfirmNoShow = false },
            title = { Text("Confirmare") },
            text = { Text("Ești sigur că vrei să marchezi rezervarea ca NO-SHOW?") },
            confirmButton = {
                TextButton(onClick = {
                    showConfirmNoShow = false
                    onMarkNoShow()
                }) {
                    Text("DA")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmNoShow = false }) {
                    Text("NU")
                }
            }
        )
    }

    // 🔹 Popup confirmare ANULARE
    if (showConfirmCancel) {
        AlertDialog(
            onDismissRequest = { showConfirmCancel = false },
            title = { Text("Confirmare") },
            text = { Text("Ești sigur că vrei să ANULEZI această rezervare?") },
            confirmButton = {
                TextButton(onClick = {
                    showConfirmCancel = false
                    onCancel()
                }) {
                    Text("DA")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmCancel = false }) {
                    Text("NU")
                }
            }
        )
    }
}


@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 13.sp, color = Color.DarkGray)
        Spacer(Modifier.width(8.dp))
        Text(value, fontSize = 13.sp, color = Color.Black)
    }
}
