const express = require('express');
const router = express.Router();
const db = require('../../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name, route_id
      FROM price_lists
      ORDER BY id
    `);

    res.json(rows);
  } catch (err) {
    console.error("PriceListsApp error", err);
    res.status(500).json({ error: "Eroare PriceListsApp" });
  }
});

module.exports = router;
