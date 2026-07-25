const crypto = require('crypto');

/**
 * Mirrors com.bloodbank.util.PasswordUtil exactly so existing user accounts
 * created by the desktop app keep working against this API, and vice versa:
 *   - PBKDF2WithHmacSHA256
 *   - 65536 iterations
 *   - 256-bit (32 byte) derived key
 *   - salt generated as 16 random bytes, everything stored as Base64
 */
const ITERATIONS = 65536;
const KEY_LENGTH_BYTES = 256 / 8;
const DIGEST = 'sha256';

function generateSalt() {
  return crypto.randomBytes(16).toString('base64');
}

function hash(password, saltBase64) {
  const salt = Buffer.from(saltBase64, 'base64');
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH_BYTES, DIGEST);
  return derived.toString('base64');
}

function verify(password, saltBase64, expectedHashBase64) {
  const actual = hash(password, saltBase64);
  return timingSafeEqualStrings(actual, expectedHashBase64);
}

// crypto.timingSafeEqual requires equal-length buffers, so guard the length
// check itself doesn't leak timing in a way that matters here — lengths are
// fixed by the algorithm anyway, this is just defensive.
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, 'base64');
  const bufB = Buffer.from(b, 'base64');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { generateSalt, hash, verify };
