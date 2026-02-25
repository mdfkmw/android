package ro.priscom.sofer.ui.data

import java.time.LocalDateTime

/**
 * Păstrează în memorie informațiile despre ultima sincronizare pentru a le afișa
 * la revenirea pe ecranul de sincronizare.
 */
object SyncStatusStore {
    var lastResultMessage: String? = null
        private set

    // ultima încercare de sincronizare (reușită sau nu)
    var lastAttemptAt: LocalDateTime? = null
        private set

    // ultima sincronizare care a fost considerată reușită
    var lastSuccessAt: LocalDateTime? = null
        private set

    /**
     * @param message  mesaj de status (master + bilete + erori)
     * @param success  true dacă sincronizarea este considerată reușită
     * @param timestamp momentul în care s-a terminat sincronizarea
     */
    fun update(
        message: String,
        success: Boolean,
        timestamp: LocalDateTime = LocalDateTime.now()
    ) {
        lastResultMessage = message
        lastAttemptAt = timestamp
        if (success) {
            lastSuccessAt = timestamp
        }
    }
}
