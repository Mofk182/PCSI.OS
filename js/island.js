// island.js : « île dynamique » du HUD. Pilule repliée en haut au centre ; s'étend pour afficher les modules choisis.
// Déclencheurs : survol (Windows), raccourci Ctrl+Alt+I / --toggle-island, ouverture automatique avant un cours.
// L'interactivité de la fenêtre est gérée par le suivi des zones du HUD (hud-zones.js, zone = [data-hud-zone]) : l'île ne l'appelle pas.
(function () {
  if (typeof window === 'undefined' || !window.pcsiDesktop || !window.IslandModules) return;
  const IM = window.IslandModules;
  const CLOSE_DELAY_MS = 250;     // anti-clignotement au survol
  const AUTO_CLOSE_MS = 8000;
  const REFRESH_MS = 30000;

  let cfg = IM.getIslandConfig({}, window.pcsiDesktop.platform);
  let open = false;
  let pinned = false;             // ouverte par le raccourci : reste ouverte jusqu'au prochain appui
  let hovered = false;
  let closeTimer = null;
  let autoTimer = null;
  let lastAutoKey = null;

  const isHud = () => document.documentElement.dataset.mode === 'hud';
  const el = () => document.getElementById('pcsi-island');

  function context() {
    return {
      state: typeof state !== 'undefined' ? state : { tasks: [] },
      now: new Date(),
      cfg,
      slotsForDate: d => { try { return getDayScheduleSlots(d, (d.getDay() + 6) % 7) || []; } catch (e) { return []; } },
      eveningModel: d => { try { return buildEveningScheduleModel(d, (d.getDay() + 6) % 7); } catch (e) { return null; } }
    };
  }

  function render() {
    const root = el();
    if (!root) return;
    cfg = IM.getIslandConfig(typeof state !== 'undefined' ? state.settings : {}, window.pcsiDesktop.platform);
    const view = IM.selectIslandView(context());
    document.getElementById('island-pill-text').textContent = view.collapsedText;
    const host = document.getElementById('island-sections');
    host.textContent = '';
    // Aucune donnée : on affiche l'heure plutôt qu'une carte vide
    const sections = view.sections.length ? view.sections : [{ id: 'empty', title: "Aujourd'hui", lines: [view.collapsedText] }];
    for (const s of sections) {
      const block = document.createElement('div');
      block.className = 'island-section';
      const title = document.createElement('div');
      title.className = 'island-section-title';
      title.textContent = s.title;
      block.appendChild(title);
      for (const line of s.lines) {
        const row = document.createElement('div');
        row.className = 'island-line';
        row.textContent = line;
        block.appendChild(row);
      }
      host.appendChild(block);
    }
  }

  function setOpen(value) {
    const root = el();
    if (!root) return;
    open = value;
    if (value) render();
    root.dataset.open = String(value);
    root.querySelector('.island-body').setAttribute('aria-expanded', String(value));
  }

  function autoOpen() {
    clearTimeout(autoTimer);
    setOpen(true);
    autoTimer = setTimeout(() => { if (!pinned && !hovered) setOpen(false); }, AUTO_CLOSE_MS);
  }

  function tick() {
    if (!isHud()) return;
    render();
    const c = context();
    const slot = IM.findUpcomingSlot(c, cfg.autoOpenMinutesBeforeClass);
    if (slot) {
      const key = c.now.toDateString() + '|' + (slot.id || slot.start);
      if (key !== lastAutoKey) { lastAutoKey = key; autoOpen(); }
    }
  }

  function init() {
    const root = el();
    if (!root || !isHud()) return;
    render();
    root.addEventListener('mouseenter', () => {
      hovered = true;
      clearTimeout(closeTimer);
      if (cfg.trigger === 'hover' && !pinned) setOpen(true);
    });
    root.addEventListener('mouseleave', () => {
      hovered = false;
      if (cfg.trigger === 'hover' && !pinned) closeTimer = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    });
    window.pcsiDesktop.onToggleIsland(() => {
      clearTimeout(closeTimer);
      pinned = !open;
      setOpen(pinned);
    });
    setInterval(tick, REFRESH_MS);
    tick();
  }

  window.renderIsland = render;
  window.tickIsland = tick;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
