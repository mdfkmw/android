package ro.priscom.sofer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class DiscountOption(
    val label: String,
    val percent: Double
)

@Composable
fun ReduceriScreen(
    onBack: () -> Unit,
    onSelect: (DiscountOption) -> Unit
) {
    val activeGreen = Color(0xFF5BC21E)
    val options = listOf(
        DiscountOption("REDUCERE 50%, Procent: 50%", 50.0)
        // mai adaugi aici alte reduceri dacă vrei
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFB0D4FF))
                .padding(12.dp)
        ) {
            Text(
                text = "Selectați reducerea",
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
            items(options) { opt ->
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(opt) }
                        .padding(vertical = 14.dp, horizontal = 12.dp)
                ) {
                    Text(opt.label, fontSize = 16.sp, color = Color.Black)
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
            onClick = onBack,
            modifier = Modifier
                .fillMaxWidth()
                .height(55.dp)
                .padding(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = activeGreen
            )
        ) {
            Text("RENUNTA", fontSize = 18.sp, color = Color.Black)
        }
    }
}
