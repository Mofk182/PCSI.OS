// desktop-bridge.js : liaison entre la page et l'appli de bureau (window.pcsiDesktop). Sans effet sur le site web.
(function () {
  if (typeof window === 'undefined' || !window.pcsiDesktop) return;
  const NEXT = { fullscreen: 'widget', widget: 'hud', hud: 'fullscreen' };

  function init() {
    const modeBtn = document.getElementById('pcsi-mode-btn');
    if (modeBtn) {
      modeBtn.addEventListener('click', () => {
        window.pcsiDesktop.setMode(NEXT[window.pcsiDesktop.getMode()] || 'fullscreen');
      });
    }
    if (typeof window.initAllNavGlides === 'function') window.initAllNavGlides();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
