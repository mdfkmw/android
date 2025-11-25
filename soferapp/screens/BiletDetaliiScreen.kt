package ro.priscom.sofer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp


import ro.priscom.sofer.ui.data.DriverLocalStore
import ro.priscom.sofer.ui.models.DriverTicket


@Composable
fun BiletDetaliiScreen(
    destination: String,
    onBack: () -> Unit,
    onIncasare: () -> Unit,
    currentStopName: String? = null,
    ticketPrice: Double? = null
) {


    val activeGreen = Color(0xFF5BC21E)
    val purpleBg = Color(0xFFE3C6FF)
    val blueFinal = Color(0xFF007BFF)

// dacă avem preț din listele reale, îl folosim; altfel 0 intern
    var pretBrut by remember(ticketPrice) { mutableStateOf(ticketPrice ?: 0.0) }
    var dusIntors by remember { mutableStateOf(false) }
    var quantity by remember { mutableStateOf(1) }
    var selectedDiscount by remember { mutableStateOf<DiscountOption?>(null) }
    var showReduceri by remember { mutableStateOf(false) }

// reducerea și totalul au sens doar dacă avem preț
    val discountFactor = if (ticketPrice != null) {
        1 - (selectedDiscount?.percent ?: 0.0) / 100.0
    } else {
        0.0
    }
    val finalPrice = if (ticketPrice != null) {
        pretBrut * quantity * (if (dusIntors) 2 else 1) * discountFactor
    } else {
        0.0
    }
    val canIncasare = ticketPrice != null



    if (showReduceri) {
        ReduceriScreen(
            onBack = { showReduceri = false },
            onSelect = { opt ->
                selectedDiscount = opt
                showReduceri = false
            }
        )
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
            Text("CURSA: TUR 06:00 - TUR", fontSize = 14.sp)
            Text(
                "IMBARCARE: ${currentStopName ?: "STATIE CURENTA"}",
                fontSize = 14.sp
            )

            Text("DEBARCARE: $destination", fontSize = 14.sp)
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

                Button(
                    onClick = { /* Cash – doar vizual deocamdată */ },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = activeGreen
                    )
                ) {
                    Text("CASH")
                }
            }
        }

        // zona mov mare
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(purpleBg)
        )

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
                    if (!canIncasare) return@Button  // prevenție totală

                    val ticket = DriverTicket(
                        destination = destination,
                        grossPrice = pretBrut,
                        finalPrice = finalPrice,
                        quantity = quantity,
                        discountPercent = selectedDiscount?.percent ?: 0.0
                    )
                    DriverLocalStore.addTicket(ticket)
                    onIncasare()
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
