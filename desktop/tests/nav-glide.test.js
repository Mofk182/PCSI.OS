const test = require('node:test');
const assert = require('node:assert');
const { computeGlideRect } = require('../../js/nav-glide.js');

test('position du cadre relative au conteneur', () => {
  assert.deepEqual(
    computeGlideRect({ left: 140, top: 10, width: 90, height: 36 }, { left: 100, top: 0 }),
    { x: 40, y: 10, width: 90, height: 36 }
  );
});

test('un élément masqué (largeur 0) donne une largeur 0, sans NaN', () => {
  const r = computeGlideRect({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0 });
  assert.deepEqual(r, { x: 0, y: 0, width: 0, height: 0 });
});

test('des valeurs absentes ou non numériques deviennent 0', () => {
  const r = computeGlideRect({ left: undefined, top: NaN, width: 'abc', height: null }, { left: 5, top: 5 });
  for (const v of Object.values(r)) assert.equal(Number.isFinite(v), true);
});
