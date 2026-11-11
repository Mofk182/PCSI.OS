// island-modules.js : données affichées par l'île dynamique (fonctions pures, testées sans navigateur).
// Chaque module lit l'état de l'appli et renvoie un texte replié et une section étendue ; un module sans donnée renvoie null.
(function (root) {
  const ISLAND_IDS = ['next-class', 'missions-due', 'evening', 'clock', 'countdown'];
  const DEFAULT_ISLAND = {
    trigger: 'hover',
    collapsed: 'next-class',
    expanded: ['next-class', 'missions-due', 'clock'],
    autoOpenMinutesBeforeClass: 10,
    dueWithinDays: 3,
    countdownTaskId: null
  };
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MAX_MISSION_LINES = 4;
  const LOOKAHEAD_DAYS = 7;

  const pad2 = n => String(n).padStart(2, '0');
  const minToHHMM = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  function timeToMin(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  }
  const isoDate = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const nowMin = d => d.getHours() * 60 + d.getMinutes();
  const isDone = t => !!(t && (t.completed === true || t.status === 'done'));
  const validDue = t => !!t && /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate || ''));
  const dayDiff = (isoA, isoB) => {
    const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    return Math.round((p(isoB) - p(isoA)) / 86400000);
  };

  function formatDue(diff) {
    if (diff < 0) return 'En retard';
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    return 'J-' + diff;
  }
  function formatRemaining(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return h + ' h ' + pad2(m);
    return h ? h + ' h' : m + ' min';
  }

  function getIslandConfig(settings, platform) {
    const raw = settings && settings.island && typeof settings.island === 'object' ? settings.island : {};
    const cfg = Object.assign({}, DEFAULT_ISLAND, { expanded: DEFAULT_ISLAND.expanded.slice() });
    if (raw.trigger === 'hover' || raw.trigger === 'shortcut') cfg.trigger = raw.trigger;
    if (ISLAND_IDS.includes(raw.collapsed)) cfg.collapsed = raw.collapsed;
    if (Array.isArray(raw.expanded)) cfg.expanded = Array.from(new Set(raw.expanded.filter(id => ISLAND_IDS.includes(id))));
    const auto = Number(raw.autoOpenMinutesBeforeClass);
    if (raw.autoOpenMinutesBeforeClass !== undefined && Number.isFinite(auto) && auto >= 0 && auto <= 120) cfg.autoOpenMinutesBeforeClass = Math.round(auto);
    const due = Number(raw.dueWithinDays);
    if (raw.dueWithinDays !== undefined && Number.isFinite(due) && due >= 0 && due <= 30) cfg.dueWithinDays = Math.round(due);
    if (typeof raw.countdownTaskId === 'string' && raw.countdownTaskId) cfg.countdownTaskId = raw.countdownTaskId;
    if (platform === 'linux') cfg.trigger = 'shortcut';   // pas de survol possible sur un HUD en lecture seule
    return cfg;
  }

  // ---- prochain cours ----
  function sortedValidSlots(list) {
    return (list || []).filter(s => s && Number.isFinite(timeToMin(s.start)))
      .sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  }
  function slotLabel(s) { return s.title || s.subject || 'Cours'; }

  function findNextClass(ctx) {
    const nm = nowMin(ctx.now);
    for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
      const day = addDays(ctx.now, offset);
      for (const s of sortedValidSlots(ctx.slotsForDate(day))) {
        const start = timeToMin(s.start);
        const end = Number.isFinite(timeToMin(s.end)) ? timeToMin(s.end) : start;
        if (offset === 0 && end <= nm) continue;
        return { slot: s, day, offset, ongoing: offset === 0 && start <= nm };
      }
    }
    return null;
  }

  const nextClass = {
    label: 'Prochain cours',
    collapsed(ctx) {
      const f = findNextClass(ctx);
      if (!f) return null;
      if (f.ongoing) return 'En cours · ' + slotLabel(f.slot);
      const when = f.offset === 0 ? '' : (f.offset === 1 ? 'Demain ' : DAYS[f.day.getDay()] + ' ');
      return when + f.slot.start + ' · ' + slotLabel(f.slot);
    },
    expanded(ctx) {
      const f = findNextClass(ctx);
      if (!f) return null;
      const end = f.slot.end ? '–' + f.slot.end : '';
      const lines = [f.slot.start + end + ' · ' + slotLabel(f.slot)];
      if (f.slot.room) lines.push('Salle ' + f.slot.room);
      if (f.offset > 0) lines.push(f.offset === 1 ? 'Demain' : DAYS[f.day.getDay()]);
      return { title: f.ongoing ? 'Cours en cours' : 'Prochain cours', lines };
    }
  };

  // ---- missions ----
  function dueMissions(ctx) {
    const today = isoDate(ctx.now);
    const limit = isoDate(addDays(ctx.now, ctx.cfg.dueWithinDays));
    return ((ctx.state && ctx.state.tasks) || [])
      .filter(t => !isDone(t) && validDue(t) && t.dueDate <= limit)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : String(a.title).localeCompare(String(b.title))))
      .map(t => ({ task: t, label: formatDue(dayDiff(today, t.dueDate)) }));
  }

  const missionsDue = {
    label: 'Missions et échéances',
    collapsed(ctx) {
      const n = dueMissions(ctx).length;
      return n ? n + (n > 1 ? ' missions' : ' mission') : null;
    },
    expanded(ctx) {
      const list = dueMissions(ctx);
      if (!list.length) return null;
      const lines = list.slice(0, MAX_MISSION_LINES).map(m => m.label + ' · ' + (m.task.title || 'Mission'));
      if (list.length > MAX_MISSION_LINES) lines.push('+' + (list.length - MAX_MISSION_LINES) + ' autres');
      return { title: 'Échéances', lines };
    }
  };

  // ---- soirée (modèle de l'agenda) ----
  function eveningOf(ctx) {
    const m = ctx.eveningModel ? ctx.eveningModel(ctx.now) : null;
    return m && Number.isFinite(m.startMin) && Number.isFinite(m.bedtimeMin) ? m : null;
  }
  const evening = {
    label: 'Soirée',
    collapsed(ctx) {
      const m = eveningOf(ctx);
      return m ? 'Soirée dès ' + minToHHMM(m.startMin) : null;
    },
    expanded(ctx) {
      const m = eveningOf(ctx);
      if (!m) return null;
      const lines = ['Soirée dès ' + minToHHMM(m.startMin)];
      if (Number.isFinite(m.dinnerStartMin) && Number.isFinite(m.dinnerEndMin)) {
        lines.push('Dîner ' + minToHHMM(m.dinnerStartMin) + '–' + minToHHMM(m.dinnerEndMin));
      }
      lines.push('Coucher ' + minToHHMM(m.bedtimeMin));
      if (Number.isFinite(m.totalStudyCapacityMin) && Number.isFinite(m.usedStudyMin)) {
        const left = m.totalStudyCapacityMin - m.usedStudyMin;
        lines.push(left > 0 ? 'Étude : ' + formatRemaining(left) + ' restantes' : 'Étude : capacité atteinte');
      }
      return { title: 'Soirée', lines };
    }
  };

  // ---- heure et date ----
  const clock = {
    label: 'Heure et date',
    collapsed(ctx) { return pad2(ctx.now.getHours()) + ':' + pad2(ctx.now.getMinutes()); },
    expanded(ctx) {
      const n = ctx.now;
      return {
        title: "Aujourd'hui",
        lines: [pad2(n.getHours()) + ':' + pad2(n.getMinutes()), DAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()]]
      };
    }
  };

  // ---- compte à rebours vers une mission choisie ----
  function countdownOf(ctx) {
    const id = ctx.cfg.countdownTaskId;
    if (!id) return null;
    const t = ((ctx.state && ctx.state.tasks) || []).find(x => x && String(x.id) === String(id));
    if (!t || isDone(t) || !validDue(t)) return null;
    const diff = dayDiff(isoDate(ctx.now), t.dueDate);
    const label = diff < 0 ? 'En retard de ' + (-diff) + ' j' : (diff === 0 ? "Aujourd'hui" : 'J-' + diff);
    return { label, title: t.title || 'Mission' };
  }
  const countdown = {
    label: 'Compte à rebours',
    collapsed(ctx) { const c = countdownOf(ctx); return c ? c.label + ' · ' + c.title : null; },
    expanded(ctx) { const c = countdownOf(ctx); return c ? { title: 'Compte à rebours', lines: [c.label, c.title] } : null; }
  };

  const ISLAND_MODULES = { 'next-class': nextClass, 'missions-due': missionsDue, evening, clock, countdown };

  function selectIslandView(ctx) {
    const cfg = ctx.cfg || getIslandConfig({}, '');
    const full = Object.assign({}, ctx, { cfg });
    const sections = [];
    const seen = new Set();
    for (const id of cfg.expanded) {
      if (seen.has(id) || !ISLAND_MODULES[id]) continue;
      seen.add(id);
      const view = ISLAND_MODULES[id].expanded(full);
      if (view && view.lines && view.lines.length) sections.push({ id, title: view.title, lines: view.lines });
    }
    const chosen = ISLAND_MODULES[cfg.collapsed];
    const collapsedText = (chosen && chosen.collapsed(full)) || clock.collapsed(full);
    return { collapsedText, sections };
  }

  // Cours qui commence dans les `minutes` prochaines minutes (aujourd'hui seulement) ; null sinon.
  function findUpcomingSlot(ctx, minutes) {
    if (!(minutes > 0)) return null;
    const nm = nowMin(ctx.now);
    for (const s of sortedValidSlots(ctx.slotsForDate(ctx.now))) {
      const delta = timeToMin(s.start) - nm;
      if (delta > 0 && delta <= minutes) return s;
    }
    return null;
  }
  const shouldAutoOpen = (ctx, minutes) => !!findUpcomingSlot(ctx, minutes);

  const api = { ISLAND_IDS, DEFAULT_ISLAND, ISLAND_MODULES, getIslandConfig, selectIslandView, findUpcomingSlot, shouldAutoOpen };
  root.IslandModules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
