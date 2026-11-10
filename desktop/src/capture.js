// Mode « capture » du HUD pendant la saisie rapide : la fenêtre prend le clavier et bloque les clics ;
// à la fermeture elle retrouve exactement son état de base (hudBase = { ignoreMouse, focusable } issus de modes.js).
function setCapture(win, platform, on, hudBase) {
  if (on) {
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.focus();
    return;
  }
  if (hudBase.ignoreMouse) win.setIgnoreMouseEvents(true, hudBase.ignoreMouse);
  else win.setIgnoreMouseEvents(false);
  win.setFocusable(hudBase.focusable);
}

module.exports = { setCapture };
