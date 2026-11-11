const test = require('node:test');
const assert = require('node:assert');
const {
  getIslandConfig, selectIslandView, shouldAutoOpen, findUpcomingSlot, ISLAND_MODULES, DEFAULT_ISLAND
} = require('../../js/island-modules.js');

// Lundi 9 novembre 2026, 08:30 (heure locale)
const NOW = new Date(2026, 10, 9, 8, 30);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TODAY_SLOTS = [
  { id: 's1', title: 'Maths', subject: 'maths', start: '07:00', end: '08:00', room: 'B203' },
  { id: 's2', title: 'Physique', subject: 'physique', start: '08:38', end: '10:38', room: 'A12' },
  { id: 's3', title: 'Chimie', subject: 'chimie', start: '10:45', end: '12:45' }
];
const slotsFor = byDate => d => byDate[iso(d)] || [];
const cfg = over => Object.assign({}, DEFAULT_ISLAND, { expanded: ['next-class', 'missions-due', 'evening', 'clock', 'countdown'] }, over);
const ctx = (over = {}) => Object.assign({
  state: { tasks: [], schedule: [] },
  now: NOW,
  cfg: cfg(),
  slotsForDate: slotsFor({ '2026-11-09': TODAY_SLOTS }),
  eveningModel: () => null
}, over);

test('next-class : premier créneau qui commence après maintenant, avec heure, matière et salle', () => {
  const v = selectIslandView(ctx({ cfg: cfg({ collapsed: 'next-class', expanded: ['next-class'] }) }));
  assert.equal(v.collapsedText, '08:38 · Physique');
  assert.deepEqual(v.sections, [{ id: 'next-class', title: 'Prochain cours', lines: ['08:38–10:38 · Physique', 'Salle A12'] }]);
});

test('next-class : un cours en cours est affiché comme tel', () => {
  const v = selectIslandView(ctx({ now: new Date(2026, 10, 9, 9, 0), cfg: cfg({ collapsed: 'next-class', expanded: ['next-class'] }) }));
  assert.equal(v.collapsedText, 'En cours · Physique');
  assert.equal(v.sections[0].title, 'Cours en cours');
});

test('next-class : plus de cours aujourd\'hui, on regarde les jours suivants', () => {
  const tomorrow = [{ id: 't1', title: 'Maths', start: '08:00', end: '10:00', room: 'B1' }];
  const v = selectIslandView(ctx({
    now: new Date(2026, 10, 9, 18, 0),
    slotsForDate: slotsFor({ '2026-11-09': TODAY_SLOTS, '2026-11-10': tomorrow }),
    cfg: cfg({ collapsed: 'next-class', expanded: ['next-class'] })
  }));
  assert.equal(v.collapsedText, 'Demain 08:00 · Maths');
});

test('creneaux invalides (heure illisible) ignorés sans exception', () => {
  const v = selectIslandView(ctx({
    slotsForDate: slotsFor({ '2026-11-09': [{ title: 'Cassé', start: 'abc', end: '??' }, { title: 'Ok', start: '09:00', end: '10:00' }] }),
    cfg: cfg({ collapsed: 'next-class', expanded: ['next-class'] })
  }));
  assert.equal(v.collapsedText, '09:00 · Ok');
});

test('missions-due : ignore les missions terminées et celles au-delà de dueWithinDays, garde les retards', () => {
  const tasks = [
    { id: 'a', title: 'DM Maths', dueDate: '2026-11-10' },
    { id: 'b', title: 'TD Physique', dueDate: '2026-11-09' },
    { id: 'c', title: 'Colle', dueDate: '2026-11-20' },
    { id: 'd', title: 'Fini', dueDate: '2026-11-09', completed: true },
    { id: 'e', title: 'Retard', dueDate: '2026-11-07' },
    { id: 'f', title: 'Fait aussi', dueDate: '2026-11-10', status: 'done' },
    { id: 'g', title: 'Sans date' },
    { id: 'h', title: 'Date folle', dueDate: 'abc' }
  ];
  const v = selectIslandView(ctx({ state: { tasks, schedule: [] }, cfg: cfg({ collapsed: 'missions-due', expanded: ['missions-due'], dueWithinDays: 3 }) }));
  assert.equal(v.collapsedText, '3 missions');
  assert.deepEqual(v.sections[0].lines, ['En retard · Retard', "Aujourd'hui · TD Physique", 'Demain · DM Maths']);
});

test('missions-due : au plus 4 lignes puis « +N autres »', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, title: 'M' + i, dueDate: '2026-11-09' }));
  const v = selectIslandView(ctx({ state: { tasks, schedule: [] }, cfg: cfg({ expanded: ['missions-due'] }) }));
  assert.equal(v.sections[0].lines.length, 5);
  assert.equal(v.sections[0].lines[4], '+2 autres');
});

