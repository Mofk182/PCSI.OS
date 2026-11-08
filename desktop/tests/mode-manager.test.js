const test = require('node:test');
const assert = require('node:assert');
const { createModeManager } = require('../src/mode-manager.js');

function harness(opts = {}) {
  const events = [];
  let counter = 0;
  const live = new Set();
  const deps = {
    async createWindow(mode) {
      if (opts.failOn === mode) throw new Error('création impossible');
      await new Promise(r => setTimeout(r, opts.delay || 0));
      const win = { id: `${mode}#${++counter}`, mode };
      win.destroy = () => { live.delete(win); events.push(`destroy:${win.id}`); };
      live.add(win);
      events.push(`shown:${win.id}`);
      return win;
    },
    async flush(win) { events.push(`flush:${win.id}`); },
    persist(mode) { events.push(`persist:${mode}`); }
  };
  return { events, live, manager: createModeManager(deps) };
}

test('le premier setMode crée la fenêtre sans rien détruire', async () => {
  const { manager, events, live } = harness();
  assert.equal(await manager.setMode('widget'), 'widget');
  assert.equal(manager.current(), 'widget');
  assert.equal(live.size, 1);
  assert.deepEqual(events, ['shown:widget#1', 'persist:widget']);
});

test('l\'ancienne fenêtre est sauvegardée, puis détruite après l\'affichage de la nouvelle', async () => {
  const { manager, events } = harness();
  await manager.setMode('fullscreen');
  events.length = 0;
  await manager.setMode('hud');
  assert.deepEqual(events, ['flush:fullscreen#1', 'shown:hud#2', 'destroy:fullscreen#1', 'persist:hud']);
});

test('deux changements lancés sans attendre : le dernier gagne, une seule fenêtre vivante', async () => {
  const { manager, live } = harness({ delay: 5 });
  await manager.setMode('fullscreen');
  const a = manager.setMode('hud');
  const b = manager.setMode('widget');
  await Promise.all([a, b]);
  assert.equal(manager.current(), 'widget');
  assert.equal(live.size, 1);
  assert.equal([...live][0].mode, 'widget');
});

test('createWindow qui échoue : l\'ancienne fenêtre reste, le mode courant ne change pas', async () => {
  const { manager, live } = harness({ failOn: 'hud' });
  await manager.setMode('widget');
  await assert.rejects(() => manager.setMode('hud'), /création impossible/);
  assert.equal(manager.current(), 'widget');
  assert.equal(live.size, 1);
  assert.equal(await manager.setMode('fullscreen'), 'fullscreen');
});

test('nextMode enchaîne plein écran, widget, HUD, plein écran', async () => {
  const { manager } = harness();
  await manager.setMode('fullscreen');
  assert.equal(await manager.nextMode(), 'widget');
  assert.equal(await manager.nextMode(), 'hud');
  assert.equal(await manager.nextMode(), 'fullscreen');
});

test('nextMode avant tout changement part du plein écran', async () => {
  const { manager } = harness();
  assert.equal(await manager.nextMode(), 'widget');
});

test('un échec de flush n\'empêche pas le changement', async () => {
  const events = [];
  let n = 0;
  const manager = createModeManager({
    async createWindow(mode) { const w = { id: `${mode}${++n}`, destroy() { events.push(`destroy:${this.id}`); } }; return w; },
    async flush() { throw new Error('page injoignable'); },
    persist() {}
  });
  await manager.setMode('fullscreen');
  assert.equal(await manager.setMode('widget'), 'widget');
  assert.deepEqual(events, ['destroy:fullscreen1']);
});
