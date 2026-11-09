const test = require('node:test');
const assert = require('node:assert');
const { createZoneTracker } = require('../../js/hud-zones.js');

test('n\'appelle setInteractive qu\'au changement de zone', () => {
  const calls = [];
  const t = createZoneTracker(b => calls.push(b));
  t.track(false); t.track(true); t.track(true); t.track(false);
  assert.deepEqual(calls, [true, false]);
});

test('en pause, track est sans effet', () => {
  const calls = [];
  const t = createZoneTracker(b => calls.push(b));
  t.setPaused(true);
  t.track(true); t.track(false);
  assert.deepEqual(calls, []);
});

test('à la reprise, l\'état est resynchronisé au prochain mouvement', () => {
  const calls = [];
  const t = createZoneTracker(b => calls.push(b));
  t.track(true);
  t.setPaused(true);
  t.setPaused(false);
  t.track(true);
  assert.deepEqual(calls, [true, true]);
});

test('une valeur non booléenne est normalisée', () => {
  const calls = [];
  const t = createZoneTracker(b => calls.push(b));
  t.track(null); t.track({}); t.track(0);
  assert.deepEqual(calls, [true, false]);
});

test('les modales ouvertes comptent comme zones interactives', () => {
  const { HUD_ZONE_SELECTOR } = require('../../js/hud-zones.js');
  assert.ok(HUD_ZONE_SELECTOR.includes('[data-hud-zone]'));
  assert.ok(HUD_ZONE_SELECTOR.includes('.modal-backdrop.open'));
});
