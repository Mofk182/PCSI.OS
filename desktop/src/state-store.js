// État mémorisé entre deux lancements (mode, taille et position du widget, repli sans transparence).
const fs = require('node:fs');
const path = require('node:path');

const MODES = ['fullscreen', 'widget', 'hud'];
const SIZES = ['small', 'medium', 'large'];

function defaults() {
  return { mode: 'fullscreen', widgetSize: 'medium', noTransparency: false };
}

function loadDesktopState(file) {
  const out = defaults();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return out;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  if (MODES.includes(data.mode)) out.mode = data.mode;
  if (SIZES.includes(data.widgetSize)) out.widgetSize = data.widgetSize;
  if (typeof data.noTransparency === 'boolean') out.noTransparency = data.noTransparency;
  const p = data.widgetPosition;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out.widgetPosition = { x: p.x, y: p.y };
  return out;
}

// Écriture atomique : fichier temporaire puis renommage.
function saveDesktopState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { loadDesktopState, saveDesktopState };
