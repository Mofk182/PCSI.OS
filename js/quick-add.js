// quick-add.js : panneau d'ajout rapide d'une carte Anki (mot + traduction).
// Ouvert par Ctrl+Alt+A, `pcsi-os --quick-add` ou l'icône système, dans l'appli de bureau seulement.
(function () {
  if (typeof window === 'undefined' || !window.pcsiDesktop) return;
  const $ = id => document.getElementById(id);
  let isOpen = false;

  function setStatus(kind, text) {
    const el = $('quick-add-status');
    if (!el) return;
    if (!text) { el.style.display = 'none'; return; }
    const palette = {
      ok: ['rgba(16, 185, 129, 0.12)', 'rgba(16, 185, 129, 0.35)', '#6EE7B7'],
      warn: ['rgba(245, 158, 11, 0.14)', 'rgba(245, 158, 11, 0.35)', '#FBBF24'],
      error: ['rgba(239, 68, 68, 0.12)', 'rgba(239, 68, 68, 0.35)', '#FCA5A5']
    }[kind];
    el.style.display = 'block';
    el.style.background = palette[0];
    el.style.border = '1px solid ' + palette[1];
    el.style.color = palette[2];
    el.textContent = text;
  }

  // La fenêtre prend (ou rend) le clavier ; le suivi des zones du HUD est suspendu pendant la saisie.
  function capture(on) {
    if (window.pcsiHudZones) window.pcsiHudZones.setPaused(on);
    window.pcsiDesktop.setQuickAddCapture(on);
  }

  window.openQuickAdd = function () {
    const root = $('quick-add');
    if (!root) return;
    if (!isOpen) {
      isOpen = true;
      $('quick-add-front').value = '';
      $('quick-add-back').value = '';
      $('quick-add-deck').value = (typeof state !== 'undefined' && state.settings && state.settings.ankiDeck) || 'PCSI::Vocabulaire';
      $('quick-add-copy').style.display = 'none';
      setStatus(null);
      root.hidden = false;
      capture(true);
    }
    setTimeout(() => $('quick-add-front').focus(), 30);
  };

  window.closeQuickAdd = function () {
    const root = $('quick-add');
    if (!root || !isOpen) return;
    isOpen = false;
    root.hidden = true;
    capture(false);
  };

  window.submitQuickAdd = async function () {
    const front = $('quick-add-front').value;
    const back = $('quick-add-back').value;
    const deck = $('quick-add-deck').value;
    const btn = $('quick-add-submit');
    btn.disabled = true;
    try {
      const res = await window.addAnkiCard(front, back, deck);
      if (res.ok) {
        if (typeof state !== 'undefined' && state.settings) {
          state.settings.ankiDeck = res.deckName;
          if (typeof saveState === 'function') saveState();
        }
        setStatus('ok', 'Ajoutée dans ' + res.deckName + ' ✓ : ' + front.trim());
        $('quick-add-copy').style.display = 'none';
        $('quick-add-front').value = '';
        $('quick-add-back').value = '';
        $('quick-add-front').focus();
      } else if (res.kind === 'empty') {
        setStatus('warn', 'Renseigne le mot et sa traduction.');
      } else if (res.kind === 'anki') {
        setStatus('warn', 'AnkiConnect : ' + res.error);
      } else {
        setStatus('error', "Anki est fermé ou le greffon AnkiConnect n'est pas installé. Tu peux copier la carte.");
        $('quick-add-copy').style.display = 'inline-flex';
      }
    } finally {
      btn.disabled = false;
    }
  };

  function copyCard() {
    const f = $('quick-add-front').value.trim();
    const b = $('quick-add-back').value.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(f + '\t' + b.replace(/\r?\n/g, ' — ')).then(
        () => setStatus('ok', 'Carte copiée (Recto + Verso) ✓'),
        () => setStatus('error', 'Impossible de copier automatiquement.')
      );
    }
  }

  function init() {
    const root = $('quick-add');
    if (!root) return;
    $('quick-add-close').addEventListener('click', window.closeQuickAdd);
    $('quick-add-submit').addEventListener('click', window.submitQuickAdd);
    $('quick-add-copy').addEventListener('click', copyCard);
    root.addEventListener('pointerdown', e => { if (e.target === root) window.closeQuickAdd(); });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') { e.preventDefault(); window.submitQuickAdd(); }
    });
    document.addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') window.closeQuickAdd(); });
    window.pcsiDesktop.onQuickAdd(() => window.openQuickAdd());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
