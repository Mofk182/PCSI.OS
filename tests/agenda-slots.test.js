// tests/agenda-slots.test.js
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const aiImport = require('../js/ai-import.js');

// Extraire getDayScheduleSlots de js/agenda.js
const agendaSrc = fs.readFileSync(__dirname + '/../js/agenda.js', 'utf8');
const match = agendaSrc.match(/function getDayScheduleSlots[\s\S]*?\n\}/);
if (!match) throw new Error('getDayScheduleSlots not found in agenda.js');

const context = {
  isSlotActiveOn: aiImport.isSlotActiveOn,
  formatDateISO: (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  isFrenchBankHoliday: () => false,
  state: {
    schedule: [
      // 1. Bi-hebdomadaire mercredi (dayOfWeek: 2, every: 2, anchor: '2026-11-09')
      { id: 's_bi', dayOfWeek: 2, every: 2, anchor: '2026-11-09', title: 'TP Physique' },
      // 2. Hebdomadaire sans every (dayOfWeek: 2)
      { id: 's_hebdo', dayOfWeek: 2, title: 'Cours Maths' },
      // 3. Ponctuel daté le 2026-11-11
      { id: 's_once', date: '2026-11-11', title: 'Colle Spéciale' }
    ]
  }
};

vm.createContext(context);
vm.runInContext(match[0], context);

// Test 1 : Mercredi 2026-11-11 (semaine active pour s_bi)
const d1 = new Date(2026, 10, 11); // Mois 10 = Nov
const res1 = context.getDayScheduleSlots(d1, 2);
const ids1 = res1.map(s => s.id);
assert.ok(ids1.includes('s_bi'), 's_bi doit être actif le 2026-11-11');
assert.ok(ids1.includes('s_hebdo'), 's_hebdo doit être actif le 2026-11-11');
assert.ok(ids1.includes('s_once'), 's_once doit être actif le 2026-11-11');
console.log('ok: slots actifs le 2026-11-11');

// Test 2 : Mercredi 2026-11-18 (semaine inactive pour s_bi)
const d2 = new Date(2026, 10, 18);
const res2 = context.getDayScheduleSlots(d2, 2);
const ids2 = res2.map(s => s.id);
assert.ok(!ids2.includes('s_bi'), 's_bi NE doit PAS être actif le 2026-11-18');
assert.ok(ids2.includes('s_hebdo'), 's_hebdo doit être actif le 2026-11-18');
assert.ok(!ids2.includes('s_once'), 's_once NE doit PAS être actif le 2026-11-18');
console.log('ok: s_bi et s_once inactifs le 2026-11-18');

// Test 3 : Mercredi 2026-11-25 (semaine active pour s_bi)
const d3 = new Date(2026, 10, 25);
const res3 = context.getDayScheduleSlots(d3, 2);
const ids3 = res3.map(s => s.id);
assert.ok(ids3.includes('s_bi'), 's_bi doit être actif le 2026-11-25');
assert.ok(ids3.includes('s_hebdo'), 's_hebdo doit être actif le 2026-11-25');
console.log('ok: s_bi réactif le 2026-11-25');

console.log('ALL AGENDA-SLOTS TESTS PASSED');
