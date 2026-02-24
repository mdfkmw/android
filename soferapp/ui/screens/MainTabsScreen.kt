package ro.priscom.sofer.ui.screens

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ro.priscom.sofer.ui.components.StatusBar
import ro.priscom.sofer.ui.models.Route
import ro.priscom.sofer.ui.data.DriverLocalStore
import ro.priscom.sofer.ui.data.local.LocalRepository
import ro.priscom.sofer.ui.data.local.StationEntity
import ro.priscom.sofer.ui.data.remote.RemoteRepository
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

private fun hasInternet(context: android.content.Context): Boolean {
    val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
    val network = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(network) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

// datele pe care le ținem când șoferul apasă pe o cursă dar nu are net
data class OfflineDialogData(
    val route: Route,
    val hour: String,
    val tripId: Int?,
    val direction: String?,
    val routeScheduleId: Int?
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainTabsScreen(
    driverName: String,
    vehicleInfo: String,
    routeInfo: String,
    loggedIn: Boolean,
    selectedVehicleId: Int?,
    onOpenSync: () -> Unit = {},
    onOpenLogin: () -> Unit = {},
    onLogout: () -> Unit = {}
) {


    val kasaStatus = "Casă: neconectată"
    var gpsStatus by remember { mutableStateOf("GPS: OFF") }
    val netStatus = "Internet: offline"
    val batteryStatus = "Baterie: 75%"

    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Administrare", "Operații")

    // aici ținem textul traseu/ora selectate
    var currentRouteInfo by rememberSaveable { mutableStateOf(routeInfo) }
    var currentRouteId by rememberSaveable { mutableStateOf<Int?>(null) }
    var currentDirection by rememberSaveable { mutableStateOf<String?>(null) }
    var currentRouteScheduleId by rememberSaveable { mutableStateOf<Int?>(null) }

    // stația curentă (calculată din GPS + geofence)
    var currentStopName by remember { mutableStateOf<String?>(null) }
    var manualBypassStopName by rememberSaveable { mutableStateOf<String?>(null) }

    // stare persistentă între taburi: cursă pornită / îmbarcare pornită / selecție auto
    var tripStarted by rememberSaveable { mutableStateOf(false) }
    var boardingStarted by rememberSaveable { mutableStateOf(false) }
    var autoSelected by remember { mutableStateOf(false) }
    var autoSelectedTouched by remember { mutableStateOf(false) }
    var currentTripId by rememberSaveable { mutableStateOf<Int?>(null) }




    val context = LocalContext.current
    val activity = context as? Activity

    // ultima locație primită de la GPS
    var currentLocation by remember { mutableStateOf<Location?>(null) }

    // LocationManager pentru GPS
    val locationManager = remember {
        context.getSystemService(LocationManager::class.java)
    }

    val repo = remember { LocalRepository(context) }
    val remoteRepo = remember { RemoteRepository() }


    var stationsList by remember { mutableStateOf(listOf<String>()) }

    // cerem permisiunea de locație la prima pornire
    LaunchedEffect(Unit) {
        if (activity != null) {
            val hasFine = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            val hasCoarse = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ),
                    1001
                )
            }
        }
    }

    // ascultăm actualizările de locație
    DisposableEffect(locationManager, activity) {
        if (locationManager == null || activity == null) {
            onDispose { }
        } else {
            val hasFine = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            val hasCoarse = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                gpsStatus = "GPS: fără permisiune"
                onDispose { }
            } else {
                gpsStatus = "GPS: căutare sateliți…"

                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        currentLocation = location
                        gpsStatus = "GPS: ON"
                    }
                }

                try {
                    locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        5000L,   // la 5 secunde
                        5f,      // la 5 metri
                        listener
                    )
                } catch (e: SecurityException) {
                    gpsStatus = "GPS: eroare permisiune"
                }

                onDispose {
                    try {
                        locationManager.removeUpdates(listener)
                    } catch (_: Exception) {
                    }
                }
            }
        }
    }


    LaunchedEffect(currentRouteId, currentDirection) {
        val stations = currentRouteId?.let { routeId ->
            // preferăm să lăsăm backend-ul să returneze lista gata ordonată
            val remote = remoteRepo.getRouteStations(routeId, currentDirection)
            val remoteStations = remote?.map { dto ->
                StationEntity(
                    id = dto.station_id,
                    name = dto.stationName ?: "Stația ${dto.station_id}",
                    latitude = null,
                    longitude = null
                )
            }



            remoteStations ?: repo.getStationsForRoute(routeId, currentDirection)
        } ?: repo.getAllStations()

        stationsList = stations.map { it.name }
    }

    // când avem rută selectată și locație, calculăm stația curentă
    LaunchedEffect(currentRouteId, currentDirection, currentLocation) {
        val routeId = currentRouteId
        val loc = currentLocation
        if (routeId != null && loc != null) {
            val name = repo.findCurrentStationNameForRoute(
                routeId = routeId,
                direction = currentDirection,
                currentLat = loc.latitude,
                currentLng = loc.longitude
            )
            currentStopName = name
        } else {
            currentStopName = null
        }
    }
    // când primim pentru prima dată semnal GPS, bifăm automat "SELECȚIE AUTO"
    LaunchedEffect(currentLocation) {
        val hasGps = currentLocation != null
        if (hasGps && !autoSelectedTouched) {
            autoSelected = true
        }
    }



    val gpsHasSignal = currentLocation != null
    val gpsBypassActive = gpsHasSignal && !autoSelected
    val effectiveStopName = if (gpsBypassActive) {
        manualBypassStopName ?: currentStopName
    } else {
        currentStopName
    }
    val statusGpsText = if (gpsBypassActive) "GPS: BYPASS" else gpsStatus

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(text = "Aplicație Șofer")
                        Text(
                            text = "$driverName | $vehicleInfo",
                            style = MaterialTheme.typography.bodySmall
                        )
                        Text(
                            text = currentRouteInfo,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            )
        },
        bottomBar = {
            StatusBar(
                kasaStatus = kasaStatus,
                gpsStatus = statusGpsText,
                netStatus = netStatus,
                batteryStatus = batteryStatus,
                gpsBypassActive = gpsBypassActive
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) }
                    )
                }
            }

            when (selectedTab) {
                0 -> AdminTabScreen(
                    loggedIn = loggedIn,
                    tripStarted = tripStarted,
                    selectedVehicleId = selectedVehicleId,
                    onRouteSelected = { routeId, routeName, hour, tripId, direction, routeScheduleId ->
                        currentRouteId = routeId
                        currentDirection = direction
                        currentRouteInfo = "Traseu: $routeName, Cursa: $hour"
                        currentTripId = tripId                  // salvăm trip-ul curent
                        currentRouteScheduleId = routeScheduleId // salvăm route_schedule_id
                        tripStarted = true                      // cursa PORNITĂ
                        boardingStarted = false                 // resetăm îmbarcarea
                    },
                    onEndTrip = {
                        tripStarted = false
                        boardingStarted = false
                        currentTripId = null            // nu mai avem cursă activă
                        currentRouteId = null
                        currentDirection = null
                        currentRouteInfo = "Nicio cursă selectată încă"
                    },
                    onOpenSync = onOpenSync,
                    onOpenLogin = onOpenLogin,
                    onLogout = onLogout
                )


                1 -> OperatiiTabScreen(
                    currentStopName = effectiveStopName,
                    stations = stationsList,
                    loggedIn = loggedIn,
                    tripStarted = tripStarted,
                    boardingStarted = boardingStarted,
                    autoSelected = autoSelected,
                    gpsHasSignal = gpsHasSignal,
                    routeId = currentRouteId,
                    routeScheduleId = currentRouteScheduleId,
                    tripId = currentTripId,               // 🆕 trimitem trip-ul curent
                    tripVehicleId = selectedVehicleId,    // 🆕 trimitem vehiculul selectat
                    repo = repo,
                    onAutoSelectedChange = { checked ->
                        autoSelectedTouched = true
                        autoSelected = checked
                        if (checked) {
                            manualBypassStopName = null
                        }
                    },
                    onManualDepartureStationSelected = { stationName ->
                        manualBypassStopName = stationName
                    },
                    onStartBoarding = {
                        boardingStarted = true
                    }
                )





            }
        }
    }
    // Când se schimbă trip-ul curent, sincronizăm rezervările din backend în SQLite.
    // Pentru cursele cu rezervări, populăm și seats_local imediat (fără click pe HARTĂ).
    LaunchedEffect(currentTripId, currentRouteId) {
        val tripId = currentTripId
        if (tripId != null) {
            try {
                repo.refreshReservationsForTrip(tripId)

                val routeId = currentRouteId
                val routeEntity = routeId?.let { repo.getRouteById(it) }
                val hasSeatReservations =
                    (routeEntity?.visibleInReservations == true) ||
                            (routeEntity?.visibleOnline == true)

                if (hasSeatReservations) {
                    // Inițializăm seats_local imediat ce șoferul a ales cursa+ora.
                    // Dacă mașina nu e atașată încă, repo tratează intern cazul (404 -> null).
                    repo.refreshMySeatMapForTrip(tripId)
                }
            } catch (e: Exception) {
                // doar log, să nu pice UI-ul
                android.util.Log.e("MainTabsScreen", "Error refreshing reservations for trip=$tripId", e)
            }
        }
    }

}


