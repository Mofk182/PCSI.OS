const test = require('node:test');
const assert = require('node:assert');
const { buildWindowOptions, clampToDisplay, canEnterHud } = require('../src/modes.js');

const display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
};
const ctx = (over = {}) => Object.assign({
  platform: 'win32',
  display,
  prefs: { widgetSize: 'medium', noTransparency: false }
}, over);

test('plein écran : fenêtre opaque avec cadre, maximisée, fond #090A0F', () => {
  const r = buildWindowOptions('fullscreen', ctx());
  assert.equal(r.mode, 'fullscreen');
  assert.equal(r.options.frame, true);
  assert.equal(r.options.transparent, false);
  assert.equal(r.options.backgroundColor, '#090A0F');
  assert.equal(r.post.maximize, true);
  assert.equal(r.post.alwaysOnTop, false);
  assert.equal(r.post.ignoreMouse, false);
});

test('widget moyen : 360x520, transparent, sans cadre, au-dessus, en bas à droite', () => {
  const r = buildWindowOptions('widget', ctx());
  assert.equal(r.mode, 'widget');
  assert.equal(r.options.width, 360);
  assert.equal(r.options.height, 520);
  assert.equal(r.options.transparent, true);
  assert.equal(r.options.frame, false);
  assert.equal(r.options.resizable, false);
  assert.equal(r.options.hasShadow, false);
  assert.equal(r.options.skipTaskbar, true);
  assert.equal(r.post.alwaysOnTop, true);
  assert.equal(r.post.ignoreMouse, false);
  assert.equal(r.options.x, 1920 - 360 - 16);
  assert.equal(r.options.y, 1040 - 520 - 16);
});

test('tailles du widget : petit 320x420, grand 420x680', () => {
  const small = buildWindowOptions('widget', ctx({ prefs: { widgetSize: 'small', noTransparency: false } }));
  const large = buildWindowOptions('widget', ctx({ prefs: { widgetSize: 'large', noTransparency: false } }));
  assert.deepEqual([small.options.width, small.options.height], [320, 420]);
  assert.deepEqual([large.options.width, large.options.height], [420, 680]);
});

test('position mémorisée hors de l\'écran : recadrée dans la zone visible', () => {
  const r = buildWindowOptions('widget', ctx({ prefs: { widgetSize: 'medium', widgetPosition: { x: 5000, y: -300 }, noTransparency: false } }));
  assert.ok(r.options.x >= 0 && r.options.x <= 1920 - 360, `x=${r.options.x}`);
  assert.ok(r.options.y >= 0 && r.options.y <= 1040 - 520, `y=${r.options.y}`);
});

test('HUD sous Windows : plein écran transparent, clics ignorés avec renvoi des mouvements', () => {
  const r = buildWindowOptions('hud', ctx());
  assert.equal(r.mode, 'hud');
  assert.deepEqual([r.options.x, r.options.y, r.options.width, r.options.height], [0, 0, 1920, 1080]);
  assert.equal(r.options.transparent, true);
  assert.equal(r.options.frame, false);
  assert.equal(r.options.focusable, true);
  assert.equal(r.post.alwaysOnTop, true);
  assert.deepEqual(r.post.ignoreMouse, { forward: true });
});

test('HUD sous Linux : lecture seule, sans renvoi des mouvements, non focalisable', () => {
  const r = buildWindowOptions('hud', ctx({ platform: 'linux' }));
  assert.deepEqual(r.post.ignoreMouse, { forward: false });
  assert.equal(r.options.focusable, false);
});

test('--no-transparency : le HUD devient un widget opaque', () => {
  const r = buildWindowOptions('hud', ctx({ prefs: { widgetSize: 'medium', noTransparency: true } }));
  assert.equal(r.mode, 'widget');
  assert.equal(r.options.transparent, false);
  assert.equal(r.options.backgroundColor, '#090A0F');
  assert.equal(r.post.ignoreMouse, false);
});

test('clampToDisplay garde la fenêtre dans la zone visible', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(clampToDisplay({ x: 5000, y: -300 }, { width: 360, height: 520 }, area), { x: 1560, y: 0 });
  assert.deepEqual(clampToDisplay({ x: 100, y: 100 }, { width: 360, height: 520 }, area), { x: 100, y: 100 });
});

test('clampToDisplay gère un second écran à gauche et une fenêtre plus grande que l\'écran', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1040 };
  assert.equal(clampToDisplay({ x: -5000, y: 10 }, { width: 360, height: 520 }, left).x, -1920);
  assert.deepEqual(clampToDisplay({ x: 50, y: 50 }, { width: 3000, height: 2000 }, left), { x: -1920, y: 0 });
});

test('canEnterHud exige au moins une voie de sortie', () => {
  assert.equal(canEnterHud({ tray: false, shortcut: false }), false);
  assert.equal(canEnterHud({ tray: true, shortcut: false }), true);
  assert.equal(canEnterHud({ tray: false, shortcut: true }), true);
});
