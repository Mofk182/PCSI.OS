// js/ai-import.js
// Fonctions pures pour l'import universel IA (EDT, colloscope, DS, autre)
// Compatible navigateur (globales) et Node.js (module.exports).

(function (root, factory) {
  const exports = factory();
  if (root) Object.assign(root, exports);
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * Ajoute N jours en jours civils UTC à une date ISO YYYY-MM-DD
   */
  function addDaysISO(iso, n) {
    if (!iso || typeof iso !== 'string') return iso;
    const parts = iso.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return iso;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Retourne le lundi (YYYY-MM-DD) de la semaine contenant la date ISO
   */
  function mondayOfISO(iso) {
    if (!iso || typeof iso !== 'string') return iso;
    const parts = iso.split('-').map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    // getUTCDay() : 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    return addDaysISO(iso, diffToMonday);
  }

  /**
   * Convertit un libellé de jour en index (0 = Lundi ... 5 = Samedi). Dimanche ou inconnu -> null.
   * Insensible à la casse, aux accents, aux points et abréviations >= 3 lettres.
   */
  function weekdayIndex(label) {
    if (!label || typeof label !== 'string') return null;
    const clean = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();

    if (clean.startsWith('lun')) return 0;
    if (clean.startsWith('mar')) return 1;
    if (clean.startsWith('mer')) return 2;
    if (clean.startsWith('jeu')) return 3;
    if (clean.startsWith('ven')) return 4;
    if (clean.startsWith('sam')) return 5;
    return null; // dim ou inconnu
  }

  /**
   * Parse une date trouvée dans un document (jj/mm/aa, jj/mm/aaaa, jj/mm, YYYY-MM-DD)
   * et retourne YYYY-MM-DD ou null si invalide.
   */
  function parseDocDate(str, todayISO) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();

    // Déjà YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      if (isValidDate(y, m, d)) return trimmed;
      return null;
    }

    // jj/mm/aaaa ou jj/mm/aa ou jj/mm
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!slashMatch) return null;

    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : null;

    if (year !== null) {
      if (year < 100) {
        year += 2000;
      }
    } else {
      // Année non spécifiée (ex: "14/09") -> année la plus proche d'aujourd'hui
      const baseYear = todayISO ? parseInt(todayISO.split('-')[0], 10) : new Date().getFullYear();
      const candYears = [baseYear - 1, baseYear, baseYear + 1];
      const todayMs = todayISO ? new Date(todayISO + 'T00:00:00Z').getTime() : Date.now();
      let bestYear = baseYear;
      let minDiff = Infinity;
      for (const y of candYears) {
        if (isValidDate(y, month, day)) {
          const t = new Date(Date.UTC(y, month - 1, day)).getTime();
          const diff = Math.abs(t - todayMs);
          if (diff < minDiff) {
            minDiff = diff;
            bestYear = y;
          }
        }
      }
      year = bestYear;
    }

    if (!isValidDate(year, month, day)) return null;

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  function isValidDate(year, month, day) {
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  }

  /**
   * Vérifie si un créneau (hebdo ou bi-hebdo ou ponctuel) est actif sur une date ISO YYYY-MM-DD
   */
  function isSlotActiveOn(slot, dateISO) {
    if (!slot || !dateISO) return false;

    // Ponctuel daté
    if (slot.date) {
      return slot.date === dateISO;
    }

    // Récurrent hebdomadaire ou bi-hebdomadaire
    if (slot.dayOfWeek !== undefined && slot.dayOfWeek !== null) {
      const parts = dateISO.split('-').map(Number);
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      const dow = d.getUTCDay();
      // map 0(Sun)->null, 1(Mon)->0, ..., 6(Sat)->5
      const currentDow = dow === 0 ? null : dow - 1;
      if (currentDow !== Number(slot.dayOfWeek)) {
        return false;
      }

      if (slot.every === 2) {
        const slotAnchorMonday = slot.anchor ? mondayOfISO(slot.anchor) : null;
        if (!slotAnchorMonday) return true; // Sans point d'ancrage, actif par défaut
        const currentMonday = mondayOfISO(dateISO);

        const aParts = slotAnchorMonday.split('-').map(Number);
        const cParts = currentMonday.split('-').map(Number);
        const aMs = Date.UTC(aParts[0], aParts[1] - 1, aParts[2]);
        const cMs = Date.UTC(cParts[0], cParts[1] - 1, cParts[2]);

        const diffWeeks = Math.round((cMs - aMs) / (7 * 86400000));
        return Math.abs(diffWeeks) % 2 === 0;
      }

      return true; // every !== 2 -> hebdo
    }

    return false;
  }

  /**
   * Parse le JSON de réponse de l'IA (enlève ```json ... ``` ou extrait { ... })
   */
  function parseAiJson(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {}
      }
    }
    return null;
  }

  /**
   * Dimension maximale de l'image pour la compression :
   * 2200px pour Colloscope, 1450px sinon.
   */
  function maxImageDimFor(category) {
    const cat = String(category || '').toLowerCase();
    if (cat.includes('collo')) return 2200;
    return 1450;
  }

  /**
   * Construit le prompt universel IA pour l'analyse visuelle
   */
  function buildUniversalPrompt(doc, ctx) {
    const category = doc.category || 'Emploi du temps';
    const pdfHint = doc.pdfHintText || '';
    const todayISO = ctx.todayISO || new Date().toISOString().slice(0, 10);
    const subjectsList = ctx.subjectsList || '';
    const userHint = ctx.userHint || '';
    const group = ctx.group || '';
    const forcedKind = ctx.forcedKind || '';

    return `Tu es un assistant expert en lecture et transcription d'emplois du temps, de colloscopes et de plannings de devoirs (DS) de classe préparatoire CPGE PCSI.
Analyse visuellement l'image (ou les pages) fournie(s) et convertis tous les créneaux en un objet JSON directement exploitable.

Date d'aujourd'hui : ${todayISO}
Catégorie du document : ${category}
${forcedKind ? `Type imposé par l'élève : ${forcedKind}` : ''}
${group ? `Trinôme / Groupe de colle de l'élève : "${group}"` : ''}
${userHint ? `Consigne spécifique de l'élève : "${userHint}"` : ''}
${pdfHint ? `Indice texte issu du PDF :\n${pdfHint.slice(0, 2500)}` : ''}

Matières disponibles :
${subjectsList}

Règles de transcription :
1. Règle absolue de fidélité : mets null plutôt que deviner. Ne JAMAIS inventer un jour, une heure ou une matière absente.
2. Détecte le type de document ("kind") : "edt" (emploi du temps), "colloscope", "ds", ou "autre".
3. Pour un colloscope :
   - Si un groupe ou trinôme est fourni ("${group}"), ne renvoie QUE les colles correspondant à ce groupe.
   - Si aucun groupe n'est spécifié, renvoie "events": [] et liste tous les groupes détectés dans "groupsDetected" (ex: ["1", "2", "3", ...]).
   - Si une case est coloriée en rouge ou barrée, renseigne "cancelled": true. Les cases noires ou vides sont ignorées.
   - Si seule l'heure de début d'une colle est notée (ex: 15h30), laisse "end": null (le code ajoutera 1h).
4. Dates et récurrence :
   - Renseigne "weekStart" (format jj/mm/aa ou jj/mm ou YYYY-MM-DD) s'il y a une semaine en en-tête de colonne/tableau.
   - "weekday" : "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi" ou null.
   - "date" : format YYYY-MM-DD si une date précise est indiquée.
   - "frequency" : "weekly" (chaque semaine) ou "biweekly" (une semaine sur 2, ex: TP/TD quinzaine) ou null.
   - "parity" : "A" ou "B" ou null si mentionné (semaine A / semaine B, paire / impaire).
5. "type" : "COURS", "TD", "TP", "COLLE", "DS".
6. "room" : nom de la salle ou nom de l'interrogateur/professeur si visible, sinon null.

Réponds STRICTEMENT avec un objet JSON conforme à cette structure :
{
  "kind": "edt" | "colloscope" | "ds" | "autre",
  "groupsDetected": ["string"],
  "events": [
    {
      "weekday": "mercredi",
      "weekStart": "16/11/26",
      "date": null,
      "frequency": null,
      "parity": null,
      "start": "15:30",
      "end": null,
      "subject": "maths",
      "type": "COLLE",
      "title": null,
      "room": "M. Lartaux",
      "cancelled": false
    }
  ]
}`;
  }

  /**
   * Résout les événements extraits par l'IA en créneaux prêts pour l'agenda pcsi.os
   */
  function resolveEvents(parsed, ctx) {
    const todayISO = ctx.todayISO || new Date().toISOString().slice(0, 10);
    const weekAMonday = ctx.weekAMonday || null;
    const group = ctx.group || null;
    const matchSubject = ctx.matchSubject || ((t) => t);
    const subjectIds = Array.isArray(ctx.subjectIds) ? ctx.subjectIds : [];

    const result = {
      kind: (parsed && parsed.kind) || 'autre',
      groupsDetected: Array.isArray(parsed?.groupsDetected) ? parsed.groupsDetected : [],
      slots: [],
      incompleteCount: 0,
      needs: {
        group: false,
        parity: false
      }
    };

    if (!parsed || typeof parsed !== 'object') {
      return result;
    }

    const events = Array.isArray(parsed.events) ? parsed.events : [];

    // Colloscope sans groupe spécifié alors que des groupes sont détectés (ou aucun event trouvé)
    if (result.kind === 'colloscope' && !group && result.groupsDetected.length > 0) {
      result.needs.group = true;
      return result;
    }

    let slotCounter = 0;

    events.forEach(ev => {
      if (!ev || typeof ev !== 'object') return;
      if (ev.cancelled === true) return; // Écarter les créneaux annulés

      const missing = [];
      const id = 's_ai_' + Date.now() + '_' + (++slotCounter);

      // 1. Détermination de la matière
      let subject = null;
      if (ev.subject && subjectIds.includes(String(ev.subject).toLowerCase().trim())) {
        subject = String(ev.subject).toLowerCase().trim();
      } else {
        subject = matchSubject(`${ev.subject || ''} ${ev.title || ''}`) || subjectIds[0] || 'maths';
      }

      // 2. Détermination du type
      const type = (ev.type && typeof ev.type === 'string')
        ? ev.type.toUpperCase().trim()
        : (result.kind === 'colloscope' ? 'COLLE' : (result.kind === 'ds' ? 'DS' : 'COURS'));

      // 3. Détermination des heures start & end
      let start = ev.start ? String(ev.start).trim() : null;
      let end = ev.end ? String(ev.end).trim() : null;

      // Normaliser HH:MM
      if (start && /^\d{1,2}h(\d{2})?$/i.test(start)) {
        const m = start.match(/^(\d{1,2})h(\d{2})?$/i);
        start = String(m[1]).padStart(2, '0') + ':' + (m[2] || '00');
      }
      if (end && /^\d{1,2}h(\d{2})?$/i.test(end)) {
        const m = end.match(/^(\d{1,2})h(\d{2})?$/i);
        end = String(m[1]).padStart(2, '0') + ':' + (m[2] || '00');
      }

      if (!start) {
        missing.push('heure début');
        start = '08:00';
      }

      if (!end) {
        if (type === 'COLLE' && start) {
          // Colle sans end : end = start + 1h
          const [sh, sm] = start.split(':').map(Number);
          const eh = Math.min(23, (sh || 0) + 1);
          end = String(eh).padStart(2, '0') + ':' + String(sm || 0).padStart(2, '0');
        } else {
          missing.push('heure fin');
          end = '10:00';
        }
      }

      // 4. Titre et Salle
      let title = ev.title ? String(ev.title).trim() : null;
      if (!title) {
        const subjCapitalized = subject.charAt(0).toUpperCase() + subject.slice(1);
        title = `${type.charAt(0) + type.slice(1).toLowerCase()} ${subjCapitalized}`;
      }
      const room = ev.room ? String(ev.room).trim() : '';

      // 5. Date, Jour & Récurrence
      let date = null;
      let dayOfWeek = null;
      let every = undefined;
      let anchor = undefined;
      let shiftable = undefined;

      // Cas A : Date explicite YYYY-MM-DD
      if (ev.date) {
        date = parseDocDate(ev.date, todayISO);
      }

      // Cas B : weekStart + weekday
      if (!date && ev.weekStart) {
        const monday = parseDocDate(ev.weekStart, todayISO);
        const wIdx = weekdayIndex(ev.weekday);
        if (monday && wIdx !== null) {
          date = addDaysISO(mondayOfISO(monday), wIdx);
        }
      }

      // Cas C : Récurrent
      if (!date) {
        const wIdx = weekdayIndex(ev.weekday);
        if (wIdx !== null) {
          dayOfWeek = wIdx;

          const freq = String(ev.frequency || '').toLowerCase().trim();
          const parity = ev.parity ? String(ev.parity).toUpperCase().trim() : null;

          if (freq === 'biweekly' || parity === 'A' || parity === 'B') {
            every = 2;
            if (parity === 'A') {
              if (weekAMonday) {
                anchor = mondayOfISO(weekAMonday);
              } else {
                result.needs.parity = true;
                anchor = mondayOfISO(todayISO);
              }
            } else if (parity === 'B') {
              if (weekAMonday) {
                anchor = addDaysISO(mondayOfISO(weekAMonday), 7);
              } else {
                result.needs.parity = true;
                anchor = addDaysISO(mondayOfISO(todayISO), 7);
              }
            } else {
              // biweekly sans parité spécifiée : anchor = lundi de todayISO, décalable
              anchor = mondayOfISO(todayISO);
              shiftable = true;
            }
          }
        } else {
          missing.push('jour');
        }
      }

      const slot = {
        id,
        start,
        end,
        subject,
        type,
        title,
        room
      };

      if (date) {
        slot.date = date;
      } else if (dayOfWeek !== null) {
        slot.dayOfWeek = dayOfWeek;
        if (every === 2) {
          slot.every = 2;
          if (anchor) slot.anchor = anchor;
          if (shiftable) slot.shiftable = true;
        }
      }

      if (missing.length > 0) {
        slot.incomplete = true;
        slot.missing = missing;
        result.incompleteCount++;
      }

      result.slots.push(slot);
    });

    return result;
  }

  return {
    addDaysISO,
    mondayOfISO,
    weekdayIndex,
    parseDocDate,
    isSlotActiveOn,
    parseAiJson,
    maxImageDimFor,
    buildUniversalPrompt,
    resolveEvents
  };
});
