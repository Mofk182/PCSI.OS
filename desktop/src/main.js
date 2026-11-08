// Processus principal : fenêtre unique recréée par mode, icône système, raccourcis, commandes, protocole app://pcsi/.
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, dialog, screen, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveWebPath } = require('./web-protocol.js');
const { buildWindowOptions, canEnterHud, BG } = require('./modes.js');
const { parseArgs, MODES } = require('./cli.js');
const { loadDesktopState, saveDesktopState } = require('./state-store.js');
const { createModeManager, NEXT } = require('./mode-manager.js');
const { buildTrayTemplate } = require('./tray.js');
const { registerShortcuts } = require('./shortcuts.js');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const SMOKE = process.argv.includes('--smoke');
const FLUSH_TIMEOUT_MS = 500;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  let state;
  let stateFile;
  let tray = null;
  let routes = { tray: false, shortcut: false };
  let lastOverlay = 'widget';
  let currentWin = null;
  const cli = parseArgs(process.argv);

  const saveState = () => saveDesktopState(stateFile, state);
  const hudAllowed = () => !state.noTransparency && canEnterHud(routes);

  function readApiBase() {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
      return typeof cfg.apiBase === 'string' ? cfg.apiBase.trim().replace(/\/+$/, '') : '';
    } catch (e) {
      return '';
    }
  }

  function createWindow(mode) {
    const display = screen.getPrimaryDisplay();
    const cfg = buildWindowOptions(mode, {
      platform: process.platform,
      display: { bounds: display.bounds, workArea: display.workArea },
      prefs: { widgetSize: state.widgetSize, widgetPosition: state.widgetPosition, noTransparency: state.noTransparency }
    });
    const win = new BrowserWindow(Object.assign({}, cfg.options, {
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        additionalArguments: [`--pcsi-api-base=${readApiBase()}`, `--pcsi-mode=${cfg.mode}`]
      }
    }));
    // Appliqués après la création (précaution documentée dans la spec : transparent + au-dessus dès la création peut échouer).
    if (cfg.post.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
    if (cfg.post.ignoreMouse) win.setIgnoreMouseEvents(true, cfg.post.ignoreMouse);
    if (cfg.mode === 'fullscreen') win.on('close', () => app.quit());
    if (cfg.mode === 'widget') {
      win.on('moved', () => {
        const [x, y] = win.getPosition();
        state.widgetPosition = { x, y };
        saveState();
      });
    }
    win.webContents.on('did-finish-load', () => win.webContents.send('pcsi:mode-changed', cfg.mode));

    return new Promise((resolve, reject) => {
      win.once('ready-to-show', () => {
        if (cfg.post.maximize) win.maximize();
        win.show();
        currentWin = win;
        resolve(win);
      });
      win.webContents.once('did-fail-load', (_e, code, desc) => reject(new Error(`chargement impossible (${code} ${desc})`)));
      win.loadURL(`app://pcsi/index.html?mode=${cfg.mode}`);
      if (SMOKE) attachSmokeCheck(win);
    });
  }

  function attachSmokeCheck(win) {
    const timer = setTimeout(() => { console.error('smoke: délai dépassé'); app.exit(1); }, 30000);
    win.webContents.once('did-finish-load', async () => {
      try {
        const title = await win.webContents.executeJavaScript('document.title');
        clearTimeout(timer);
        if (title === 'PCSI.OS') { console.log('smoke: OK'); app.exit(0); }
        else { console.error(`smoke: titre inattendu "${title}"`); app.exit(1); }
      } catch (e) {
        console.error(`smoke: ${e.message}`); app.exit(1);
      }
    });
  }

  // Demande à la page d'enregistrer son état avant de la remplacer (500 ms au plus).
  function flush(win) {
    const ask = win.webContents.executeJavaScript("typeof saveState==='function' && (saveState(), true)");
    const timeout = new Promise(resolve => setTimeout(resolve, FLUSH_TIMEOUT_MS));
    return Promise.race([ask, timeout]);
  }

  const manager = createModeManager({
    createWindow,
    flush,
    persist: mode => { state.mode = mode; saveState(); }
  });

  async function requestMode(mode) {
    let effective = mode;
    if (mode === 'hud' && !hudAllowed()) {
      effective = 'widget';
      if (!state.noTransparency) {
        dialog.showMessageBox({
          type: 'info',
          title: 'HUD indisponible',
          message: "Le HUD n'a pas été lancé.",
          detail: "Aucune voie de sortie n'est disponible (icône système ou raccourci clavier). Le widget a été ouvert à la place. La commande « pcsi-os --mode=fullscreen » fonctionne toujours depuis un terminal."
        });
      }
    }
    if (effective !== 'fullscreen') lastOverlay = effective;
    const applied = await manager.setMode(effective);
    refreshTray();
    return applied;
  }

  function nextAllowed(mode) {
    let next = NEXT[mode || 'fullscreen'];
    if (next === 'hud' && !hudAllowed()) next = NEXT[next];
    return next;
  }

  function sendToPage(channel) {
    if (currentWin && !currentWin.isDestroyed()) currentWin.webContents.send(channel);
  }

  function toggleOverlay() {
    const mode = manager.current();
    if (mode === 'widget' || mode === 'hud') {
      if (currentWin.isVisible()) currentWin.hide(); else currentWin.show();
    } else {
      requestMode(lastOverlay);
    }
  }

  const actions = {
    setMode: mode => requestMode(mode),
    setWidget: size => { state.widgetSize = size; saveState(); return requestMode('widget'); },
    nextMode: () => requestMode(nextAllowed(manager.current())),
    toggle: toggleOverlay,
    quickAdd: () => sendToPage('pcsi:quick-add'),
    toggleIsland: () => sendToPage('pcsi:toggle-island'),
    toggleNoTransparency: () => {
      state.noTransparency = !state.noTransparency;
      saveState();
      return requestMode(manager.current() || 'fullscreen');
    },
    quit: () => app.quit()
  };

  function refreshTray() {
    if (!tray) return;
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate(
      { mode: manager.current(), widgetSize: state.widgetSize, noTransparency: state.noTransparency }, actions)));
  }

  function createTray() {
    try {
      const icon = nativeImage.createFromPath(path.join(WEB_ROOT, 'icon.png')).resize({ width: 16, height: 16 });
      tray = new Tray(icon);
      tray.setToolTip('PCSI.OS');
      return true;
    } catch (e) {
      tray = null;
      return false;
    }
  }

  function handleCli(parsed) {
    if (parsed.error) console.error(parsed.error);
    if (parsed.noTransparency && !state.noTransparency) {
      state.noTransparency = true;
      saveState();
    }
    switch (parsed.action) {
      case 'set-mode': return requestMode(parsed.mode);
      case 'next-mode': return actions.nextMode();
      case 'toggle': return actions.toggle();
      case 'quick-add': return actions.quickAdd();
      case 'toggle-island': return actions.toggleIsland();
      case 'quit': return app.quit();
      default: return undefined;
    }
  }

  const trustedSender = e => !!(e.senderFrame && String(e.senderFrame.url).startsWith('app://pcsi/'));

  app.on('second-instance', (_e, argv) => { handleCli(parseArgs(argv)); });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());

  app.whenReady().then(async () => {
    stateFile = path.join(app.getPath('userData'), 'desktop-state.json');
    state = loadDesktopState(stateFile);
    if (cli.noTransparency) state.noTransparency = true;

    protocol.handle('app', async request => {
      const url = new URL(request.url);
      const file = url.host === 'pcsi' ? resolveWebPath(WEB_ROOT, url.pathname) : null;
      if (!file) return new Response('Not found', { status: 404 });
      try {
        return await net.fetch(pathToFileURL(file).toString());
      } catch (e) {
        return new Response('Not found', { status: 404 });
      }
    });

    ipcMain.handle('pcsi:set-mode', (e, mode) => {
      if (!trustedSender(e) || !MODES.includes(mode)) throw new Error('requête refusée');
      return requestMode(mode);
    });
    ipcMain.handle('pcsi:quit', e => { if (trustedSender(e)) app.quit(); });

    if (!SMOKE) {
      routes.tray = createTray();
      const accepted = registerShortcuts(globalShortcut, actions);
      routes.shortcut = Object.values(accepted).some(Boolean);
    }

    const startMode = SMOKE ? 'fullscreen' : (cli.action === 'set-mode' ? cli.mode : state.mode);
    await requestMode(startMode);
    if (!SMOKE && cli.action !== 'set-mode') handleCli(cli);
  });
}
