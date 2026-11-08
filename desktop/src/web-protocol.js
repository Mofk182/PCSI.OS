// Résolution sûre d'une URL app://pcsi/... vers un fichier de desktop/web/.
const path = require('node:path');

// Renvoie le chemin absolu du fichier, ou null s'il sort de webRoot ou si l'URL est invalide.
function resolveWebPath(webRoot, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(String(pathname || '')); } catch (e) { return null; }
  if (decoded.includes('\0')) return null;
  const rel = (decoded === '' || decoded === '/') ? '/index.html' : decoded;
  const root = path.resolve(webRoot);
  const full = path.resolve(root, '.' + (rel.startsWith('/') ? rel : '/' + rel));
  return full.startsWith(root + path.sep) ? full : null;
}

module.exports = { resolveWebPath };
