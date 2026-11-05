// state.js : objet state global, chargement et sauvegarde locale

let state = {
  activeTab: 'cahier', sidebarCollapsed: false, cahierMode: 'table', cahierSubjFilter: 'all', postitSubjFilter: 'all', postitTypeFilter: 'all',
  errorTypes: JSON.parse(JSON.stringify(DEFAULT_ERROR_TYPES)), portals: [], tasks: [], schedule: [], postits: [],
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  subjectOverrides: {},  // { [subjectId]: { name?, short?, color? } } — les id de matières ne changent jamais
  eveningPlan: {}        // { 'YYYY-MM-DD': { order: [taskId], manual: { [taskId]: 'HH:MM' } } } (Étape 3)
};

/* Schéma des tâches (state.tasks[]) — champs optionnels, lus via getters, sans migration :
   weight   : 1 | 1.5 | 2 (absent = 1)
   pipeline : { enabled: bool, steps: [{ id, label, dueDate:'YYYY-MM-DD', done: bool }] } avec 2 ou 3 étapes (absent = désactivé) */
function getTaskWeight(t) { const w = parseFloat(t && t.weight); return IMPORTANCE_LEVELS.indexOf(w) !== -1 ? w : 1; }
function getTaskPipeline(t) {
  const p = t && t.pipeline;
  if (!isPlainObject(p) || !p.enabled || !Array.isArray(p.steps) || p.steps.length < 2 || p.steps.length > 3) return null;
  return p;
}

function sanitizeSettings(s) {
  s.tension.deadlineBalance = clampNum(Math.round(s.tension.deadlineBalance), 0, 100);
  s.tension.dsMultiplier = clampNum(s.tension.dsMultiplier, 1, 3);
  s.tension.dsWindowDays = clampNum(Math.round(s.tension.dsWindowDays), 1, 21);
  if (s.tasks.sortMode !== 'tension' && s.tasks.sortMode !== 'deadline') s.tasks.sortMode = DEFAULT_SETTINGS.tasks.sortMode;
  const ev = s.evening, dv = DEFAULT_SETTINGS.evening;
  ['minStart', 'fallbackStart', 'endTime'].forEach(k => { if (!isTimeStr(ev[k])) ev[k] = dv[k]; });
  ev.breakMin = clampNum(Math.round(ev.breakMin), 0, 60);
  ev.meals = ev.meals.filter(m => isPlainObject(m) && isTimeStr(m.start) && isTimeStr(m.end) && m.start < m.end)
    .map((m, i) => ({ id: String(m.id || 'meal_' + i), label: String(m.label || 'Repas').slice(0, 30), start: m.start, end: m.end }));
  return s;
}

// Applique state.subjectOverrides sur SUBJECTS (mutation en place : toutes les lectures existantes restent valides)
function applySubjectOverrides() {
  const ov = isPlainObject(state.subjectOverrides) ? state.subjectOverrides : {};
  Object.keys(SUBJECTS_DEFAULT).forEach(id => {
    const base = SUBJECTS_DEFAULT[id], o = isPlainObject(ov[id]) ? ov[id] : {};
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 30) : '';
    const short = typeof o.short === 'string' ? o.short.trim().slice(0, 12) : '';
    Object.assign(SUBJECTS[id], {
      name: name || base.name,
      short: short || (name ? name.toUpperCase().slice(0, 12) : base.short),
      color: (typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color)) ? o.color : base.color
    });
  });
}

// À appeler après tout chargement externe de state (localStorage, pull Supabase, import JSON)
function normalizeState() {
  state.settings = sanitizeSettings(mergeDefaults(DEFAULT_SETTINGS, state.settings));
  if (!isPlainObject(state.subjectOverrides)) state.subjectOverrides = {};
  if (!isPlainObject(state.eveningPlan)) state.eveningPlan = {};
  applySubjectOverrides();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { 
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed); 
      if (!state.errorTypes || !state.errorTypes.length) state.errorTypes = JSON.parse(JSON.stringify(DEFAULT_ERROR_TYPES));
      if (!Array.isArray(parsed.portals)) state.portals = JSON.parse(JSON.stringify(DEFAULT_PORTALS));
    } else {
      state.portals = JSON.parse(JSON.stringify(DEFAULT_PORTALS));
    }
    const rawSupa = localStorage.getItem(SUPA_KEY);
    if (rawSupa) supaConfig = Object.assign(supaConfig, JSON.parse(rawSupa));
    syncDirty = localStorage.getItem(DIRTY_KEY) === '1';
  } catch (e) {
    state.portals = JSON.parse(JSON.stringify(DEFAULT_PORTALS));
  }
  normalizeState();
  lastDataSig = dataSig(); updateSyncIndicator(); renderPortals();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  const sig = dataSig();
  if (sig !== lastDataSig) {
    lastDataSig = sig; syncVersion++; syncDirty = true;
    try { localStorage.setItem(DIRTY_KEY, '1'); } catch (e) {}
    if (supaConfigured()) { clearTimeout(pushTimer); pushTimer = setTimeout(pushToSupabase, 700); }
  }
  updateSyncIndicator();
}