@Composable
fun AdminTabScreen(
    loggedIn: Boolean,
    tripStarted: Boolean,
    selectedVehicleId: Int?,
    onRouteSelected: (Int, String, String, Int?, String?, Int?) -> Unit,
    onEndTrip: () -> Unit,
    onOpenSync: () -> Unit,
    onOpenLogin: () -> Unit,
    onLogout: () -> Unit
)

{



    val activeGreen = Color(0xFF5BC21E)
    val inactiveGrey = Color(0xFFCCCCCC)
    val inactiveText = Color(0xFF444444)

    val context = LocalContext.current
    val localRepo = remember { LocalRepository(context) }
    val remoteRepo = remember { RemoteRepository() }

    var routes by remember { mutableStateOf<List<Route>>(emptyList()) }
    var tripIdByRouteAndDisplayTime by remember {
        mutableStateOf<Map<Pair<Int, String>, Int>>(emptyMap())
    }
    var directionByRouteAndDisplayTime by remember {
        mutableStateOf<Map<Pair<Int, String>, String>>(emptyMap())
    }
    var routeScheduleIdByRouteAndDisplayTime by remember {
        mutableStateOf<Map<Pair<Int, String>, Int?>>(emptyMap())
    }

    val coroutineScope = rememberCoroutineScope()
    var startTripError by remember { mutableStateOf<String?>(null) }
    var showCloseDay by remember { mutableStateOf(false) }
    var offlineDialogData by remember { mutableStateOf<OfflineDialogData?>(null) }

    // 🔹 Rulăm efectul doar când se schimbă starea de login
    LaunchedEffect(loggedIn) {
        startTripError = null

        // Dacă NU e logat încă, nu pregătim rute și nu afișăm erori
        if (!loggedIn) {
            routes = emptyList()
            tripIdByRouteAndDisplayTime = emptyMap()
            directionByRouteAndDisplayTime = emptyMap()
            routeScheduleIdByRouteAndDisplayTime = emptyMap()
            return@LaunchedEffect
        }

        val operatorId = DriverLocalStore.getOperatorId()
        if (operatorId == null) {
            // Abia acum – după login – e corect să arătăm eroarea asta
            startTripError = "Nu este setat operatorul pentru utilizatorul logat."
            routes = emptyList()
            tripIdByRouteAndDisplayTime = emptyMap()
            directionByRouteAndDisplayTime = emptyMap()
            routeScheduleIdByRouteAndDisplayTime = emptyMap()
            return@LaunchedEffect
        }

        try {
            // 1️⃣ rute vizibile pentru șofer
            val routeEntities = localRepo.getAllRoutes()
                .filter { it.visibleForDrivers }

            // 2️⃣ orare din Room pentru operatorul curent
            val schedules = localRepo.getRouteSchedulesForOperator(operatorId)

            if (routeEntities.isEmpty() || schedules.isEmpty()) {
                startTripError = "Nu există rute și ore în memoria telefonului. Te rog fă sincronizarea."
                routes = emptyList()
                tripIdByRouteAndDisplayTime = emptyMap()
                directionByRouteAndDisplayTime = emptyMap()
                routeScheduleIdByRouteAndDisplayTime = emptyMap()
                return@LaunchedEffect
            }

            val schedulesByRouteId = schedules.groupBy { it.routeId }

            // 3️⃣ construim lista de Route pentru UI, doar rutele care au ore
            routes = routeEntities
                .filter { schedulesByRouteId.containsKey(it.id) }
                .sortedBy { it.orderIndex }
                .map { entity ->
                    val hours = schedulesByRouteId[entity.id]!!
                        .sortedBy { it.departure }
                        .map { rs ->
                            val prefix = when (rs.direction.lowercase()) {
                                "tur" -> "TUR"
                                "retur" -> "RETUR"
                                else -> rs.direction.uppercase()
                            }
                            "$prefix ${rs.departure}"   // ex: "TUR 07:00"
                        }

                    Route(
                        id = entity.id,
                        name = entity.name,
                        hours = hours
                    )
                }

            // 4️⃣ map-urile pentru direction și route_schedule_id
            val directionMap = mutableMapOf<Pair<Int, String>, String>()
            val routeScheduleMap = mutableMapOf<Pair<Int, String>, Int?>()
            val keyByRouteScheduleId = mutableMapOf<Int, Pair<Int, String>>()

            schedules.forEach { rs ->
                val prefix = when (rs.direction.lowercase()) {
                    "tur" -> "TUR"
                    "retur" -> "RETUR"
                    else -> rs.direction.uppercase()
                }
                val displayTime = "$prefix ${rs.departure}"
                val key = rs.routeId to displayTime

                directionMap[key] = rs.direction
                routeScheduleMap[key] = rs.id
                keyByRouteScheduleId[rs.id] = key
            }

            // 5️⃣ TRIPS pentru AZI din Room (cache offline)
            val todayStr = java.time.LocalDate.now().toString()
            val trips = localRepo.getTripsForDate(todayStr)

            val tripMap = mutableMapOf<Pair<Int, String>, Int>()
            trips.forEach { trip ->
                val rsId = trip.routeScheduleId ?: return@forEach
                val key = keyByRouteScheduleId[rsId] ?: return@forEach
                tripMap[key] = trip.id
            }

            tripIdByRouteAndDisplayTime = tripMap
            directionByRouteAndDisplayTime = directionMap
            routeScheduleIdByRouteAndDisplayTime = routeScheduleMap
        } catch (e: Exception) {
            startTripError = "Eroare la citirea rutelor din memoria locală: ${e.message}"
            routes = emptyList()
            tripIdByRouteAndDisplayTime = emptyMap()
            directionByRouteAndDisplayTime = emptyMap()
            routeScheduleIdByRouteAndDisplayTime = emptyMap()
        }
    }




    var screen by remember { mutableStateOf("buttons") }
    var selectedRoute by remember { mutableStateOf<Route?>(null) }


    // poate începe cursa doar dacă e logat și nu are o cursă în desfășurare
    val canStartTrip = loggedIn && !tripStarted

    // poate încheia cursa doar dacă e logat și există o cursă în desfășurare
    val canCloseTrip = loggedIn && tripStarted

    // poate închide ziua doar dacă e logat și NU este cursă activă
    val canCloseDay = loggedIn && !tripStarted



    when (screen) {
        "buttons" -> {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                Spacer(Modifier.height(8.dp))

                // rând 1: LOGIN | PORNIRE IN CURSA
                Row(Modifier.fillMaxWidth()) {
                    Button(
                        onClick = {
                            if (!loggedIn) onOpenLogin()
                        },
                        enabled = !loggedIn, // după login se dezactivează
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (!loggedIn) activeGreen else inactiveGrey,
                            contentColor = Color.Black
                        )
                    ) {
                        Text("LOGIN")
                    }

                    Spacer(Modifier.width(8.dp))

                    Button(
                        onClick = {
                            if (canStartTrip) screen = "selectRoute"
                        },
                        enabled = canStartTrip,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canStartTrip) activeGreen else inactiveGrey,
                            contentColor = if (canStartTrip) Color.Black else inactiveText
                        )
                    ) {
                        Text("PORNIRE IN CURSA")
                    }
                }

                Spacer(Modifier.height(8.dp))

                // rând 2: REINITIALIZARE CASA... | INCHEIERE CURSA
                Row(Modifier.fillMaxWidth()) {
                    Button(
                        onClick = { /* REINITIALIZARE CASA */ },
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = activeGreen
                        )
                    ) {
                        Text("REINITIALIZARE CASA DE MARCAT / CARD READER")
                    }

                    Spacer(Modifier.width(8.dp))

                    Button(
                        onClick = {
                            if (canCloseTrip) {
                                onEndTrip()
                            }
                        },
                        enabled = canCloseTrip,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canCloseTrip) activeGreen else inactiveGrey,
                            contentColor = if (canCloseTrip) Color.Black else inactiveText
                        )
                    ) {
                        Text("INCHEIERE CURSA")
                    }
                }

                Spacer(Modifier.height(8.dp))

                // rând 3: SINCRONIZARE | INCHIDERE ZI
                Row(Modifier.fillMaxWidth()) {
                    Button(
                        onClick = { onOpenSync() },
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = activeGreen
                        )
                    ) {
                        Text("SINCRONIZARE")
                    }

                    Spacer(Modifier.width(8.dp))

                    Button(
                        onClick = { if (canCloseDay) showCloseDay = true },
                        enabled = canCloseDay,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canCloseDay) activeGreen else inactiveGrey,
                            contentColor = if (canCloseDay) Color.Black else inactiveText
                        )
                    ) {
                        Text("INCHIDERE ZI")
                    }
                }
            }

            // popup confirmare INCHIDERE ZI (delogare)
            if (showCloseDay) {
                AlertDialog(
                    onDismissRequest = { showCloseDay = false },
                    title = { Text("Închidere zi") },
                    text = { Text("Ești sigur că vrei să închizi ziua? Vei fi delogat.") },
                    confirmButton = {
                        TextButton(onClick = {
                            showCloseDay = false
                            DriverLocalStore.clearSession()
                            onLogout()
                        }) {
                            Text("DA")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showCloseDay = false }) {
                            Text("NU")
                        }
                    }
                )
            }
        }

        "selectRoute" -> {
            SelectRouteScreen(
                routes = routes,
                onRouteClick = { route ->
                    selectedRoute = route
                    screen = "selectHour"
                },
                onCancel = { screen = "buttons" }
            )
        }

        "selectHour" -> {
            val route = selectedRoute
            if (route == null) {
                screen = "buttons"
            } else {
                SelectHourScreen(
                    route = route,
                    onHourClick = { hour ->
                        val key = route.id to hour
                        val tripId = tripIdByRouteAndDisplayTime[key]
                        val direction = directionByRouteAndDisplayTime[key]
                        val routeScheduleId = routeScheduleIdByRouteAndDisplayTime[key]

                        if (!loggedIn) {
                            startTripError = "Trebuie să fii logat pentru a porni cursa."
                            return@SelectHourScreen
                        }

                        if (selectedVehicleId == null) {
                            startTripError = "Trebuie să alegi mai întâi o mașină înainte de a porni cursa."
                            return@SelectHourScreen
                        }

                        // ⛔ FĂRĂ tripId → NU pornim cursa, cerem sincronizare
                        if (tripId == null) {
                            startTripError =
                                "Nu există Trip ID pentru această cursă în memoria telefonului.\n" +
                                        "Te rog fă sincronizarea (este necesară conexiune la internet) pentru a continua."
                            return@SelectHourScreen
                        }

                        coroutineScope.launch {
                            // 1️⃣ vedem dacă ruta are rezervări sau e „scurtă”
                            val routeEntity = localRepo.getRouteById(route.id)
                            val hasReservations =
                                (routeEntity?.visibleInReservations == true) ||
                                        (routeEntity?.visibleOnline == true)


                            // 2️⃣ dacă NU are rezervări → CURSĂ SCURTĂ
                            //    👉 nu mai apelăm deloc backend-ul, pornim direct cursa
                            if (!hasReservations) {
                                onRouteSelected(
                                    route.id,
                                    route.name,
                                    hour,
                                    tripId,
                                    direction,
                                    routeScheduleId
                                )
                                screen = "buttons"
                                return@launch
                            }

                            // 3️⃣ de aici în jos tratăm DOAR curse cu rezervări (lungi)

                            // fără internet → popup nou
                            if (!hasInternet(context)) {
                                offlineDialogData = OfflineDialogData(
                                    route = route,
                                    hour = hour,
                                    tripId = tripId,
                                    direction = direction,
                                    routeScheduleId = routeScheduleId
                                )
                                return@launch
                            }

                            // avem internet → validăm în backend
                            val resp = remoteRepo.validateTripStart(
                                routeId = route.id,
                                tripId = tripId,
                                vehicleId = selectedVehicleId
                            )

                            if (resp == null) {
                                // backend oprit / nu răspunde → același popup nou
                                offlineDialogData = OfflineDialogData(
                                    route = route,
                                    hour = hour,
                                    tripId = tripId,
                                    direction = direction,
                                    routeScheduleId = routeScheduleId
                                )
                                return@launch
                            }

                            if (!resp.ok) {
                                startTripError = resp.error
                                    ?: "Mașina aleasă nu este asociată acestei curse cu rezervări."
                                return@launch
                            }

                            if (tripId != null) {
                                remoteRepo.attachDriverVehicle(
                                    tripId = tripId,
                                    vehicleId = selectedVehicleId
                                )
                            }

                            onRouteSelected(route.id, route.name, hour, tripId, direction, routeScheduleId)
                            screen = "buttons"
                        }



                    },
                    onCancel = { screen = "buttons" }
                )
            }
        }


    }
    if (startTripError != null) {
        AlertDialog(
            onDismissRequest = { startTripError = null },
            title = { Text("Nu poți porni cursa") },
            text = { Text(startTripError!!) },
            confirmButton = {
                TextButton(onClick = { startTripError = null }) {
                    Text("OK")
                }
            }
        )
    }
    if (offlineDialogData != null) {
        val data = offlineDialogData!!
        AlertDialog(
            onDismissRequest = { offlineDialogData = null },
            title = { Text("Nu ai conexiune la internet") },
            text = {
                Text(
                    "Nu îți pot încărca rezervările pentru această cursă.\n" +
                            "Ești în mod avion?.\n" +
                            "Încearcă să te conectezi printr-un hotspot.\n" +
                            "Totuși poți porni cursa fără internet, dar există risc de suprapunere a rezervărilor."
                )
            },
            confirmButton = {
                Row {
                    // PORNEȘTE ORICUM
                    TextButton(
                        onClick = {
                            // pornim cursa direct, folosim datele salvate
                            onRouteSelected(
                                data.route.id,
                                data.route.name,
                                data.hour,
                                data.tripId,
                                data.direction,
                                data.routeScheduleId
                            )
                            offlineDialogData = null
                            screen = "buttons"

                        }
                    ) {
                        Text("PORNEȘTE ORICUM")
                    }

                    Spacer(Modifier.width(8.dp))

                    // RETRY
                    TextButton(
                        onClick = {
                            coroutineScope.launch {
                                val d = offlineDialogData
                                if (d == null) {
                                    offlineDialogData = null
                                    return@launch
                                }

                                val tripIdNonNull = d.tripId
                                val vehicleIdNonNull = selectedVehicleId

                                if (tripIdNonNull == null || vehicleIdNonNull == null) {
                                    startTripError =
                                        "Nu pot porni cursa: lipsește tripId sau mașina selectată."
                                    offlineDialogData = null
                                    return@launch
                                }

                                val resp = remoteRepo.validateTripStart(
                                    routeId = d.route.id,
                                    tripId = tripIdNonNull,
                                    vehicleId = vehicleIdNonNull
                                )

                                if (resp == null) {
                                    startTripError =
                                        "Încă nu se poate verifica mașina. Verifică din nou conexiunea la internet."
                                    offlineDialogData = null
                                    return@launch
                                }

                                if (!resp.ok) {
                                    startTripError = resp.error
                                        ?: "Mașina aleasă nu este asociată acestei curse cu rezervări."
                                    offlineDialogData = null
                                    return@launch
                                }

                                remoteRepo.attachDriverVehicle(
                                    tripId = tripIdNonNull,
                                    vehicleId = vehicleIdNonNull
                                )

                                onRouteSelected(
                                    d.route.id,
                                    d.route.name,
                                    d.hour,
                                    tripIdNonNull,
                                    d.direction,
                                    d.routeScheduleId
                                )
                                offlineDialogData = null
                                screen = "buttons"
                            }
                        }
                    ) {
                        Text("RETRY")
                    }

                }
            },
            dismissButton = {
                TextButton(onClick = { offlineDialogData = null }) {
                    Text("RENUNȚĂ")
                }
            }
        )
    }


}