test('evening : lignes de la soirée à partir du modèle de l\'agenda', () => {
  const model = { startMin: 1050, dinnerStartMin: 1140, dinnerEndMin: 1200, bedtimeMin: 1380, totalStudyCapacityMin: 240, usedStudyMin: 90 };
  const v = selectIslandView(ctx({ eveningModel: () => model, cfg: cfg({ collapsed: 'evening', expanded: ['evening'] }) }));
  assert.deepEqual(v.sections[0].lines, ['Soirée dès 17:30', 'Dîner 19:00–20:00', 'Coucher 23:00', 'Étude : 2 h 30 restantes']);
  assert.equal(v.collapsedText, 'Soirée dès 17:30');
});

test('evening : modèle absent => module omis', () => {
  const v = selectIslandView(ctx({ cfg: cfg({ expanded: ['evening'] }) }));
  assert.deepEqual(v.sections, []);
});

test('countdown : jours restants vers la mission choisie ; identifiant inconnu => omis', () => {
  const tasks = [{ id: 'x', title: 'DS de physique', dueDate: '2026-11-14' }];
  const v = selectIslandView(ctx({ state: { tasks, schedule: [] }, cfg: cfg({ collapsed: 'countdown', expanded: ['countdown'], countdownTaskId: 'x' }) }));
  assert.equal(v.collapsedText, 'J-5 · DS de physique');
  assert.deepEqual(v.sections[0].lines, ['J-5', 'DS de physique']);
  const unknown = selectIslandView(ctx({ state: { tasks, schedule: [] }, cfg: cfg({ expanded: ['countdown'], countdownTaskId: 'zzz' }) }));
  assert.deepEqual(unknown.sections, []);
});

test('clock : heure et date en français', () => {
  const v = selectIslandView(ctx({ cfg: cfg({ collapsed: 'clock', expanded: ['clock'] }) }));
  assert.equal(v.collapsedText, '08:30');
  assert.deepEqual(v.sections[0].lines, ['08:30', 'lundi 9 novembre']);
});

test('état vide : aucune section, et l\'île affiche l\'heure', () => {
  const v = selectIslandView(ctx({ slotsForDate: () => [], cfg: cfg({ collapsed: 'next-class', expanded: ['next-class', 'missions-due', 'evening'] }) }));
  assert.deepEqual(v.sections, []);
  assert.equal(v.collapsedText, '08:30');
});

test('configuration par défaut sur un état vide : seule l\'heure apparaît', () => {
  const v = selectIslandView(ctx({ slotsForDate: () => [], cfg: getIslandConfig({}, 'win32') }));
  assert.deepEqual(v.sections.map(s => s.id), ['clock']);
  assert.equal(v.collapsedText, '08:30');
});

test('modules inconnus ou en double dans expanded : ignorés', () => {
  const v = selectIslandView(ctx({ cfg: cfg({ expanded: ['clock', 'nimporte', 'clock'] }) }));
  assert.deepEqual(v.sections.map(s => s.id), ['clock']);
});

test('shouldAutoOpen : vrai quand un cours commence dans les minutes données', () => {
  assert.equal(shouldAutoOpen(ctx(), 10), true);      // 08:38 dans 8 min
  assert.equal(shouldAutoOpen(ctx(), 5), false);      // trop tôt
  assert.equal(shouldAutoOpen(ctx(), 0), false);      // désactivé
  assert.equal(shouldAutoOpen(ctx({ now: new Date(2026, 10, 9, 8, 40) }), 10), false);   // déjà commencé
});

test('findUpcomingSlot renvoie le créneau concerné (pour ne pas rouvrir deux fois)', () => {
  assert.equal(findUpcomingSlot(ctx(), 10).id, 's2');
  assert.equal(findUpcomingSlot(ctx(), 5), null);
});

test('getIslandConfig : défauts, validation et Linux forcé en raccourci', () => {
  assert.equal(getIslandConfig({}, 'win32').trigger, 'hover');
  assert.equal(getIslandConfig({}, 'linux').trigger, 'shortcut');
  assert.equal(getIslandConfig({ island: { trigger: 'shortcut' } }, 'win32').trigger, 'shortcut');
  assert.equal(getIslandConfig({ island: { trigger: 'hover' } }, 'linux').trigger, 'shortcut');
  const d = getIslandConfig({}, 'win32');
  assert.deepEqual(d.expanded, ['next-class', 'missions-due', 'clock']);
  assert.equal(d.collapsed, 'next-class');
  assert.equal(d.autoOpenMinutesBeforeClass, 10);
  assert.equal(d.dueWithinDays, 3);
  assert.equal(d.countdownTaskId, null);
  const bad = getIslandConfig({ island: { collapsed: 'x', expanded: 'oui', autoOpenMinutesBeforeClass: -4, dueWithinDays: 'beaucoup', trigger: 7 } }, 'win32');
  assert.equal(bad.collapsed, 'next-class');
  assert.deepEqual(bad.expanded, ['next-class', 'missions-due', 'clock']);
  assert.equal(bad.autoOpenMinutesBeforeClass, 10);
  assert.equal(bad.dueWithinDays, 3);
  assert.equal(bad.trigger, 'hover');
});

test('le registre expose un libellé par module', () => {
  for (const id of ['next-class', 'missions-due', 'evening', 'clock', 'countdown']) {
    assert.equal(typeof ISLAND_MODULES[id].label, 'string');
  }
});
