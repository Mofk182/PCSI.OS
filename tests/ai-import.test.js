// tests/ai-import.test.js
const assert = require('node:assert');
const aiImport = require('../js/ai-import.js');

const {
  addDaysISO,
  mondayOfISO,
  weekdayIndex,
  parseDocDate,
  isSlotActiveOn,
  parseAiJson,
  buildUniversalPrompt,
  resolveEvents,
  maxImageDimFor
} = aiImport;

// 1. weekdayIndex
assert.strictEqual(weekdayIndex('lundi'), 0);
assert.strictEqual(weekdayIndex('Mer.'), 2);
assert.strictEqual(weekdayIndex(' MERCREDI '), 2);
assert.strictEqual(weekdayIndex('samedi'), 5);
assert.strictEqual(weekdayIndex('dimanche'), null);
assert.strictEqual(weekdayIndex(null), null);
console.log('ok: weekdayIndex');

// 2. parseDocDate
assert.strictEqual(parseDocDate('14/09/26', '2026-11-07'), '2026-09-14');
assert.strictEqual(parseDocDate('14/09', '2026-11-07'), '2026-09-14');
assert.strictEqual(parseDocDate('05/01', '2026-11-07'), '2027-01-05');
assert.strictEqual(parseDocDate('31/02/26', '2026-11-07'), null);
assert.strictEqual(parseDocDate('2026-11-09', '2026-11-07'), '2026-11-09');
console.log('ok: parseDocDate');

// 3. mondayOfISO & addDaysISO
assert.strictEqual(mondayOfISO('2026-11-11'), '2026-11-09');
assert.strictEqual(addDaysISO('2026-10-25', 7), '2026-11-01');
console.log('ok: mondayOfISO & addDaysISO');

// 4. isSlotActiveOn
// sans every -> actif chaque semaine
const weeklySlot = { dayOfWeek: 2 };
assert.strictEqual(isSlotActiveOn(weeklySlot, '2026-11-11'), true);
assert.strictEqual(isSlotActiveOn(weeklySlot, '2026-11-18'), true);

// avec every: 2 et anchor
const biweeklySlot = { dayOfWeek: 2, every: 2, anchor: '2026-11-09' };
assert.strictEqual(isSlotActiveOn(biweeklySlot, '2026-11-11'), true);
assert.strictEqual(isSlotActiveOn(biweeklySlot, '2026-11-18'), false);
assert.strictEqual(isSlotActiveOn(biweeklySlot, '2026-11-25'), true);

// DST switch test: anchor '2026-10-19'
const biweeklyDst = { dayOfWeek: 2, every: 2, anchor: '2026-10-19' };
// 2026-10-21 (week 0) -> true
// 2026-10-28 (week 1, after DST on 2026-10-25) -> false
// 2026-11-04 (week 2) -> true
assert.strictEqual(isSlotActiveOn(biweeklyDst, '2026-10-21'), true);
assert.strictEqual(isSlotActiveOn(biweeklyDst, '2026-10-28'), false);
assert.strictEqual(isSlotActiveOn(biweeklyDst, '2026-11-04'), true);

// créneau ponctuel avec date
const singleSlot = { date: '2026-11-11' };
assert.strictEqual(isSlotActiveOn(singleSlot, '2026-11-11'), true);
assert.strictEqual(isSlotActiveOn(singleSlot, '2026-11-18'), false);
console.log('ok: isSlotActiveOn');

// 5. parseAiJson
assert.strictEqual(parseAiJson(''), null);
assert.strictEqual(parseAiJson('pas du json'), null);
const parsedObj = parseAiJson('```json\n{"kind":"colloscope","events":[]}\n```');
assert.deepStrictEqual(parsedObj, { kind: 'colloscope', events: [] });
console.log('ok: parseAiJson');

// 6. resolveEvents
const dummyMatchSubject = (text) => {
  const t = String(text || '').toLowerCase();
  if (t.includes('math')) return 'maths';
  if (t.includes('phys')) return 'physique';
  return 'maths';
};

// Fixture colloscope annulé / actif
const colloscopeFixture = {
  kind: 'colloscope',
  groupsDetected: ['9'],
  events: [
    { weekday: 'mercredi', weekStart: '09/11/26', start: '15:30', end: null, type: 'COLLE', subject: 'maths', title: null, room: 'M. Lartaux', cancelled: true },
    { weekday: 'mercredi', weekStart: '16/11/26', start: '15:30', end: null, type: 'COLLE', subject: 'maths', title: null, room: 'M. Lartaux', cancelled: false },
    { weekday: 'jeudi', weekStart: null, date: null, frequency: 'weekly', start: '08:00', end: '10:00', type: 'COURS', subject: 'physique', title: null, room: 'B1' },
    { weekday: null, weekStart: null, date: null, start: '10:00', end: '12:00', type: 'TD', subject: 'maths', title: null }
  ]
};

const resolvedCollo = resolveEvents(colloscopeFixture, {
  todayISO: '2026-11-07',
  weekAMonday: '2026-11-09',
  group: '9',
  matchSubject: dummyMatchSubject,
  subjectIds: ['maths', 'physique']
});

