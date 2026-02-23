const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/terminals  (doar autentificat)
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
         FROM terminals
        WHERE active = 1
        ORDER BY id ASC`
    );
    const rows = result.rows ?? result[0] ?? result ?? [];
    res.json(rows);
  } catch (err) {
    console.error('GET /terminals error:', err);
    res.status(500).json({ error: 'Eroare la interogare DB' });
  }
});

module.exports = router;
