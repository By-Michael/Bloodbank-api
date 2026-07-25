const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /blood-stock — anyone logged in can view stock levels
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blood_stock ORDER BY blood_type');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /blood-stock/:bloodType — staff/admin only, sets absolute quantity
router.patch('/:bloodType', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { quantityMl } = req.body;
    if (typeof quantityMl !== 'number' || quantityMl < 0) {
      return res.status(400).json({ error: 'quantityMl must be a non-negative number' });
    }
    const [result] = await pool.query(
      'UPDATE blood_stock SET quantity_ml = ? WHERE blood_type = ?',
      [quantityMl, req.params.bloodType]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Unknown blood type' });
    }
    res.json({ bloodType: req.params.bloodType, quantityMl });
  } catch (err) {
    next(err);
  }
});

// POST /blood-stock/:bloodType/adjust — staff/admin only, relative change (+/-)
// Used for "Add Stock" / "Remove Stock" buttons rather than setting an absolute value,
// so two staff adjusting stock around the same time don't clobber each other's change.
router.post('/:bloodType/adjust', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { deltaMl } = req.body;
    if (typeof deltaMl !== 'number' || deltaMl === 0) {
      return res.status(400).json({ error: 'deltaMl must be a non-zero number' });
    }

    await conn.beginTransaction();
    const [[row]] = await conn.query(
      'SELECT * FROM blood_stock WHERE blood_type = ? FOR UPDATE',
      [req.params.bloodType]
    );
    if (!row) {
      await conn.rollback();
      return res.status(404).json({ error: 'Unknown blood type' });
    }
    const newQuantity = row.quantity_ml + deltaMl;
    if (newQuantity < 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Cannot remove more than the current stock' });
    }
    await conn.query(
      'UPDATE blood_stock SET quantity_ml = ? WHERE blood_type = ?',
      [newQuantity, req.params.bloodType]
    );
    await conn.commit();
    res.json({ bloodType: req.params.bloodType, quantityMl: newQuantity });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