assert.strictEqual(resolvedCollo.slots.length, 3); // la ligne 1 annulée est écartée
// Ligne 2 : weekStart 16/11/26 + mercredi -> 2026-11-18, end: 16:30
assert.strictEqual(resolvedCollo.slots[0].date, '2026-11-18');
assert.strictEqual(resolvedCollo.slots[0].start, '15:30');
assert.strictEqual(resolvedCollo.slots[0].end, '16:30');
assert.strictEqual(resolvedCollo.slots[0].room, 'M. Lartaux');
assert.strictEqual(resolvedCollo.slots[0].incomplete, undefined);

// Ligne 3 : jeudi récurrent weekly -> dayOfWeek: 3
assert.strictEqual(resolvedCollo.slots[1].dayOfWeek, 3);

// Ligne 4 : weekday null et sans date -> incomplete: true, missing contient 'jour'
assert.strictEqual(resolvedCollo.slots[2].incomplete, true);
assert.ok(resolvedCollo.slots[2].missing && resolvedCollo.slots[2].missing.includes('jour'));
console.log('ok: resolveEvents colloscope');

// 7. Récurrence biweekly
const biweeklyFixtureA = {
  kind: 'edt',
  events: [
    { weekday: 'mardi', frequency: 'biweekly', parity: 'A', start: '08:00', end: '10:00', subject: 'maths' }
  ]
};
const resBiA = resolveEvents(biweeklyFixtureA, {
  todayISO: '2026-11-07',
  weekAMonday: '2026-11-09',
  group: null,
  matchSubject: dummyMatchSubject,
  subjectIds: ['maths']
});
assert.strictEqual(resBiA.slots[0].every, 2);
assert.strictEqual(resBiA.slots[0].anchor, '2026-11-09');

const biweeklyFixtureB = {
  kind: 'edt',
  events: [
    { weekday: 'mardi', frequency: 'biweekly', parity: 'B', start: '08:00', end: '10:00', subject: 'maths' }
  ]
};
const resBiB = resolveEvents(biweeklyFixtureB, {
  todayISO: '2026-11-07',
  weekAMonday: '2026-11-09',
  group: null,
  matchSubject: dummyMatchSubject,
  subjectIds: ['maths']
});
assert.strictEqual(resBiB.slots[0].every, 2);
assert.strictEqual(resBiB.slots[0].anchor, '2026-11-16');

// parity: 'A' sans weekAMonday -> needs.parity === true
const resBiNoWeekA = resolveEvents(biweeklyFixtureA, {
  todayISO: '2026-11-07',
  weekAMonday: null,
  group: null,
  matchSubject: dummyMatchSubject,
  subjectIds: ['maths']
});
assert.strictEqual(resBiNoWeekA.needs.parity, true);

// parity: null -> anchor = lundi de todayISO ('2026-11-02'), shiftable: true
const biweeklyFixtureNoParity = {
  kind: 'edt',
  events: [
    { weekday: 'mardi', frequency: 'biweekly', parity: null, start: '08:00', end: '10:00', subject: 'maths' }
  ]
};
const resBiNoParity = resolveEvents(biweeklyFixtureNoParity, {
  todayISO: '2026-11-07',
  weekAMonday: null,
  group: null,
  matchSubject: dummyMatchSubject,
  subjectIds: ['maths']
});
assert.strictEqual(resBiNoParity.slots[0].every, 2);
assert.strictEqual(resBiNoParity.slots[0].anchor, '2026-11-02');
assert.strictEqual(resBiNoParity.slots[0].shiftable, true);
console.log('ok: resolveEvents recurrence');

// 8. Colloscope sans groupe
const colloNoGroup = {
  kind: 'colloscope',
  groupsDetected: ['1', '2'],
  events: []
};
const resNoGroup = resolveEvents(colloNoGroup, {
  todayISO: '2026-11-07',
  weekAMonday: null,
  group: null,
  matchSubject: dummyMatchSubject,
  subjectIds: ['maths']
});
assert.strictEqual(resNoGroup.needs.group, true);
assert.strictEqual(resNoGroup.slots.length, 0);
console.log('ok: resolveEvents needs.group');

// 9. maxImageDimFor
assert.strictEqual(maxImageDimFor('Colloscope'), 2200);
assert.strictEqual(maxImageDimFor('colloscope'), 2200);
assert.strictEqual(maxImageDimFor('Emploi du temps'), 1450);
assert.strictEqual(maxImageDimFor(undefined), 1450);
console.log('ok: maxImageDimFor');

// 10. buildUniversalPrompt
const promptWithGroup = buildUniversalPrompt(
  { category: 'Colloscope', pdfHintText: '' },
  { todayISO: '2026-11-07', subjectsList: '"maths" (Maths)', userHint: '', group: '9', forcedKind: 'colloscope' }
);
assert.ok(promptWithGroup.includes('9'));
assert.ok(promptWithGroup.includes('colloscope'));
assert.ok(promptWithGroup.includes('null plutôt que deviner') || promptWithGroup.includes('mets null'));
assert.ok(promptWithGroup.includes('"maths" (Maths)'));

const promptNoGroup = buildUniversalPrompt(
  { category: 'Colloscope', pdfHintText: '' },
  { todayISO: '2026-11-07', subjectsList: '"maths" (Maths)', userHint: '', group: null, forcedKind: null }
);
assert.ok(promptNoGroup.includes('events": []') || promptNoGroup.includes('groupsDetected'));
console.log('ok: buildUniversalPrompt');

console.log('ALL AI-IMPORT TESTS PASSED');
