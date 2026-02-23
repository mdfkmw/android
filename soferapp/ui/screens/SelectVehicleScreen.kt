package ro.priscom.sofer.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.data.local.VehicleEntity
import ro.priscom.sofer.ui.models.Vehicle
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import ro.priscom.sofer.ui.data.DriverLocalStore


@Composable
fun SelectVehicleScreen(
    onVehicleSelected: (Vehicle) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val repo = remember { LocalRepository(context) }

    var vehicles by remember { mutableStateOf<List<Vehicle>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            val operatorId = DriverLocalStore.getOperatorId()

            if (operatorId == null) {
                vehicles = emptyList()
                error = "Operatorul șoferului nu este cunoscut"
                return@LaunchedEffect
            }

            val localVehicles: List<VehicleEntity> =
                repo.getVehiclesForOperator(operatorId)

            vehicles = localVehicles
                .sortedBy { it.plateNumber.lowercase() }
                .map { v ->
                    Vehicle(
                        id = v.id,
                        plate = v.plateNumber,
                        name = v.plateNumber
                    )
                }

        } catch (e: Exception) {
            error = e.message ?: "Eroare la încărcarea vehiculelor"
        }
    }


    Surface(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier
            .padding(16.dp)) {

            Text(
                text = "Alege mașina",
                style = MaterialTheme.typography.titleMedium
            )

            Spacer(Modifier.height(8.dp))

            Button(onClick = onBack) {
                Text("Înapoi")
            }

            Spacer(Modifier.height(16.dp))

            if (error != null) {
                Text("Eroare: $error")
                Spacer(Modifier.height(8.dp))
            }

            if (vehicles.isEmpty() && error == null) {
                Text("Nu există mașini disponibile")
            }

            Spacer(Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                items(vehicles) { vehicle ->
                    Surface(
                        onClick = { onVehicleSelected(vehicle) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp),
                        shape = MaterialTheme.shapes.medium,
                        tonalElevation = 1.dp
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(
                                text = vehicle.plate,
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                text = vehicle.name,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }

        }
    }
}
