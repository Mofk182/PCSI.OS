const test = require('node:test');
const assert = require('node:assert');
const { parseArgs } = require('../src/cli.js');

test('aucun argument utile : action none', () => {
  assert.deepEqual(parseArgs([]), { action: 'none', noTransparency: false, noSplash: false });
});

test('--mode=hud donne set-mode hud', () => {
  const r = parseArgs(['--mode=hud']);
  assert.equal(r.action, 'set-mode');
  assert.equal(r.mode, 'hud');
});

test('--mode=foo : erreur, action none', () => {
  const r = parseArgs(['--mode=foo']);
  assert.equal(r.action, 'none');
  assert.ok(r.error && r.error.includes('foo'));
});

test('les commandes sont reconnues', () => {
  assert.equal(parseArgs(['--toggle']).action, 'toggle');
  assert.equal(parseArgs(['--next-mode']).action, 'next-mode');
  assert.equal(parseArgs(['--quick-add']).action, 'quick-add');
  assert.equal(parseArgs(['--toggle-island']).action, 'toggle-island');
  assert.equal(parseArgs(['--quit']).action, 'quit');
});

test('--no-transparency est un drapeau, pas une action', () => {
  const r = parseArgs(['--no-transparency']);
  assert.equal(r.noTransparency, true);
  assert.equal(r.action, 'none');
});

test('les arguments inconnus (ceux d\'Electron compris) sont ignorés', () => {
  const r = parseArgs(['/usr/bin/electron', '.', '--no-sandbox', '--smoke', '--next-mode']);
  assert.equal(r.action, 'next-mode');
  assert.equal(r.error, undefined);
});
