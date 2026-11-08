const test = require('node:test');
const assert = require('node:assert');
const { buildTrayTemplate } = require('../src/tray.js');

const handlers = () => {
  const calls = [];
  const h = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  return { h, calls };
};
const labels = tpl => tpl.filter(i => i.type !== 'separator').map(i => i.label);

test('libellés dans l\'ordre de la spec', () => {
  const { h } = handlers();
  const tpl = buildTrayTemplate({ mode: 'fullscreen', widgetSize: 'medium', noTransparency: false }, h);
  assert.deepEqual(labels(tpl), ['Plein écran', 'Widget (petit)', 'Widget (moyen)', 'Widget (grand)', 'HUD', 'Saisie rapide', 'Fond opaque', 'Quitter']);
});

test('le mode et la taille courants sont cochés', () => {
  const { h } = handlers();
  const tpl = buildTrayTemplate({ mode: 'widget', widgetSize: 'large', noTransparency: false }, h);
  const checked = tpl.filter(i => i.checked).map(i => i.label);
  assert.deepEqual(checked, ['Widget (grand)']);
});

test('la case « Fond opaque » reflète l\'état', () => {
  const { h } = handlers();
  const on = buildTrayTemplate({ mode: 'hud', widgetSize: 'medium', noTransparency: true }, h).find(i => i.label === 'Fond opaque');
  const off = buildTrayTemplate({ mode: 'hud', widgetSize: 'medium', noTransparency: false }, h).find(i => i.label === 'Fond opaque');
  assert.equal(on.type, 'checkbox');
  assert.equal(on.checked, true);
  assert.equal(off.checked, false);
});

test('chaque entrée appelle le bon gestionnaire', () => {
  const { h, calls } = handlers();
  const tpl = buildTrayTemplate({ mode: 'fullscreen', widgetSize: 'medium', noTransparency: false }, h);
  const click = label => tpl.find(i => i.label === label).click();
  click('Plein écran'); click('Widget (petit)'); click('HUD'); click('Saisie rapide'); click('Fond opaque'); click('Quitter');
  assert.deepEqual(calls, [['setMode', 'fullscreen'], ['setWidget', 'small'], ['setMode', 'hud'], ['quickAdd'], ['toggleNoTransparency'], ['quit']]);
});
