package ro.priscom.sofer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ro.priscom.sofer.ui.data.SyncStatusStore
import ui.data.local.AppDatabase
import ro.priscom.sofer.ui.data.remote.RemoteSyncRepository
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter


@Composable
fun SyncScreen(
    db: AppDatabase,
    loggedIn: Boolean,
    onSyncCompleted: () -> Unit = {},
    onBack: () -> Unit = {}
) {




    val scope = rememberCoroutineScope()
    val syncRepo = remember { RemoteSyncRepository() }

    var isRunning by remember { mutableStateOf(false) }
    var lastMessage by remember {
        mutableStateOf(SyncStatusStore.lastResultMessage ?: "Nu a fost rulat încă niciun sync.")
    }
    var lastAttemptAt by remember { mutableStateOf(SyncStatusStore.lastAttemptAt) }
    var lastSuccessAt by remember { mutableStateOf(SyncStatusStore.lastSuccessAt) }

    val formatter = remember {
        DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss")
    }


    fun runSync() {
        scope.launch {
            isRunning = true

            // 1. master data
            val result = syncRepo.syncMasterData(db, loggedIn)

            // 2. bilete
            val ticketsResult = syncRepo.syncTickets(db)
            // 3. trips în Room (după sync)
            val tripsCount = db.tripDao().countAll()

            val message = buildString {
                appendLine("Sincronizare completă:")
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

            lastMessage = message
            lastAttemptAt = finishedAt
            if (success) {
                lastSuccessAt = finishedAt
            }

            SyncStatusStore.update(
                message = message,
                success = success,
                timestamp = finishedAt
            )

            onSyncCompleted()

            isRunning = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.Start
    ) {

        Text(
            "Sincronizare date",
            style = MaterialTheme.typography.headlineSmall
        )

        Spacer(Modifier.height(16.dp))

        Text(
            lastMessage,
            style = MaterialTheme.typography.bodySmall
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = lastAttemptAt?.let { "Ultima încercare de sincronizare: ${it.format(formatter)}" }
                ?: "Ultima încercare de sincronizare: —",
            style = MaterialTheme.typography.bodySmall
        )

        Spacer(Modifier.height(4.dp))

        Text(
            text = lastSuccessAt?.let { "Ultima sincronizare reușită: ${it.format(formatter)}" }
                ?: "Ultima sincronizare reușită: —",
            style = MaterialTheme.typography.bodySmall
        )


        Spacer(Modifier.height(24.dp))

        Button(
            onClick = { runSync() },
            enabled = !isRunning
        ) {
            Text(if (isRunning) "Se sincronizează..." else "Sincronizează acum")
        }
        Button(
            onClick = onBack,
            modifier = Modifier.padding(bottom = 16.dp)
        ) {
            Text("Înapoi")
        }
    }
}
