// Processus principal : fenêtre unique, protocole app://pcsi/, option --smoke.
const { app, BrowserWindow, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolveWebPath } = require('./web-protocol.js');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const BG = '#090A0F';
const SMOKE = process.argv.includes('--smoke');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

function readApiBase() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    return typeof cfg.apiBase === 'string' ? cfg.apiBase.trim().replace(/\/+$/, '') : '';
  } catch (e) {
    return '';
  }
}

function createWindow() {
  const apiBase = readApiBase();
  const win = new BrowserWindow({
    show: false,
    backgroundColor: BG,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--pcsi-api-base=${apiBase}`, '--pcsi-mode=fullscreen']
    }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('app://pcsi/index.html');

  if (SMOKE) {
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
  return win;
}

app.whenReady().then(() => {
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
  createWindow();
});

app.on('window-all-closed', () => app.quit());
