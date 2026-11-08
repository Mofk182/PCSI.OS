// tests/smoke-ui.js
// Smoke test for UI handlers: pickColleGroup, answerWeekParity, shiftStagedSlot, setForcedKind

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Minimal DOM & browser mock
global.window = global;
global.document = {
  getElementById: (id) => {
    return {
      style: {},
      innerHTML: '',
      value: '',
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      }
    };
  }
};

global.SUBJECTS = {
  maths: { id: 'maths', name: 'Mathématiques', short: 'MATHS', color: '#3B82F6' },
  physique: { id: 'physique', name: 'Physique', short: 'PHYS', color: '#10B981' },
  chimie: { id: 'chimie', name: 'Chimie', short: 'CHIM', color: '#F59E0B' },
  si: { id: 'si', name: 'S.I.', short: 'SI', color: '#8B5CF6' },
  francais: { id: 'francais', name: 'Français-Philo', short: 'FR', color: '#EC4899' },
  anglais: { id: 'anglais', name: 'Anglais', short: 'ANG', color: '#06B6D4' }
};

global.getSubject = (id) => global.SUBJECTS[id] || global.SUBJECTS.maths;
global.DAYS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
global.escapeHtml = (s) => String(s || '');
global.showToast = () => {};
global.saveState = () => {};
global.todayISO = () => '2026-11-09'; // Monday

global.state = {
  settings: {},
  schedule: [],
  scheduleDocs: []
};

// Load js/ai-import.js
require('../js/ai-import.js');

// Verify exports on global/window
assert(typeof global.isSlotActiveOn === 'function', 'isSlotActiveOn must be available');
assert(typeof global.mondayOfISO === 'function', 'mondayOfISO must be available');
assert(typeof global.resolveEvents === 'function', 'resolveEvents must be available');

// Load js/data.js code in this context
const dataCode = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf-8');
eval(dataCode);

// 1. Test pickColleGroup
assert(typeof window.pickColleGroup === 'function', 'pickColleGroup should be a function');
window.pickColleGroup('Trinôme 3');
assert.strictEqual(state.settings.colleGroup, 'Trinôme 3', 'pickColleGroup sets state.settings.colleGroup');

// 2. Test answerWeekParity
assert(typeof window.answerWeekParity === 'function', 'answerWeekParity should be a function');
window.answerWeekParity('A');
assert.strictEqual(state.settings.weekAMonday, '2026-11-09', 'answerWeekParity A sets weekAMonday to this monday');
window.answerWeekParity('B');
assert.strictEqual(state.settings.weekAMonday, '2026-11-02', 'answerWeekParity B sets weekAMonday to previous monday');

// 3. Test shiftStagedSlot
assert(typeof window.shiftStagedSlot === 'function', 'shiftStagedSlot should be a function');
// Mock staged slot
window.setStagedAiSlots([{
  id: 's1',
  title: 'TP Physique',
  dayOfWeek: 1,
  every: 2,
  anchor: '2026-11-09',
  shiftable: true
}]);
window.shiftStagedSlot(0);
const slotsAfter = window.getStagedAiSlots();
assert.strictEqual(slotsAfter[0].anchor, '2026-11-16', 'shiftStagedSlot shifts anchor by +7 days');

// 4. Test setForcedKind
assert(typeof window.setForcedKind === 'function', 'setForcedKind should be a function');
window.setForcedKind('colloscope');
assert.strictEqual(window.getStagedForcedKind(), 'colloscope', 'setForcedKind updates stagedForcedKind');

console.log('ALL SMOKE UI TESTS PASSED !');
