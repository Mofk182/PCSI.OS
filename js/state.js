// state.js : objet state global, chargement, normalisation, matières dynamiques et réglages

let state = {
  activeTab: 'cahier',
  sidebarCollapsed: false,
  cahierMode: 'table',
  cahierSubjFilter: 'all',
  postitSubjFilter: 'all',
  postitTypeFilter: 'all',
  agendaSubTab: 'academic',
  errorTypes: JSON.parse(JSON.stringify(DEFAULT_ERROR_TYPES)),
  portals: [],
  subjects: JSON.parse(JSON.stringify(DEFAULT_SUBJECTS)),
  taskTypes: JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES)),
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  eveningPlan: {
    manualOrder: [],
    excludedIds: [],
    customDurations: {},
    pinnedEveningIds: [],
    naps: {}
  },
  tasks: [],
  schedule: [],
  scheduleDocs: [],
  postits: []
};

function syncSubjectsWithState() {
  if (!state.subjects || typeof state.subjects !== 'object' || Object.keys(state.subjects).length === 0) {
    state.subjects = JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
  }
  Object.keys(SUBJECTS).forEach(k => delete SUBJECTS[k]);
  Object.entries(state.subjects).forEach(([k, v]) => {
    if (v && v.id && v.name) {
      SUBJECTS[k] = {
        id: v.id,
        name: v.name,
        short: (v.short || v.name.slice(0, 6)).toUpperCase(),
        color: v.color || '#3B82F6',
        builtin: !!DEFAULT_SUBJECTS[k]
      };
    }
  });
}

function syncTaskTypesWithState() {
  if (!state.taskTypes || typeof state.taskTypes !== 'object' || Object.keys(state.taskTypes).length === 0) {
    state.taskTypes = JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES));
  }
  Object.keys(TASK_TYPES).forEach(k => delete TASK_TYPES[k]);
  Object.entries(state.taskTypes).forEach(([k, v]) => {
    if (v && (v.id || k) && v.label) {
      const id = v.id || k;
      const color = v.color || '#38BDF8';
      const defMult = parseFloat(v.defaultMult);
      TASK_TYPES[id] = {
        id,
        label: String(v.label).trim(),
        color,
        bg: v.bg || hexToRgba(color, 0.15),
        border: v.border || hexToRgba(color, 0.38),
        icon: v.icon || 'ph-pencil-line',
        defaultMult: (Number.isFinite(defMult) && defMult >= 0.1 && defMult <= 5.0)
          ? Number(defMult.toFixed(2))
          : (DEFAULT_TYPE_MULTIPLIERS[id] || 1.0)
      };
    }
  });
  if (Object.keys(TASK_TYPES).length === 0) {
    state.taskTypes = JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES));
    Object.assign(TASK_TYPES, JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES)));
  }
}

