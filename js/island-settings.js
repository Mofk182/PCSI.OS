// island-settings.js : carte « Île dynamique » dans Portails & Réglages (appli de bureau seulement).
// Tout est modifiable : modules actifs et leur ordre, module replié, déclencheur, ouverture automatique, échéances, compte à rebours.
(function () {
  if (typeof window === 'undefined' || !window.pcsiDesktop || !window.IslandModules) return;
  const IM = window.IslandModules;
  const platform = window.pcsiDesktop.platform;
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const mount = () => document.getElementById('island-settings-mount');
  const current = () => IM.getIslandConfig(state.settings, platform);

  function save(next) {
    state.settings.island = next;
    saveState();
    if (typeof window.renderIsland === 'function') window.renderIsland();
    render();
  }

  function render() {
    const host = mount();
    if (!host) return;
    const cfg = current();
    const unchecked = IM.ISLAND_IDS.filter(id => !cfg.expanded.includes(id));
    const rows = cfg.expanded.concat(unchecked).map(id => {
      const on = cfg.expanded.includes(id);
      const idx = cfg.expanded.indexOf(id);
      return `<div class="island-set-row">
        <label class="island-set-check"><input type="checkbox" data-island-toggle="${id}" ${on ? 'checked' : ''}> ${esc(IM.ISLAND_MODULES[id].label)}</label>
        <span class="island-set-arrows">
          <button type="button" class="btn-ghost" data-island-move="${id}" data-dir="-1" aria-label="Monter" ${on && idx > 0 ? '' : 'disabled'}><i class="ph-bold ph-arrow-up"></i></button>
          <button type="button" class="btn-ghost" data-island-move="${id}" data-dir="1" aria-label="Descendre" ${on && idx < cfg.expanded.length - 1 ? '' : 'disabled'}><i class="ph-bold ph-arrow-down"></i></button>
        </span>
      </div>`;
    }).join('');
    const collapsedOpts = IM.ISLAND_IDS.map(id => `<option value="${id}" ${cfg.collapsed === id ? 'selected' : ''}>${esc(IM.ISLAND_MODULES[id].label)}</option>`).join('');
    const tasks = (state.tasks || []).filter(t => t && !(t.completed === true || t.status === 'done') && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || ''));
    const taskOpts = '<option value="">Aucune</option>' + tasks.map(t => `<option value="${esc(t.id)}" ${String(cfg.countdownTaskId) === String(t.id) ? 'selected' : ''}>${esc(t.title || 'Mission')} (${esc(t.dueDate)})</option>`).join('');
    const linux = platform === 'linux';
    host.innerHTML = `<div class="saas-card island-settings">
      <div class="section-label" style="margin:0 0 6px;">Île dynamique (HUD)</div>
      <p class="island-set-hint">Choisis ce que l'île affiche une fois étendue et dans quel ordre.</p>
      <div class="island-set-list">${rows}</div>
      <label class="island-set-field">Module affiché quand l'île est repliée
        <select class="saas-input" data-island-field="collapsed">${collapsedOpts}</select></label>
      <label class="island-set-field">Déclencheur
        <select class="saas-input" data-island-field="trigger" ${linux ? 'disabled' : ''}>
          <option value="hover" ${cfg.trigger === 'hover' ? 'selected' : ''}>Survol</option>
          <option value="shortcut" ${cfg.trigger === 'shortcut' ? 'selected' : ''}>Raccourci</option>
        </select></label>
      ${linux ? '<p class="island-set-hint">Sous Linux le HUD est en lecture seule : l\'île s\'ouvre par raccourci (Ctrl+Alt+I ou « pcsi-os --toggle-island »).</p>' : '<p class="island-set-hint">Raccourci : Ctrl+Alt+I ou « pcsi-os --toggle-island ».</p>'}
      <label class="island-set-field">Ouverture automatique avant un cours (minutes, 0 = désactivée)
        <input class="saas-input" type="number" min="0" max="120" step="1" data-island-field="autoOpenMinutesBeforeClass" value="${cfg.autoOpenMinutesBeforeClass}"></label>
      <label class="island-set-field">Échéances : nombre de jours pris en compte
        <input class="saas-input" type="number" min="0" max="30" step="1" data-island-field="dueWithinDays" value="${cfg.dueWithinDays}"></label>
      <label class="island-set-field">Mission du compte à rebours
        <select class="saas-input" data-island-field="countdownTaskId">${taskOpts}</select></label>
    </div>`;
  }

  function onChange(e) {
    const t = e.target;
    const cfg = current();
    if (t.dataset.islandToggle) {
      const id = t.dataset.islandToggle;
      const expanded = t.checked ? cfg.expanded.concat(cfg.expanded.includes(id) ? [] : [id]) : cfg.expanded.filter(x => x !== id);
      save(Object.assign({}, cfg, { expanded }));
    } else if (t.dataset.islandField) {
      const field = t.dataset.islandField;
      const value = field === 'countdownTaskId' ? (t.value || null) : (t.type === 'number' ? Number(t.value) : t.value);
      save(Object.assign({}, cfg, { [field]: value }));
    }
  }

  function onClick(e) {
    const b = e.target.closest ? e.target.closest('[data-island-move]') : null;
    if (!b || b.disabled) return;
    const cfg = current();
    const i = cfg.expanded.indexOf(b.dataset.islandMove);
    const j = i + Number(b.dataset.dir);
    if (i < 0 || j < 0 || j >= cfg.expanded.length) return;
    const expanded = cfg.expanded.slice();
    [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
    save(Object.assign({}, cfg, { expanded }));
  }

  function init() {
    const host = mount();
    if (!host) return;
    host.addEventListener('change', onChange);
    host.addEventListener('click', onClick);
    render();
    // La liste des missions du compte à rebours change : on rafraîchit à l'ouverture de l'onglet Portails & Réglages
    const original = window.switchTab;
    if (typeof original === 'function') {
      window.switchTab = function (tab) {
        const result = original.apply(this, arguments);
        if (tab === 'sites') render();
        return result;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
