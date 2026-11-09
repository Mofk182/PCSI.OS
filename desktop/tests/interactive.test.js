const test = require('node:test');
const assert = require('node:assert');
const { applyInteractive } = require('../src/interactive.js');

function fakeWin() {
  const calls = [];
  return { calls, setIgnoreMouseEvents: (...args) => calls.push(args) };
}

test('Windows + interactif : la fenêtre cesse d\'ignorer les clics', () => {
  const w = fakeWin();
  applyInteractive(w, 'win32', true);
  assert.deepEqual(w.calls, [[false, { forward: true }]]);
});

test('Windows + non interactif : les clics traversent, les mouvements sont renvoyés à la page', () => {
  const w = fakeWin();
  applyInteractive(w, 'win32', false);
  assert.deepEqual(w.calls, [[true, { forward: true }]]);
});

test('Linux : aucun appel (HUD en lecture seule)', () => {
  const w = fakeWin();
  applyInteractive(w, 'linux', true);
  applyInteractive(w, 'linux', false);
  assert.deepEqual(w.calls, []);
});
