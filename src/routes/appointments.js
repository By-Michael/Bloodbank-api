const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /appointments — donors see their own; staff/admin see all
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'DONOR') {
      [rows] = await pool.query(
        `SELECT a.* FROM appointments a
         JOIN donors d ON d.id = a.donor_id
         WHERE d.user_id = ? ORDER BY a.appointment_date DESC`,
        [req.user.sub]
      );
    } else {
      [rows] = await pool.query(
        `SELECT a.*, u.full_name AS donor_name FROM appointments a
         JOIN donors d ON d.id = a.donor_id
         JOIN users u ON u.id = d.user_id
         ORDER BY a.appointment_date DESC`
      );
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /appointments — donor books a slot
router.post('/', requireAuth, requireRole('DONOR'), async (req, res, next) => {
  try {
    const { appointmentDate, timeSlot } = req.body;
    if (!appointmentDate) {
      return res.status(400).json({ error: 'appointmentDate is required' });
    }

    const [[donor]] = await pool.query('SELECT id FROM donors WHERE user_id = ?', [req.user.sub]);
    if (!donor) return res.status(404).json({ error: 'Donor profile not found' });

    const [[existing]] = await pool.query(
      `SELECT id FROM appointments
       WHERE donor_id = ? AND appointment_date = ? AND status = 'SCHEDULED'`,
      [donor.id, appointmentDate]
    );
    if (existing) {
      return res.status(409).json({ error: 'You already have an active appointment on this date' });
    }

    const [result] = await pool.query(
      `INSERT INTO appointments (donor_id, appointment_date, time_slot, status)
       VALUES (?, ?, ?, 'SCHEDULED')`,
      [donor.id, appointmentDate, timeSlot || null]
    );
    res.status(201).json({ id: result.insertId, status: 'SCHEDULED' });
  } catch (err) {
    next(err);
  }
});

// POST /appointments/:id/cancel — donor cancels their own appointment
router.post('/:id/cancel', requireAuth, requireRole('DONOR'), async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `UPDATE appointments a
       JOIN donors d ON d.id = a.donor_id
       SET a.status = 'CANCELLED'
       WHERE a.id = ? AND d.user_id = ? AND a.status = 'SCHEDULED'`,
      [req.params.id, req.user.sub]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Appointment not found, not yours, or already cancelled' });
    }
    res.json({ id: Number(req.params.id), status: 'CANCELLED' });
  } catch (err) {
    next(err);
  }
});

// POST /appointments/:id/status — staff/admin only, sets COMPLETED or CANCELLED
router.post('/:id/status', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'status must be COMPLETED or CANCELLED' });
    }
    const [result] = await pool.query(
      "UPDATE appointments SET status = ? WHERE id = ? AND status = 'SCHEDULED'",
      [status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Appointment not found or already processed' });
    }
    res.json({ id: Number(req.params.id), status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
