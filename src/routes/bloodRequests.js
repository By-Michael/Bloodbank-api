const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /blood-requests — hospitals see only their own; staff/admin see all
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'HOSPITAL') {
      [rows] = await pool.query(
        `SELECT br.* FROM blood_requests br
         JOIN hospitals h ON h.id = br.hospital_id
         WHERE h.user_id = ? ORDER BY br.created_at DESC`,
        [req.user.sub]
      );
    } else if (req.query.status) {
      [rows] = await pool.query(
        `SELECT br.*, h.hospital_name FROM blood_requests br
         JOIN hospitals h ON h.id = br.hospital_id
         WHERE br.status = ?
         ORDER BY br.created_at DESC`,
        [req.query.status]
      );
    } else {
      [rows] = await pool.query(
        `SELECT br.*, h.hospital_name FROM blood_requests br
         JOIN hospitals h ON h.id = br.hospital_id
         ORDER BY br.created_at DESC`
      );
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /blood-requests — hospital submits a new request
router.post('/', requireAuth, requireRole('HOSPITAL'), async (req, res, next) => {
  try {
    const { bloodType, quantityMl, urgency, notes } = req.body;
    if (!bloodType || !quantityMl || !urgency) {
      return res.status(400).json({ error: 'bloodType, quantityMl, and urgency are required' });
    }

    const [[hospital]] = await pool.query('SELECT id FROM hospitals WHERE user_id = ?', [req.user.sub]);
    if (!hospital) return res.status(404).json({ error: 'Hospital profile not found' });

    const [result] = await pool.query(
      `INSERT INTO blood_requests (hospital_id, blood_type, quantity_ml, urgency, status, notes)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`,
      [hospital.id, bloodType, quantityMl, urgency, notes || null]
    );
    res.status(201).json({ id: result.insertId, status: 'PENDING' });
  } catch (err) {
    next(err);
  }
});

// POST /blood-requests/:id/approve — staff/admin only, atomic with stock deduction
router.post('/:id/approve', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Row-level locks, same pattern as BloodRequestService on the Java side:
    // lock the request row and the stock row before checking/mutating either,
    // so two staff members approving concurrently can't both succeed against
    // stock that only covers one of them.
    const [[request]] = await conn.query(
      'SELECT * FROM blood_requests WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!request) {
      await conn.rollback();
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'PENDING') {
      await conn.rollback();
      return res.status(409).json({ error: `Request is already ${request.status}` });
    }

    const [[stock]] = await conn.query(
      'SELECT * FROM blood_stock WHERE blood_type = ? FOR UPDATE',
      [request.blood_type]
    );
    if (!stock || stock.quantity_ml < request.quantity_ml) {
      await conn.rollback();
      return res.status(409).json({ error: 'Insufficient stock to approve this request' });
    }

    await conn.query(
      'UPDATE blood_stock SET quantity_ml = quantity_ml - ? WHERE blood_type = ?',
      [request.quantity_ml, request.blood_type]
    );
    await conn.query(
      "UPDATE blood_requests SET status = 'APPROVED', processed_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    await conn.commit();
    res.json({ id: Number(req.params.id), status: 'APPROVED' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// POST /blood-requests/:id/reject — staff/admin only
router.post('/:id/reject', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE blood_requests SET status = 'REJECTED', processed_at = NOW() WHERE id = ? AND status = 'PENDING'",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Request not found or already processed' });
    }
    res.json({ id: Number(req.params.id), status: 'REJECTED' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
