const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { shouldSplash } = require('../src/modes.js');
const { parseArgs } = require('../src/cli.js');
const { computeSplashExit } = require('../../js/splash.js');

const root = path.join(__dirname, '..', '..');
// Lecture au moment du test : un fichier absent fait échouer ce test seulement, pas tout le fichier.
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// ---- quand jouer l'écran de lancement ----
test('shouldSplash : première fenêtre en plein écran ou en widget', () => {
  assert.equal(shouldSplash('fullscreen', { firstWindow: true, noSplash: false }), true);
  assert.equal(shouldSplash('widget', { firstWindow: true, noSplash: false }), true);
});

test('shouldSplash : jamais en HUD', () => {
  assert.equal(shouldSplash('hud', { firstWindow: true, noSplash: false }), false);
});

test('shouldSplash : pas de relecture à chaque changement de mode', () => {
  assert.equal(shouldSplash('fullscreen', { firstWindow: false, noSplash: false }), false);
  assert.equal(shouldSplash('widget', { firstWindow: false, noSplash: false }), false);
});

test('shouldSplash : --no-splash le désactive', () => {
  assert.equal(shouldSplash('fullscreen', { firstWindow: true, noSplash: true }), false);
});

test('parseArgs reconnaît --no-splash', () => {
  assert.equal(parseArgs(['--no-splash']).noSplash, true);
  assert.equal(parseArgs([]).noSplash, false);
});

// ---- quand la fermer ----
test('computeSplashExit : appli prête avant la durée minimale, il reste le délai manquant', () => {
  assert.deepEqual(computeSplashExit({ elapsedMs: 1000, appReady: true }), { exit: false, remainingMs: 800 });
});

test('computeSplashExit : prête et durée minimale écoulée, on sort', () => {
  assert.deepEqual(computeSplashExit({ elapsedMs: 2000, appReady: true }), { exit: true, remainingMs: 0 });
});

test('computeSplashExit : appli pas prête, on attend', () => {
  assert.equal(computeSplashExit({ elapsedMs: 3000, appReady: false }).exit, false);
});

test('computeSplashExit : sécurité à 6 s même si l\'appli n\'est jamais prête', () => {
  assert.equal(computeSplashExit({ elapsedMs: 6000, appReady: false }).exit, true);
});

test('computeSplashExit : un clic ou une touche passe l\'écran immédiatement', () => {
  assert.equal(computeSplashExit({ elapsedMs: 100, skipped: true }).exit, true);
});

test('computeSplashExit : avec « réduire les animations », 600 ms suffisent', () => {
  assert.equal(computeSplashExit({ elapsedMs: 700, appReady: true, reducedMotion: true }).exit, true);
  assert.equal(computeSplashExit({ elapsedMs: 500, appReady: true, reducedMotion: true }).exit, false);
});

// ---- CSS ----
test('le CSS masque l\'écran de lancement par défaut et ne l\'affiche que sous html[data-splash="1"]', () => {
  const css = read('css/splash.css');
  assert.match(css, /\.pcsi-splash\s*\{[^}]*display:\s*none/);
  assert.match(css, /html\[data-splash="1"\]\s+\.pcsi-splash\s*\{[^}]*display:\s*(grid|flex|block)/);
});

test('le CSS prévoit « réduire les animations » et le flux vertical dans le widget', () => {
  const css = read('css/splash.css');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
});

test('le CSS définit les cinq animations', () => {
  const css = read('css/splash.css');
  for (const name of ['splash-block-in', 'splash-arrow-draw', 'splash-packet', 'splash-scan', 'splash-pulse']) {
    assert.match(css, new RegExp(`@keyframes\\s+${name}\\b`), `manque @keyframes ${name}`);
  }
});

// ---- HTML ----
test('index.html contient le diagramme avec ses textes et son étiquette d\'accessibilité', () => {
  const html = read('index.html');
  assert.match(html, /class="pcsi-splash"/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Chargement de PCSI\.OS"/);
  assert.ok(html.includes('Données / Fichiers bruts'));
  assert.ok(html.includes('ENS · ULM · Polytechnique · etc.'));
});
