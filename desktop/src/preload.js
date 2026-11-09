// Pont minimal exposé à la page : window.pcsiDesktop (contextIsolation activé, sandbox activé).
const { contextBridge, ipcRenderer } = require('electron');

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

const apiBase = argValue('pcsi-api-base') || null;

contextBridge.exposeInMainWorld('pcsiDesktop', {
  platform: process.platform,
  apiBase,
  getMode: () => argValue('pcsi-mode') || 'fullscreen',
  setMode: mode => ipcRenderer.invoke('pcsi:set-mode', mode),
  onModeChange: cb => { ipcRenderer.on('pcsi:mode-changed', (_e, mode) => cb(mode)); },
  setInteractive: interactive => ipcRenderer.invoke('pcsi:set-interactive', interactive === true),
  quit: () => ipcRenderer.invoke('pcsi:quit')
});
