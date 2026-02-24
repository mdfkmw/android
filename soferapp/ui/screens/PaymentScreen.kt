package ro.priscom.sofer.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ro.priscom.sofer.ui.data.local.DiscountTypeEntity
import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.data.local.ReservationEntity
import ro.priscom.sofer.ui.data.local.StationEntity

@Composable
fun PaymentScreen(
    reservation: ReservationEntity,
    tripRouteScheduleId: Int?,
    repo: LocalRepository,
    onBack: () -> Unit,
    onConfirmPayment: (
        newExitStationId: Int?,
        discount: DiscountTypeEntity?,
        description: String?
    ) -> Unit
) {
    // Prețul de bază (din rezervarea curentă) și suma deja plătită
    val initialBase = reservation.basePrice ?: 0.0
    val initialPaid = reservation.paidAmount ?: 0.0

    // ---- Date pentru destinații / stații ----
    var routeStations by remember { mutableStateOf<List<StationEntity>>(emptyList()) }
    val boardStationId = reservation.boardStationId
    var selectedExitStationId by remember { mutableStateOf(reservation.exitStationId) }

    // Prețul de bază pentru segmentul selectat ACUM (urcare -> destinație selectată)
    var basePriceForSelection by remember { mutableStateOf(initialBase) }

    // ---- Reduceri disponibile pentru cursa (route_schedule) curentă ----
    var discountList by remember { mutableStateOf<List<DiscountTypeEntity>>(emptyList()) }
    var selectedDiscount by remember { mutableStateOf<DiscountTypeEntity?>(null) }
    var descriptionText by remember { mutableStateOf("") }
    var seatDisplay by remember { mutableStateOf(if (reservation.seatId == null) "-" else "Se încarcă nr de loc...") }

    // 1) Încărcăm stațiile pentru route_schedule-ul curent
    LaunchedEffect(tripRouteScheduleId) {
        routeStations = repo.getStationsForRouteSchedule(tripRouteScheduleId)
    }

    LaunchedEffect(reservation.seatId) {
        if (reservation.seatId == null) {
            seatDisplay = "-"
            return@LaunchedEffect
        }

        repeat(10) { attempt ->
            val label = repo.getSeatLabelById(reservation.seatId)
            if (!label.isNullOrBlank()) {
                seatDisplay = label
                return@LaunchedEffect
            }
            if (attempt < 9) delay(500)
        }

        // dacă tot nu avem label, rămâne mesajul de încărcare
        seatDisplay = "Se încarcă nr de loc..."
    }

    // 2) Încărcăm reducerile pentru cursa curentă
    LaunchedEffect(tripRouteScheduleId) {
        discountList = repo.getDiscountsForRouteSchedule(tripRouteScheduleId)
    }

    // 3) Dacă rezervarea are deja o reducere, încercăm să o mapăm pe una din lista curentă
    LaunchedEffect(discountList) {
        if (selectedDiscount == null && (reservation.discountAmount ?: 0.0) > 0.0) {
            val currentLabel = reservation.discountLabel
            val currentDiscAmount = reservation.discountAmount ?: 0.0
            val base = initialBase

            // Încercăm mai întâi după label (fără case-sensitive)
            val byLabel = if (!currentLabel.isNullOrBlank()) {
                discountList.firstOrNull { d ->
                    d.label.equals(currentLabel, ignoreCase = true)
                }
            } else null

            // Dacă nu găsim după nume, încercăm după valoarea reducerii
            val byValue = byLabel ?: discountList.firstOrNull { d ->
                when (d.type.lowercase()) {
                    "percent" -> {
                        val expected = base * (d.valueOff / 100.0)
                        kotlin.math.abs(expected - currentDiscAmount) < 0.01
                    }
                    "fixed" -> {
                        kotlin.math.abs(d.valueOff - currentDiscAmount) < 0.01
                    }
                    else -> false
                }
            }

            if (byLabel != null || byValue != null) {
                selectedDiscount = byLabel ?: byValue
            }
        }
    }

    // 4) Când se schimbă destinația, recalculează prețul de bază (dacă putem)
    LaunchedEffect(tripRouteScheduleId, boardStationId, selectedExitStationId) {
        if (tripRouteScheduleId == null || boardStationId == null || selectedExitStationId == null) {
            basePriceForSelection = initialBase
        } else {
            val newBase = repo.getBasePriceForRouteScheduleSegment(
                routeScheduleId = tripRouteScheduleId,
                fromStationId = boardStationId,
                toStationId = selectedExitStationId
            )
            basePriceForSelection = newBase ?: initialBase
        }
    }

    // ---- Calcule derivate pentru UI (nu sunt state, se recalculează la recompoziție) ----
    val base = basePriceForSelection

    val discountValue: Double = if (selectedDiscount == null) {
        0.0
    } else {
        when (selectedDiscount!!.type.lowercase()) {
            "percent" -> base * (selectedDiscount!!.valueOff / 100.0)
            "fixed" -> selectedDiscount!!.valueOff
            else -> 0.0
        }
    }.coerceAtLeast(0.0)

    val finalPrice: Double = (base - discountValue).coerceAtLeast(0.0)
    val dueNow: Double = (finalPrice - initialPaid).coerceAtLeast(0.0)

    val needsDescription = selectedDiscount?.descriptionRequired == true
    val isDescriptionOK = if (needsDescription) descriptionText.isNotBlank() else true
    val canConfirm = isDescriptionOK

    // Map pentru nume de stații
    val stationNameById: Map<Int, String> = remember(routeStations) {
        routeStations.associate { it.id to it.name }
    }

    val boardName = boardStationId?.let { stationNameById[it] } ?: "—"
    val exitName = selectedExitStationId?.let { stationNameById[it] }
        ?: reservation.exitStationId?.let { stationNameById[it] }
        ?: "—"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {

        Text("Încasare pentru rezervarea:", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text("${reservation.personName} – loc $seatDisplay")

        Spacer(Modifier.height(12.dp))

        Text("Segment: $boardName → $exitName")
        Spacer(Modifier.height(8.dp))

        // Secțiune pentru schimbare destinație
        DestinationSection(
            stations = routeStations,
            boardStationId = boardStationId,
            selectedExitStationId = selectedExitStationId,
            onSelectExitStationId = { newId ->
                selectedExitStationId = newId
            }
        )

        Spacer(Modifier.height(20.dp))

        // Informații de preț pentru selecția curentă
        Text("Preț de bază: %.2f RON".format(base))
        Text("Plătit deja: %.2f RON".format(initialPaid))
        Text("Reducere curentă: %.2f RON".format(discountValue))
        Text("Preț final curent: %.2f RON".format(finalPrice))
        Text("De încasat acum: %.2f RON".format(dueNow))

        Spacer(Modifier.height(16.dp))

        // Selector de reducere
        PaymentDiscountSection(
            discounts = discountList,
            selectedDiscount = selectedDiscount,
            descriptionText = descriptionText,
            onSelectDiscount = { discount ->
                selectedDiscount = discount
                if (discount?.descriptionRequired != true) {
                    descriptionText = ""
                }
            },
            onDescriptionChange = { newText ->
                descriptionText = newText
            }
        )

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                onConfirmPayment(
                    selectedExitStationId ?: reservation.exitStationId,
                    selectedDiscount,
                    if (descriptionText.isBlank()) null else descriptionText
                )
            },
            enabled = canConfirm,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("CONFIRMĂ ÎNCASAREA")
        }

        Spacer(Modifier.height(8.dp))

        OutlinedButton(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("ÎNAPOI")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DestinationSection(
    stations: List<StationEntity>,
    boardStationId: Int?,
    selectedExitStationId: Int?,
    onSelectExitStationId: (Int) -> Unit
) {
    if (stations.isEmpty() || boardStationId == null) {
        Text(
            text = "Nu se poate schimba destinația (stațiile nu sunt disponibile pentru această cursă).",
            style = MaterialTheme.typography.bodySmall
        )
        return
    }

    // Stațiile posibile ca destinație sunt cele după stația de urcare
    val boardIndex = stations.indexOfFirst { it.id == boardStationId }
    val destOptions: List<StationEntity> =
        if (boardIndex == -1 || boardIndex == stations.size - 1) {
            emptyList()
        } else {
            stations.drop(boardIndex + 1)
        }

    if (destOptions.isEmpty()) {
        Text(
            text = "Nu există stații ulterioare pentru schimbarea destinației.",
            style = MaterialTheme.typography.bodySmall
        )
        return
    }

    val currentId = selectedExitStationId ?: destOptions.last().id
    val currentName = destOptions.firstOrNull { it.id == currentId }?.name
        ?: destOptions.last().name

    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(text = "Schimbă destinația", style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(4.dp))

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            TextField(
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth(),
                readOnly = true,
                value = currentName,
                onValueChange = { },
                label = { Text("Destinație") },
                singleLine = true,
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                },
                colors = ExposedDropdownMenuDefaults.textFieldColors(),
            )

            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                destOptions.forEach { station ->
                    DropdownMenuItem(
                        text = { Text(station.name) },
                        onClick = {
                            onSelectExitStationId(station.id)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}

/**
 * Secțiunea de alegere reducere + câmp text (dacă descriptionRequired = true).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentDiscountSection(
    discounts: List<DiscountTypeEntity>,
    selectedDiscount: DiscountTypeEntity?,
    descriptionText: String,
    onSelectDiscount: (DiscountTypeEntity?) -> Unit,
    onDescriptionChange: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            TextField(
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth(),
                readOnly = true,
                value = selectedDiscount?.label ?: "Fără reducere",
                onValueChange = { },
                label = { Text("Reducere") },
                singleLine = true,
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                },
                colors = ExposedDropdownMenuDefaults.textFieldColors(),
            )

            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                DropdownMenuItem(
                    text = { Text("Fără reducere") },
                    onClick = {
                        onSelectDiscount(null)
                        onDescriptionChange("")
                        expanded = false
                    }
                )

                discounts.forEach { discount ->
                    DropdownMenuItem(
                        text = { Text(discount.label) },
                        onClick = {
                            onSelectDiscount(discount)
                            if (!discount.descriptionRequired) {
                                onDescriptionChange("")
                            }
                            expanded = false
                        }
                    )
                }
            }
        }

        if (selectedDiscount?.descriptionRequired == true) {
            Spacer(modifier = Modifier.height(8.dp))

            val labelText = selectedDiscount.descriptionLabel ?: "Motiv reducere"

            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = descriptionText,
                onValueChange = { onDescriptionChange(it) },
                label = { Text(labelText) },
                singleLine = true
            )
        }
    }
}
