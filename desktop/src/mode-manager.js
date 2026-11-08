// Une seule fenêtre active : chaque changement de mode crée la nouvelle fenêtre, l'affiche, puis détruit l'ancienne.
// Les changements sont exécutés l'un après l'autre (file) : le dernier demandé gagne.
const NEXT = { fullscreen: 'widget', widget: 'hud', hud: 'fullscreen' };

function createModeManager(deps) {
  let win = null;
  let currentMode = null;
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  }

  async function switchTo(mode) {
    if (win) {
      try { await deps.flush(win); } catch (e) { /* page injoignable : on bascule quand même */ }
    }
    const next = await deps.createWindow(mode);   // résolu une fois la nouvelle fenêtre affichée
    const old = win;
    win = next;
    currentMode = mode;
    if (old) old.destroy();
    deps.persist(mode);
    return mode;
  }

  return {
    setMode: mode => enqueue(() => switchTo(mode)),
    nextMode: () => enqueue(() => switchTo(NEXT[currentMode || 'fullscreen'])),
    current: () => currentMode
  };
}

module.exports = { createModeManager, NEXT };
