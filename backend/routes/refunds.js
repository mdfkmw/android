const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('admin', 'operator_admin', 'agent'));

async function execQuery(client, sql, params = []) {
  if (client && typeof client.query === 'function' && client !== db) {
    const [rows] = await client.query(sql, params);
    const isArray = Array.isArray(rows);
    const insertId = typeof rows?.insertId === 'number' ? rows.insertId : null;
    return {
      rows: isArray ? rows : [],
      insertId,
      raw: rows,
    };
  }
  return db.query(sql, params);
}

router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `
        SELECT
          pr.id AS refund_id,
          pr.payment_id,
          pr.public_order_payment_id,
          pr.order_id,
          pr.amount,
          pr.currency,
          pr.status AS refund_status,
          pr.provider,
          pr.provider_refund_id,
          pr.provider_transaction_id,
          pr.provider_payload,
          pr.reason,
          pr.requested_by,
          pr.requested_by_type,
          pr.created_at,
          pr.processed_at,
          o.status AS order_status,
          o.total_amount AS order_total_amount,
          o.customer_name,
          o.customer_phone,
          o.customer_email,
          o.trip_id,
          o.board_station_id AS order_board_station_id,
          o.exit_station_id AS order_exit_station_id,
          ppo.status AS public_payment_status,
          ppo.amount AS public_payment_amount,
          ppo.provider_payment_id AS public_provider_payment_id,
          ppo.provider_order_number AS public_provider_order_number,
          p.status AS payment_status,
          p.amount AS payment_amount,
          p.provider_payment_id AS payment_provider_payment_id,
          p.provider_order_number AS payment_provider_order_number,
          r.id AS reservation_id,
          r.status AS reservation_status,
          r.seat_id,
          s.label AS seat_label,
          r.board_station_id AS reservation_board_station_id,
          r.exit_station_id AS reservation_exit_station_id,
          t.date AS trip_date,
          t.time AS trip_time,
          rs.direction AS trip_direction,

          rt.name AS route_name,
          sb.name AS board_name,
          se.name AS exit_name,
          pe.name AS passenger_name,
          pe.phone AS passenger_phone,
          emp.name AS processed_by_name,
          emp.email AS processed_by_email
        FROM payment_refunds pr
        LEFT JOIN orders o ON o.id = pr.order_id
        LEFT JOIN payments_public_orders ppo ON ppo.id = pr.public_order_payment_id
        LEFT JOIN payments p ON (p.id = pr.payment_id OR p.order_id = pr.order_id)
        LEFT JOIN reservations r ON r.id = p.reservation_id
        LEFT JOIN trips t ON t.id = COALESCE(o.trip_id, r.trip_id)
        LEFT JOIN routes rt ON rt.id = t.route_id
        LEFT JOIN route_schedules rs ON rs.id = t.route_schedule_id


        LEFT JOIN seats s ON s.id = r.seat_id
LEFT JOIN stations sb ON sb.id = COALESCE(o.board_station_id, r.board_station_id)
LEFT JOIN stations se ON se.id = COALESCE(o.exit_station_id, r.exit_station_id)

        LEFT JOIN people pe ON pe.id = r.person_id
        LEFT JOIN employees emp ON emp.id = pr.requested_by
        ORDER BY pr.created_at DESC, pr.id DESC, r.id ASC
      `,
    );

    const grouped = new Map();
    for (const row of rows || []) {
      const refundId = Number(row.refund_id);
      if (!Number.isFinite(refundId)) continue;
      if (!grouped.has(refundId)) {
        grouped.set(refundId, {
          refund: {
            id: refundId,
            payment_id: row.payment_id ? Number(row.payment_id) : null,
            public_order_payment_id: row.public_order_payment_id ? Number(row.public_order_payment_id) : null,
            order_id: row.order_id ? Number(row.order_id) : null,
            amount: row.amount != null ? Number(row.amount) : null,
            currency: row.currency || null,
            status: row.refund_status || null,
            provider: row.provider || null,
            provider_refund_id: row.provider_refund_id || null,
            provider_transaction_id: row.provider_transaction_id || null,
            provider_payload: row.provider_payload || null,
            reason: row.reason || null,
            requested_by: row.requested_by ? Number(row.requested_by) : null,
            requested_by_type: row.requested_by_type || null,
            created_at: row.created_at,
            processed_at: row.processed_at,
            processed_by: row.processed_by_name
              ? { name: row.processed_by_name, email: row.processed_by_email || null }
              : null,
          },
          order: {
            // dacă există order_id, îl păstrăm; dacă nu, rămâne null
            id: row.order_id ? Number(row.order_id) : null,
            status: row.order_status || null,
            total_amount: row.order_total_amount != null ? Number(row.order_total_amount) : null,

            // fallback: pentru refund-urile interne (fără orders), luăm clientul din rezervare
            customer_name: row.customer_name || row.passenger_name || null,
            customer_phone: row.customer_phone || row.passenger_phone || null,
            customer_email: row.customer_email || null,

            // trip info (merge deja din query: trips t join cu COALESCE)
            trip_id: row.trip_id ? Number(row.trip_id) : null,
            trip_date: row.trip_date || null,
            trip_time: row.trip_time || null,
            route_name: row.route_name || null,
            trip_direction: row.trip_direction || null,

            // stații: dacă order nu există, folosim stațiile din rezervare (ai deja COALESCE în query)
            board_station_id: row.order_board_station_id
              ? Number(row.order_board_station_id)
              : (row.reservation_board_station_id ? Number(row.reservation_board_station_id) : null),

            exit_station_id: row.order_exit_station_id
              ? Number(row.order_exit_station_id)
              : (row.reservation_exit_station_id ? Number(row.reservation_exit_station_id) : null),
          },

          payment_public: row.public_order_payment_id ? {
            id: Number(row.public_order_payment_id),
            status: row.public_payment_status || null,
            amount: row.public_payment_amount != null ? Number(row.public_payment_amount) : null,
            provider_payment_id: row.public_provider_payment_id || null,
            provider_order_number: row.public_provider_order_number || null,
          } : null,
          payments: [],
          reservations: [],
        });
      }

      const entry = grouped.get(refundId);
      if (row.payment_provider_payment_id || row.payment_provider_order_number || row.payment_status || row.payment_amount) {
        entry.payments.push({
          status: row.payment_status || null,
          amount: row.payment_amount != null ? Number(row.payment_amount) : null,
          provider_payment_id: row.payment_provider_payment_id || null,
          provider_order_number: row.payment_provider_order_number || null,
        });
      }

      if (row.reservation_id) {
        const reservationId = Number(row.reservation_id);
        if (!entry.reservations.some((resv) => resv.id === reservationId)) {
          entry.reservations.push({
            id: reservationId,
            status: row.reservation_status || null,
            seat_id: row.seat_id ? Number(row.seat_id) : null,
            seat_label: row.seat_label || null,
            board_station_id: row.reservation_board_station_id ? Number(row.reservation_board_station_id) : null,
            exit_station_id: row.reservation_exit_station_id ? Number(row.reservation_exit_station_id) : null,
            trip_direction: row.trip_direction || null,
            board_name: row.board_name || null,
            exit_name: row.exit_name || null,
            passenger_name: row.passenger_name || null,
            passenger_phone: row.passenger_phone || null,
          });
        }
      }
    }

    res.json({ refunds: Array.from(grouped.values()) });
  } catch (err) {
    console.error('[admin/refunds] error', err);
    res.status(500).json({ error: 'Nu am putut încărca refundurile.' });
  }
});

