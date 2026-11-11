// splash.js : écran de lancement (diagramme de flux SysML) de l'appli de bureau.
// Affiché seulement quand l'URL contient ?splash=1 (html[data-splash="1"]) ; sans effet sur le site web.

const SPLASH_MIN_MS = 1800;          // durée minimale : la séquence d'animation se déroule en entier
const SPLASH_REDUCED_MIN_MS = 600;   // « réduire les animations » : diagramme statique, bref
const SPLASH_MAX_MS = 6000;          // sécurité : l'écran ne doit jamais rester bloqué

// Décide quand fermer l'écran de lancement.
// exit = true : on ferme maintenant ; sinon remainingMs = délai restant avant la fermeture (0 = on attend l'appli).
function computeSplashExit(ctx) {
  const c = ctx || {};
  if (c.skipped || c.elapsedMs >= SPLASH_MAX_MS) return { exit: true, remainingMs: 0 };
  if (!c.appReady) return { exit: false, remainingMs: 0 };
  const min = c.reducedMotion ? SPLASH_REDUCED_MIN_MS : SPLASH_MIN_MS;
  if (c.elapsedMs >= min) return { exit: true, remainingMs: 0 };
  return { exit: false, remainingMs: min - c.elapsedMs };
}

(function initSplash() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.dataset.splash !== '1') return;
  const el = document.querySelector('.pcsi-splash');
  if (!el) { delete root.dataset.splash; return; }

  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Départ = premier affichage (c'est l'écran de lancement qui est peint en premier) ; à défaut, maintenant.
  const paint = (performance.getEntriesByName && performance.getEntriesByName('first-paint')[0]) || null;
  const t0 = paint ? paint.startTime : performance.now();
  let skipped = false;
  let appReady = document.readyState === 'complete';

  if (!appReady) window.addEventListener('load', () => { appReady = true; }, { once: true });
  const skip = () => { skipped = true; };
  el.addEventListener('click', skip);
  window.addEventListener('keydown', skip, { once: true });

  function finish() {
    el.classList.add('is-leaving');
    // Délai fixe (pas d'événement d'animation) : fonctionne aussi quand « réduire les animations » coupe l'animation.
    setTimeout(() => { el.remove(); delete root.dataset.splash; }, 280);
  }

  function frame() {
    const r = computeSplashExit({ elapsedMs: performance.now() - t0, appReady, skipped, reducedMotion: reduced });
    if (r.exit) finish();
    else requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { computeSplashExit };
