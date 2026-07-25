require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const bloodStockRoutes = require('./routes/bloodStock');
const bloodRequestRoutes = require('./routes/bloodRequests');
const appointmentRoutes = require('./routes/appointments');
const donorRoutes = require('./routes/donors');
const userRoutes = require('./routes/users');

const app = express();

app.use(helmet());
app.use(express.json());

// The desktop app doesn't send an Origin header, so CORS doesn't restrict it.
// This only matters if you later add a browser-based frontend.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
}));

// Blanket rate limit — protects against brute-force login attempts and abuse.
// Tune per-route if you need something stricter on /auth/login specifically.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/blood-stock', bloodStockRoutes);
app.use('/blood-requests', bloodRequestRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/donors', donorRoutes);
app.use('/users', userRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler — keeps stack traces out of API responses.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`bloodbank-api listening on port ${port}`);
});