router.post('/:refundId/mark-success', async (req, res) => {
  const refundId = Number(req.params.refundId);
  if (!Number.isFinite(refundId) || refundId <= 0) {
    return res.status(400).json({ error: 'Refund invalid.' });
  }

  const actorId = req.user?.id ? Number(req.user.id) : null;
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 255) : 'manual_success';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { rows: refundRows } = await execQuery(
      conn,
      `
        SELECT id, order_id, status
          FROM payment_refunds
         WHERE id = ?
         LIMIT 1
      `,
      [refundId],
    );

    if (!refundRows.length) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: 'Refundul nu există.' });
    }

    const refund = refundRows[0];
    if (String(refund.status) === 'succeeded') {
      await conn.rollback();
      conn.release();
      return res.status(409).json({ error: 'Refundul este deja marcat ca reușit.' });
    }

    const orderId = refund.order_id ? Number(refund.order_id) : null;
    if (!Number.isFinite(orderId)) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({ error: 'Refundul nu este asociat unei comenzi.' });
    }

    const { rows: reservationPayments } = await execQuery(
      conn,
      `
        SELECT id, reservation_id
          FROM payments
         WHERE order_id = ?
           AND status = 'paid'
      `,
      [orderId],
    );

    const reservationIds = reservationPayments
      .map((row) => Number(row.reservation_id))
      .filter((value) => Number.isFinite(value));

    await execQuery(
      conn,
      `
        UPDATE payment_refunds
           SET status = 'succeeded',
               processed_at = NOW(),
               requested_by = ?,
               requested_by_type = 'employee',
               reason = ?
         WHERE id = ?
      `,
      [Number.isFinite(actorId) ? actorId : null, reason, refundId],
    );

    await execQuery(conn, `UPDATE orders SET status = 'cancelled' WHERE id = ?`, [orderId]);
    await execQuery(conn, `UPDATE payments_public_orders SET status = 'refunded' WHERE order_id = ?`, [orderId]);
    await execQuery(conn, `UPDATE payments SET status = 'refunded' WHERE order_id = ? AND status = 'paid'`, [orderId]);

    if (reservationIds.length) {
      const placeholders = reservationIds.map(() => '?').join(',');
      await execQuery(
        conn,
        `
          UPDATE reservations
             SET status = 'cancelled',
                 version = version + 1
           WHERE id IN (${placeholders})
        `,
        reservationIds,
      );

      for (const reservationId of reservationIds) {
        const details = JSON.stringify({
          source: 'admin_manual',
          refund_id: refundId,
          order_id: orderId,
          processed_by: actorId,
        });
        await execQuery(
          conn,
          `
            INSERT INTO reservation_events (reservation_id, action, actor_id, details)
            VALUES (?, 'refund', ?, ?)
          `,
          [reservationId, Number.isFinite(actorId) ? actorId : null, details],
        );
      }
    }

    await conn.commit();
    conn.release();

    return res.json({ success: true });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore */
    }
    conn.release();
    console.error('[admin/refunds/mark-success] error', err);
    return res.status(500).json({ error: 'Nu am putut marca refundul ca reușit.' });
  }
});

module.exports = router;