@Composable
fun SelectRouteScreen(
    routes: List<Route>,
    onRouteClick: (Route) -> Unit,
    onCancel: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        // titlu sus
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFB0D4FF))
                .padding(12.dp)
        ) {
            Text(
                text = "Selectați traseul",
                fontSize = 18.sp,
                color = Color.Black
            )
        }

        Spacer(Modifier.height(4.dp))

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            items(routes) { route ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onRouteClick(route) }
                        .padding(vertical = 14.dp, horizontal = 12.dp)
                ) {
                    Text(route.name, fontSize = 16.sp, color = Color.Black)
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(Color(0xFFDDDDDD))
                )
            }
        }

        Button(
            onClick = onCancel,
            modifier = Modifier
                .fillMaxWidth()
                .height(55.dp)
                .padding(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF5BC21E)
            )
        ) {
            Text("RENUNTA", fontSize = 18.sp, color = Color.Black)
        }
    }
}

@Composable
fun SelectHourScreen(
    route: Route,
    onHourClick: (String) -> Unit,
    onCancel: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        // titlu sus
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFB0D4FF))
                .padding(12.dp)
        ) {
            Text(
                text = "Selectați cursa",
                fontSize = 18.sp,
                color = Color.Black
            )
        }

        Spacer(Modifier.height(4.dp))

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            items(route.hours) { hour ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onHourClick(hour) }
                        .padding(vertical = 14.dp, horizontal = 12.dp)
                ) {
                    Text(hour, fontSize = 16.sp, color = Color.Black)
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(Color(0xFFDDDDDD))
                )
            }
        }

        Button(
            onClick = onCancel,
            modifier = Modifier
                .fillMaxWidth()
                .height(55.dp)
                .padding(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF5BC21E)
            )
        ) {
            Text("RENUNTA", fontSize = 18.sp, color = Color.Black)
        }
    }

}








