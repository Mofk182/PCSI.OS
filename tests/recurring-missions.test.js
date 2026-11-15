// tests/recurring-missions.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const configSrc = fs.readFileSync(__dirname + '/../js/config.js', 'utf8');
const utilsSrc = fs.readFileSync(__dirname + '/../js/utils.js', 'utf8');
const stateSrc = fs.readFileSync(__dirname + '/../js/state.js', 'utf8');
const missionsSrc = fs.readFileSync(__dirname + '/../js/missions.js', 'utf8');

let lastToast = '';

const context = {
  window: {},
  document: {
    getElementById: () => ({ style: {}, innerHTML: '', value: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  sessionStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); }
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  showToast: (msg) => { lastToast = msg; },
  escapeHtml: (s) => String(s || ''),
  setInterval: () => {},
  clearTimeout: () => {},
  setTimeout: () => {}
};
context.window = context;

vm.createContext(context);
vm.runInContext(configSrc, context);
vm.runInContext(utilsSrc, context);
context.showToast = (msg) => { lastToast = msg; };
vm.runInContext(stateSrc, context);
vm.runInContext(missionsSrc, context);
vm.runInContext('window.state = state;', context);

// 1. Test computeNextRecurrenceDates (Weekly Sunday & every X days)
{
  const recSunday = { enabled: true, type: 'weekly', dayOfWeek: 0, daysInterval: 7 };
  // 2026-11-15 is a Sunday
  const sameOrNext = context.computeNextRecurrenceDates(recSunday, '2026-11-15', false, 2);
  assert.deepStrictEqual(Array.from(sameOrNext), ['2026-11-15', '2026-11-22'], 'Weekly Sunday from Sunday (strictlyAfter=false) returns today and next Sunday');

  const strictlyNext = context.computeNextRecurrenceDates(recSunday, '2026-11-15', true, 2);
  assert.deepStrictEqual(Array.from(strictlyNext), ['2026-11-22', '2026-11-29'], 'Weekly Sunday from Sunday (strictlyAfter=true) returns next 2 Sundays');

  const recEvery3Days = { enabled: true, type: 'days', dayOfWeek: 0, daysInterval: 3 };
  const next3Days = context.computeNextRecurrenceDates(recEvery3Days, '2026-11-15', true, 2);
  assert.deepStrictEqual(Array.from(next3Days), ['2026-11-18', '2026-11-21'], 'Every 3 days strictlyAfter returns +3d and +6d');
  console.log('ok: computeNextRecurrenceDates (weekly & every X days)');
}

// 2. Test automatic disappearance of past non-recurring tasks & roll-forward of past recurring tasks
{
  const todayISO = context.formatDateISO(new Date());
  const pastISO = '2020-01-05'; // Definitely in the past
  const futureISO = '2099-12-31';

  context.state.tasks = [
    { id: 't_past_once', title: 'Vieille quête passée', dueDate: pastISO, subject: 'maths', type: 'TD', recurrence: { enabled: false } },
    { id: 't_past_rec', title: 'QCM Hebdo Dimanche', dueDate: pastISO, subject: 'physique', type: 'Exercice', recurrence: { enabled: true, type: 'weekly', dayOfWeek: 0, daysInterval: 7 } },
    { id: 't_future_once', title: 'DM Futur', dueDate: futureISO, subject: 'chimie', type: 'DM', recurrence: { enabled: false } }
  ];

  context.normalizeTasksState();

  const remainingIds = context.state.tasks.map(t => t.id);
  assert.ok(!remainingIds.includes('t_past_once'), 'Past non-recurring task must automatically disappear');
  assert.ok(remainingIds.includes('t_future_once'), 'Future non-recurring task must be kept');
  assert.ok(remainingIds.includes('t_past_rec'), 'Past recurring task must be kept and rolled forward');

  const rolledTask = context.state.tasks.find(t => t.id === 't_past_rec');
  assert.ok(rolledTask.dueDate >= todayISO, `Rolled recurring task dueDate (${rolledTask.dueDate}) must be >= today (${todayISO})`);
  assert.strictEqual(rolledTask.completed, false, 'Rolled recurring task must be reset to incomplete');
  console.log('ok: past non-recurring tasks disappear & recurring tasks roll forward');
}

// 3. Test completing a recurring task advances it to the next occurrence instead of staying done
{
  const recTask = {
    id: 't_qcm_dim',
    title: 'QCM Physique Dimanche',
    subject: 'physique',
    type: 'Exercice',
    dueDate: '2026-11-15',
    completed: false,
    status: 'todo',
    recurrence: { enabled: true, type: 'weekly', dayOfWeek: 0, daysInterval: 7 }
  };
  context.state.tasks = [recTask];
  context.setTaskCompletedState(recTask, true);

  assert.strictEqual(recTask.completed, false, 'Recurring task remains active for its next cycle');
  assert.strictEqual(recTask.status, 'todo', 'Recurring task status is reset to todo');
  assert.ok(recTask.dueDate > '2026-11-15', `Recurring task dueDate advanced to ${recTask.dueDate}`);
  console.log('ok: completing a recurring task schedules next occurrence automatically');
}

// 4. Test tension threshold alert notification
{
  lastToast = '';
  context.sessionStorage._data = {};
  context.state.settings.tensionAlertEnabled = true;
  context.state.settings.tensionAlertThreshold = 70;

  const todayISO = context.formatDateISO(new Date());
  context.state.tasks = [
    {
      id: 't_high_tension',
      title: 'DS Maths Critique',
      subject: 'maths',
      type: 'DS',
      importance: 2.2,
      duration: 4,
      dueDate: todayISO,
      completed: false,
      status: 'todo'
    }
  ];

  context.checkTensionThresholdAlerts();
  assert.ok(lastToast.includes('Seuil de tension (70%) atteint'), `Expected tension alert toast, got: ${lastToast}`);

  // Second call on same day/threshold should not spam
  lastToast = '';
  context.checkTensionThresholdAlerts();
  assert.strictEqual(lastToast, '', 'Should not spam duplicate alert for the same task and threshold on the same day');
  console.log('ok: tension threshold notification and anti-spam');
}

console.log('ALL RECURRING MISSIONS & TENSION ALERT TESTS PASSED !');
