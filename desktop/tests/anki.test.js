const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { callAnki, ALLOWED_ACTIONS } = require('../src/anki.js');

const reply = body => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });

test('la liste blanche correspond exactement aux actions appelées par js/daily_drop.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'daily_drop.js'), 'utf8');
  const used = [...new Set([...src.matchAll(/invokeAnkiConnect\('([A-Za-z]+)'/g)].map(m => m[1]))].sort();
  assert.deepEqual([...ALLOWED_ACTIONS].sort(), used);
});

test('une action hors liste est refusée sans aucun appel réseau', async () => {
  let calls = 0;
  await assert.rejects(
    () => callAnki(async () => { calls++; return reply({}); }, 'deleteNotes', { notes: [1] }),
    e => e.code === 'forbidden'
  );
  assert.equal(calls, 0);
});

test('une action autorisée part en POST vers 127.0.0.1:8765 avec version 6 et renvoie result', async () => {
  let seen;
  const out = await callAnki(async (url, init) => {
    seen = { url, method: init.method, body: JSON.parse(init.body) };
    return reply({ result: ['Basic', 'Basique'], error: null });
  }, 'modelNames', {});
  assert.deepEqual(out, ['Basic', 'Basique']);
  assert.equal(seen.url, 'http://127.0.0.1:8765');
  assert.equal(seen.method, 'POST');
  assert.deepEqual(seen.body, { action: 'modelNames', version: 6, params: {} });
});

test('Anki fermé (fetch rejette) : unreachable', async () => {
  await assert.rejects(
    () => callAnki(async () => { throw new Error('ECONNREFUSED'); }, 'modelNames', {}),
    e => e.code === 'unreachable' && /Anki/.test(e.message)
  );
});

test('Anki qui ne répond pas : timeout au bout du délai', async () => {
  const hang = (url, init) => new Promise((_, rej) => {
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const t0 = Date.now();
  await assert.rejects(() => callAnki(hang, 'modelNames', {}, { timeoutMs: 60 }), e => e.code === 'timeout');
  assert.ok(Date.now() - t0 < 1000);
});

test('une réponse avec error (carte en double) : anki-error avec le message d\'Anki', async () => {
  await assert.rejects(
    () => callAnki(async () => reply({ result: null, error: 'cannot create note because it is a duplicate' }), 'addNote', { note: {} }),
    e => e.code === 'anki-error' && e.message === 'cannot create note because it is a duplicate'
  );
});

test('une réponse illisible : unreachable, sans exception brute', async () => {
  await assert.rejects(() => callAnki(async () => reply('<html>pas du JSON'), 'modelNames', {}), e => e.code === 'unreachable');
});
