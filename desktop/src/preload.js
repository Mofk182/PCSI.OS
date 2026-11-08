// Pont minimal exposé à la page : window.pcsiDesktop (contextIsolation activé, sandbox activé).
const { contextBridge } = require('electron');

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

const apiBase = argValue('pcsi-api-base') || null;

contextBridge.exposeInMainWorld('pcsiDesktop', {
  platform: process.platform,
  apiBase,
  getMode: () => argValue('pcsi-mode') || 'fullscreen'
});
