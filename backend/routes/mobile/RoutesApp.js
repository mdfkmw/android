const express = require('express');
const router = express.Router();
const db = require('../../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name, order_index, visible_for_drivers
      FROM routes
      WHERE visible_for_drivers = 1 OR visible_for_drivers IS NULL
      ORDER BY COALESCE(order_index, 999999), name
    `);

    res.json(rows);
  } catch (err) {
    console.error("RoutesApp error", err);
    res.status(500).json({ error: "Eroare RoutesApp" });
  }
});

module.exports = router;
