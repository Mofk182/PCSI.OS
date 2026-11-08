// Modèle du menu de l'icône système (construit sans Electron pour être testable).
const SIZES = [['small', 'Widget (petit)'], ['medium', 'Widget (moyen)'], ['large', 'Widget (grand)']];

function buildTrayTemplate(state, handlers) {
  return [
    { label: 'Plein écran', type: 'radio', checked: state.mode === 'fullscreen', click: () => handlers.setMode('fullscreen') },
    ...SIZES.map(([size, label]) => ({
      label, type: 'radio', checked: state.mode === 'widget' && state.widgetSize === size, click: () => handlers.setWidget(size)
    })),
    { label: 'HUD', type: 'radio', checked: state.mode === 'hud', click: () => handlers.setMode('hud') },
    { type: 'separator' },
    { label: 'Saisie rapide', click: () => handlers.quickAdd() },
    { label: 'Fond opaque', type: 'checkbox', checked: !!state.noTransparency, click: () => handlers.toggleNoTransparency() },
    { type: 'separator' },
    { label: 'Quitter', click: () => handlers.quit() }
  ];
}

module.exports = { buildTrayTemplate };
