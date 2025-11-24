const express = require('express');
const router = express.Router();
const db = require('../../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name
      FROM routes
      
      ORDER BY name
    `);

    res.json(rows);
  } catch (err) {
    console.error("RoutesApp error", err);
    res.status(500).json({ error: "Eroare RoutesApp" });
  }
});

module.exports = router;
