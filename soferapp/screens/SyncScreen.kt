package ro.priscom.sofer.ui.screens

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
import ro.priscom.sofer.ui.data.local.AppDatabase
import ro.priscom.sofer.ui.data.remote.RemoteSyncRepository

@Composable
fun SyncScreen(
    db: AppDatabase,
    onBack: () -> Unit = {}
) {




    val scope = rememberCoroutineScope()
    val syncRepo = remember { RemoteSyncRepository() }

    var isRunning by remember { mutableStateOf(false) }
    var lastMessage by remember { mutableStateOf("Nu a fost rulat încă niciun sync.") }

    fun runSync() {
        scope.launch {
            isRunning = true
            val result = syncRepo.syncMasterData(db)
            lastMessage =
                "Sincronizare completă:\n" +
                        "- operators: ${result.operators}\n" +
                        "- employees: ${result.employees}\n" +
                        "- vehicles: ${result.vehicles}\n" +
                        "- routes: ${result.routes}\n" +
                        "- stations: ${result.stations}\n" +
                        "- route_stations: ${result.routeStations}\n" +
                        "- price_lists: ${result.priceLists}\n" +
                        "- price_list_items: ${result.priceListItems}"
            isRunning = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
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
