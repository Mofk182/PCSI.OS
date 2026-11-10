const test = require('node:test');
const assert = require('node:assert');
const { setCapture } = require('../src/capture.js');

function fakeWin() {
  const calls = [];
  const rec = name => (...args) => calls.push([name, ...args]);
  return { calls, setIgnoreMouseEvents: rec('ignore'), setFocusable: rec('focusable'), focus: rec('focus') };
}

test('ouverture : la fenêtre cesse d\'ignorer les clics, devient focalisable et prend le focus', () => {
  const w = fakeWin();
  setCapture(w, 'linux', true, { ignoreMouse: { forward: false }, focusable: false });
  assert.deepEqual(w.calls, [['ignore', false], ['focusable', true], ['focus']]);
});

test('fermeture sous Linux : retour à la lecture seule (clics ignorés, non focalisable)', () => {
  const w = fakeWin();
  setCapture(w, 'linux', false, { ignoreMouse: { forward: false }, focusable: false });
  assert.deepEqual(w.calls, [['ignore', true, { forward: false }], ['focusable', false]]);
});

test('fermeture sous Windows : retour au HUD avec renvoi des mouvements, fenêtre focalisable', () => {
  const w = fakeWin();
  setCapture(w, 'win32', false, { ignoreMouse: { forward: true }, focusable: true });
  assert.deepEqual(w.calls, [['ignore', true, { forward: true }], ['focusable', true]]);
});

test('fermeture quand le mode de base ne laisse pas passer les clics (widget) : clics normaux', () => {
  const w = fakeWin();
  setCapture(w, 'win32', false, { ignoreMouse: false, focusable: true });
  assert.deepEqual(w.calls, [['ignore', false], ['focusable', true]]);
});