function normalizeSettingsState() {
  const incomingSettings = state.settings || {};
  const incomingMults = incomingSettings.typeMultipliers || {};
  state.settings = Object.assign({}, DEFAULT_SETTINGS, incomingSettings);
  state.settings.typeMultipliers = Object.assign({}, DEFAULT_TYPE_MULTIPLIERS, incomingMults);
  Object.keys(TASK_TYPES).forEach(k => {
    const v = parseFloat(state.settings.typeMultipliers[k]);
    const fallback = (TASK_TYPES[k] && Number.isFinite(TASK_TYPES[k].defaultMult))
      ? TASK_TYPES[k].defaultMult
      : (DEFAULT_TYPE_MULTIPLIERS[k] || 1.0);
    state.settings.typeMultipliers[k] = (Number.isFinite(v) && v >= 0.1 && v <= 5.0)
      ? Number(v.toFixed(2))
      : fallback;
  });

  const a = parseFloat(state.settings.alpha);
  state.settings.alpha = Number.isFinite(a) ? Math.min(0.95, Math.max(0.05, Number(a.toFixed(2)))) : DEFAULT_SETTINGS.alpha;
  state.settings.beta = Number((1 - state.settings.alpha).toFixed(2));
  const boost = parseFloat(state.settings.dsBoostFactor);
  state.settings.dsBoostFactor = Number.isFinite(boost) ? Math.min(2.5, Math.max(1.0, Number(boost.toFixed(2)))) : DEFAULT_SETTINGS.dsBoostFactor;
  state.settings.autoDsBoost = state.settings.autoDsBoost !== false;
  state.settings.tomorrowFirst = state.settings.tomorrowFirst !== false;
  state.settings.sortMode = state.settings.sortMode === 'deadline' ? 'deadline' : 'tension';
  state.settings.dinnerStart = state.settings.dinnerStart || '19:00';
  state.settings.dinnerEnd = state.settings.dinnerEnd || '20:00';
  state.settings.bedtime = state.settings.bedtime || '23:00';
  state.settings.defaultClassEnd = state.settings.defaultClassEnd || '17:30';
  const buf = parseInt(state.settings.commuteBufferMin, 10);
  state.settings.commuteBufferMin = Number.isFinite(buf) ? Math.min(120, Math.max(0, buf)) : 30;
  const rawDeck = String(state.settings.ankiDeck || '').trim();
  state.settings.ankiDeck = rawDeck || 'PCSI::Vocabulaire';

  if (!state.eveningPlan || typeof state.eveningPlan !== 'object') {
    state.eveningPlan = { manualOrder: [], excludedIds: [], customDurations: {}, pinnedEveningIds: [], naps: {}, canvasAddedByDay: {} };
  }
  if (!Array.isArray(state.eveningPlan.manualOrder)) state.eveningPlan.manualOrder = [];
  if (!Array.isArray(state.eveningPlan.excludedIds)) state.eveningPlan.excludedIds = [];
  if (!Array.isArray(state.eveningPlan.pinnedEveningIds)) state.eveningPlan.pinnedEveningIds = [];
  if (!state.eveningPlan.customDurations || typeof state.eveningPlan.customDurations !== 'object') {
    state.eveningPlan.customDurations = {};
  }
  if (!state.eveningPlan.naps || typeof state.eveningPlan.naps !== 'object' || Array.isArray(state.eveningPlan.naps)) {
    state.eveningPlan.naps = {};
  }
  if (!state.eveningPlan.canvasAddedByDay || typeof state.eveningPlan.canvasAddedByDay !== 'object' || Array.isArray(state.eveningPlan.canvasAddedByDay)) {
    state.eveningPlan.canvasAddedByDay = {};
  }
  if (!Array.isArray(state.scheduleDocs)) {
    state.scheduleDocs = [];
  }
}

function inferTaskTypeFromTitle(title) {
  const defaultType = TASK_TYPES[DEFAULT_TASK_TYPE] ? DEFAULT_TASK_TYPE : (Object.keys(TASK_TYPES)[0] || 'Exercice');
  if (!title) return defaultType;
  const clean = title.trim();
  for (const t of Object.values(TASK_TYPES)) {
    const escaped = String(t.label || t.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped && new RegExp('^' + escaped + '\\b', 'i').test(clean)) {
      return t.id;
    }
  }
  if (TASK_TYPES.DS && /\b(ds|devoir\s+surveill[eé]|concours\s+blanc)\b/i.test(clean)) return 'DS';
  if (TASK_TYPES.TD && /^td\b/i.test(clean)) return 'TD';
  if (TASK_TYPES.DM && /^dm\b/i.test(clean)) return 'DM';
  if (TASK_TYPES.Exercice && /^(exo|exercice)s?\b/i.test(clean)) return 'Exercice';
  if (TASK_TYPES.Colle && /^(colle|kh[ôo]lle)\b/i.test(clean)) return 'Colle';
  if (TASK_TYPES.TP && /^tp\b/i.test(clean)) return 'TP';
  if (TASK_TYPES['Révision'] && /^r[ée]vision/i.test(clean)) return 'Révision';
  if (TASK_TYPES.Cours && /^cours\b/i.test(clean)) return 'Cours';
  return defaultType;
}

