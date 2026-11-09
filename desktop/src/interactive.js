// Interactivité du HUD : la fenêtre laisse passer les clics, sauf au-dessus des zones interactives de la page.
// Windows : on bascule l'ignorance des clics et la page continue de recevoir les mouvements de souris (forward).
// Linux : le renvoi des mouvements n'existe pas, le HUD reste en lecture seule (aucun appel).
function applyInteractive(win, platform, interactive) {
  if (platform !== 'win32') return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
}

module.exports = { applyInteractive };
