const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const datePart = date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

module.exports = async function sendOrderRefundEmail({ to, receipt, refundTime }) {
  if (!to) return;
  if (!receipt || !receipt.order) {
    throw new Error('Receipt invalid: missing order');
  }

  const order = receipt.order;
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const reservationIds = Array.isArray(receipt.reservation_ids) ? receipt.reservation_ids : [];

  const tripDate = esc(order.trip_date);
  const depTime = esc(order.departure_time);
  const routeName = esc(order.vehicle_route_text || order.route_name);
  const boardName = esc(order.board_station_name || `#${order.board_station_id}`);
  const exitName = esc(order.exit_station_name || `#${order.exit_station_id}`);

  const seatLabels = items
    .map((item) => String(item.seat_label || item.seat_id || '').trim())
    .filter(Boolean);
  const paidAmount = Number(order.total_amount || 0);
  const currency = esc((order.currency || 'RON').toUpperCase());
  const refundStamp = esc(formatLocalDateTime(refundTime));

  const subject = `Rezervare anulată – ${boardName} → ${exitName}`;

  const html = `
    <h2>Rezervarea ta a fost anulată</h2>

    <p><strong>Data cursei:</strong> ${tripDate}</p>
    <p><strong>Ora:</strong> ${depTime}</p>
    <p><strong>Ruta mașinii:</strong> ${routeName}</p>
    <p><strong>Rezervarea ta:</strong> ${boardName} → ${exitName}</p>
    <p><strong>Locuri:</strong> ${seatLabels.length ? esc(seatLabels.join(', ')) : '-'}</p>
    <p><strong>Suma refundată:</strong> ${paidAmount} ${currency}</p>
    ${refundStamp ? `<p><strong>Refund procesat la:</strong> ${refundStamp}</p>` : ''}
    ${reservationIds.length ? `<p><strong>ID rezervări:</strong> ${esc(reservationIds.join(', '))}</p>` : ''}

    <p><em>Îți mulțumim că ai folosit platforma noastră!</em></p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
};
