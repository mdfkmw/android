const express = require('express');
const router = express.Router();
const db = require('../../db');

// Stațiile unei rute pentru aplicația de șofer
// fără requireAuth, fără cookie
router.get('/', async (req, res) => {
  try {
    const { route_id } = req.query;
    if (!route_id) {
      return res.status(400).json({ error: 'Missing route_id' });
    }

    const q = `
      SELECT rs.id, rs.route_id, rs.station_id, rs.order_index,
             s.name AS station_name
      FROM route_stations rs
      JOIN stations s ON s.id = rs.station_id
      WHERE rs.route_id = $1
      ORDER BY rs.order_index ASC
    `;

    const result = await db.query(q, [route_id]);
    res.json(result.rows);

  } catch (err) {
    console.error("RouteStationsApp ERROR", err);
    res.status(500).json({ error: "Eroare RouteStationsApp" });
  }
});

module.exports = router;