function inferSubjectFromText(text) {
  if (!text) return null;
  const norm = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const s of Object.values(SUBJECTS)) {
    const sName = String(s.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const sShort = String(s.short || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (sName && norm.includes(sName)) return s.id;
    if (sShort && sShort.length >= 2 && new RegExp('\\b' + sShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(norm)) {
      return s.id;
    }
  }
  if (/\b(math|maths|mathematiques|algebre|analyse)\b/.test(norm) && SUBJECTS.maths) return 'maths';
  if (/\b(physique|phys|mecanique|optique|thermo|elec)\b/.test(norm) && SUBJECTS.physique) return 'physique';
  if (/\b(chimie|orga|atomistique)\b/.test(norm) && SUBJECTS.chimie) return 'chimie';
  if (/\b(sii|si|ingenieur|automatique|cinematique)\b/.test(norm)) {
    if (SUBJECTS.si) return 'si';
    if (SUBJECTS.sii) return 'sii';
  }
  if (/\b(info|informatique|python|sql|algo)\b/.test(norm) && SUBJECTS.info) return 'info';
  if (/\b(anglais|english|lv1)\b/.test(norm) && SUBJECTS.anglais) return 'anglais';
  if (/\b(francais|philo|philosophie|lettres|dissertation)\b/.test(norm) && SUBJECTS.francais) return 'francais';
  return null;
}

function computeStaggeredPhaseDates(count, finalDueDateISO) {
  const n = Math.max(1, parseInt(count, 10) || 1);
  const todayStr = formatDateISO(new Date());
  const todayObj = new Date(todayStr + 'T00:00:00');

  let targetISO = finalDueDateISO;
  if (!targetISO || isNaN(new Date(targetISO + 'T00:00:00').getTime())) {
    targetISO = getOffsetDateISO(Math.max(2, n * 2 - 1));
  }
  const targetObj = new Date(targetISO + 'T00:00:00');
  const diffDays = Math.round((targetObj - todayObj) / 86400000);

  if (n === 1) return [targetISO];

  // Si l'échéance finale est très proche ou aujourd'hui, étaler à partir d'aujourd'hui (ex: J+0, J+1, J+2...) ou répartir entre aujourd'hui et l'échéance finale
  if (diffDays <= 0) {
    // Si l'échéance est aujourd'hui ou passée, étaler les passes sur les jours qui viennent (J+0, J+1, J+2...) pour lisser la charge
    return Array.from({ length: n }, (_, idx) => getOffsetDateISO(idx));
  }

  if (diffDays < n - 1) {
    // Pas assez de jours avant l'échéance finale : étaler d'aujourd'hui jusqu'à J+(n-1)
    return Array.from({ length: n }, (_, idx) => getOffsetDateISO(idx));
  }

  // Répartir uniformément les jalons entre aujourd'hui (ou demain si diffDays >= n) et la date finale
  const startOffset = diffDays >= n ? 1 : 0;
  const span = Math.max(1, diffDays - startOffset);
  return Array.from({ length: n }, (_, idx) => {
    if (idx === n - 1) return targetISO;
    const dayOffset = startOffset + Math.round((idx * span) / (n - 1));
    return getOffsetDateISO(dayOffset);
  });
}

function buildDefaultPipelinePhases(totalDuration, phaseCount = 3, taskType = 'Exercice', mode = 'auto', finalDueDateISO = null) {
  const count = Math.max(1, Math.min(10, parseInt(phaseCount, 10) || 3));
  const dur = Math.max(0.25 * count, parseFloat(totalDuration) || 1.5);
  const typeStr = String(taskType || '').toLowerCase();

  // Calcul d'une durée équilibrée par sous-mission (arrondie au quart d'heure : 0.25h)
  const rawStep = dur / count;
  const stepDur = Math.max(0.25, Math.round(rawStep * 4) / 4);

  const getStepDuration = (idx) => {
    if (idx < count - 1) return stepDur;
    const used = stepDur * (count - 1);
    return Math.max(0.25, Number(Math.max(0.25, dur - used).toFixed(2)));
  };

  const staggeredDates = computeStaggeredPhaseDates(count, finalDueDateISO);

  // Mode répétition explicite (ex: "Faire 2x / 3x / 4x" : Apprendre mon cours, refaire ses exos...)
  if (mode === 'repeat') {
    const ordinals = ['1re passe', '2e passe', '3e passe', '4e passe', '5e passe', '6e passe', '7e passe', '8e passe', '9e passe', '10e passe'];
    return Array.from({ length: count }, (_, idx) => ({
      id: 'ph_' + (idx + 1),
      title: ordinals[idx] || `Séance ${idx + 1}`,
      duration: getStepDuration(idx),
      dueDate: staggeredDates[idx] || null,
      done: false
    }));
  }

  // Modèles intelligents selon le type de mission
  let titles = [];
  if (typeStr === 'cours' || typeStr === 'révision' || typeStr === 'revision') {
    if (count === 2) {
      titles = ['1re passe : Lecture & compréhension', '2e passe : Mémorisation active & récitation'];
    } else if (count === 3) {
      titles = ['1re passe : Lecture & compréhension', '2e passe : Fiche / Démonstrations clés', '3e passe : Récitation active (feuille blanche)'];
    } else if (count === 4) {
      titles = ['1re passe : Lecture & compréhension', '2e passe : Apprentissage théorèmes & démos', '3e passe : Récitation feuille blanche', '4e passe : Réactivation J+3 / Flashcards'];
    }
  } else if (typeStr === 'colle' || typeStr === 'kholle') {
    if (count === 2) {
      titles = ['Étape 1 : Cours & questions de cours', 'Étape 2 : Démos & exercices types'];
    } else if (count === 3) {
      titles = ['Étape 1 : Questions de cours & définitions', 'Étape 2 : Démonstrations au programme', 'Étape 3 : Exercices types & méthodes'];
    }
  } else if (typeStr === 'td' || typeStr === 'exercice') {
    if (count === 2) {
      titles = ['Partie 1 : Exercices d\'application', 'Partie 2 : Exercices d\'approfondissement'];
    } else if (count === 3) {
      titles = ['Partie 1 : Exos d\'application directe', 'Partie 2 : Exos classiques / méthodes', 'Partie 3 : Reprise des erreurs & bilan'];
    }
  } else if (typeStr === 'tp') {
    if (count === 2) {
      titles = ['Étape 1 : Lecture protocole & préparation', 'Étape 2 : Exploitation & compte-rendu'];
    } else if (count === 3) {
      titles = ['Étape 1 : Préparation théorique', 'Étape 2 : Manipulations / Mesures', 'Étape 3 : Compte-rendu & incertitudes'];
    }
  } else if (typeStr === 'ds') {
    if (count === 2) {
      titles = ['Étape 1 : Maîtrise du cours & méthodes', 'Étape 2 : Annales & sujets types'];
    } else if (count === 3) {
      titles = ['Étape 1 : Révision du cours & formulaires', 'Étape 2 : Reprise des TD & erreurs (Post-its)', 'Étape 3 : Entraînement sujet type / Annale'];
    }
  } else if (typeStr === 'dm') {
    if (count === 2) {
      titles = ['Phase 1 : Recherche & Brouillon', 'Phase 2 : Résolution & Rédaction'];
    } else if (count === 3) {
      titles = ['Phase 1 : Recherche / Brouillon', 'Phase 2 : Résolution', 'Phase 3 : Rédaction propre'];
    }
  }

  return Array.from({ length: count }, (_, idx) => ({
    id: 'ph_' + (idx + 1),
    title: titles[idx] || `Sous-mission ${idx + 1}`,
    duration: getStepDuration(idx),
    dueDate: staggeredDates[idx] || null,
    done: false
  }));
}

function normalizeTasksState() {
  if (!Array.isArray(state.tasks)) state.tasks = [];
  state.tasks.forEach(t => {
    if (!t.type || !TASK_TYPES[t.type]) {
      const matched = t.type ? Object.keys(TASK_TYPES).find(k => k.toLowerCase() === String(t.type).toLowerCase()) : null;
      t.type = matched || inferTaskTypeFromTitle(t.title);
    }
    const imp = parseFloat(t.importance);
    t.importance = Number.isFinite(imp) ? Math.min(2.5, Math.max(0.5, Number(imp.toFixed(1)))) : 1.0;

    if (t.completed === true || t.status === 'done') {
      t.completed = true;
      t.status = 'done';
    } else {
      t.completed = false;
      t.status = t.status === 'in_progress' ? 'in_progress' : 'todo';
    }

    if (!t.pipeline || typeof t.pipeline !== 'object') {
      t.pipeline = { enabled: false, phases: [] };
    } else {
      t.pipeline.enabled = !!t.pipeline.enabled;
      if (!Array.isArray(t.pipeline.phases)) t.pipeline.phases = [];
      if (t.pipeline.enabled && t.pipeline.phases.length > 0) {
        const missingDates = t.pipeline.phases.every(p => !p.dueDate);
        if (missingDates) {
          const autoDates = computeStaggeredPhaseDates(t.pipeline.phases.length, t.dueDate);
          t.pipeline.phases.forEach((p, idx) => {
            p.dueDate = autoDates[idx] || t.dueDate || null;
          });
        }
      }
    }
  });
}

function getUpcomingSaturdayDsSubjects() {
  const override = state.settings && state.settings.dsSubjectOverride;
  if (override && override !== 'auto' && override !== 'none' && SUBJECTS[override]) {
    return [override];
  }
  if (override === 'none') return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dsRegex = /\b(ds|devoir\s+surveill[eé]|concours\s+blanc|cb)\b/i;

  const specificFound = new Set();

  // 1. Chercher dans les missions actives (type DS ou titre mentionnant un DS) prévues dans les 10 prochains jours
  if (Array.isArray(state.tasks)) {
    state.tasks.forEach(t => {
      if (!t || t.completed || t.status === 'done') return;
      const isDsTask = String(t.type || '').toUpperCase() === 'DS' || dsRegex.test(t.title || '');
      if (!isDsTask) return;
      let withinWindow = true;
      if (t.dueDate) {
        const due = new Date(t.dueDate + 'T00:00:00');
        if (!isNaN(due.getTime())) {
          const diffDays = Math.round((due - today) / 86400000);
          withinWindow = diffDays >= 0 && diffDays <= 10;
        }
      }
      if (withinWindow) {
        const inferred = inferSubjectFromText(t.title || '');
        const subj = (inferred && SUBJECTS[inferred]) ? inferred : t.subject;
        if (subj && SUBJECTS[subj]) specificFound.add(subj);
      }
    });
  }

  // 2. Chercher dans les créneaux d'emploi du temps datés dans les 10 prochains jours
  if (Array.isArray(state.schedule)) {
    state.schedule.forEach(sl => {
      if (!sl || !sl.date) return;
      const isDsSlot = String(sl.type || '').toUpperCase() === 'DS' || dsRegex.test(sl.title || '');
      if (!isDsSlot) return;
      const slDate = new Date(sl.date + 'T00:00:00');
      if (isNaN(slDate.getTime())) return;
      const diffDays = Math.round((slDate - today) / 86400000);
      if (diffDays >= 0 && diffDays <= 10) {
        const inferred = inferSubjectFromText(sl.title || '');
        const subj = (inferred && SUBJECTS[inferred]) ? inferred : sl.subject;
        if (subj && SUBJECTS[subj]) specificFound.add(subj);
      }
    });
  }

  if (specificFound.size > 0) {
    return Array.from(specificFound);
  }

  // 3. Repli : créneaux hebdomadaires récurrents de type DS (ex: DS du Samedi matin)
  const recurringFound = new Set();
  if (Array.isArray(state.schedule)) {
    // Calculer la date du prochain samedi pour vérifier l'activité des créneaux bi-hebdomadaires
    const dayToSat = (6 - today.getDay() + 7) % 7;
    const nextSat = new Date(today.getTime() + dayToSat * 86400000);
    const nextSatISO = formatDateISO(nextSat);

    state.schedule.forEach(sl => {
      if (!sl || sl.date) return;
      const isDsSlot = String(sl.type || '').toUpperCase() === 'DS' || dsRegex.test(sl.title || '');
      if (!isDsSlot) return;
      if (typeof isSlotActiveOn === 'function' && !isSlotActiveOn(sl, nextSatISO)) return;
      const inferred = inferSubjectFromText(sl.title || '');
      const subj = (inferred && SUBJECTS[inferred]) ? inferred : sl.subject;
      if (subj && SUBJECTS[subj]) recurringFound.add(subj);
    });
  }

  return Array.from(recurringFound);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      if (!state.errorTypes || !state.errorTypes.length) state.errorTypes = JSON.parse(JSON.stringify(DEFAULT_ERROR_TYPES));
      if (!Array.isArray(parsed.portals)) state.portals = JSON.parse(JSON.stringify(DEFAULT_PORTALS));
      if (!parsed.subjects || typeof parsed.subjects !== 'object' || Object.keys(parsed.subjects).length === 0) {
        state.subjects = JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
      } else {
        state.subjects = parsed.subjects;
      }
      if (!parsed.taskTypes || typeof parsed.taskTypes !== 'object' || Object.keys(parsed.taskTypes).length === 0) {
        state.taskTypes = JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES));
      } else {
        state.taskTypes = parsed.taskTypes;
      }
    } else {
      state.portals = JSON.parse(JSON.stringify(DEFAULT_PORTALS));
      state.subjects = JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
      state.taskTypes = JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES));
    }
    const rawSupa = localStorage.getItem(SUPA_KEY);
    if (rawSupa) supaConfig = Object.assign(supaConfig, JSON.parse(rawSupa));
    syncDirty = localStorage.getItem(DIRTY_KEY) === '1';
  } catch (e) {
    state.portals = JSON.parse(JSON.stringify(DEFAULT_PORTALS));
    state.subjects = JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
    state.taskTypes = JSON.parse(JSON.stringify(DEFAULT_TASK_TYPES));
  }
  syncSubjectsWithState();
  syncTaskTypesWithState();
  normalizeSettingsState();
  normalizeTasksState();
  lastDataSig = dataSig();
  updateSyncIndicator();
  renderPortals();
}

function saveUiPrefsLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function saveState() {
  syncSubjectsWithState();
  syncTaskTypesWithState();
  normalizeSettingsState();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  const sig = dataSig();
  if (sig !== lastDataSig) {
    lastDataSig = sig;
    syncVersion++;
    syncDirty = true;
    try { localStorage.setItem(DIRTY_KEY, '1'); } catch (e) {}
    if (supaConfigured()) {
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushToSupabase, 700);
    }
  }
  updateSyncIndicator();
}
