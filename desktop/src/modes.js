// Options de fenêtre par mode et par plateforme (fonctions pures, testées sans Electron).
const BG = '#090A0F';
const TRANSPARENT = '#00000000';
const MARGIN = 16;
const WIDGET_SIZES = {
  small: { width: 320, height: 420 },
  medium: { width: 360, height: 520 },
  large: { width: 420, height: 680 }
};

// Garde la fenêtre entièrement dans la zone visible ; si elle est plus grande, colle son coin en haut à gauche.
function clampToDisplay(pos, size, area) {
  const maxX = Math.max(area.x + area.width - size.width, area.x);
  const maxY = Math.max(area.y + area.height - size.height, area.y);
  return {
    x: Math.round(Math.min(Math.max(pos.x, area.x), maxX)),
    y: Math.round(Math.min(Math.max(pos.y, area.y), maxY))
  };
}

function widgetConfig(ctx) {
  const { display, prefs } = ctx;
  const size = WIDGET_SIZES[prefs.widgetSize] || WIDGET_SIZES.medium;
  const area = display.workArea;
  const wanted = prefs.widgetPosition || {
    x: area.x + area.width - size.width - MARGIN,
    y: area.y + area.height - size.height - MARGIN
  };
  const pos = clampToDisplay(wanted, size, area);
  return {
    mode: 'widget',
    options: {
      width: size.width,
      height: size.height,
      x: pos.x,
      y: pos.y,
      frame: false,
      transparent: !prefs.noTransparency,
      backgroundColor: prefs.noTransparency ? BG : TRANSPARENT,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      show: false
    },
    post: { alwaysOnTop: true, maximize: false, ignoreMouse: false }
  };
}

function hudConfig(ctx) {
  const b = ctx.display.bounds;
  const win = ctx.platform === 'win32';
  return {
    mode: 'hud',
    options: {
      x: b.x, y: b.y, width: b.width, height: b.height,
      frame: false,
      transparent: true,
      backgroundColor: TRANSPARENT,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: win,
      show: false
    },
    // Windows : les clics traversent mais la page reçoit les mouvements (survol). Linux : lecture seule.
    post: { alwaysOnTop: true, maximize: false, ignoreMouse: { forward: win } }
  };
}

function buildWindowOptions(mode, ctx) {
  if (mode === 'widget') return widgetConfig(ctx);
  if (mode === 'hud') return ctx.prefs.noTransparency ? widgetConfig(ctx) : hudConfig(ctx);
  return {
    mode: 'fullscreen',
    options: { frame: true, transparent: false, backgroundColor: BG, show: false },
    post: { alwaysOnTop: false, maximize: true, ignoreMouse: false }
  };
}

// Un HUD qui laisse passer les clics ne se lance que s'il existe une voie de sortie.
function canEnterHud(routes) {
  return !!(routes && (routes.tray || routes.shortcut));
}

// Écran de lancement : une seule fois par démarrage (première fenêtre), jamais en HUD, désactivable par --no-splash.
function shouldSplash(mode, opts) {
  return !!(opts && opts.firstWindow && !opts.noSplash && mode !== 'hud');
}

module.exports = { buildWindowOptions, clampToDisplay, canEnterHud, shouldSplash, WIDGET_SIZES, BG };
