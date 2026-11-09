// missions.js : moteur de tension, types de tâches, curseur d'importance (0.5 à 2.5), mode pipeline, liste & kanban

let currentModalTaskType = DEFAULT_TASK_TYPE; // 'Exercice'
let currentQuickAddType = 'TD';
let currentModalPipeline = { enabled: false, phases: [] };

function pressureColor(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  return `hsl(${(120 * (1 - clamped / 100)).toFixed(0)}, 82%, 52%)`;
}

function isTaskCompleted(task) {
  return !!(task && (task.completed === true || task.status === 'done'));
}

function setTaskCompletedState(task, isDone, eveningDateISO = null) {
  if (!task) return;
  const targetISO = eveningDateISO || (typeof getEveningSelectedDayISO === 'function' ? getEveningSelectedDayISO() : formatDateISO(new Date()));

  // Figer l'ordre actuel du programme du soir et la durée allouée AVANT de basculer l'état
  // afin que cocher une tâche dans l'onglet Missions ne fasse jamais disparaître la tâche du soir ni ne la remplace par une autre
  if (typeof ensureEveningManualOrderInitialized === 'function') {
    ensureEveningManualOrderInitialized(targetISO);
  }
  if (!state.eveningPlan) {
    state.eveningPlan = { manualOrder: [], excludedIds: [], customDurations: {}, pinnedEveningIds: [] };
  }
  if (!Array.isArray(state.eveningPlan.pinnedEveningIds)) {
    state.eveningPlan.pinnedEveningIds = [];
  }
  if (!state.eveningPlan.pinnedEveningIds.includes(task.id)) {
    state.eveningPlan.pinnedEveningIds.push(task.id);
  }

  if (isDone) {
    if (!isTaskCompleted(task) || !task.eveningAllocatedHours) {
      task.eveningAllocatedHours = (typeof getTaskEveningDurationHours === 'function')
        ? getTaskEveningDurationHours(task)
        : getTaskRemainingDuration(task);
    }
    task.completed = true;
    task.status = 'done';
    task.completedInEveningDate = targetISO;
    task.completedDate = formatDateISO(new Date());
    if (task.pipeline && task.pipeline.enabled && Array.isArray(task.pipeline.phases)) {
      task.pipeline.phases.forEach(ph => { ph.done = true; });
    }
  } else {
    task.completed = false;
    task.status = 'todo';
    task.completedInEveningDate = targetISO;
    delete task.completedDate;
    if (task.pipeline && task.pipeline.enabled && Array.isArray(task.pipeline.phases)) {
      const allDone = task.pipeline.phases.every(ph => ph.done);
      if (allDone) task.pipeline.phases.forEach(ph => { ph.done = false; });
      else if (task.pipeline.phases.some(ph => ph.done)) task.status = 'in_progress';
    }
  }
}

function getTaskRemainingDuration(task) {
  if (!task) return 1;
  if (isTaskCompleted(task)) return 0;
  if (task.pipeline && task.pipeline.enabled && Array.isArray(task.pipeline.phases) && task.pipeline.phases.length > 0) {
    const rem = task.pipeline.phases.reduce((acc, ph) => acc + (ph.done ? 0 : (parseFloat(ph.duration) || 0.5)), 0);
    return Math.max(0.25, Number(rem.toFixed(2)));
  }
  return Math.max(0.25, parseFloat(task.duration) || 1);
}

function getTaskTotalDuration(task) {
  if (!task) return 1;
  if (task.pipeline && task.pipeline.enabled && Array.isArray(task.pipeline.phases) && task.pipeline.phases.length > 0) {
    const tot = task.pipeline.phases.reduce((acc, ph) => acc + (parseFloat(ph.duration) || 0.5), 0);
    return Math.max(0.5, Number(tot.toFixed(2)));
  }
  return Math.max(0.5, parseFloat(task.duration) || 1);
}

function getActivePipelinePhase(task) {
  if (!task || !task.pipeline || !task.pipeline.enabled || !Array.isArray(task.pipeline.phases) || !task.pipeline.phases.length) {
    return null;
  }
  return task.pipeline.phases.find(p => !p.done) || null;
}

function getEffectiveTaskDueDate(task) {
  if (!task) return null;
  const activePhase = getActivePipelinePhase(task);
  if (activePhase && activePhase.dueDate) {
    return activePhase.dueDate;
  }
  return task.dueDate || null;
}

function getTaskDiffDays(task) {
  const effDue = getEffectiveTaskDueDate(task);
  if (!effDue) return 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(effDue + 'T00:00:00');
  if (isNaN(due.getTime())) return 7;
  return Math.round((due - today) / 86400000);
}

/**
 * Formule de Tension recalibrée :
 * - Si la tâche est subdivisée en sous-missions, la tension porte sur l'échéance et la durée de la PROCHAINE sous-mission active
 *   (étalement réaliste de la charge sur plusieurs échéances).
 * - Les multiplicateurs (TypeMultiplier, Importance, AutoDS) sont amortis par exposant doux et projetés via une courbe progressive
 *   pour éviter l'effet plafond où tout atteint 100%.
 */
