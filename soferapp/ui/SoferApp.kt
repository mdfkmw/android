package ro.priscom.sofer.ui

import androidx.compose.runtime.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.platform.LocalContext
import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.screens.LoginScreen
import ro.priscom.sofer.ui.screens.MainTabsScreen
import ro.priscom.sofer.ui.screens.SelectVehicleScreen
import ro.priscom.sofer.ui.models.Vehicle
import ui.data.local.AppDatabase
import ro.priscom.sofer.ui.screens.SyncScreen
import ro.priscom.sofer.ui.data.remote.RemoteSyncRepository
import ro.priscom.sofer.ui.data.SyncStatusStore
import java.time.LocalDateTime


@Composable
fun SoferApp(db: AppDatabase) {
    val context = LocalContext.current
    val localRepo = remember { LocalRepository(context) }

    var driverId by remember { mutableStateOf<String?>(null) }
    var driverDisplayName by remember { mutableStateOf("Neautentificat") }
    var selectedVehicle by remember { mutableStateOf<Vehicle?>(null) }
    var sessionConfirmed by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }

    var showSyncScreen by remember { mutableStateOf(false) }
    var showLoginDialog by remember { mutableStateOf(false) }
    var showSelectVehicleScreen by remember { mutableStateOf(false) }
    var syncRefreshToken by remember { mutableIntStateOf(0) }

    val remoteSyncRepo = remember { RemoteSyncRepository() }

    LaunchedEffect(driverId, syncRefreshToken) {
        val id = driverId?.toIntOrNull()
        if (id == null) {
            driverDisplayName = "Neautentificat"
            return@LaunchedEffect
        }

        val localName = runCatching { localRepo.getDriver(id)?.name }
            .getOrNull()
            ?.trim()

        driverDisplayName = if (!localName.isNullOrBlank()) {
            localName
        } else if (driverDisplayName.isBlank() || driverDisplayName == "Neautentificat") {
            "Șofer $driverId"
        } else {
            driverDisplayName
        }
    }

    // sincronizare inițială la deschiderea aplicației (master + bilete)
    LaunchedEffect(Unit) {
        val result = remoteSyncRepo.syncMasterData(db, loggedIn = false)
        val ticketsResult = remoteSyncRepo.syncTickets(db)
        val tripsCount = db.tripDao().countAll()
        val message = buildString {
            appendLine("Sincronizare automată la pornire:")
            appendLine("- operators: ${result.operators}")
            appendLine("- employees: ${result.employees}")
            appendLine("- vehicles: ${result.vehicles}")
            appendLine("- routes: ${result.routes}")
            appendLine("- stations: ${result.stations}")
            appendLine("- route_stations: ${result.routeStations}")
            appendLine("- price_lists: ${result.priceLists}")
            appendLine("- price_list_items: ${result.priceListItems}")
            appendLine("- discount_types: ${result.discountTypes}")
            appendLine("- route_discounts: ${result.routeDiscounts}")
            appendLine("- route_schedules: ${result.routeSchedules}")
            appendLine("- trips (în Room): $tripsCount")
            appendLine("- tickets total: ${ticketsResult.total}")
            appendLine("- tickets synced: ${ticketsResult.synced}")
            appendLine("- tickets failed: ${ticketsResult.failed}")
            ticketsResult.error?.let { errorMessage ->
                appendLine("Eroare sync tickets: $errorMessage")
            }

            result.error?.let { errorMessage ->
                appendLine()
                appendLine()
                append("Eroare sincronizare: $errorMessage")
            }
        }

        val finishedAt = LocalDateTime.now()
        val success = (result.error == null && ticketsResult.error == null)

        SyncStatusStore.update(
            message = message,
            success = success,
            timestamp = finishedAt
        )
    }



    // auto-sync după login (master + bilete, folosește și endpointurile securizate)
    LaunchedEffect(driverId) {
        if (driverId != null) {
            val result = remoteSyncRepo.syncMasterData(db, loggedIn = true)
            val ticketsResult = remoteSyncRepo.syncTickets(db)
            val tripsCount = db.tripDao().countAll()

            val message = buildString {
                appendLine("Sincronizare automată după login:")
                appendLine("- operators: ${result.operators}")
                appendLine("- employees: ${result.employees}")
                appendLine("- vehicles: ${result.vehicles}")
                appendLine("- routes: ${result.routes}")
                appendLine("- stations: ${result.stations}")
                appendLine("- route_stations: ${result.routeStations}")
                appendLine("- price_lists: ${result.priceLists}")
                appendLine("- price_list_items: ${result.priceListItems}")
                appendLine("- discount_types: ${result.discountTypes}")
                appendLine("- route_discounts: ${result.routeDiscounts}")
                appendLine("- route_schedules: ${result.routeSchedules}")
                appendLine("- trips (în Room): $tripsCount")

                appendLine("- tickets total: ${ticketsResult.total}")
                appendLine("- tickets synced: ${ticketsResult.synced}")
                appendLine("- tickets failed: ${ticketsResult.failed}")
                ticketsResult.error?.let { errorMessage ->
                    appendLine("Eroare sync tickets: ${errorMessage}")
                }

                result.error?.let { errorMessage ->
                    appendLine()
                    appendLine()
                    append("Eroare sincronizare: $errorMessage")
                }
            }

            val finishedAt = LocalDateTime.now()
            val success = (result.error == null && ticketsResult.error == null)

            SyncStatusStore.update(
                message = message,
                success = success,
                timestamp = finishedAt
            )
        }
    }




    // 2) Ecranul principal / navigația de sus
    when {
        // după login → alegerea mașinii
        showSelectVehicleScreen -> SelectVehicleScreen(
            onVehicleSelected = { vehicle ->
                selectedVehicle = vehicle
                sessionConfirmed = false
                showSelectVehicleScreen = false
                showConfirmDialog = true
            },
            onBack = { showSelectVehicleScreen = false }
        )

        // ecranul principal cu tab-uri (Administrare + Operații)
        else -> {
            val driverName = driverDisplayName
            val vehicleInfo = selectedVehicle?.let { vehicle ->
                if (vehicle.name.equals(vehicle.plate, ignoreCase = true)) {
                    vehicle.plate
                } else {
                    "${vehicle.plate} - ${vehicle.name}"
                }
            } ?: "Fără mașină"

            MainTabsScreen(
                driverName = driverName,
                vehicleInfo = vehicleInfo,
                routeInfo = "Nicio cursă selectată încă",
                loggedIn = driverId != null,
                selectedVehicleId = selectedVehicle?.id,
                syncRefreshToken = syncRefreshToken,
                onOpenSync = { showSyncScreen = true },
                onOpenLogin = { showLoginDialog = true },
                onLogout = {
                    driverId = null
                    selectedVehicle = null
                    sessionConfirmed = false
                }
            )

        }
    }

    // ecran de sincronizare afișat peste ecranul principal (fără să piardă cursa curentă)
    if (showSyncScreen) {
        SyncScreen(
            db = db,
            loggedIn = driverId != null,
            onSyncCompleted = {
                syncRefreshToken++
            },
            onBack = { showSyncScreen = false }
        )
    }





    // 3) Dialogul de LOGIN (nu mai e ecran de start, apare peste Administrare)
    if (showLoginDialog) {
        LoginScreen(
            onLoginSuccess = { id, driverName ->
                driverId = id
                driverDisplayName = driverName?.takeIf { it.isNotBlank() } ?: "Șofer $id"
                showLoginDialog = false
                // după login mergem imediat la alegerea mașinii
                showSelectVehicleScreen = true
            },
            onCancel = {
                showLoginDialog = false
            }
        )
    }

    // 4) Dialog de confirmare a sesiunii (șofer + mașină)
    if (showConfirmDialog && selectedVehicle != null && !sessionConfirmed) {
        AlertDialog(
            onDismissRequest = { /* nu închidem pe tap în afară */ },
            title = { Text("Confirmă datele cursei") },
            text = {
                Text(
                    "Te-ai logat cu ID $driverId și ai ales mașina " +
                            "${selectedVehicle!!.plate} - ${selectedVehicle!!.name}.\n\n" +
                            "Confirmi că datele sunt corecte?"
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    sessionConfirmed = true
                    showConfirmDialog = false
                }) {
                    Text("DA, SUNT CORECTE")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    driverId = null
                    selectedVehicle = null
                    sessionConfirmed = false
                    showConfirmDialog = false
                }) {
                    Text("NU SUNT CORECTE")
                }
            }
        )
    }
}
