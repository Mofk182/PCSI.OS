// Analyse des arguments de ligne de commande (premier lancement et second-instance).
const MODES = ['fullscreen', 'widget', 'hud'];
const FLAG_ACTIONS = {
  '--toggle': 'toggle',
  '--next-mode': 'next-mode',
  '--quick-add': 'quick-add',
  '--toggle-island': 'toggle-island',
  '--quit': 'quit'
};

function parseArgs(argv) {
  const result = { action: 'none', noTransparency: false };
  for (const arg of argv || []) {
    if (arg === '--no-transparency') {
      result.noTransparency = true;
    } else if (Object.prototype.hasOwnProperty.call(FLAG_ACTIONS, arg)) {
      result.action = FLAG_ACTIONS[arg];
    } else if (arg.startsWith('--mode=')) {
      const mode = arg.slice('--mode='.length);
      if (MODES.includes(mode)) {
        result.action = 'set-mode';
        result.mode = mode;
      } else {
        result.action = 'none';
        delete result.mode;
        result.error = `Mode inconnu : ${mode}`;
      }
    }
  }
  return result;
}

module.exports = { parseArgs, MODES };