function computePressure(task) {
  const typeMult = getTypeMultiplier(task ? task.type : DEFAULT_TASK_TYPE);
  const importance = Math.min(2.5, Math.max(0.5, parseFloat(task && task.importance) || 1.0));

  if (isTaskCompleted(task)) {
    return {
      score: -1,
      rawScore: 0,
      pct: 100,
      pctLabel: '',
      badge: 'TERMINÉ',
      color: '#10B981',
      urgent: false,
      dayLabel: 'Validé',
      diffDays: 999,
      typeMult,
      importance,
      dsFactor: 1.0,
      dsBoosted: false,
      remDur: 0
    };
  }

  const cfg = state.settings || DEFAULT_SETTINGS;
  const alpha = typeof cfg.alpha === 'number' ? cfg.alpha : 0.65;
  const beta = typeof cfg.beta === 'number' ? cfg.beta : (1 - alpha);

  const remDur = getTaskRemainingDuration(task);
  const activePhase = getActivePipelinePhase(task);
  // Si subdivisé, la pression immédiate dépend de la durée de la sous-mission en cours (+ léger poids sur le reste)
  const activeDur = activePhase
    ? Math.max(0.25, (parseFloat(activePhase.duration) || 0.5) + 0.15 * Math.max(0, remDur - (parseFloat(activePhase.duration) || 0.5)))
    : remDur;

  const effDue = getEffectiveTaskDueDate(task);
  let diffDays = 7;
  let dayLabel = `${remDur}h`;

  if (effDue) {
    diffDays = getTaskDiffDays(task);
    const stepPrefix = activePhase ? `Étape ` : '';
    if (diffDays < 0) {
      dayLabel = `${stepPrefix}Retard ${Math.abs(diffDays)}j`;
    } else if (diffDays === 0) {
      dayLabel = `${stepPrefix}Aujourd'hui`;
    } else if (diffDays === 1) {
      dayLabel = `${stepPrefix}Demain`;
    } else {
      dayLabel = `${stepPrefix}J-${diffDays}`;
    }
  }

  // 1. Urgence Deadline (échelle 0 - 110, plus progressive pour éviter la saturation)
  let urgencyScore = 18;
  if (!effDue) {
    urgencyScore = 20;
  } else if (diffDays < 0) {
    urgencyScore = 95 + Math.min(35, Math.abs(diffDays) * 10);
  } else if (diffDays === 0) {
    urgencyScore = 88;
  } else if (diffDays === 1) {
    urgencyScore = 72;
  } else if (diffDays === 2) {
    urgencyScore = 55;
  } else {
    urgencyScore = 72 * Math.exp(-(diffDays - 1) / 3.4);
  }

  // 2. Durée Estimée de l'étape active (échelle 0 - 90, constante 3.5h au lieu de 2.4h)
  const durationScore = 90 * (1 - Math.exp(-activeDur / 3.5));

  // 3. AutoDSFactor (Boost automatique si matière au programme du prochain DS)
  const dsSubjects = getUpcomingSaturdayDsSubjects();
  const isDsTitle = /\b(ds|devoir\s+surveill[eé]|concours\s+blanc)\b/i.test(task.title || '');
  const isDsSubject = Boolean(cfg.autoDsBoost && (dsSubjects.includes(task.subject) || task.type === 'DS' || isDsTitle));
  const dsFactor = isDsSubject ? (parseFloat(cfg.dsBoostFactor) || 1.4) : 1.0;

  // Amortissement des multiplicateurs cumulés pour conserver la hiérarchie de tri sans saturer à 100%
  const baseWeighted = (alpha * urgencyScore) + (beta * durationScore);
  const combinedMult = Math.pow(typeMult, 0.58) * Math.pow(importance, 0.65) * Math.pow(dsFactor, 0.55);
  const rawTension = baseWeighted * combinedMult;
  const score = Number(rawTension.toFixed(1));

  if (effDue && diffDays < 0) {
    const overduePct = Math.min(100, Math.round(92 + Math.min(8, Math.abs(diffDays) * 3)));
    return {
      score: Math.max(140, score + 80),
      rawScore: score,
      pct: overduePct,
      pctLabel: overduePct + '%',
      badge: 'RETARD',
      color: pressureColor(overduePct),
      urgent: true,
      dayLabel,
      diffDays,
      typeMult,
      importance,
      dsFactor,
      dsBoosted: isDsSubject,
      remDur
    };
  }

  // Compression douce au-delà de 65 pour que 95-99% reste exceptionnel (ex: DS/DM pour aujourd'hui)
  let mappedPct = rawTension;
  if (rawTension > 65) {
    mappedPct = 65 + 34 * (1 - Math.exp(-(rawTension - 65) / 42));
  }
  const pct = Math.max(5, Math.min(99, Math.round(mappedPct)));
  const badge = !effDue
    ? 'PLANIFIÉ'
    : pct >= 76
      ? 'CRITIQUE'
      : pct >= 52
        ? 'TENDU'
        : pct >= 28
          ? 'MODÉRÉ'
          : 'ANTICIPÉ';

  return {
    score,
    rawScore: score,
    pct,
    pctLabel: pct + '%',
    badge,
    color: pressureColor(pct),
    urgent: pct >= 68,
    dayLabel,
    diffDays,
    typeMult,
    importance,
    dsFactor,
    dsBoosted: isDsSubject,
    remDur
  };
}

function sortTasksForView(tasksList) {
  const cfg = state.settings || DEFAULT_SETTINGS;
  const tomorrowFirst = cfg.tomorrowFirst !== false;
  const sortMode = cfg.sortMode || 'tension';

  return tasksList.slice().sort((a, b) => {
    const aDone = isTaskCompleted(a);
    const bDone = isTaskCompleted(b);
    // 1. Les tâches terminées sont toujours reléguées tout en bas
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone && bDone) return (b.createdAt || 0) - (a.createdAt || 0);

    const pa = computePressure(a);
    const pb = computePressure(b);

    const effDueA = getEffectiveTaskDueDate(a);
    const effDueB = getEffectiveTaskDueDate(b);

    // 2. Option "Tâches de demain en priorité" (Tomorrow's Tasks First)
    if (tomorrowFirst) {
      const aTom = effDueA && pa.diffDays <= 1;
      const bTom = effDueB && pb.diffDays <= 1;
      if (aTom !== bTom) return aTom ? -1 : 1;
      if (aTom && bTom && pa.diffDays !== pb.diffDays) {
        return pa.diffDays - pb.diffDays;
      }
    }

    // 3. Mode de tri : Score de Tension vs Délai Strict
    if (sortMode === 'deadline') {
      const da = effDueA ? pa.diffDays : 9999;
      const db = effDueB ? pb.diffDays : 9999;
      if (da !== db) return da - db;
      return pb.score - pa.score;
    }

    // Par défaut : Score de Tension décroissant
    if (pb.score !== pa.score) return pb.score - pa.score;
    return pa.diffDays - pb.diffDays;
  });
}

window.setCahierMode = function(m) {
  state.cahierMode = m;
  if (typeof saveUiPrefsLocal === 'function') saveUiPrefsLocal();
  renderCahier();
};

window.setCahierFilter = function(s) {
  state.cahierSubjFilter = s;
  if (typeof saveUiPrefsLocal === 'function') saveUiPrefsLocal();
  renderCahier();
};

window.setTaskSortMode = function(mode) {
  if (!state.settings) state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  state.settings.sortMode = mode === 'deadline' ? 'deadline' : 'tension';
  saveState();
  renderCahier();
};

window.toggleTomorrowFirst = function() {
  if (!state.settings) state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  state.settings.tomorrowFirst = !state.settings.tomorrowFirst;
  saveState();
  renderCahier();
  if (typeof window.renderSettingsPanel === 'function') window.renderSettingsPanel();
  showToast(state.settings.tomorrowFirst ? 'Priorité Demain activée' : 'Priorité Demain désactivée');
};

window.selectQuickAddType = function(typeId) {
  if (!TASK_TYPES[typeId]) return;
  currentQuickAddType = typeId;
  renderQuickAddTypePills();
};

function renderQuickAddTypePills() {
  const box = document.getElementById('qa-type-pills');
  if (!box) return;
  if (!TASK_TYPES[currentQuickAddType]) {
    currentQuickAddType = Object.keys(TASK_TYPES)[0] || DEFAULT_TASK_TYPE;
  }
  const pillsHtml = Object.values(TASK_TYPES).map(t => {
    const active = t.id === currentQuickAddType;
    return `<button type="button" onclick="event.stopPropagation(); window.selectQuickAddType('${escapeHtml(t.id)}')" class="task-type-pill ${active ? 'active' : ''}" style="${active ? `background:${t.bg}; border-color:${t.border}; color:${t.color};` : ''}" title="Type : ${escapeHtml(t.label)} (×${getTypeMultiplier(t.id)})"><i class="ph-bold ${escapeHtml(t.icon)}" style="font-size:11px;"></i><span>${escapeHtml(t.label)}</span></button>`;
  }).join('');

  box.innerHTML = `
    <div class="qa-type-pills-list">${pillsHtml}</div>
    <div class="qa-type-pills-tools">
      <button type="button" onclick="event.stopPropagation(); window.openTaskTypeModal && window.openTaskTypeModal(currentQuickAddType)" class="task-type-tool-btn" title="Modifier ou supprimer le type « ${escapeHtml(TASK_TYPES[currentQuickAddType]?.label || currentQuickAddType)} »">
        <i class="ph-bold ph-pencil-simple"></i>
        <span>Modifier</span>
      </button>
      <button type="button" onclick="event.stopPropagation(); window.openTaskTypeModal && window.openTaskTypeModal(null)" class="task-type-tool-btn task-type-tool-add" title="Ajouter un nouveau type de tâche">
        <i class="ph-bold ph-plus"></i>
        <span>Type</span>
      </button>
    </div>
  `;
}

