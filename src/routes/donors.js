const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const SELECT_DONOR = `
  SELECT d.*, u.full_name, u.phone, u.email
  FROM donors d
  JOIN users u ON u.id = d.user_id
`;

// GET /donors — staff/admin only
router.get('/', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${SELECT_DONOR} ORDER BY d.id`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /donors/me — the logged-in donor's own profile
router.get('/me', requireAuth, requireRole('DONOR'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${SELECT_DONOR} WHERE d.user_id = ?`, [req.user.sub]);
    if (rows.length === 0) return res.status(404).json({ error: 'Donor profile not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /donors/:id — staff/admin only, lookup by donor id
router.get('/:id', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${SELECT_DONOR} WHERE d.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Donor not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