@Composable
fun OperatiiTabScreen(
    currentStopName: String?,
    stations: List<String>,
    loggedIn: Boolean,
    tripStarted: Boolean,
    boardingStarted: Boolean,
    autoSelected: Boolean,
    gpsHasSignal: Boolean,
    routeId: Int?,
    routeScheduleId: Int?,
    tripId: Int?,                    // 🆕 id-ul cursei curente
    tripVehicleId: Int?,             // 🆕 vehiculul folosit pe cursă
    repo: LocalRepository,
    onAutoSelectedChange: (Boolean) -> Unit,
    onManualDepartureStationSelected: (String) -> Unit,
    onStartBoarding: () -> Unit
) {



    val activeGreen = Color(0xFF5BC21E)
    val inactiveGrey = Color(0xFFCCCCCC)
    val inactiveText = Color(0xFF444444)

    var showDestinations by remember { mutableStateOf(false) }
    var showDepartureStations by remember { mutableStateOf(false) }
    var selectedDestination by remember { mutableStateOf<String?>(null) }
    var showStartBoardingConfirm by remember { mutableStateOf(false) }
    var showTicketHistory by remember { mutableStateOf(false) }
    var showPassHistory by remember { mutableStateOf(false) }

    var showReservations by remember { mutableStateOf(false) }


    val coroutineScope = rememberCoroutineScope()
    var selectedDestinationPrice by remember { mutableStateOf<Double?>(null) }


    var fromStationId by remember { mutableStateOf<Int?>(null) }
    var toStationId by remember { mutableStateOf<Int?>(null) }
    var priceListId by remember { mutableStateOf<Int?>(null) }





    // Stațiile disponibile ca destinație:
    // - dacă avem stație curentă și e în listă,
    //   arătăm doar stațiile DE DUPĂ ea (în ordinea rutei).
    // - dacă nu avem stație curentă sau nu e găsită, arătăm toate stațiile.
    val nextStations = remember(currentStopName, stations) {
        if (currentStopName == null) {
            stations
        } else {
            val idx = stations.indexOf(currentStopName)
            if (idx >= 0 && idx < stations.lastIndex) {
                stations.subList(idx + 1, stations.size)
            } else {
                // nu am găsit stația curentă în listă, sau e ultima
                emptyList()
            }
        }
    }

    LaunchedEffect(currentStopName, routeId) {
        fromStationId = currentStopName?.let { repo.getStationIdByName(it) }
        priceListId = routeId?.let { repo.getPriceListIdForRoute(it) }
    }

    LaunchedEffect(selectedDestination) {
        toStationId = selectedDestination?.let { repo.getStationIdByName(it) }
    }



    // --- reguli de activare ---

    // „Plecare din stație”:
    //  - activ dacă: NU există semnal GPS SAU bifa de selecție auto NU e bifată
    //  - dezactivat numai când: există GPS și bifa e bifată
    val canPlecare =
        loggedIn && (!gpsHasSignal || !autoSelected)

    val canEmiteBilet =
        loggedIn && tripStarted && boardingStarted

    val canRezervari =
        loggedIn && tripStarted

    val canStartBoarding =
        loggedIn && tripStarted && !boardingStarted

    val canRapoarte =
        loggedIn && tripStarted && boardingStarted

    // „Selecție auto”:
    //  - bifa este activă doar dacă există GPS și șoferul e logat
    val canSelectAuto =
        loggedIn && gpsHasSignal


    when {
        showTicketHistory -> {
            TicketHistoryScreen(onBack = { showTicketHistory = false })
        }

        showPassHistory -> {
            PassHistoryScreen(onBack = { showPassHistory = false })
        }

        showReservations && tripId != null -> {
            DriverReservationsScreen(
                tripId = tripId,
                currentStopName = currentStopName,
                routeScheduleId = routeScheduleId,
                repo = repo,
                onBack = { showReservations = false }
            )
        }

        showDepartureStations -> {
            EmiteBiletScreen(
                onBack = { showDepartureStations = false },
                onDestinationSelected = { station ->
                    onManualDepartureStationSelected(station)
                    showDepartureStations = false
                },
                stations = stations
            )
        }

        selectedDestination != null -> {
            BiletDetaliiScreen(
                destination = selectedDestination!!,
                onBack = { selectedDestination = null },
                onIncasare = {
                    selectedDestination = null
                    showDestinations = false
                },
                currentStopName = currentStopName,
                ticketPrice = selectedDestinationPrice,

                // date reale pentru bilet – folosim parametrii funcției, nu variabile din altă parte
                tripId = tripId,
                fromStationId = fromStationId,
                toStationId = toStationId,
                priceListId = priceListId,
                tripVehicleId = tripVehicleId,
                operatorId = DriverLocalStore.getOperatorId(),
                employeeId = DriverLocalStore.getEmployeeId(),

                routeScheduleId = routeScheduleId,
                repo = repo
            )
        }





        showDestinations -> {
            EmiteBiletScreen(
                onBack = { showDestinations = false },
                onDestinationSelected = { dest ->
                    selectedDestination = dest
                    showDestinations = false

                    // calculăm prețul real pentru segment (currentStopName → dest)
                    if (routeId != null && currentStopName != null) {
                        coroutineScope.launch {
                            val price = repo.getPriceForSegmentByStationNames(
                                routeId = routeId,
                                fromStationName = currentStopName,
                                toStationName = dest,
                                categoryId = 1  // NORMAL
                            )
                            selectedDestinationPrice = price
                        }
                    } else {
                        selectedDestinationPrice = null
                    }
                },
                stations = nextStations
            )
        }


        else -> {
            // biletele emise local
            val tickets = DriverLocalStore.getTickets()

            val persoaneCoboara = if (currentStopName != null) {
                tickets
                    .filter { it.destination.contains(currentStopName, ignoreCase = true) }
                    .sumOf { it.quantity }
            } else 0

            // deocamdată 0 – în viitor: rezervări + abonamente din stația curentă
            val persoaneUrca = 0

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                Spacer(Modifier.height(8.dp))

                // rând 1: PLECARE DIN STATIE | EMITE BILET
                Row(Modifier.fillMaxWidth()) {
                    Button(
                        onClick = { showDepartureStations = true },
                        enabled = canPlecare,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canPlecare) activeGreen else inactiveGrey,
                            contentColor = if (canPlecare) Color.Black else inactiveText
                        )
                    ) {
                        Text("PLECARE DIN STATIE")
                    }

                    Spacer(Modifier.width(8.dp))

                    Button(
                        onClick = { showDestinations = true },
                        enabled = canEmiteBilet,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canEmiteBilet) activeGreen else inactiveGrey,
                            contentColor = if (canEmiteBilet) Color.Black else inactiveText
                        )
                    ) {
                        Text("EMITE BILET")
                    }
                }

                Spacer(Modifier.height(8.dp))

                // rând 2: REZERVARI | PORNESTE IMBARCAREA
                Row(Modifier.fillMaxWidth()) {
                    Button(
                        onClick = { showReservations = true },
                        enabled = canRezervari,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canRezervari) activeGreen else inactiveGrey,
                            contentColor = if (canRezervari) Color.Black else inactiveText
                        )
                    ) {
                        Text("REZERVARI")
                    }


                    Spacer(Modifier.width(8.dp))

                    Button(
                        onClick = { showStartBoardingConfirm = true },
                        enabled = canStartBoarding,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canStartBoarding) activeGreen else inactiveGrey,
                            contentColor = if (canStartBoarding) Color.Black else inactiveText
                        )
                    ) {
                        Text(
                            if (boardingStarted)
                                "IMBARCAREA A INCEPUT"
                            else
                                "PORNESTE IMBARCAREA"
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                // rând 3: RAPOARTE | SELECTIE AUTO (bifă)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .height(60.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = { /* TODO: Rapoarte */ },
                        enabled = canRapoarte,
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (canRapoarte) activeGreen else inactiveGrey,
                            contentColor = if (canRapoarte) Color.Black else inactiveText
                        )
                    ) {
                        Text("RAPOARTE")
                    }

                    Spacer(Modifier.width(8.dp))

                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = autoSelected,
                            onCheckedChange = { checked ->
                                if (canSelectAuto) {
                                    onAutoSelectedChange(checked)
                                }
                            },
                            enabled = canSelectAuto
                        )

                        Text(
                            text = "SELECTIE AUTO",
                            color = if (canSelectAuto) Color.Black else inactiveText
                        )
                    }
                }

                // carduri sub butoane
                Spacer(Modifier.height(16.dp))

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 80.dp)
                        .clickable { if (loggedIn) showTicketHistory = true }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp)
                    ) {
                        Text(
                            text = "Istoric bilete emise (cursa curentă)",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "Ex: ultimele 5 bilete.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 80.dp)
                        .clickable { if (loggedIn) showPassHistory = true }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp)
                    ) {
                        Text(
                            text = "Istoric abonamente (cursa curentă)",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "Ex: ultimele validări/invalidări.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                // sumar stație curentă
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 70.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp)
                    ) {
                        Text(
                            text = if (currentStopName != null)
                                "Stația curentă: $currentStopName"
                            else
                                "Stația curentă: necunoscută",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.Black,
                            modifier = Modifier.padding(bottom = 4.dp)
                        )


                        Text(
                            text = "Persoane care COBOARĂ: $persoaneCoboara",
                            style = MaterialTheme.typography.bodySmall
                        )
                        Text(
                            text = "Persoane care URCĂ: $persoaneUrca",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            // popup confirmare pornire îmbarcare
            if (showStartBoardingConfirm) {
                AlertDialog(
                    onDismissRequest = { showStartBoardingConfirm = false },
                    title = { Text("Pornește îmbarcarea") },
                    text = { Text("Ești sigur că vrei să pornești îmbarcarea?") },
                    confirmButton = {
                        TextButton(onClick = {
                            onStartBoarding()
                            showStartBoardingConfirm = false
                        }) {
                            Text("DA")
                        }
                    }
,
                    dismissButton = {
                        TextButton(onClick = { showStartBoardingConfirm = false }) {
                            Text("NU")
                        }
                    }
                )
            }
        }
    }
}