window.quickAddMission = function(e) {
  e.preventDefault();
  const tInput = document.getElementById('qa-title');
  const t = tInput.value.trim();
  if (!t) return;
  const titleInferredType = inferTaskTypeFromTitle(t);
  const explicitPrefixMatch = /^(ds|dm|td|tp|colle|kh[ôo]lle|cours|r[ée]vision)\b/i.test(t);
  const finalType = explicitPrefixMatch ? titleInferredType : (currentQuickAddType || titleInferredType);
  let dur = parseFloat(document.getElementById('qa-duration').value) || 1.5;

  const stepsEl = document.getElementById('qa-steps');
  const stepsCount = stepsEl ? parseInt(stepsEl.value, 10) || 1 : 1;
  let dueDate = document.getElementById('qa-duedate').value || getOffsetDateISO(Math.max(2, stepsCount * 2 - 1));
  let pipeline = { enabled: false, phases: [] };

  if (stepsCount >= 2 && typeof buildDefaultPipelinePhases === 'function') {
    const phases = buildDefaultPipelinePhases(dur, stepsCount, finalType, 'auto', dueDate);
    dur = Number(phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0).toFixed(2));
    if (phases.length && phases[phases.length - 1].dueDate) {
      dueDate = phases[phases.length - 1].dueDate;
    }
    pipeline = { enabled: true, phases };
  }

  state.tasks.unshift({
    id: 't_' + Date.now(),
    title: t,
    type: finalType,
    importance: 1.0,
    note: '',
    subject: customSelectValues['qa-subj'] || Object.keys(SUBJECTS)[0] || 'maths',
    status: 'todo',
    completed: false,
    duration: dur,
    dueDate,
    pipeline,
    createdAt: Date.now()
  });
  tInput.value = '';
  if (stepsEl) stepsEl.value = '1';
  saveState();
  renderCahier();
  if (typeof window.renderSettingsPanel === 'function') window.renderSettingsPanel();
  showToast(stepsCount >= 2 ? `Mission ajoutée (${stepsCount} échéances étalées)` : 'Mission ajoutée');
};

window.quickSubdivideTask = function(taskId, count = 2, event = null) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const task = state.tasks.find(x => x.id === taskId);
  if (!task) return;

  if (task.pipeline && task.pipeline.enabled && Array.isArray(task.pipeline.phases) && task.pipeline.phases.length > 0) {
    // Ajouter une passe / sous-mission supplémentaire directement avec échéance décalée (+2 jours après la dernière)
    const nextIdx = task.pipeline.phases.length + 1;
    const isRepeatStyle = task.pipeline.phases.some(p => /passe|s[ée]ance/i.test(p.title || ''));
    const ordinals = ['1re passe', '2e passe', '3e passe', '4e passe', '5e passe', '6e passe', '7e passe', '8e passe', '9e passe', '10e passe'];
    const newTitle = isRepeatStyle ? (ordinals[nextIdx - 1] || `Séance ${nextIdx}`) : `Sous-mission ${nextIdx}`;
    const lastPhase = task.pipeline.phases[task.pipeline.phases.length - 1];
    const lastDur = parseFloat(lastPhase?.duration) || 0.5;
    const baseIso = lastPhase?.dueDate || task.dueDate || formatDateISO(new Date());
    const nextDue = (typeof addDaysISO === 'function')
      ? addDaysISO(baseIso, 2)
      : getOffsetDateISO(nextIdx);

    task.pipeline.phases.push({
      id: 'ph_' + Date.now() + '_' + nextIdx,
      title: newTitle,
      duration: lastDur,
      dueDate: nextDue,
      done: false
    });
    task.dueDate = nextDue;
    task.duration = Number(task.pipeline.phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0).toFixed(2));
    if (isTaskCompleted(task)) {
      setTaskCompletedState(task, false);
      task.status = 'in_progress';
    }
    saveState();
    renderCahier();
    if (state.activeTab === 'agenda') renderAgenda();
    showToast(`Sous-mission ${nextIdx} ajoutée (échéance étalée)`);
    return;
  }

  const targetCount = Math.max(2, parseInt(count, 10) || 2);
  const baseDur = parseFloat(task.duration) || 1.5;
  const phases = buildDefaultPipelinePhases(baseDur, targetCount, task.type, 'auto', task.dueDate);
  task.pipeline = { enabled: true, phases };
  if (phases.length && phases[phases.length - 1].dueDate) {
    task.dueDate = phases[phases.length - 1].dueDate;
  }
  task.duration = Number(phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0).toFixed(2));
  saveState();
  renderCahier();
  if (state.activeTab === 'agenda') renderAgenda();
  showToast(`Mission étalée sur ${phases.length} échéances`);
};

function renderTaskTypeBadge(typeId) {
  const tm = getTaskTypeMeta(typeId);
  const mult = getTypeMultiplier(tm.id);
  return `<span class="task-type-badge mono" style="background:${tm.bg}; border:1px solid ${tm.border}; color:${tm.color};" title="Type ${tm.label} (Multiplicateur ×${mult})"><i class="ph-bold ${tm.icon}" style="font-size:10.5px;"></i>${escapeHtml(tm.label)}</span>`;
}

