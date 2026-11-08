const test = require('node:test');
const assert = require('node:assert');
const { registerShortcuts } = require('../src/shortcuts.js');

function fakeGs(refuse = []) {
  const map = new Map();
  return { map, register(accel, cb) { if (refuse.includes(accel)) return false; map.set(accel, cb); return true; } };
}
const handlers = calls => ({
  toggle: () => calls.push('toggle'),
  nextMode: () => calls.push('nextMode'),
  quickAdd: () => calls.push('quickAdd'),
  toggleIsland: () => calls.push('toggleIsland')
});

test('les quatre raccourcis sont enregistrés et appellent le bon gestionnaire', () => {
  const calls = [];
  const gs = fakeGs();
  const result = registerShortcuts(gs, handlers(calls));
  assert.deepEqual(result, { p: true, m: true, a: true, i: true });
  gs.map.get('Control+Alt+P')(); gs.map.get('Control+Alt+M')(); gs.map.get('Control+Alt+A')(); gs.map.get('Control+Alt+I')();
  assert.deepEqual(calls, ['toggle', 'nextMode', 'quickAdd', 'toggleIsland']);
});

test('un raccourci refusé est signalé sans bloquer les autres', () => {
  const gs = fakeGs(['Control+Alt+I']);
  assert.deepEqual(registerShortcuts(gs, handlers([])), { p: true, m: true, a: true, i: false });
});

test('une exception de register compte comme un échec', () => {
  const gs = { register() { throw new Error('Wayland'); } };
  assert.deepEqual(registerShortcuts(gs, handlers([])), { p: false, m: false, a: false, i: false });
});
