const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { resolveWebPath } = require('../src/web-protocol.js');

const root = path.resolve('/r');

test('la racine sert index.html', () => {
  assert.equal(resolveWebPath(root, '/'), path.join(root, 'index.html'));
});

test('un fichier du site est résolu sous la racine', () => {
  assert.equal(resolveWebPath(root, '/css/base.css'), path.join(root, 'css', 'base.css'));
});

test('la remontée de dossier est refusée', () => {
  assert.equal(resolveWebPath(root, '/../secret'), null);
});

test('la remontée encodée est refusée', () => {
  assert.equal(resolveWebPath(root, '/%2e%2e/secret'), null);
  assert.equal(resolveWebPath(root, '/css/%2e%2e/%2e%2e/secret'), null);
});

test('un chemin mal encodé est refusé sans exception', () => {
  assert.equal(resolveWebPath(root, '/%E0%A4%A'), null);
});
