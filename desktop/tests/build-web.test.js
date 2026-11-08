const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { rewriteHtml } = require('../scripts/build-web.js');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const localScripts = h => (h.match(/<script src="js\/[^"]+"><\/script>/g) || []);

test('aucune balise script/link ne pointe vers https après réécriture', () => {
  const out = rewriteHtml(html);
  assert.equal(/<script[^>]+src="https?:/i.test(out), false);
  assert.equal(/<link[^>]+href="https?:/i.test(out), false);
});

test('les balises js/*.js sont toutes conservées dans le même ordre', () => {
  const before = localScripts(html);
  assert.ok(before.length >= 14, 'index.html contient au moins les 14 scripts d\'origine');
  assert.deepEqual(localScripts(rewriteHtml(html)), before);
});

test('les ressources locales attendues sont référencées', () => {
  const out = rewriteHtml(html);
  for (const ref of ['vendor/tailwind.js', 'vendor/phosphor/regular/style.css', 'vendor/qrcode.min.js', 'vendor/html5-qrcode.min.js', 'vendor/fonts.css']) {
    assert.ok(out.includes(ref), `manque ${ref}`);
  }
});

test('la réécriture est idempotente', () => {
  const once = rewriteHtml(html);
  assert.equal(rewriteHtml(once), once);
});
