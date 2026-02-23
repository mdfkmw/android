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

module.exports = async function sendOrderConfirmationEmail({ to, receipt }) {
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
  const discountTotal = Number(order.discount_total || 0);
  const paidAmount = Number(order.total_amount || 0);
  const currency = esc((order.currency || 'RON').toUpperCase());

  const subject = `Confirmare rezervare – ${boardName} → ${exitName}`;


  const html = `
    <h2>Rezervarea ta a fost confirmată</h2>

    <p><strong>Data cursei:</strong> ${tripDate}</p>
    <p><strong>Ora:</strong> ${depTime} <em>(IMPORTANT: Prezentați-vă cu 15 minute mai devreme)</em></p>

<p><strong>Ruta mașinii:</strong> ${routeName}</p>
<p><strong>Rezervarea ta:</strong> ${boardName} → ${exitName}</p>

    <p><strong>Locuri:</strong> ${seatLabels.length ? esc(seatLabels.join(', ')) : '-'}</p>

    ${discountTotal > 0 ? `<p><strong>Reduceri:</strong> -${discountTotal} ${currency}</p>` : ''}

    <p><strong>Valoare plată:</strong> ${paidAmount} ${currency}</p>

    ${reservationIds.length ? `<p><strong>ID rezervări:</strong> ${esc(reservationIds.join(', '))}</p>` : ''}

    <p><em>Mulțumim pentru rezervare!</em></p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
};
