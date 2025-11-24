// routes/mobile/driverApp.js
// Endpointuri dedicate pentru aplicația de șofer (Android).
// Scop: să furnizeze rapid rutele și cursele (trips) pentru o anumită zi,
// în format ușor de folosit în client.

const express = require('express');
const router = express.Router();

// adaptor DB – același ca restul backend-ului
const db = require('../../db');

// middleware de autentificare (folosit ca să știm operator_id etc.)
const { requireAuth } = require('../../middleware/auth');

/**
 * Helper simplu: normalizează parametru ?date=YYYY-MM-DD.
 * Dacă nu e trimis nimic, folosește data de azi (fusul orar al serverului).
 */
function getDateParam(req) {
  const { date } = req.query;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return String(date);
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * GET /api/mobile/routes-with-trips
 *
 * Returnează pentru o anumită zi toate rutele vizibile pentru șofer
 * + cursele (trips) disponibile pe fiecare rută.
 *
 * Query:
 *   - date=YYYY-MM-DD (opțional; default: azi)
 *
 * Răspuns:
 * [
 *   {
 *     route_id: 1,
 *     route_name: "Botoșani → Iași",
 *     trips: [
 *       {
 *         trip_id: 10,
 *         date: "2025-11-24",
 *         time: "06:00:00",
 *         direction: "tur",          // din route_schedules.direction
 *         direction_label: "TUR",    // upper-case
 *         display_time: "TUR 06:00"  // gata de pus în buton în aplicație
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */
router.get('/routes-with-trips', requireAuth, async (req, res) => {
  const dateStr = getDateParam(req);

  try {
    // Dacă utilizatorul are operator_id (șofer / operator_admin),
    // filtrăm cursele doar pe operatorul lui.
    const currentOpId = req.user?.operator_id || null;

    const params = [dateStr];
    let operatorFilterSql = '';

    if (currentOpId) {
      operatorFilterSql = ' AND rs.operator_id = ? ';
      params.push(currentOpId);
    }

    const sql = `
      SELECT
        r.id           AS route_id,
        r.name         AS route_name,
        t.id           AS trip_id,
        t.date         AS trip_date,
        t.time         AS trip_time,
        rs.direction   AS direction
      FROM trips t
      JOIN routes r
        ON r.id = t.route_id
      LEFT JOIN route_schedules rs
        ON rs.id = t.route_schedule_id
      WHERE t.date = ?
        AND (r.visible_for_drivers = 1 OR r.visible_for_drivers IS NULL)
        AND (t.disabled = 0 OR t.disabled IS NULL)
        ${operatorFilterSql}
      ORDER BY
        COALESCE(r.order_index, 999999),
        r.id,
        t.time
    `;

    const { rows } = await db.query(sql, params);

    // Grupăm rezultatul pe rută
    const byRoute = new Map();

    for (const row of rows) {
      if (!byRoute.has(row.route_id)) {
        byRoute.set(row.route_id, {
          route_id: row.route_id,
          route_name: row.route_name,
          trips: []
        });
      }

      const direction = row.direction || 'tur';
      const dirLabel = String(direction).toUpperCase(); // "TUR" / "RETUR"
      const timeStr = String(row.trip_time).slice(0, 5); // "HH:MM"

      byRoute.get(row.route_id).trips.push({
        trip_id: row.trip_id,
        date: row.trip_date,
        time: row.trip_time,
        direction,
        direction_label: dirLabel,
        display_time: `${dirLabel} ${timeStr}`
      });
    }

    return res.json(Array.from(byRoute.values()));
  } catch (err) {
    console.error('[GET /api/mobile/routes-with-trips] error:', err);
    return res.status(500).json({
      error: 'Eroare la încărcarea curselor pentru aplicația de șofer.'
    });
  }
});

module.exports = router;
