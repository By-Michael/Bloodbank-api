const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { generateSalt, hash, verify } = require('../util/password');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

function publicUser(user) {
  const { password_hash, salt, ...rest } = user;
  return rest;
}

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);

    // Always run a hash even on a missing user, so response time doesn't reveal
    // whether the username exists (same reasoning as AuthService on the Java side).
    const user = rows[0];
    const saltToUse = user ? user.salt : generateSalt();
    const hashToCompare = user ? user.password_hash : hash('decoy', saltToUse);
    const passwordOk = verify(password, saltToUse, hashToCompare);

    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/register-donor  (public self-registration, mirrors the app's donor signup)
router.post('/register-donor', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { username, password, fullName, email, phone, bloodType, dateOfBirth } = req.body;
    if (!username || !password || !fullName || !email || !bloodType || !dateOfBirth) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const salt = generateSalt();
    const passwordHash = hash(password, salt);

    await conn.beginTransaction();

    const [userResult] = await conn.query(
      `INSERT INTO users (username, password_hash, salt, role, full_name, email, phone)
       VALUES (?, ?, ?, 'DONOR', ?, ?, ?)`,
      [username, passwordHash, salt, fullName, email, phone || null]
    );

    await conn.query(
      `INSERT INTO donors (user_id, blood_type, date_of_birth)
       VALUES (?, ?, ?)`,
      [userResult.insertId, bloodType, dateOfBirth]
    );

    await conn.commit();
    res.status(201).json({ id: userResult.insertId, username, role: 'DONOR' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// POST /auth/register-staff — admin only
router.post('/register-staff', require('../middleware/auth').requireAuth, require('../middleware/auth').requireRole('ADMIN'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { username, password, fullName, email, phone, employeeId, department } = req.body;
    if (!username || !password || !fullName || !email || !employeeId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const salt = generateSalt();
    const passwordHash = hash(password, salt);

    await conn.beginTransaction();
    const [userResult] = await conn.query(
      `INSERT INTO users (username, password_hash, salt, role, full_name, email, phone)
       VALUES (?, ?, ?, 'STAFF', ?, ?, ?)`,
      [username, passwordHash, salt, fullName, email, phone || null]
    );
    await conn.query(
      `INSERT INTO staff (user_id, employee_id, department) VALUES (?, ?, ?)`,
      [userResult.insertId, employeeId, department || null]
    );
    await conn.commit();
    res.status(201).json({ id: userResult.insertId, username, role: 'STAFF' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// POST /auth/register-hospital — admin only
router.post('/register-hospital', require('../middleware/auth').requireAuth, require('../middleware/auth').requireRole('ADMIN'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { username, password, hospitalName, email, phone, licenseNumber, address } = req.body;
    if (!username || !password || !hospitalName || !email || !licenseNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const salt = generateSalt();
    const passwordHash = hash(password, salt);

    await conn.beginTransaction();
    const [userResult] = await conn.query(
      `INSERT INTO users (username, password_hash, salt, role, full_name, email, phone)
       VALUES (?, ?, ?, 'HOSPITAL', ?, ?, ?)`,
      [username, passwordHash, salt, hospitalName, email, phone || null]
    );
    await conn.query(
      `INSERT INTO hospitals (user_id, hospital_name, license_number, address) VALUES (?, ?, ?, ?)`,
      [userResult.insertId, hospitalName, licenseNumber, address || null]
    );
    await conn.commit();
    res.status(201).json({ id: userResult.insertId, username, role: 'HOSPITAL' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// GET /auth/me
router.get('/me', require('../middleware/auth').requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.sub]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
