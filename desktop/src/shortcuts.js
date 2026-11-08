// Raccourcis globaux. Le résultat dit lesquels ont été acceptés (les échecs sont fréquents sous Wayland).
const BINDINGS = [
  ['p', 'Control+Alt+P', 'toggle'],
  ['m', 'Control+Alt+M', 'nextMode'],
  ['a', 'Control+Alt+A', 'quickAdd'],
  ['i', 'Control+Alt+I', 'toggleIsland']
];

function registerShortcuts(globalShortcut, handlers) {
  const result = {};
  for (const [key, accelerator, handlerName] of BINDINGS) {
    try {
      result[key] = !!globalShortcut.register(accelerator, () => handlers[handlerName]());
    } catch (e) {
      result[key] = false;
    }
  }
  return result;
}

module.exports = { registerShortcuts };
