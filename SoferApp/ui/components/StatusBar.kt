package ro.priscom.sofer.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

@Composable
fun StatusBar(
    kasaStatus: String,
    gpsStatus: String,
    netStatus: String,
    batteryStatus: String,
    gpsBypassActive: Boolean = false
) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(modifier = Modifier.padding(8.dp)) {
            val statusText = buildAnnotatedString {
                append("$kasaStatus | ")
                if (gpsBypassActive) {
                    withStyle(SpanStyle(color = Color.Red)) {
                        append(gpsStatus)
                    }
                } else {
                    append(gpsStatus)
                }
                append(" | $netStatus | $batteryStatus")
            }
            Text(
                text = statusText,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
