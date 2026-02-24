package ro.priscom.sofer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ro.priscom.sofer.ui.data.local.TicketLocalRepository
import ro.priscom.sofer.ui.screens.DiscountOption
import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.data.local.SeatEntity
import ro.priscom.sofer.ui.data.local.StationEntity


/**
 * Ecran detalii bilet:
 *  - arată prețul, reducerea, dus/întors, cantitatea
 *  - la INCAZARE salvează biletul în SQLite (tickets_local) cu syncStatus = 0
 *
 * Parametrii noi (toți opționali, ca să nu strice apelurile existente):
 *  - tripId, fromStationId, toStationId, priceListId, operatorId, employeeId, tripVehicleId
 *    -> când le vei avea din ecranul de cursă, le poți pasa aici.
 */

@Composable
fun BiletDetaliiScreen(
    destination: String,
    onBack: () -> Unit,
    onIncasare: () -> Unit,
    currentStopName: String? = null,
    ticketPrice: Double? = null,

    // 🔵 date reale pentru bilet – deocamdată doar le primim, le vom folosi la PARTEA 5
    tripId: Int? = null,
    fromStationId: Int? = null,
    toStationId: Int? = null,
    seatId: Int? = null,
    priceListId: Int? = null,
    operatorId: Int? = null,
    employeeId: Int? = null,
    tripVehicleId: Int? = null,

    routeScheduleId: Int? = null,
    repo: ro.priscom.sofer.ui.data.local.LocalRepository? = null,
    initialDiscountLabel: String? = null,
    initialDiscountAmount: Double? = null,
    initialPromoCode: String? = null,
    initialFinalPrice: Double? = null,
    initialDiscountPercent: Double? = null
)
 {
    val activeGreen = Color(0xFF5BC21E)
    val purpleBg = Color(0xFFE3C6FF)
    val blueFinal = Color(0xFF007BFF)

    val context = LocalContext.current
    val ticketRepo = remember { TicketLocalRepository(context) }
    val coroutineScope = rememberCoroutineScope()

    // dacă avem preț din listele reale, îl folosim; altfel 0 intern
    var pretBrut by remember(ticketPrice) { mutableStateOf(ticketPrice ?: 0.0) }
    var dusIntors by remember { mutableStateOf(false) }
    var quantity by remember { mutableStateOf(1) }
    var hasInitialReservationDiscount by remember(initialDiscountAmount, initialFinalPrice) {
        mutableStateOf((initialDiscountAmount ?: 0.0) > 0.0 || (ticketPrice != null && initialFinalPrice != null && initialFinalPrice < ticketPrice))
    }
    var selectedDiscount by remember(initialDiscountLabel, initialDiscountPercent) {
        mutableStateOf(
            if (!initialDiscountLabel.isNullOrBlank() && (initialDiscountPercent ?: 0.0) > 0.0) {
                DiscountOption(
                    id = null,
                    label = initialDiscountLabel,
                    percent = initialDiscountPercent ?: 0.0
                )
            } else {
                null
            }
        )
    }
    var showReduceri by remember { mutableStateOf(false) }
    var selectedPaymentMethod by remember { mutableStateOf("cash") } // deocamdată doar cash
    var routeStations by remember { mutableStateOf<List<StationEntity>>(emptyList()) }
    var selectedToStationId by remember(toStationId) { mutableStateOf(toStationId) }
    var hasSeatReservations by remember { mutableStateOf(false) }
    var seatMapSeats by remember { mutableStateOf<List<SeatEntity>>(emptyList()) }
    var seatDisplay by remember { mutableStateOf("-") }

    LaunchedEffect(routeScheduleId, repo) {
        val localRepo = repo ?: return@LaunchedEffect
        routeStations = localRepo.getStationsForRouteSchedule(routeScheduleId)

        val routeId = localRepo.getRouteSchedule(routeScheduleId)?.routeId
        val routeEntity = routeId?.let { localRepo.getRouteById(it) }
        hasSeatReservations =
            (routeEntity?.visibleInReservations == true) ||
                    (routeEntity?.visibleOnline == true)
    }

    LaunchedEffect(seatId, repo) {
        val localRepo = repo ?: return@LaunchedEffect
        seatDisplay = localRepo.getSeatLabelById(seatId) ?: if (seatId != null) seatId.toString() else "-"
    }

    LaunchedEffect(tripId, hasSeatReservations, repo) {
        val localRepo = repo ?: return@LaunchedEffect
        if (!hasSeatReservations || tripId == null) {
            seatMapSeats = emptyList()
            return@LaunchedEffect
        }

        val pair = localRepo.refreshMySeatMapForTrip(tripId)
        val vehicleId = pair?.second
        seatMapSeats = if (vehicleId != null) localRepo.getSeatsForVehicle(vehicleId) else emptyList()
    }

    LaunchedEffect(routeScheduleId, fromStationId, selectedToStationId, repo) {
        val localRepo = repo ?: return@LaunchedEffect
        if (routeScheduleId == null || fromStationId == null || selectedToStationId == null) return@LaunchedEffect

        val newBase = localRepo.getBasePriceForRouteScheduleSegment(
            routeScheduleId = routeScheduleId,
            fromStationId = fromStationId,
            toStationId = selectedToStationId
        )
        if (newBase != null) {
            pretBrut = newBase
        }
    }

    val destinationOptions = remember(routeStations, fromStationId) {
        val boardIndex = routeStations.indexOfFirst { it.id == fromStationId }
        if (boardIndex == -1 || boardIndex == routeStations.size - 1) {
            emptyList()
        } else {
            routeStations.drop(boardIndex + 1)
        }
    }

    val destinationName = destinationOptions.firstOrNull { it.id == selectedToStationId }?.name ?: destination

    val baseTotal = if (ticketPrice != null) {
        pretBrut * quantity * (if (dusIntors) 2 else 1)
    } else {
        0.0
    }

    val selectedDiscountAmount = if (ticketPrice != null && selectedDiscount != null) {
        (baseTotal * ((selectedDiscount?.percent ?: 0.0) / 100.0)).coerceAtLeast(0.0)
    } else {
        0.0
    }

    val initialDiscountValue = (initialDiscountAmount ?: 0.0).coerceAtLeast(0.0)
    val finalPriceFromInitial = initialFinalPrice?.coerceAtLeast(0.0)

    val appliedDiscountAmount = when {
        selectedDiscount != null -> selectedDiscountAmount
        hasInitialReservationDiscount && !dusIntors && quantity == 1 && finalPriceFromInitial != null ->
            (baseTotal - finalPriceFromInitial).coerceAtLeast(0.0)
        hasInitialReservationDiscount && !dusIntors && quantity == 1 -> initialDiscountValue
        else -> 0.0
    }

    val finalPrice = (baseTotal - appliedDiscountAmount).coerceAtLeast(0.0)
    val canIncasare = ticketPrice != null

    // ecranul de reduceri
     if (showReduceri) {
         // repo și routeScheduleId NU ar trebui să fie null în fluxul „Emite bilet”
         val nonNullRepo = repo
         if (nonNullRepo != null && routeScheduleId != null) {
             ReduceriScreen(
                 repo = nonNullRepo,
                 routeScheduleId = routeScheduleId,
                 onBack = { showReduceri = false },
                 onSelect = { opt ->
                     selectedDiscount = opt
                     hasInitialReservationDiscount = false
                     showReduceri = false
                 }
             )
         } else {
             // fallback: dacă nu avem date, doar închidem ecranul de reduceri
             showReduceri = false
         }
         return
     }


    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        // zona albă de sus cu info cursă
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .padding(8.dp)
        ) {
            Text(
                "IMBARCARE: ${currentStopName ?: "STATIE CURENTA"}",
                fontSize = 14.sp
            )
            if (destinationOptions.isNotEmpty()) {
                DestinationPickerButton(
                    options = destinationOptions,
                    selectedId = selectedToStationId,
                    fallbackName = destinationName,
                    onSelect = { selectedToStationId = it }
                )
            } else {
                Text("DEBARCARE: $destinationName", fontSize = 14.sp)
            }

            if (seatId != null) {
                Text("LOC: $seatDisplay", fontSize = 14.sp)
            }

            Spacer(Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (ticketPrice != null) {
                        "PRET BRUT: %.2f".format(pretBrut)
                    } else {
                        "PRET BRUT: -"
                    },
                    fontSize = 16.sp
                )

                Spacer(Modifier.weight(1f))

                Box(
                    modifier = Modifier
                        .background(blueFinal)
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = if (ticketPrice != null) {
                            "FINAL %.2f".format(finalPrice)
                        } else {
                            "FINAL: -"
                        },
                        fontSize = 16.sp,
                        color = Color.White
                    )
                }
            }

            if (selectedDiscount != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = selectedDiscount!!.label,
                    fontSize = 14.sp,
                    color = Color.Black
                )
            } else if (hasInitialReservationDiscount) {
                Spacer(Modifier.height(4.dp))
                val discountInfo = when {
                    !initialDiscountLabel.isNullOrBlank() && !initialPromoCode.isNullOrBlank() && initialDiscountAmount != null ->
                        "$initialDiscountLabel | promo: $initialPromoCode (-${"%.2f".format(initialDiscountAmount)} lei)"
                    !initialDiscountLabel.isNullOrBlank() && initialDiscountAmount != null ->
                        "$initialDiscountLabel (-${"%.2f".format(initialDiscountAmount)} lei)"
                    !initialPromoCode.isNullOrBlank() && initialDiscountAmount != null ->
                        "Promo: $initialPromoCode (-${"%.2f".format(initialDiscountAmount)} lei)"
                    !initialPromoCode.isNullOrBlank() -> "Promo: $initialPromoCode"
                    !initialDiscountLabel.isNullOrBlank() -> initialDiscountLabel
                    initialDiscountAmount != null -> "Reducere (-${"%.2f".format(initialDiscountAmount)} lei)"
                    else -> "Reducere"
                }
                Text(
                    text = discountInfo,
                    fontSize = 14.sp,
                    color = Color.Black
                )
            }

            Spacer(Modifier.height(8.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { showReduceri = true },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = activeGreen
                    )
                ) {
                    Text("REDUCERI")
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = dusIntors,
                        onCheckedChange = { dusIntors = it }
                    )
                    Text("DUS / INTORS")
                }

                // buton CASH – setează metoda de plată
                Button(
                    onClick = {
                        selectedPaymentMethod = "cash"
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (selectedPaymentMethod == "cash") activeGreen else Color.Gray
                    )
                ) {
                    Text("CASH")
                }

                // aici, ulterior, poți adăuga și buton CARD (paymentMethod = "card")
            }
        }

        // zona mov mare (poți adăuga detalii suplimentare ulterior)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(purpleBg)
                .padding(8.dp)
        ) {
            if (hasSeatReservations && seatMapSeats.isNotEmpty()) {
                TicketSeatMapPreview(
                    seats = seatMapSeats,
                    selectedSeatId = seatId
                )
            }
        }

        // bara de jos: RENUNTA | Nr | - 1 + | INCASARE
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(
                onClick = onBack,
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeGreen
                )
            ) {
                Text("RENUNTA")
            }

            Spacer(Modifier.width(8.dp))

            Text("Nr.", fontSize = 16.sp)

            Spacer(Modifier.width(4.dp))

            Button(
                onClick = { if (quantity > 1) quantity-- },
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeGreen
                ),
                modifier = Modifier.width(40.dp)
            ) { Text("-") }

            Text(quantity.toString(), modifier = Modifier.padding(horizontal = 8.dp))

            Button(
                onClick = { quantity++ },
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeGreen
                ),
                modifier = Modifier.width(40.dp)
            ) { Text("+") }

            Spacer(Modifier.weight(1f))

            Button(
                onClick = {
                    if (!canIncasare) return@Button  // nu avem preț -> nu salvăm nimic

                    // lansăm coroutine pentru salvarea în DB locală
                    coroutineScope.launch {
                        // pentru moment:
                        //  - tripId, fromStationId, toStationId, priceListId, operatorId, employeeId, tripVehicleId
                        //    pot fi null dacă nu sunt încă transmise din ecranul părinte.
                        ticketRepo.saveTicketLocally(
                            operatorId = operatorId,
                            employeeId = employeeId,
                            tripId = tripId,
                            tripVehicleId = tripVehicleId,
                            fromStationId = fromStationId,
                            toStationId = selectedToStationId ?: toStationId,
                            seatId = null,                     // curse scurte -> fără loc
                            priceListId = priceListId,
                            discountTypeId = selectedDiscount?.id,
                            basePrice = pretBrut,
                            finalPrice = finalPrice,
                            currency = "RON",
                            paymentMethod = selectedPaymentMethod
                        )


                        // după ce am salvat local, mergem mai departe (de ex. afișăm mesaj / revenim)
                        onIncasare()
                    }
                },
                enabled = canIncasare,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (canIncasare) activeGreen else Color.Gray
                )
            ) {
                Text("INCAZARE")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DestinationPickerButton(
    options: List<StationEntity>,
    selectedId: Int?,
    fallbackName: String,
    onSelect: (Int) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = options.firstOrNull { it.id == selectedId }?.name ?: fallbackName

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded }
    ) {
        TextField(
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            readOnly = true,
            value = "DEBARCARE: $selectedName",
            onValueChange = {},
            singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = ExposedDropdownMenuDefaults.textFieldColors(),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            options.forEach { station ->
                DropdownMenuItem(
                    text = { Text(station.name) },
                    onClick = {
                        onSelect(station.id)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun TicketSeatMapPreview(
    seats: List<SeatEntity>,
    selectedSeatId: Int?
) {
    val selectedColor = Color(0xFF1E88E5)
    val normalColor = Color(0xFF66BB6A)
    val inactiveColor = Color(0xFFBDBDBD)

    val grid = remember(seats) { buildTicketSeatGrid(seats) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        for (r in 0..grid.maxRow) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                for (c in 0..grid.maxCol) {
                    val seat = grid.byPos[r to c]
                    if (seat == null) {
                        Spacer(modifier = Modifier.size(42.dp))
                    } else {
                        val bg = when {
                            seat.seatType == "none" || seat.seatType == "service" -> inactiveColor
                            seat.id == selectedSeatId -> selectedColor
                            else -> normalColor
                        }

                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .background(bg),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = seat.label ?: seat.id.toString(),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.Black
                            )
                        }
                    }
                }
            }
        }
    }
}

private data class TicketSeatGrid(
    val byPos: Map<Pair<Int, Int>, SeatEntity>,
    val maxRow: Int,
    val maxCol: Int
)

private fun buildTicketSeatGrid(seats: List<SeatEntity>): TicketSeatGrid {
    if (seats.isEmpty()) return TicketSeatGrid(emptyMap(), 0, 0)

    val byPos = mutableMapOf<Pair<Int, Int>, SeatEntity>()
    var maxRow = 0
    var maxCol = 0

    seats.forEach { seat ->
        val r = (seat.row ?: 1) - 1
        val c = (seat.seatCol ?: 1) - 1
        if (r >= 0 && c >= 0) {
            byPos[r to c] = seat
            if (r > maxRow) maxRow = r
            if (c > maxCol) maxCol = c
        }
    }

    return TicketSeatGrid(byPos, maxRow, maxCol)
}
