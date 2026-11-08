// api/_rate-limit.js
// Rate limiter en mémoire pour la fonction serverless Vercel

/**
 * Vérifie si la requête est dans la limite autorisée.
 * @param {Map} store
 * @param {string} key
 * @param {number} now
 * @param {number} [limit=8]
 * @param {number} [windowMs=600000]
 * @returns {{ok: boolean, retryAfterSec: number}}
 */
function checkRateLimit(store, key, now, limit = 8, windowMs = 600000) {
  if (!store || !(store instanceof Map)) {
    store = new Map();
  }
  const timestamps = (store.get(key) || []).filter(t => (now - t) < windowMs);
  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = windowMs - (now - oldestInWindow);
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    store.set(key, timestamps);
    return { ok: false, retryAfterSec };
  }
  timestamps.push(now);
  store.set(key, timestamps);
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Extrait l'IP du client depuis les en-têtes HTTP.
 * @param {object} headers
 * @returns {string}
 */
function clientKey(headers) {
  if (!headers || typeof headers !== 'object') return 'unknown';
  const fwd = headers['x-forwarded-for'];
  if (fwd && typeof fwd === 'string') {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  const real = headers['x-real-ip'];
  if (real && typeof real === 'string' && real.trim()) {
    return real.trim();
  }
  return 'unknown';
}

module.exports = {
  checkRateLimit,
  clientKey
};
