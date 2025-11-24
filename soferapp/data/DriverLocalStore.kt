package ro.priscom.sofer.ui.data

import ro.priscom.sofer.ui.models.DriverTicket

object DriverLocalStore {

    private val tickets = mutableListOf<DriverTicket>()

    fun addTicket(ticket: DriverTicket) {
        tickets.add(ticket)
    }

    fun getTickets(): List<DriverTicket> {
        return tickets.toList()
    }

    fun clearTickets() {
        tickets.clear()
    }
}
