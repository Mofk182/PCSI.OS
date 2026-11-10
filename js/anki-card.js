// anki-card.js : champs d'une carte Anki à partir du recto et du verso saisis.
// L'échappement est identique à escapeHtml (utils.js) ; les retours à la ligne deviennent <br>.
// Renvoie null si l'un des deux est vide après suppression des espaces.
function buildAnkiNoteFields(front, back) {
  const clean = v => (v === undefined || v === null ? '' : String(v).trim());
  const f = clean(front);
  const b = clean(back);
  if (!f || !b) return null;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r?\n/g, '<br>');
  return { Front: esc(f), Back: esc(b) };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildAnkiNoteFields };
