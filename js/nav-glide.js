// nav-glide.js : cadre lumineux qui coulisse entre les boutons de navigation.
// Actif seulement dans l'appli de bureau, en mode widget ou HUD (html[data-mode]) ; sans effet sur le site web.

// Position et taille du cadre, relatives au conteneur (valeurs non numériques ramenées à 0).
function computeGlideRect(item, container) {
  const n = v => (Number.isFinite(v) ? v : 0);
  return {
    x: n(item.left) - n(container.left),
    y: n(item.top) - n(container.top),
    width: n(item.width),
    height: n(item.height)
  };
}

function initNavGlide(container) {
  if (typeof document === 'undefined' || !container || container.__navGlide) return;
  const mode = document.documentElement.dataset.mode;
  if (mode !== 'widget' && mode !== 'hud') return;
  const items = () => Array.from(container.querySelectorAll('.nav-item'));
  if (!items().length) return;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const glide = document.createElement('div');
  glide.className = 'nav-glide';
  glide.setAttribute('aria-hidden', 'true');
  container.appendChild(glide);
  container.__navGlide = glide;

  let hovered = null;
  let focused = null;
  const active = () => items().find(i => i.classList.contains('active')) || null;

  function place() {
    const item = hovered || focused || active();
    if (!item || item.offsetWidth === 0 || container.offsetWidth === 0) { glide.style.opacity = '0'; return; }
    const box = container.getBoundingClientRect();
    // Le cadre est positionné dans la zone intérieure du conteneur : on retire l'épaisseur de sa bordure.
    const r = computeGlideRect(item.getBoundingClientRect(), { left: box.left + container.clientLeft, top: box.top + container.clientTop });
    glide.style.width = r.width + 'px';
    glide.style.height = r.height + 'px';
    glide.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
    glide.style.borderRadius = getComputedStyle(item).borderRadius;
    glide.style.opacity = '1';
  }

  const itemOf = e => (e.target && e.target.closest ? e.target.closest('.nav-item') : null);
  container.addEventListener('pointerover', e => { const it = itemOf(e); if (it && container.contains(it)) { hovered = it; place(); } });
  container.addEventListener('pointerleave', () => { hovered = null; place(); });
  container.addEventListener('focusin', e => { const it = itemOf(e); if (it) { focused = it; place(); } });
  container.addEventListener('focusout', () => { focused = null; place(); });
  new MutationObserver(place).observe(container, { attributes: true, attributeFilter: ['class'], subtree: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(container);
  window.addEventListener('resize', place);
  place();
}

// Un cadre par conteneur de navigation : barre du haut (bureau) et barre du bas (mobile / widget).
function initAllNavGlides() {
  if (typeof document === 'undefined') return;
  const parents = new Set();
  document.querySelectorAll('.nav-item').forEach(i => { if (i.parentElement) parents.add(i.parentElement); });
  parents.forEach(initNavGlide);
}

if (typeof window !== 'undefined') {
  window.initNavGlide = initNavGlide;
  window.initAllNavGlides = initAllNavGlides;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { computeGlideRect };
