// Pont AnkiConnect côté processus principal : aucune règle CORS à configurer dans Anki.
// Seules les actions réellement appelées par js/daily_drop.js sont autorisées (un test garde les deux listes alignées).
const ALLOWED_ACTIONS = ['modelNames', 'modelFieldNames', 'requestPermission', 'createDeck', 'addNote'];
const ENDPOINT = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 3000;

class AnkiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnkiError';
    this.code = code;   // 'forbidden' | 'timeout' | 'unreachable' | 'anki-error'
  }
}

// Renvoie le champ result de la réponse ; rejette une AnkiError sinon.
async function callAnki(fetchFn, action, params, opts) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new AnkiError('forbidden', `Action Anki non autorisée : ${action}`);
  }
  const timeoutMs = (opts && opts.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let data;
  try {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ action, version: 6, params: params || {} }),
      signal: ctrl.signal
    });
    const text = await res.text();
    data = text ? JSON.parse(text) : { result: null, error: null };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AnkiError('timeout', "Anki ne répond pas (délai dépassé).");
    throw new AnkiError('unreachable', "Anki est fermé ou le greffon AnkiConnect n'est pas installé.");
  } finally {
    clearTimeout(timer);
  }
  if (data && data.error) throw new AnkiError('anki-error', String(data.error));
  return data ? data.result : null;
}

module.exports = { callAnki, ALLOWED_ACTIONS, AnkiError };
