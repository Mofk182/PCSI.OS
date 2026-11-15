// tests/daily-drop.test.js : validation of daily drop content and rotation index
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/daily_culture.json');
const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);

assert.ok(data.pressKiosk, 'pressKiosk must be present');
assert.ok(Array.isArray(data.drops), 'drops must be an array');
assert.strictEqual(data.drops.length, 31, 'Must have exactly 31 daily drops');

const seenIds = new Set();
data.drops.forEach((d, idx) => {
  const expectedId = `drop_${String(idx + 1).padStart(2, '0')}`;
  assert.strictEqual(d.id, expectedId, `Drop #${idx + 1} id must be ${expectedId}`);
  assert.ok(!seenIds.has(d.id), `Duplicate drop id: ${d.id}`);
  seenIds.add(d.id);

  assert.ok(d.theme && d.theme.length > 3, `Drop ${d.id} theme missing`);

  // Word of the day
  const w = d.wordOfTheDay;
  assert.ok(w, `Drop ${d.id} wordOfTheDay missing`);
  assert.ok(w.word && w.word.length > 1, `Drop ${d.id} word missing`);
  assert.ok(w.phonetic && w.phonetic.startsWith('/'), `Drop ${d.id} phonetic missing`);
  assert.ok(w.meaning && w.meaning.length > 5, `Drop ${d.id} meaning missing`);
  assert.ok(w.example && w.example.length > 10, `Drop ${d.id} example missing`);
  assert.ok(w.exampleTranslation && w.exampleTranslation.length > 10, `Drop ${d.id} exampleTranslation missing`);
  assert.ok(Array.isArray(w.collocations) && w.collocations.length >= 2, `Drop ${d.id} collocations missing`);

  // Daily focus
  const f = d.dailyFocus;
  assert.ok(f, `Drop ${d.id} dailyFocus missing`);
  assert.ok(['grammar', 'vocab'].includes(f.defaultMode), `Drop ${d.id} invalid defaultMode`);
  assert.ok(f.topicTitle && f.topicTitle.length > 3, `Drop ${d.id} topicTitle missing`);
  assert.ok(Array.isArray(f.topicalWords) && f.topicalWords.length >= 5, `Drop ${d.id} must have >= 5 topicalWords`);
  f.topicalWords.forEach((tw, twIdx) => {
    assert.ok(tw.term, `Drop ${d.id} topicalWord ${twIdx} missing term`);
    assert.ok(tw.translation, `Drop ${d.id} topicalWord ${twIdx} missing translation`);
  });
  assert.ok(Array.isArray(f.grammarTraps) && f.grammarTraps.length >= 2, `Drop ${d.id} must have >= 2 grammarTraps`);
  f.grammarTraps.forEach((gt, gtIdx) => {
    assert.ok(gt.title, `Drop ${d.id} grammarTrap ${gtIdx} missing title`);
    assert.ok(gt.rule, `Drop ${d.id} grammarTrap ${gtIdx} missing rule`);
    assert.ok(gt.wrong, `Drop ${d.id} grammarTrap ${gtIdx} missing wrong example`);
    assert.ok(gt.right, `Drop ${d.id} grammarTrap ${gtIdx} missing right example`);
  });

  // Article of the day (doit être sous la forme https://archive.ph/https://...)
  const art = d.articleOfTheDay;
  assert.ok(art, `Drop ${d.id} articleOfTheDay missing`);
  assert.ok(art.title && art.title.length > 5, `Drop ${d.id} article title missing`);
  assert.ok(art.source && art.source.length > 2, `Drop ${d.id} article source missing`);
  assert.ok(art.abstract && art.abstract.length > 10, `Drop ${d.id} article abstract missing`);
  assert.ok(art.url && art.url.startsWith('https://archive.ph/https://'), `Drop ${d.id} article url must start with https://archive.ph/https://`);

  // Culture G de niche
  const cg = d.cultureGNiche;
  assert.ok(cg, `Drop ${d.id} cultureGNiche missing`);
  assert.ok(cg.category, `Drop ${d.id} cultureGNiche category missing`);
  assert.ok(cg.title && cg.title.length > 5, `Drop ${d.id} cultureGNiche title missing`);
  assert.ok(cg.hook && cg.hook.length > 20, `Drop ${d.id} cultureGNiche hook missing`);
  assert.ok(cg.details && cg.details.length > 50, `Drop ${d.id} cultureGNiche details missing`);
});

// Validation de la structure du kiosque par pays et par type
assert.ok(Array.isArray(data.pressKiosk.countries), 'pressKiosk.countries must be an array');
assert.ok(data.pressKiosk.countries.length >= 3, 'Must have at least 3 countries (UK, US, INTL)');
data.pressKiosk.countries.forEach(c => {
  assert.ok(c.id && c.name && c.flag, `Country ${c.id} missing basic fields`);
  assert.ok(Array.isArray(c.types) && c.types.length >= 1, `Country ${c.id} must have types`);
  c.types.forEach(t => {
    assert.ok(t.id && t.name && Array.isArray(t.sources) && t.sources.length >= 1, `Type ${t.id} missing fields`);
    t.sources.forEach(s => {
      assert.ok(s.id && s.name && s.url && s.desc, `Source ${s.id} in country ${c.id} missing fields`);
    });
  });
});

console.log('ALL DAILY-DROP TESTS PASSED (31 drops & categorized kiosk validated)!');