function formatPhaseShortDue(isoDate) {
  if (!isoDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Auj.';
  if (diff === 1) return 'Dem.';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function renderPipelineProgressHtml(task) {
  if (!task.pipeline || !task.pipeline.enabled || !Array.isArray(task.pipeline.phases) || !task.pipeline.phases.length) {
    return '';
  }
  const doneCount = task.pipeline.phases.filter(p => p.done).length;
  const totalCount = task.pipeline.phases.length;
  const nextActiveIdx = task.pipeline.phases.findIndex(p => !p.done);
  return `
    <div class="pipeline-steps-bar" onclick="event.stopPropagation();">
      <div class="pipeline-header-tag mono">
        <i class="ph-bold ph-git-commit"></i> SOUS-MISSIONS (${doneCount}/${totalCount})
      </div>
      <div class="pipeline-steps-list">
        ${task.pipeline.phases.map((ph, idx) => {
          const shortDue = formatPhaseShortDue(ph.dueDate);
          const isCurrent = idx === nextActiveIdx;
          return `
            <button type="button" onclick="event.stopPropagation(); window.toggleTaskPhase('${task.id}', ${idx}, event)" class="pipeline-step-chip ${ph.done ? 'done' : ''}" style="${isCurrent ? 'border-color:rgba(56,189,248,0.45); background:rgba(56,189,248,0.08);' : ''}" title="Cliquer pour valider/invalider cette sous-mission${ph.dueDate ? ' (Échéance : ' + ph.dueDate + ')' : ''}">
              <span class="pipeline-step-check">${ph.done ? '<i class="ph-bold ph-check"></i>' : (idx + 1)}</span>
              <span class="pipeline-step-title">${escapeHtml(ph.title)}</span>
              <span class="pipeline-step-dur mono">${ph.duration}h${shortDue ? ' · ' + escapeHtml(shortDue) : ''}</span>
            </button>
          `;
        }).join('')}
        ${!isTaskCompleted(task) && totalCount < 10 ? `
          <button type="button" onclick="event.stopPropagation(); window.quickSubdivideTask('${task.id}', 1, event)" class="pipeline-step-chip" style="padding:3px 8px; border-style:dashed; color:var(--text-muted);" title="Ajouter une passe ou sous-mission supplémentaire (+2j)">
            <i class="ph-bold ph-plus" style="font-size:10px;"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

window.toggleTaskPhase = function(taskId, phaseIdx, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const task = state.tasks.find(x => x.id === taskId);
  if (!task || !task.pipeline || !Array.isArray(task.pipeline.phases) || !task.pipeline.phases[phaseIdx]) return;
  task.pipeline.phases[phaseIdx].done = !task.pipeline.phases[phaseIdx].done;

  const allDone = task.pipeline.phases.every(p => p.done);
  const someDone = task.pipeline.phases.some(p => p.done);
  if (allDone) {
    setTaskCompletedState(task, true);
    showToast('Toutes les sous-missions sont validées : Mission terminée !');
  } else if (someDone) {
    setTaskCompletedState(task, false);
    task.status = 'in_progress';
  } else {
    setTaskCompletedState(task, false);
    task.status = 'todo';
  }
  saveState();
  renderCahier();
  if (state.activeTab === 'agenda') renderAgenda();
};

// Clic général sur une ligne de tâche : ignore strictement tout clic provenant d'un bouton ou d'une checkbox
window.onTaskRowClick = function(event, taskId) {
  if (event && event.target && event.target.closest('button, .custom-check, .check-touch-zone, .pipeline-steps-bar, a, input')) {
    return;
  }
  window.openMissionModal(taskId);
};

function renderSingleTaskRow(t, sL) {
  const s = getSubject(t.subject);
  const p = computePressure(t);
  const isDone = isTaskCompleted(t);
  const imp = parseFloat(t.importance) || 1.0;
  const remDur = getTaskRemainingDuration(t);
  const totDur = getTaskTotalDuration(t);
  const hasPipeline = Boolean(t.pipeline && t.pipeline.enabled && Array.isArray(t.pipeline.phases) && t.pipeline.phases.length > 0);
  const durLabel = hasPipeline && !isDone && remDur !== totDur
    ? `${remDur}h/${totDur}h`
    : `${totDur}h`;

  return `
    <div class="saas-card task-row ${isDone ? 'task-row-done' : ''}" onclick="window.onTaskRowClick(event, '${t.id}')" style="display:flex; flex-direction:column; padding:14px 18px; border-left:3px solid ${s.color}; gap:10px; ${isDone ? 'opacity:0.46;' : ''}">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:210px;">
          <button type="button" class="check-touch-zone" onclick="event.stopPropagation(); window.toggleTask('${t.id}', event)" title="${isDone ? 'Marquer comme à faire' : 'Valider la mission'}" aria-label="Valider la mission">
            <span class="custom-check ${isDone ? 'checked' : ''}">${isDone ? '<i class="ph-bold ph-check text-xs"></i>' : ''}</span>
          </button>
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
              ${renderTaskTypeBadge(t.type)}
              <span style="font-weight:600; font-size:14px; ${isDone ? 'text-decoration:line-through; color:var(--text-subtle);' : ''}">${escapeHtml(t.title)}</span>
              ${Math.abs(imp - 1.0) >= 0.05 ? `<span class="imp-scalar-badge mono" title="Importance Manuelle">×${imp.toFixed(1)}</span>` : ''}
              ${p.dsBoosted && !isDone ? `<span class="ds-boost-badge mono" title="Boost DS du Samedi (×${p.dsFactor})"><i class="ph-fill ph-lightning"></i> DS ×${p.dsFactor}</span>` : ''}
              ${(!isDone && state.settings?.tomorrowFirst && getEffectiveTaskDueDate(t) && p.diffDays === 1) ? `<span class="tomorrow-prio-badge mono">DEMAIN</span>` : ''}
            </div>
            ${t.note ? `<div style="font-size:12.5px; color:var(--text-muted); margin-top:3px;">${escapeHtml(t.note)}</div>` : ''}
          </div>
        </div>
        <div class="task-right" style="display:flex; align-items:center; gap:10px;" onclick="event.stopPropagation();">
          <span class="subj-badge"><span class="subj-dot" style="background:${s.color};"></span>${escapeHtml(s.short)}</span>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:118px;">
            <div style="display:flex; align-items:center; gap:6px; font-size:11px;" class="mono">
              <span style="color:${p.color}; font-weight:700;" title="Score Tension : ${p.rawScore}">${p.pctLabel ? p.pctLabel + ' · ' : ''}${p.badge}</span>
              <span style="color:var(--text-muted);">${p.dayLabel} · ${durLabel}</span>
            </div>
            <div class="pressure-track"><div class="pressure-fill" style="width:${p.pct}%; background:${p.color};"></div></div>
          </div>
          <button type="button" onclick="event.stopPropagation(); window.cycleStatus('${t.id}', event)" class="btn-ghost task-action-btn" style="padding:6px 10px; font-size:11.5px;">${sL[t.status] || 'À faire'}</button>
          ${!hasPipeline && !isDone ? `<button type="button" onclick="event.stopPropagation(); window.quickSubdivideTask('${t.id}', 2, event)" class="btn-ghost task-action-btn" style="padding:7px 9px; color:#38BDF8;" title="Subdiviser en sous-missions ou passes (×2)"><i class="ph-bold ph-git-commit"></i></button>` : ''}
          <button type="button" onclick="event.stopPropagation(); window.openMissionModal('${t.id}', event)" class="btn-ghost task-action-btn" style="padding:7px 10px;" title="Modifier"><i class="ph ph-pencil-simple"></i></button>
          <button type="button" onclick="event.stopPropagation(); window.deleteTask('${t.id}', event)" class="btn-ghost task-action-btn" style="padding:7px 10px; color:#F87171;" title="Supprimer"><i class="ph ph-trash"></i></button>
        </div>
      </div>
      ${renderPipelineProgressHtml(t)}
    </div>
  `;
}

function renderCahier() {
  renderQuickAddTypePills();
  const active = state.tasks.filter(t => !isTaskCompleted(t));
  const done = state.tasks.filter(t => isTaskCompleted(t));
  const total = state.tasks.length;
  let uCount = 0, h = 0;
  active.forEach(t => {
    h += getTaskRemainingDuration(t);
    if (computePressure(t).urgent) uCount++;
  });

  document.getElementById('kpi-urgent').textContent = uCount;
  document.getElementById('kpi-hours').textContent = `${h % 1 === 0 ? h : h.toFixed(1)}h`;
  document.getElementById('kpi-ratio').textContent = total === 0 ? '0%' : `${Math.round((done.length / total) * 100)}%`;
  document.getElementById('kpi-ratio-sub').textContent = `${done.length}/${total} validées`;

  const pillsBox = document.getElementById('subject-filters');
  let pillsHtml = `<button type="button" onclick="window.setCahierFilter('all')" class="btn-ghost ${state.cahierSubjFilter === 'all' ? 'active-pill' : ''}">Toutes (${active.length})</button>`;
  Object.values(SUBJECTS).forEach(s => {
    const c = active.filter(t => t.subject === s.id).length;
    pillsHtml += `<button type="button" onclick="window.setCahierFilter('${s.id}')" class="btn-ghost ${state.cahierSubjFilter === s.id ? 'active-pill' : ''}"><span class="subj-dot" style="background:${s.color};"></span>${escapeHtml(s.name)} (${c})</button>`;
  });
  pillsBox.innerHTML = pillsHtml;

  document.getElementById('mode-table-btn').classList.toggle('active-pill', state.cahierMode === 'table');
  document.getElementById('mode-kanban-btn').classList.toggle('active-pill', state.cahierMode === 'kanban');

  const sortMode = (state.settings && state.settings.sortMode) || 'tension';
  const sortTensionBtn = document.getElementById('sort-tension-btn');
  const sortDeadlineBtn = document.getElementById('sort-deadline-btn');
  const tomFirstBtn = document.getElementById('toggle-tomorrow-first-btn');
  if (sortTensionBtn) sortTensionBtn.classList.toggle('active-pill', sortMode === 'tension');
  if (sortDeadlineBtn) sortDeadlineBtn.classList.toggle('active-pill', sortMode === 'deadline');
  if (tomFirstBtn) tomFirstBtn.classList.toggle('active-pill', state.settings?.tomorrowFirst !== false);

  const filtered = sortTasksForView(
    state.tasks.filter(t => state.cahierSubjFilter === 'all' || t.subject === state.cahierSubjFilter)
  );
  const area = document.getElementById('tasks-render-area');

  if (state.cahierMode === 'table') {
    if (filtered.length === 0) {
      area.innerHTML = `<div class="saas-card" style="padding:40px; text-align:center; color:var(--text-muted);">Aucune mission trouvée.</div>`;
      return;
    }
    const sL = { todo: 'À faire', in_progress: 'En cours', done: 'Terminé' };
    const activeFiltered = filtered.filter(t => !isTaskCompleted(t));
    const doneFiltered = filtered.filter(t => isTaskCompleted(t));

    let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    if (activeFiltered.length > 0) {
      html += activeFiltered.map(t => renderSingleTaskRow(t, sL)).join('');
    } else {
      html += `<div class="saas-card" style="padding:24px; text-align:center; color:var(--text-muted); font-size:12.5px;">Toutes les missions actives de cette vue sont terminées 🎉</div>`;
    }

    if (doneFiltered.length > 0) {
      html += `
        <div class="completed-divider">
          <span class="completed-divider-line"></span>
          <span class="completed-divider-label mono"><i class="ph-bold ph-check-circle"></i> Terminées (${doneFiltered.length})</span>
          <span class="completed-divider-line"></span>
        </div>
        ${doneFiltered.map(t => renderSingleTaskRow(t, sL)).join('')}
      `;
    }
    html += `</div>`;
    area.innerHTML = html;
  } else {
    const cols = [
      { key: 'todo', label: 'À faire' },
      { key: 'in_progress', label: 'En cours' },
      { key: 'done', label: 'Terminé' }
    ];
    area.innerHTML = `<div id="kanban-board" class="kanban-board">` + cols.map(c => {
      const cT = filtered.filter(t => (isTaskCompleted(t) ? 'done' : t.status) === c.key);
      const acc = { todo: '#94A3B8', in_progress: '#F59E0B', done: '#10B981' }[c.key];
      return `
        <div class="saas-card kanban-col" data-status="${c.key}" ondragover="window.onKanbanDragOver(event)" ondragleave="window.onKanbanDragLeave(event)" ondrop="window.onKanbanDrop(event, '${c.key}')">
          <div class="k-colhead" style="--accent:${acc};">
            <span class="k-coltitle"><i class="k-coldot"></i>${c.label}</span>
            <span class="k-count mono">${cT.length}</span>
          </div>
          <div class="k-list">
            ${cT.length === 0 ? `<div class="k-empty">Glisser une mission ici</div>` : ''}
            ${cT.map(t => {
              const s = getSubject(t.subject);
              const p = computePressure(t);
              const isDone = isTaskCompleted(t);
              const imp = parseFloat(t.importance) || 1.0;
              const hasPipeline = Boolean(t.pipeline && t.pipeline.enabled && Array.isArray(t.pipeline.phases) && t.pipeline.phases.length > 0);
              return `
                <div class="saas-card kanban-card" draggable="true" ondragstart="window.onKanbanDragStart(event, '${t.id}')" ondragend="window.onKanbanDragEnd(event)" style="border-left:3px solid ${s.color}; ${isDone ? 'opacity:0.5;' : ''}">
                  <div class="k-head">
                    <div class="k-head-l" style="flex-wrap:wrap;">
                      <span class="k-handle" onpointerdown="window.kPointerDown(event, '${t.id}')" title="Glisser">⠿</span>
                      <button type="button" class="check-touch-zone" onclick="event.stopPropagation(); window.toggleTask('${t.id}', event)" title="${isDone ? 'Marquer comme à faire' : 'Valider'}">
                        <span class="custom-check ${isDone ? 'checked' : ''}">${isDone ? '<i class="ph-bold ph-check text-xs"></i>' : ''}</span>
                      </button>
                      ${renderTaskTypeBadge(t.type)}
                      <span class="subj-badge"><span class="subj-dot" style="background:${s.color};"></span>${escapeHtml(s.short)}</span>
                      ${Math.abs(imp - 1.0) >= 0.05 ? `<span class="imp-scalar-badge mono">×${imp.toFixed(1)}</span>` : ''}
                    </div>
                    <div class="k-actions" onclick="event.stopPropagation();">
                      ${!hasPipeline && !isDone ? `<button type="button" onclick="event.stopPropagation(); window.quickSubdivideTask('${t.id}', 2, event)" class="k-btn" style="color:#38BDF8;" title="Subdiviser en sous-missions (×2)"><i class="ph-bold ph-git-commit"></i></button>` : ''}
                      <button type="button" onclick="event.stopPropagation(); window.cycleStatus('${t.id}', event)" class="k-btn" title="Changer statut"><i class="ph ph-arrow-right"></i></button>
                      <button type="button" onclick="event.stopPropagation(); window.openMissionModal('${t.id}', event)" class="k-btn" title="Modifier"><i class="ph ph-pencil-simple"></i></button>
                      <button type="button" onclick="event.stopPropagation(); window.deleteTask('${t.id}', event)" class="k-btn k-del" title="Supprimer"><i class="ph ph-trash"></i></button>
                    </div>
                  </div>
                  <div class="k-title" style="${isDone ? 'text-decoration:line-through; color:var(--text-subtle);' : ''}">${escapeHtml(t.title)}</div>
                  ${t.note ? `<div class="k-note">${escapeHtml(t.note)}</div>` : ''}
                  ${renderPipelineProgressHtml(t)}
                  <div class="k-foot">
                    <div class="mono k-due" style="color:${p.color}; display:flex; justify-content:space-between; align-items:center;">
                      <span>${p.pctLabel ? p.pctLabel + ' · ' : ''}${p.badge} · ${p.dayLabel}${t.duration ? ' · ' + getTaskRemainingDuration(t) + 'h' : ''}</span>
                      ${p.dsBoosted && !isDone ? `<span class="ds-boost-badge mono">⚡ DS</span>` : ''}
                    </div>
                    <div class="pressure-track"><div class="pressure-fill" style="width:${p.pct}%; background:${p.color};"></div></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('') + `</div>`;
  }
}

let draggedTaskId = null;
window.onKanbanDragStart = function(e, id) { draggedTaskId = id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
window.onKanbanDragEnd = function(e) { e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over')); };
window.onKanbanDragOver = function(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
window.onKanbanDragLeave = function(e) { e.currentTarget.classList.remove('drag-over'); };

function moveTaskTo(id, st) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.status !== st) {
    if (st === 'done') {
      setTaskCompletedState(t, true);
    } else {
      setTaskCompletedState(t, false);
      t.status = st;
    }
    saveState();
    renderCahier();
  }
}

window.onKanbanDrop = function(e, st) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (draggedTaskId) moveTaskTo(draggedTaskId, st);
  draggedTaskId = null;
};

let kd = null;
window.kPointerDown = function(e, id) {
  if (kd) return;
  e.preventDefault();
  e.stopPropagation();
  const card = e.currentTarget.closest('.kanban-card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; z-index:400; pointer-events:none; opacity:0.95; transform:scale(1.03) rotate(1.5deg); box-shadow:0 18px 40px rgba(0,0,0,0.7); background:#1a1d27;`;
  document.body.appendChild(ghost);
  card.classList.add('dragging');
  document.body.classList.add('k-dragging');
  kd = { id, card, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY, col: null, raf: 0 };
  document.addEventListener('pointermove', kMove, { passive: false });
  document.addEventListener('pointerup', kUp);
  document.addEventListener('pointercancel', kCancel);
  kd.raf = requestAnimationFrame(kTick);
};
function kColAt(x, y) { const el = document.elementFromPoint(x, y); return el ? el.closest('.kanban-col') : null; }
function kMove(e) { if (!kd) return; e.preventDefault(); kd.x = e.clientX; kd.y = e.clientY; kd.ghost.style.left = (kd.x - kd.dx) + 'px'; kd.ghost.style.top = (kd.y - kd.dy) + 'px'; const col = kColAt(kd.x, kd.y); document.querySelectorAll('.kanban-col').forEach(c => c.classList.toggle('drag-over', c === col)); kd.col = col; }
function kTick() { if (!kd) return; const b = document.getElementById('kanban-board'); if (b) { if (kd.x < 56) b.scrollLeft -= 14; else if (kd.x > window.innerWidth - 56) b.scrollLeft += 14; } if (kd.y < 90) window.scrollBy(0, -12); else if (kd.y > window.innerHeight - 120) window.scrollBy(0, 12); kd.raf = requestAnimationFrame(kTick); }
function kCleanup() { if (!kd) return; cancelAnimationFrame(kd.raf); kd.ghost.remove(); kd.card.classList.remove('dragging'); document.body.classList.remove('k-dragging'); document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over')); document.removeEventListener('pointermove', kMove); document.removeEventListener('pointerup', kUp); document.removeEventListener('pointercancel', kCancel); }
function kUp(e) { if (!kd) return; const col = kColAt(e.clientX, e.clientY) || kd.col; const id = kd.id; kCleanup(); kd = null; if (col) moveTaskTo(id, col.dataset.status); }
function kCancel() { kCleanup(); kd = null; }

window.toggleTask = function(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    setTaskCompletedState(t, !isTaskCompleted(t));
    saveState();
    renderCahier();
  }
};

window.cycleStatus = function(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    const order = ['todo', 'in_progress', 'done'];
    const next = order[(order.indexOf(t.status) + 1) % 3];
    if (next === 'done') {
      setTaskCompletedState(t, true);
    } else {
      setTaskCompletedState(t, false);
      t.status = next;
    }
    saveState();
    renderCahier();
  }
};

window.deleteTask = function(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  state.tasks = state.tasks.filter(x => x.id !== id);
  saveState();
  renderCahier();
  showToast('Mission supprimée');
};

window.setModalQuickDate = function(offset) {
  document.getElementById('m-duedate').value = getOffsetDateISO(offset);
};

// =========================================================
// MODALE MISSION : TYPES, IMPORTANCE SLIDER (0.5 à 2.5) & PIPELINE
// =========================================================
window.selectMissionType = function(typeId) {
  if (!TASK_TYPES[typeId]) return;
  currentModalTaskType = typeId;
  renderModalTypePills();
  if (currentModalPipeline && currentModalPipeline.enabled && Array.isArray(currentModalPipeline.phases)) {
    const isUntouchedDefault = currentModalPipeline.phases.every(p => !p.done && /^(Phase|Étape|Partie|Sous-mission|\d+r?e\s+passe)\b/i.test(p.title || ''));
    if (isUntouchedDefault) {
      const dur = parseFloat(document.getElementById('m-duration')?.value) || 1.5;
      const due = document.getElementById('m-duedate')?.value || null;
      currentModalPipeline.phases = buildDefaultPipelinePhases(dur, currentModalPipeline.phases.length || 2, currentModalTaskType, 'auto', due);
      renderModalPipelineEditor();
    }
  }
};

function renderModalTypePills() {
  const mount = document.getElementById('m-type-pills');
  if (!mount) return;
  if (!TASK_TYPES[currentModalTaskType]) {
    currentModalTaskType = Object.keys(TASK_TYPES)[0] || DEFAULT_TASK_TYPE;
  }
  mount.innerHTML = Object.values(TASK_TYPES).map(t => {
    const active = t.id === currentModalTaskType;
    const mult = getTypeMultiplier(t.id);
    return `
      <button type="button" onclick="event.stopPropagation(); window.selectMissionType('${escapeHtml(t.id)}')" class="task-type-pill modal-pill ${active ? 'active' : ''}" style="${active ? `background:${t.bg}; border-color:${t.border}; color:${t.color}; box-shadow:0 0 12px ${t.bg};` : ''}">
        <i class="ph-bold ${escapeHtml(t.icon)}"></i>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.label)}</span>
        <small class="mono" style="font-size:10px; opacity:0.75; margin-left:auto;">×${mult}</small>
      </button>
    `;
  }).join('') + `
    <button type="button" onclick="event.stopPropagation(); window.openTaskTypeModal && window.openTaskTypeModal(currentModalTaskType)" class="task-type-pill modal-pill" style="border-style:dashed; color:var(--text-muted); justify-content:center;" title="Modifier ou supprimer le type sélectionné">
      <i class="ph-bold ph-pencil-simple"></i>
      <span>Modifier</span>
    </button>
    <button type="button" onclick="event.stopPropagation(); window.openTaskTypeModal && window.openTaskTypeModal(null)" class="task-type-pill modal-pill" style="border-style:dashed; color:#38BDF8; border-color:rgba(56,189,248,0.35); justify-content:center;" title="Ajouter un nouveau type de tâche">
      <i class="ph-bold ph-plus"></i>
      <span>Nouveau</span>
    </button>
  `;
}

window.refreshAllTaskTypePills = function() {
  renderQuickAddTypePills();
  renderModalTypePills();
};

window.onImportanceSliderInput = function(val) {
  const v = Math.min(2.5, Math.max(0.5, parseFloat(val) || 1.0));
  const readout = document.getElementById('m-importance-readout');
  if (!readout) return;
  let label = 'Normal';
  let col = '#94A3B8';
  if (v >= 2.1) { label = 'Critique'; col = '#EF4444'; }
  else if (v >= 1.6) { label = 'Majeur'; col = '#F97316'; }
  else if (v >= 1.2) { label = 'Important'; col = '#EAB308'; }
  else if (v <= 0.6) { label = 'Mineur'; col = '#38BDF8'; }
  else if (v < 0.95) { label = 'Secondaire'; col = '#64748B'; }
  readout.textContent = `×${v.toFixed(1)} · ${label}`;
  readout.style.color = col;
  readout.style.borderColor = col + '55';
  readout.style.background = col + '18';
};

window.toggleModalPipeline = function() {
  currentModalPipeline.enabled = !currentModalPipeline.enabled;
  if (currentModalPipeline.enabled && (!currentModalPipeline.phases || !currentModalPipeline.phases.length)) {
    const dur = parseFloat(document.getElementById('m-duration').value) || 1.5;
    const due = document.getElementById('m-duedate')?.value || null;
    const defaultCount = (currentModalTaskType === 'Cours' || currentModalTaskType === 'Révision') ? 2 : 3;
    currentModalPipeline.phases = buildDefaultPipelinePhases(dur, defaultCount, currentModalTaskType, 'auto', due);
    const lastDue = currentModalPipeline.phases[currentModalPipeline.phases.length - 1]?.dueDate;
    if (lastDue && document.getElementById('m-duedate')) {
      document.getElementById('m-duedate').value = lastDue;
    }
  }
  renderModalPipelineEditor();
};

window.setModalPipelineCount = function(count, mode = 'auto') {
  const dur = parseFloat(document.getElementById('m-duration').value) || 1.5;
  const due = document.getElementById('m-duedate')?.value || null;
  currentModalPipeline.phases = buildDefaultPipelinePhases(dur, count, currentModalTaskType, mode, due);
  const total = currentModalPipeline.phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0);
  const durEl = document.getElementById('m-duration');
  if (durEl) durEl.value = Number(total.toFixed(2));
  const lastDue = currentModalPipeline.phases[currentModalPipeline.phases.length - 1]?.dueDate;
  if (lastDue && document.getElementById('m-duedate')) {
    document.getElementById('m-duedate').value = lastDue;
  }
  renderModalPipelineEditor();
};

window.staggerModalPipelineDates = function() {
  if (!currentModalPipeline || !Array.isArray(currentModalPipeline.phases) || !currentModalPipeline.phases.length) return;
  const count = currentModalPipeline.phases.length;
  const due = document.getElementById('m-duedate')?.value || null;
  const dates = (typeof computeStaggeredPhaseDates === 'function')
    ? computeStaggeredPhaseDates(count, due)
    : [];
  currentModalPipeline.phases.forEach((ph, idx) => {
    if (dates[idx]) ph.dueDate = dates[idx];
  });
  const lastDue = currentModalPipeline.phases[currentModalPipeline.phases.length - 1]?.dueDate;
  if (lastDue && document.getElementById('m-duedate')) {
    document.getElementById('m-duedate').value = lastDue;
  }
  renderModalPipelineEditor();
};

window.addModalPipelinePhase = function() {
  if (!Array.isArray(currentModalPipeline.phases)) currentModalPipeline.phases = [];
  if (currentModalPipeline.phases.length >= 10) return;
  const nextIdx = currentModalPipeline.phases.length + 1;
  const isRepeat = currentModalPipeline.phases.some(p => /passe|s[ée]ance/i.test(p.title || ''));
  const ordinals = ['1re passe', '2e passe', '3e passe', '4e passe', '5e passe', '6e passe', '7e passe', '8e passe', '9e passe', '10e passe'];
  const defaultTitle = isRepeat ? (ordinals[nextIdx - 1] || `Séance ${nextIdx}`) : `Sous-mission ${nextIdx}`;
  const lastPhase = currentModalPipeline.phases[currentModalPipeline.phases.length - 1];
  const defaultDur = lastPhase ? (parseFloat(lastPhase.duration) || 0.5) : 0.5;
  const baseIso = lastPhase?.dueDate || document.getElementById('m-duedate')?.value || formatDateISO(new Date());
  const nextDue = (typeof addDaysISO === 'function') ? addDaysISO(baseIso, 2) : getOffsetDateISO(nextIdx);

  currentModalPipeline.phases.push({
    id: 'ph_' + Date.now() + '_' + nextIdx,
    title: defaultTitle,
    duration: defaultDur,
    dueDate: nextDue,
    done: false
  });
  const total = currentModalPipeline.phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0);
  const durEl = document.getElementById('m-duration');
  if (durEl) durEl.value = Number(total.toFixed(2));
  if (document.getElementById('m-duedate')) {
    document.getElementById('m-duedate').value = nextDue;
  }
  renderModalPipelineEditor();
};

window.removeModalPipelinePhase = function(idx) {
  if (!Array.isArray(currentModalPipeline.phases) || currentModalPipeline.phases.length <= 1) return;
  currentModalPipeline.phases.splice(idx, 1);
  const total = currentModalPipeline.phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0);
  const durEl = document.getElementById('m-duration');
  if (durEl) durEl.value = Number(total.toFixed(2));
  const lastDue = currentModalPipeline.phases[currentModalPipeline.phases.length - 1]?.dueDate;
  if (lastDue && document.getElementById('m-duedate')) {
    document.getElementById('m-duedate').value = lastDue;
  }
  renderModalPipelineEditor();
};

window.updateModalPipelinePhase = function(idx, field, val) {
  if (!currentModalPipeline.phases[idx]) return;
  if (field === 'title') {
    currentModalPipeline.phases[idx].title = val;
  } else if (field === 'duration') {
    currentModalPipeline.phases[idx].duration = Math.max(0.25, parseFloat(val) || 0.5);
    const total = currentModalPipeline.phases.reduce((acc, p) => acc + (parseFloat(p.duration) || 0.5), 0);
    const durEl = document.getElementById('m-duration');
    if (durEl) durEl.value = Number(total.toFixed(2));
  } else if (field === 'dueDate') {
    currentModalPipeline.phases[idx].dueDate = val || null;
    if (idx === currentModalPipeline.phases.length - 1 && val && document.getElementById('m-duedate')) {
      document.getElementById('m-duedate').value = val;
    }
  } else if (field === 'done') {
    currentModalPipeline.phases[idx].done = !!val;
    renderModalPipelineEditor();
  }
};

function renderModalPipelineEditor() {
  const btn = document.getElementById('m-pipeline-toggle-btn');
  const box = document.getElementById('m-pipeline-box');
  if (!btn || !box) return;

  btn.classList.toggle('active-pill', currentModalPipeline.enabled);
  btn.innerHTML = currentModalPipeline.enabled
    ? `<i class="ph-bold ph-check-circle" style="color:#10B981;"></i> <span>Subdivision activée (${currentModalPipeline.phases.length} échéances étalées)</span>`
    : `<i class="ph-bold ph-git-commit"></i> <span>Subdiviser en sous-missions ou passes (étaler sur plusieurs échéances)</span>`;

  if (!currentModalPipeline.enabled) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'flex';
  const count = currentModalPipeline.phases.length;
  const isRepeatMode = currentModalPipeline.phases.every(p => /^\d+r?e\s+passe$/i.test((p.title || '').trim()));

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
      <span style="font-size:11.5px; font-weight:600; color:var(--text-muted);">Modèles rapides :</span>
      <div style="display:flex; gap:5px; flex-wrap:wrap;">
        <button type="button" onclick="window.setModalPipelineCount(2, 'auto')" class="btn-ghost ${count === 2 && !isRepeatMode ? 'active-pill' : ''}" style="padding:4px 9px; font-size:11px;" title="Découper en 2 étapes étalées">2 Étapes</button>
        <button type="button" onclick="window.setModalPipelineCount(3, 'auto')" class="btn-ghost ${count === 3 && !isRepeatMode ? 'active-pill' : ''}" style="padding:4px 9px; font-size:11px;" title="Découper en 3 étapes étalées">3 Étapes</button>
        <button type="button" onclick="window.setModalPipelineCount(4, 'auto')" class="btn-ghost ${count === 4 && !isRepeatMode ? 'active-pill' : ''}" style="padding:4px 9px; font-size:11px;" title="Découper en 4 étapes étalées">4 Étapes</button>
        <button type="button" onclick="window.setModalPipelineCount(${Math.max(2, count)}, 'repeat')" class="btn-ghost ${isRepeatMode ? 'active-pill' : ''}" style="padding:4px 9px; font-size:11px; color:#38BDF8;" title="Idéal pour une mission à faire plusieurs fois (1re passe, 2e passe, 3e passe...)">
          <i class="ph-bold ph-repeat"></i> Répéter (${Math.max(2, count)}×)
        </button>
        <button type="button" onclick="window.staggerModalPipelineDates()" class="btn-ghost" style="padding:4px 9px; font-size:11px; color:#10B981;" title="Répartir automatiquement les dates d'échéance de chaque sous-mission">
          <i class="ph-bold ph-calendar-plus"></i> Étaler dates
        </button>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:7px;">
      ${currentModalPipeline.phases.map((ph, idx) => `
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <button type="button" onclick="window.updateModalPipelinePhase(${idx}, 'done', ${!ph.done})" class="custom-check ${ph.done ? 'checked' : ''}" title="Marquer cette sous-mission comme terminée">
            ${ph.done ? '<i class="ph-bold ph-check text-xs"></i>' : ''}
          </button>
          <input type="text" class="saas-input" style="flex:1; min-width:120px; padding:6px 10px; font-size:12px;" value="${escapeHtml(ph.title)}" placeholder="Sous-mission ${idx + 1}" oninput="window.updateModalPipelinePhase(${idx}, 'title', this.value)" />
          <input type="date" class="saas-input mono" style="width:128px; padding:5px 7px; font-size:11px;" value="${escapeHtml(ph.dueDate || '')}" title="Échéance de cette sous-mission" onchange="window.updateModalPipelinePhase(${idx}, 'dueDate', this.value)" />
          <div style="display:flex; align-items:center; gap:4px; width:74px;">
            <input type="number" class="saas-input mono" style="padding:6px 7px; font-size:12px;" step="0.25" min="0.25" value="${ph.duration}" oninput="window.updateModalPipelinePhase(${idx}, 'duration', this.value)" />
            <span class="mono" style="font-size:11px; color:var(--text-subtle);">h</span>
          </div>
          ${count > 1 ? `
            <button type="button" onclick="window.removeModalPipelinePhase(${idx})" class="btn-ghost" style="padding:4px 6px; min-height:26px; border:none; color:var(--text-subtle);" title="Supprimer cette étape">
              <i class="ph-bold ph-x"></i>
            </button>
          ` : ''}
        </div>
      `).join('')}
    </div>
    ${count < 10 ? `
      <div style="display:flex; justify-content:flex-start; margin-top:2px;">
        <button type="button" onclick="window.addModalPipelinePhase()" class="btn-ghost" style="padding:5px 10px; font-size:11px; border-style:dashed; color:#38BDF8;">
          <i class="ph-bold ph-plus"></i> Ajouter une sous-mission / passe (+2j)
        </button>
      </div>
    ` : ''}
  `;
}

window.openMissionModal = function(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const m = id ? state.tasks.find(x => x.id === id) : null;
  document.getElementById('mission-modal-title').textContent = m ? 'Modifier la mission' : 'Nouvelle Mission';
  document.getElementById('m-id').value = m ? m.id : '';
  document.getElementById('m-title').value = m ? m.title : '';
  document.getElementById('m-duration').value = m && m.duration ? m.duration : 1.5;
  document.getElementById('m-duedate').value = m && m.dueDate ? m.dueDate : getOffsetDateISO(2);
  document.getElementById('m-note').value = m && m.note ? m.note : '';

  // Type de tâche : jamais DS par défaut (Exercice par défaut)
  currentModalTaskType = (m && m.type && TASK_TYPES[m.type]) ? m.type : DEFAULT_TASK_TYPE;
  renderModalTypePills();

  // Curseur d'importance scalaire (0.5 à 2.5)
  const impVal = m && typeof m.importance === 'number' ? Math.min(2.5, Math.max(0.5, m.importance)) : 1.0;
  const impSlider = document.getElementById('m-importance');
  if (impSlider) {
    impSlider.value = impVal;
    window.onImportanceSliderInput(impVal);
  }

  // Mode Pipeline
  if (m && m.pipeline && m.pipeline.enabled) {
    currentModalPipeline = JSON.parse(JSON.stringify(m.pipeline));
    if (Array.isArray(currentModalPipeline.phases) && currentModalPipeline.phases.every(p => !p.dueDate)) {
      const staggered = (typeof computeStaggeredPhaseDates === 'function')
        ? computeStaggeredPhaseDates(currentModalPipeline.phases.length, m.dueDate)
        : [];
      currentModalPipeline.phases.forEach((p, idx) => {
        if (staggered[idx]) p.dueDate = staggered[idx];
      });
    }
  } else {
    currentModalPipeline = { enabled: false, phases: [] };
  }
  renderModalPipelineEditor();

  const defaultSubj = m && SUBJECTS[m.subject] ? m.subject : (Object.keys(SUBJECTS)[0] || 'maths');
  mountCustomSelect('m-subject-mount', 'm-subj', getSubjectOptions(), defaultSubj);
  mountCustomSelect('m-status-mount', 'm-stat', [
    { value: 'todo', label: 'À faire' },
    { value: 'in_progress', label: 'En cours' },
    { value: 'done', label: 'Terminé' }
  ], m ? (isTaskCompleted(m) ? 'done' : m.status) : 'todo');

  document.getElementById('mission-modal').classList.add('open');
  if (typeof window.focusModalInput === 'function') window.focusModalInput('m-title');
};

window.closeMissionModal = function() {
  document.getElementById('mission-modal').classList.remove('open');
};

window.saveMissionForm = function(e) {
  e.preventDefault();
  const id = document.getElementById('m-id').value;
  const title = document.getElementById('m-title').value.trim();
  const subject = customSelectValues['m-subj'] || Object.keys(SUBJECTS)[0] || 'maths';
  const type = currentModalTaskType || DEFAULT_TASK_TYPE;
  const importance = Math.min(2.5, Math.max(0.5, parseFloat(document.getElementById('m-importance')?.value) || 1.0));
  let duration = parseFloat(document.getElementById('m-duration').value) || 1;
  let dueDate = document.getElementById('m-duedate').value || null;
  let status = customSelectValues['m-stat'] || 'todo';
  const note = document.getElementById('m-note').value.trim();

  let staggeredDates = [];
  if (currentModalPipeline.enabled && Array.isArray(currentModalPipeline.phases) && currentModalPipeline.phases.every(p => !p.dueDate)) {
    staggeredDates = (typeof computeStaggeredPhaseDates === 'function')
      ? computeStaggeredPhaseDates(currentModalPipeline.phases.length, dueDate)
      : [];
  }

  const pipeline = currentModalPipeline.enabled
    ? {
        enabled: true,
        phases: currentModalPipeline.phases.map((p, i) => ({
          id: p.id || ('ph_' + (i + 1)),
          title: (p.title || `Sous-mission ${i + 1}`).trim(),
          duration: Math.max(0.25, parseFloat(p.duration) || 0.5),
          dueDate: p.dueDate || staggeredDates[i] || dueDate || null,
          done: !!p.done
        }))
      }
    : { enabled: false, phases: [] };

  if (pipeline.enabled && pipeline.phases.length) {
    duration = Number(pipeline.phases.reduce((acc, p) => acc + p.duration, 0).toFixed(2));
    const lastPhaseDue = pipeline.phases[pipeline.phases.length - 1]?.dueDate;
    if (lastPhaseDue && (!dueDate || lastPhaseDue > dueDate)) {
      dueDate = lastPhaseDue;
    }
    if (pipeline.phases.every(p => p.done)) status = 'done';
    else if (pipeline.phases.some(p => p.done) && status === 'todo') status = 'in_progress';
  }

  const completed = (status === 'done');

  if (id) {
    const t = state.tasks.find(x => x.id === id);
    if (t) {
      const wasDone = isTaskCompleted(t);
      Object.assign(t, { title, type, importance, subject, duration, dueDate, note, pipeline });
      if (completed !== wasDone) {
        setTaskCompletedState(t, completed);
      } else {
        t.status = status;
        t.completed = completed;
      }
    }
    showToast('Mission modifiée');
  } else {
    state.tasks.unshift({
      id: 't_' + Date.now(),
      title,
      type,
      importance,
      subject,
      duration,
      dueDate,
      status,
      completed,
      note,
      pipeline,
      createdAt: Date.now()
    });
    showToast('Mission créée');
  }
  saveState();
  closeMissionModal();
  renderCahier();
};
