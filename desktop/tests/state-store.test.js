const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadDesktopState, saveDesktopState } = require('../src/state-store.js');

const DEFAULTS = { mode: 'fullscreen', widgetSize: 'medium', noTransparency: false };
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pcsi-')), 'desktop-state.json');

test('fichier absent : valeurs par défaut', () => {
  assert.deepEqual(loadDesktopState(tmp()), DEFAULTS);
});

test('fichier vide, JSON tronqué ou mode inconnu : valeurs par défaut sans exception', () => {
  for (const content of ['', '{', '{"mode":"xyz"}', 'null', '[]', '42']) {
    const f = tmp();
    fs.writeFileSync(f, content);
    assert.deepEqual(loadDesktopState(f), DEFAULTS, `contenu : ${JSON.stringify(content)}`);
  }
});

test('champs valides conservés, champs invalides remplacés un par un', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ mode: 'hud', widgetSize: 'huge', widgetPosition: { x: 10, y: 20 }, noTransparency: 'oui' }));
  assert.deepEqual(loadDesktopState(f), { mode: 'hud', widgetSize: 'medium', widgetPosition: { x: 10, y: 20 }, noTransparency: false });
});

test('une position invalide est ignorée', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ widgetPosition: { x: 'a', y: null } }));
  assert.equal('widgetPosition' in loadDesktopState(f), false);
});

test('enregistrer puis relire redonne le même état', () => {
  const f = tmp();
  const s = { mode: 'widget', widgetSize: 'large', widgetPosition: { x: 5, y: 6 }, noTransparency: true };
  saveDesktopState(f, s);
  assert.deepEqual(loadDesktopState(f), s);
});

test('enregistrer crée le dossier manquant', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcsi-'));
  const f = path.join(dir, 'a', 'b', 'desktop-state.json');
  saveDesktopState(f, { mode: 'hud', widgetSize: 'small', noTransparency: false });
  assert.equal(loadDesktopState(f).mode, 'hud');
});
