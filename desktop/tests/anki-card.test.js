const test = require('node:test');
const assert = require('node:assert');
const { buildAnkiNoteFields } = require('../../js/anki-card.js');

test('échappe &, < et > et convertit les retours à la ligne', () => {
  assert.deepEqual(buildAnkiNoteFields('a<b', 'x&y\nz'), { Front: 'a&lt;b', Back: 'x&amp;y<br>z' });
});

test('échappe aussi les guillemets doubles, comme escapeHtml de l\'appli', () => {
  assert.deepEqual(buildAnkiNoteFields('say "hi"', 'ok'), { Front: 'say &quot;hi&quot;', Back: 'ok' });
});

test('retours à la ligne Windows (\\r\\n) : un seul <br>', () => {
  assert.equal(buildAnkiNoteFields('a', 'l1\r\nl2').Back, 'l1<br>l2');
});

test('mot ou traduction vide après trim : refus (null)', () => {
  assert.equal(buildAnkiNoteFields('  ', 'x'), null);
  assert.equal(buildAnkiNoteFields('x', '\n\t '), null);
  assert.equal(buildAnkiNoteFields(undefined, 'x'), null);
  assert.equal(buildAnkiNoteFields('x', null), null);
});

test('les espaces autour sont retirés, ceux du milieu conservés', () => {
  assert.deepEqual(buildAnkiNoteFields('  to run  ', ' courir '), { Front: 'to run', Back: 'courir' });
});
