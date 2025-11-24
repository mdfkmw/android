package ro.priscom.sofer.ui

import androidx.compose.runtime.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import ro.priscom.sofer.ui.screens.LoginScreen
import ro.priscom.sofer.ui.screens.MainTabsScreen
import ro.priscom.sofer.ui.screens.SelectVehicleScreen
import ro.priscom.sofer.ui.models.Vehicle
import ro.priscom.sofer.ui.data.local.AppDatabase
import ro.priscom.sofer.ui.screens.SyncScreen
import ro.priscom.sofer.ui.data.remote.RemoteSyncRepository

@Composable
fun SoferApp(db: AppDatabase) {
    var driverId by remember { mutableStateOf<String?>(null) }
    var selectedVehicle by remember { mutableStateOf<Vehicle?>(null) }
    var sessionConfirmed by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }

    var showSyncScreen by remember { mutableStateOf(false) }
    var showLoginDialog by remember { mutableStateOf(false) }
    var showSelectVehicleScreen by remember { mutableStateOf(false) }

    val remoteSyncRepo = remember { RemoteSyncRepository() }

    // sincronizare inițială la deschiderea aplicației (fără login, /api/mobile/*)
    LaunchedEffect(Unit) {
        remoteSyncRepo.syncMasterData(db, loggedIn = false)
    }

    // auto-sync după login (folosește și endpointurile securizate)
    LaunchedEffect(driverId) {
        if (driverId != null) {
            remoteSyncRepo.syncMasterData(db, loggedIn = true)
        }
    }

    // 2) Ecranul principal / navigația de sus
    when {
        // ecran de sincronizare
        showSyncScreen -> SyncScreen(
            db = db,
            loggedIn = driverId != null,
            onBack = { showSyncScreen = false }
        )

        // după login → alegerea mașinii
        showSelectVehicleScreen -> SelectVehicleScreen(
            onVehicleSelected = { vehicle ->
                selectedVehicle = vehicle
                sessionConfirmed = false
                showSelectVehicleScreen = false
                showConfirmDialog = true       // deschidem dialogul de confirmare șofer + mașină
            },
            onBack = { showSelectVehicleScreen = false }
        )

        // ecranul principal cu tab-uri (Administrare + Operații)
        else -> {
            val driverName = if (driverId != null) "Șofer $driverId" else "Neautentificat"
            val vehicleInfo =
                if (selectedVehicle != null)
                    "${selectedVehicle!!.plate} - ${selectedVehicle!!.name}"
                else
                    "Fără mașină"

            MainTabsScreen(
                driverName = driverName,
                vehicleInfo = vehicleInfo,
                routeInfo = "Nicio cursă selectată încă",
                loggedIn = driverId != null,
                onOpenSync = { showSyncScreen = true },
                onOpenLogin = { showLoginDialog = true }
            )
        }
    }

    // 3) Dialogul de LOGIN (nu mai e ecran de start, apare peste Administrare)
    if (showLoginDialog) {
        LoginScreen(
            onLoginSuccess = { id ->
                driverId = id
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
