// hud-zones.js : dans le HUD (fenêtre plein écran dont les clics traversent), rend la fenêtre cliquable
// uniquement quand le pointeur est au-dessus d'une zone marquée [data-hud-zone]. Actif sous Windows.
// Sans effet sur le site web.

// Zones où la fenêtre doit être cliquable : les panneaux de l'appli et toute modale ouverte (montée hors de #app-shell).
const HUD_ZONE_SELECTOR = '[data-hud-zone], .modal-backdrop.open';

// n'appelle setInteractive qu'au changement ; en pause, track est sans effet ;
// à la reprise l'état redevient inconnu, donc le prochain mouvement est toujours transmis (resynchronisation).
function createZoneTracker(setInteractive) {
  let current = false;
  let paused = false;
  return {
    track(inZone) {
      if (paused) return;
      const next = !!inZone;
      if (next !== current) {
        current = next;
        setInteractive(next);
      }
    },
    setPaused(value) {
      paused = !!value;
      if (!paused) current = null;
    }
  };
}

(function initHudZones() {
  if (typeof window === 'undefined' || !window.pcsiDesktop) return;
  const active = document.documentElement.dataset.mode === 'hud' && window.pcsiDesktop.platform === 'win32';
  // Hors HUD ou sous Linux, le suivi est un faux qui ne fait rien : le code appelant n'a pas à tester le mode.
  const tracker = createZoneTracker(active ? (b => { window.pcsiDesktop.setInteractive(b); }) : (() => {}));
  window.pcsiHudZones = tracker;
  if (!active) return;
  document.addEventListener('pointermove', e => {
    tracker.track(!!(e.target && e.target.closest && e.target.closest(HUD_ZONE_SELECTOR)));
  }, { passive: true });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { createZoneTracker, HUD_ZONE_SELECTOR };
