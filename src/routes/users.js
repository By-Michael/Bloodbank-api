const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /users — admin only, full user list for the admin dashboard
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, role, email, phone, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
