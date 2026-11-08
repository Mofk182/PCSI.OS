# PCSI.OS Desktop (Electron overlay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer PCSI.OS comme application de bureau Windows/Linux avec trois modes (plein écran, widget, HUD), une île dynamique configurable et une saisie rapide Anki.

**Architecture:** Une seule fenêtre Electron recréée à chaque changement de mode, qui charge le site copié localement via `app://pcsi/`. Toute la logique non graphique est en fonctions pures testées avec `node --test` ; le côté page est en scripts classiques (pas de modules ES) qui ne font rien sans `window.pcsiDesktop`, donc le site web ne change pas.

**Tech Stack:** Electron 45.2.3, electron-builder 26.18.0, Node `node:test`, JavaScript CommonJS dans `desktop/`, scripts classiques dans `js/`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-08-electron-overlay-design.md`

## Global Constraints

- `webPreferences` : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Le preload n'expose que `window.pcsiDesktop` (spec §3.4 + `apiBase`, `setQuickAddCapture` et `onToggleIsland`, ajoutés par ce plan).
- Protocole `app://pcsi/` servant `desktop/web/` ; jamais `file://`.
- Un seul `BrowserWindow` actif ; mode mémorisé dans `userData/desktop-state.json`.
- Raccourcis : `Ctrl+Alt+P` (afficher/masquer), `Ctrl+Alt+M` (plein écran → widget → HUD → plein écran), `Ctrl+Alt+A` (saisie rapide), `Ctrl+Alt+I` (île). Commandes : `--toggle`, `--next-mode`, `--mode=<fullscreen|widget|hud>`, `--quick-add`, `--toggle-island`, `--quit`, `--no-transparency`.
- Fond plein écran `#090A0F` ; token `--accent-info: #38BDF8` ; courbe `cubic-bezier(0.16, 1, 0.3, 1)` ; `prefers-reduced-motion` : aucune animation.
- AnkiConnect : `POST http://127.0.0.1:8765`, `version: 6`, délai 3 s, liste blanche d'actions ; paquet par défaut `state.settings.ankiDeck` (`PCSI::Vocabulaire`).
- Île : défauts `trigger: "hover"` (Windows) / `"shortcut"` (Linux, imposé), `collapsed: "next-class"`, `expanded: ["next-class","missions-due","clock"]`, `autoOpenMinutesBeforeClass: 10`, `dueWithinDays: 3`, `countdownTaskId: null` ; repli après 250 ms ; rafraîchissement 30 s.
- Le site web (Vercel) ne change pas de comportement quand `window.pcsiDesktop` est absent ; `desktop/` est exclu de Vercel via `.vercelignore`.
- Écran de lancement : textes verbatim « Données / Fichiers bruts » (entrée) et « ENS · ULM · Polytechnique · etc. » (sortie), en-tête `«block»`, nom `PCSI.OS` ; durée minimale 1800 ms, maximale 6000 ms, 600 ms avec `prefers-reduced-motion` ; masqué par défaut, activé seulement par `data-splash="1"` (posé depuis `?splash=1`) ; jamais en HUD ; une seule fois par démarrage.
- Les builds sont gratuits : pas de signature de code, pas de mise à jour automatique, pas de macOS.
- Tests : `cd desktop && npm test` (`node --test tests/*.test.js`). Les fichiers de `js/` testés exposent `if (typeof module !== 'undefined' && module.exports) module.exports = …`.
- Décisions du plan (absentes de la spec, à reporter dans la spec à la Tâche 2) : tailles du widget petit 320×420, moyen 360×520, grand 420×680 ; avec `--no-transparency`, le mode HUD est remplacé par un widget opaque.

## Review Focus

Entrées ou pannes que la spec laisse implicites, avec le test qui les épingle :

1. `desktop-state.json` absent, vide ou corrompu : démarrage en plein écran par défaut, sans exception (Tâche 2, `state-store`).
2. Position mémorisée du widget hors de l'écran après un changement d'écran : recadrée dans la zone visible (Tâche 2, `clampToDisplay`).
3. Deux changements de mode ou une commande `second-instance` en cours de bascule : exécutés en file, le dernier mode gagne, aucune fenêtre orpheline (Tâche 2, `mode-manager`).
4. État sans emploi du temps ni mission, ou module choisi sans donnée : l'île affiche l'heure au lieu d'une case vide (Tâche 6, `island-modules`).
5. Mot ou traduction vide après `trim`, ou contenant `<`, `&`, retours à la ligne ; réponse AnkiConnect avec `error` (carte en double) : refus, échappement, message d'erreur affiché (Tâche 5, `anki-card` et `anki`).

---

### Task 1: Coquille Electron, `app://`, build hors ligne, plein écran

**Files:**
- Create: `desktop/package.json`, `desktop/config.json`, `desktop/.gitignore` (`web/`, `dist/`, `node_modules/`), `desktop/src/main.js`, `desktop/src/preload.js`, `desktop/src/web-protocol.js`, `desktop/scripts/build-web.js`
- Modify: `.vercelignore` (+ `desktop/`), `js/config.js` (constante `API_BASE`), `js/data.js` (appel `fetch('/api/ai-schedule', …)` vers la ligne 673)
- Test: `desktop/tests/web-protocol.test.js`, `desktop/tests/build-web.test.js`

**Interfaces:**
- Produces: `resolveWebPath(webRoot: string, pathname: string): string | null` (CommonJS, `web-protocol.js`) — chemin absolu sûr, `null` si hors racine ; `/` → `index.html`.
- Produces: `rewriteHtml(html: string): string` (`build-web.js`) — remplace les 5 balises CDN (lignes 17-21 de `index.html`) par des fichiers locaux sous `vendor/`.
- Produces: `window.pcsiDesktop = { platform: 'win32'|'linux', apiBase: string|null, getMode(): string }` (preload ; `apiBase` lu dans `config.json`, `null` si vide).
- Produces: global `API_BASE` dans `js/config.js` : `window.pcsiDesktop ? window.pcsiDesktop.apiBase : ''`.

- [ ] **Step 1: Écrire les tests qui échouent.** `web-protocol.test.js` : `resolveWebPath('/r','/')` → `/r/index.html` ; `'/css/base.css'` → `/r/css/base.css` ; `'/../secret'` → `null` ; `'/%2e%2e/secret'` → `null`. `build-web.test.js` : sur le `index.html` réel, `rewriteHtml` ne laisse aucune balise `<script src="https://…">` ni `<link href="https://…">` ; conserve les 13 balises `js/*.js` dans le même ordre ; est idempotent (`rewriteHtml(rewriteHtml(x)) === rewriteHtml(x)`).
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm install && npm test` — Expected: FAIL (modules absents).
- [ ] **Step 3: Implémenter `resolveWebPath` et `rewriteHtml`.** `resolveWebPath` décode l'URL puis vérifie que le chemin résolu commence par `webRoot` + séparateur ; `rewriteHtml` remplace chaque balise CDN par son équivalent sous `vendor/` (Tailwind, `vendor/phosphor/*.css`, `qrcode.min.js`, `html5-qrcode.min.js`, `vendor/fonts.css`). Run: `cd desktop && npm test` — Expected: PASS.
- [ ] **Step 4: Implémenter le reste de la tâche.** `build-web.js` : copie `index.html`, `css/`, `js/`, `data/`, `icon.png`, `manifest.webmanifest`, `nom-du-site.txt` dans `desktop/web/`, applique `rewriteHtml`, vend les ressources (polices via `@fontsource/{plus-jakarta-sans,jetbrains-mono,caveat,oxanium}` en devDependencies ; `@phosphor-icons/web` : copie des six dossiers de graisse ; `html5-qrcode@2.3.8` ; `qrcodejs` ; Tailwind téléchargé depuis `https://cdn.tailwindcss.com/3.4.17`, ou `TAILWIND_LOCAL` pour un fichier local ; échec explicite si absent). `main.js` : `protocol.registerSchemesAsPrivileged` (`app`, standard + secure), `protocol.handle('app', …)` via `resolveWebPath`, fenêtre unique plein écran, option `--smoke` (charge la page, vérifie `document.title === 'PCSI.OS'`, quitte 0 ou 1). `js/data.js` : entourer la tentative serveur de `if (API_BASE !== null)` et préfixer l'URL par `API_BASE`, sans toucher au chemin de repli.
- [ ] **Step 5: Vérifier le succès.** Run: `cd desktop && npm test` — Expected: PASS. Run: `npm run build:web && xvfb-run -a npx electron . --smoke` — Expected: exit code 0. Si `xvfb` ou le réseau (Tailwind) manque, noter le résultat dans `TESTING.md` plutôt que de le contourner.
- [ ] **Step 6: Créer `desktop/TESTING.md`** avec la section « Plein écran » : lancement hors ligne, onglets, `localStorage` conservé après relance.
- [ ] **Step 7: Commit.** `git add desktop .vercelignore js/config.js js/data.js && git commit -m "feat(desktop): coquille Electron, protocole app://, build hors ligne"`

### Task 2: Changement de mode, icône système, commandes

**Files:**
- Create: `desktop/src/modes.js`, `desktop/src/cli.js`, `desktop/src/state-store.js`, `desktop/src/mode-manager.js`, `desktop/src/tray.js`, `desktop/src/shortcuts.js`
- Modify: `desktop/src/main.js`, `desktop/src/preload.js`, `index.html` (script de tête `data-mode`), `docs/superpowers/specs/2026-11-08-electron-overlay-design.md` (décisions du plan), `desktop/TESTING.md`
- Test: `desktop/tests/{modes,cli,state-store,mode-manager,tray,shortcuts}.test.js`

**Interfaces:**
- Consumes: `resolveWebPath`, `window.pcsiDesktop` (Tâche 1).
- Produces: `type Mode = 'fullscreen' | 'widget' | 'hud'`.
- Produces: `buildWindowOptions(mode: Mode, ctx: { platform: 'win32'|'linux', display: { bounds: Rect, workArea: Rect }, prefs: { widgetSize: 'small'|'medium'|'large', widgetPosition?: {x,y}, noTransparency: boolean } }): { mode: Mode, options: object, post: { alwaysOnTop: boolean, maximize: boolean, ignoreMouse: false | { forward: boolean } } }` ; en `noTransparency`, `mode: 'hud'` renvoie `mode: 'widget'` opaque.
- Produces: `clampToDisplay(pos: {x,y}, size: {width,height}, workArea: Rect): {x,y}`.
- Produces: `parseArgs(argv: string[]): { action: 'none'|'toggle'|'next-mode'|'set-mode'|'quick-add'|'toggle-island'|'quit', mode?: Mode, noTransparency: boolean, error?: string }`.
- Produces: `loadDesktopState(file: string): { mode: Mode, widgetSize: string, widgetPosition?: {x,y}, noTransparency: boolean }` (valeurs par défaut si fichier absent/corrompu) et `saveDesktopState(file: string, s): void`.
- Produces: `createModeManager(deps: { createWindow(mode: Mode): Promise<Win>, flush(win: Win): Promise<void>, persist(mode: Mode): void }): { setMode(mode: Mode): Promise<Mode>, nextMode(): Promise<Mode>, current(): Mode }`.
- Produces: `buildTrayTemplate(state: { mode, noTransparency }, handlers): MenuItemConstructorOptions[]` ; `registerShortcuts(gs: { register(accel, cb): boolean }, handlers): { p: boolean, m: boolean, a: boolean, i: boolean }` ; `canEnterHud(routes: { tray: boolean, shortcut: boolean }): boolean` (`tray || shortcut`).

- [ ] **Step 1: Écrire les tests qui échouent.** `modes` : plein écran `{frame:true, transparent:false, backgroundColor:'#090A0F'}` + `maximize:true` ; widget `moyen` = 360×520, `transparent:true`, `frame:false`, `resizable:false`, `hasShadow:false`, `skipTaskbar:true`, `post.alwaysOnTop:true` ; HUD win32 → `ignoreMouse:{forward:true}`, linux → `{forward:false}` et `focusable:false` ; `noTransparency` + `'hud'` → `mode:'widget'`, `transparent:false`. `clampToDisplay({x:5000,y:-300}, {width:360,height:520}, workArea)` reste dans `workArea`. `cli` : `--mode=hud` → `set-mode/hud` ; `--mode=foo` → `error` défini, `action:'none'` ; `--next-mode`, `--toggle-island` reconnus ; arguments inconnus ignorés. `state-store` : fichier absent, vide, `{`, `{"mode":"xyz"}` → défauts, sans exception (Review Focus 1). `mode-manager` avec faux `createWindow` : l'ancienne fenêtre est détruite après l'affichage de la nouvelle ; `setMode('hud')` puis `setMode('widget')` lancés sans attendre → un seul état final `widget`, une seule fenêtre vivante (Review Focus 3) ; `createWindow` qui rejette → l'ancienne reste, `current()` inchangé. `tray` : libellés dans l'ordre de la spec §5, case « Fond opaque » cochée selon l'état. `shortcuts` : faux `register` renvoyant `false` pour `Ctrl+Alt+I` → `{…, i:false}`. `canEnterHud({tray:false, shortcut:false})` → `false`.
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm test` — Expected: FAIL (modules absents).
- [ ] **Step 3: Implémenter les fonctions pures** (`buildWindowOptions`, `clampToDisplay`, `parseArgs`, `loadDesktopState`/`saveDesktopState`, `createModeManager`, `buildTrayTemplate`, `registerShortcuts`, `canEnterHud`). Run: `cd desktop && npm test` — Expected: PASS.
- [ ] **Step 4: Câbler `main.js`, le preload et `index.html`.** Verrou d'instance unique ; `second-instance` → `parseArgs` → gestionnaire de modes ; icône système ; raccourcis ; refus du HUD si `!canEnterHud` (la fenêtre reste en widget et un message s'affiche) ; `flush` = `webContents.executeJavaScript("typeof saveState==='function' && (saveState(), true)")` avec délai de 500 ms. Preload : `getMode()`, `setMode(mode)`, `onModeChange(cb)`, `quit()`. `index.html` : script de tête de 3 lignes posant `document.documentElement.dataset.mode` depuis `?mode=` (absent = site web, aucun attribut).
- [ ] **Step 5: Reporter dans la spec** les tailles du widget, le remplacement du HUD en `--no-transparency`, et `apiBase`, `setQuickAddCapture`, `onToggleIsland` dans l'API du preload.
- [ ] **Step 6: Vérifier le succès.** Run: `cd desktop && npm test` — Expected: PASS ; `xvfb-run -a npx electron . --smoke` — Expected: exit 0. Ajouter à `TESTING.md` les lignes : bascule des trois modes, mode conservé après relance, `pcsi-os --next-mode` depuis un second terminal, HUD refusé sans voie de sortie.
- [ ] **Step 7: Commit.** `git add desktop index.html docs && git commit -m "feat(desktop): modes, icône système, commandes, raccourcis"`

### Task 3: Widget et cadre qui coulisse

**Files:**
- Create: `js/nav-glide.js`, `js/desktop-bridge.js`
- Modify: `css/base.css` (`--accent-info`), `css/overrides.css` (blocs `data-mode`, cadre, poignée, bouton de mode), `index.html` (balises `<script>` avant `js/app.js`, `#pcsi-drag-handle`, `#pcsi-mode-btn`), `desktop/TESTING.md`
- Test: `desktop/tests/nav-glide.test.js`

**Interfaces:**
- Consumes: `window.pcsiDesktop.setMode/getMode` (Tâche 2), `switchTab` (`js/ui.js:146`, inchangé : le cadre observe le changement de classe `.active`).
- Produces: `computeGlideRect(item: Rect, container: Rect): { x: number, y: number, width: number, height: number }` (relatif au conteneur ; exporté).
- Produces: `window.initNavGlide(container: Element): void` — idempotent ; sans effet si `html[data-mode]` vaut `fullscreen` ou est absent.

- [ ] **Step 1: Test qui échoue.** `computeGlideRect({left:140,top:10,width:90,height:36}, {left:100,top:0})` → `{x:40, y:10, width:90, height:36}` ; élément de largeur 0 (conteneur masqué) → largeur 0 sans `NaN`.
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm test -- tests/nav-glide.test.js` — Expected: FAIL.
- [ ] **Step 3: Implémenter `computeGlideRect` et `js/nav-glide.js`** : un élément `.nav-glide` absolu dans chaque conteneur `.v3-segmented-nav` et barre mobile du bas ; déplacé vers l'élément survolé (`pointerover`), ayant le focus (`focusin`) ou devenant `.active` (`MutationObserver` sur `class`) ; retour sur `.active` à `pointerleave`/`focusout` ; recalcul au `resize`. Run: `cd desktop && npm test` — Expected: PASS.
- [ ] **Step 4: CSS, pont et HTML.** `css/overrides.css` : transition de `transform` et `width` avec la courbe imposée, lueur en `--accent-info`, `@media (prefers-reduced-motion: reduce)` sans transition, bloc `html[data-mode="widget"]` (`html, body` transparents, poignée `-webkit-app-region: drag`, surfaces vitrées). `js/desktop-bridge.js` : si `window.pcsiDesktop`, affiche `#pcsi-mode-btn` (cycle de mode) et appelle `initNavGlide`.
- [ ] **Step 5: Vérifier le succès.** Run: `cd desktop && npm test` — Expected: PASS. Ajouter à `TESTING.md` : widget transparent, déplaçable, au-dessus, cadre qui suit le survol et le clavier, retour sur l'onglet actif, absence d'animation avec « réduire les animations » activé.
- [ ] **Step 6: Commit.** `git add js css index.html desktop && git commit -m "feat(desktop): widget et cadre qui coulisse"`

### Task 4: HUD, passage des clics, zones interactives

**Files:**
- Create: `desktop/src/interactive.js`, `js/hud-zones.js`
- Modify: `desktop/src/main.js` (IPC `pcsi:set-interactive`), `desktop/src/preload.js` (`setInteractive`), `css/overrides.css` (bloc `html[data-mode="hud"]`), `index.html` (`data-hud-zone`, mini-barre `#pcsi-hud-bar`), `js/desktop-bridge.js`, `desktop/TESTING.md`
- Test: `desktop/tests/interactive.test.js`, `desktop/tests/hud-zones.test.js`

**Interfaces:**
- Consumes: `buildWindowOptions` (HUD déjà décrit en Tâche 2), `window.pcsiDesktop.platform`.
- Produces: `applyInteractive(win: { setIgnoreMouseEvents(ignore: boolean, opts?: { forward: boolean }): void }, platform: 'win32'|'linux', interactive: boolean): void` — Windows : `setIgnoreMouseEvents(!interactive, { forward: true })` ; Linux : aucun appel.
- Produces: `createZoneTracker(setInteractive: (b: boolean) => void): { track(inZone: boolean): void, setPaused(paused: boolean): void }` — n'appelle `setInteractive` qu'au changement ; en pause, `track` est sans effet. `js/hud-zones.js` expose l'instance : `window.pcsiHudZones`.
- Produces: `window.pcsiDesktop.setInteractive(b: boolean): void`.

- [ ] **Step 1: Tests qui échouent.** `applyInteractive` : win32 + `true` → `(false, {forward:true})` ; win32 + `false` → `(true, {forward:true})` ; linux + `true` → aucun appel. `createZoneTracker` : suite `track(false), track(true), track(true), track(false)` → appels `[true, false]` ; après `setPaused(true)`, `track(false)` n'appelle rien.
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm test` — Expected: FAIL.
- [ ] **Step 3: Implémenter `applyInteractive`, `createZoneTracker` et l'IPC `pcsi:set-interactive`** (preload : `setInteractive`). Run: `cd desktop && npm test` — Expected: PASS.
- [ ] **Step 4: Implémenter la page HUD.** `js/hud-zones.js` : écoute `pointermove` sur `document`, `track(!!event.target.closest('[data-hud-zone]'))`, actif seulement si `data-mode="hud"` et `platform === 'win32'`. CSS : `html, body` transparents ; navigation et onglet actif dans un conteneur `[data-hud-zone]` ancré en haut à droite (`position: fixed`, largeur `min(420px, 40vw)`, hauteur max `calc(100vh - 32px)`), fond `--bg-surface`. Mini-barre en coin (retour au widget ou au plein écran) dans une zone interactive, Windows uniquement.
- [ ] **Step 5: Vérifier le succès.** Run: `cd desktop && npm test` — Expected: PASS. Ajouter à `TESTING.md` : HUD transparent plein écran, clics qui traversent hors panneaux (Windows et Linux), panneaux cliquables (Windows), panneaux non cliquables (Linux), sortie de secours par icône système et par `--mode=fullscreen`.
- [ ] **Step 6: Commit.** `git add desktop js css index.html && git commit -m "feat(desktop): HUD et zones interactives"`

### Task 5: Saisie rapide et pont Anki

**Files:**
- Create: `desktop/src/anki.js`, `desktop/src/capture.js`, `js/anki-card.js`, `js/quick-add.js`
- Modify: `desktop/src/main.js` (IPC `pcsi:anki-invoke`, `pcsi:quick-add-capture`, déclenchement par raccourci/commande/icône), `desktop/src/preload.js` (`ankiInvoke`, `onQuickAdd`, `setQuickAddCapture`), `js/daily_drop.js` (fonctions `invokeAnkiConnect` ~l.329 et `submitAnkiCard` ~l.419), `index.html`, `css/components.css`, `desktop/TESTING.md`
- Test: `desktop/tests/{anki,capture,anki-card}.test.js`

**Interfaces:**
- Consumes: `window.pcsiDesktop`, `applyInteractive` (Tâche 4), `parseArgs` (`quick-add`).
- Produces: `ALLOWED_ACTIONS: string[]` (exactement les actions appelées par `invokeAnkiConnect` dans `js/daily_drop.js`, relevées avec `grep -n "invokeAnkiConnect(" js/daily_drop.js` au début de la tâche).
- Produces: `callAnki(fetchFn, action: string, params: object, opts?: { timeoutMs?: number }): Promise<any>` — rejette `{ code: 'forbidden' | 'timeout' | 'unreachable' | 'anki-error', message: string }` ; envoie `{ action, version: 6, params }`.
- Produces: `setCapture(win, platform, on: boolean, hudBase: { ignoreMouse: false | { forward: boolean }, focusable: boolean }): void` — `on` : `setIgnoreMouseEvents(false)`, `setFocusable(true)`, `focus()` ; `off` : `setIgnoreMouseEvents(true, hudBase.ignoreMouse)` si c'est un objet, sinon `setIgnoreMouseEvents(false)`, puis `setFocusable(hudBase.focusable)`.
- Produces: `buildAnkiNoteFields(front: string, back: string): { Front: string, Back: string } | null` (`js/anki-card.js`, exporté) — `null` si l'un est vide après `trim` ; échappe `&`, `<`, `>` ; remplace les retours à la ligne par `<br>`.
- Produces: `addAnkiCard(front: string, back: string, deck: string): Promise<{ ok: boolean, error?: string }>` (`js/daily_drop.js`, global, réutilisée par `submitAnkiCard` et `js/quick-add.js`).

- [ ] **Step 1: Tests qui échouent.** `anki` : action absente de `ALLOWED_ACTIONS` → rejet `forbidden` sans appel `fetch` ; succès → corps `{action, version: 6, params}` vers `http://127.0.0.1:8765` ; `fetch` qui rejette → `unreachable` ; `fetch` qui ne répond pas → `timeout` au bout de `timeoutMs` ; réponse `{result:null, error:"cannot create note because it is a duplicate"}` → `anki-error` avec ce message (Review Focus 5). `capture` : `on` appelle `setIgnoreMouseEvents(false)`, `setFocusable(true)`, `focus()` ; `off` avec `hudBase = { ignoreMouse: { forward: false }, focusable: false }` appelle `setIgnoreMouseEvents(true, { forward: false })` puis `setFocusable(false)`. `anki-card` : `('a<b','x&y\nz')` → `{Front:'a&lt;b', Back:'x&amp;y<br>z'}` ; `('  ','x')` → `null` (Review Focus 5).
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm test` — Expected: FAIL.
- [ ] **Step 3: Implémenter le côté bureau** : `anki.js` (`ALLOWED_ACTIONS`, `callAnki`), `capture.js` (`setCapture`), IPC `pcsi:anki-invoke` et `pcsi:quick-add-capture`, déclenchement par `Ctrl+Alt+A`, `--quick-add` et l'icône système (`webContents.send('pcsi:quick-add')`), preload `ankiInvoke`, `onQuickAdd`, `setQuickAddCapture`. Run: `cd desktop && npm test` — Expected: PASS pour `anki` et `capture`.
- [ ] **Step 4: Implémenter le côté page.** `js/anki-card.js` (`buildAnkiNoteFields`) ; `js/daily_drop.js` : `addAnkiCard` reprend la logique d'ajout actuelle de `submitAnkiCard` (paquet, modèle et champs via `resolveAnkiNoteModelAndFields`), `submitAnkiCard` lit ses champs puis l'appelle, `invokeAnkiConnect` utilise `window.pcsiDesktop.ankiInvoke` si présent, sinon le comportement actuel ; `js/quick-add.js` : panneau compact (mot, traduction, paquet par défaut `state.settings.ankiDeck`), `Entrée` ajoute, `Échap` ferme, appelle `window.pcsiHudZones.setPaused(true)` et `setQuickAddCapture(true)` à l'ouverture (et l'inverse à la fermeture), repli `copyAnkiCardFallback` si Anki est injoignable. Run: `cd desktop && npm test` — Expected: PASS pour `anki-card`.
- [ ] **Step 5: Vérifier le succès.** Run: `cd desktop && npm test` — Expected: PASS. Ajouter à `TESTING.md` : saisie rapide dans les trois modes, focus clavier sous Wayland (si absent, noter le repli widget), carte en double signalée, Anki fermé signalé, aucune configuration CORS requise.
- [ ] **Step 6: Commit.** `git add desktop js css index.html && git commit -m "feat(desktop): saisie rapide et pont AnkiConnect"`

### Task 6: Île dynamique et réglages

**Files:**
- Create: `js/island-modules.js`, `js/island.js`, `js/island-settings.js`
- Modify: `js/config.js` (clé `island` dans `DEFAULT_SETTINGS`), `index.html` (`#pcsi-island`, `#island-settings-mount` près de `#sites-grid-mount`), `css/overrides.css`, `desktop/src/main.js` + `desktop/src/preload.js` (`onToggleIsland`), `desktop/TESTING.md`
- Test: `desktop/tests/island-modules.test.js`

**Interfaces:**
- Consumes: `state.schedule` (créneau `{ id, title, subject, type, start: 'HH:MM', end, room, dayOfWeek?: 0-6 (0 = lundi) , date?: 'YYYY-MM-DD' }`), `state.tasks` (`{ title, subject, dueDate: 'YYYY-MM-DD', completed?: boolean, status?: 'done' }`), `buildEveningScheduleModel(dateObj, dayIdx)` (`js/agenda.js:516`, champs lus : `startMin`, `dinnerStartMin`, `dinnerEndMin`, `bedtimeMin`, `totalStudyCapacityMin`, `usedStudyMin`), `setInteractive` et `window.pcsiHudZones` (Tâche 4).
- Produces: `type IslandConfig = { trigger: 'hover'|'shortcut', collapsed: string, expanded: string[], autoOpenMinutesBeforeClass: number, dueWithinDays: number, countdownTaskId: string|null }` et `getIslandConfig(settings: object, platform: string): IslandConfig` (fusionne avec les défauts ; `trigger` forcé à `'shortcut'` sous Linux).
- Produces: `selectIslandView(ctx: { state: object, now: Date, cfg: IslandConfig, slotsForDate(d: Date): Slot[], eveningModel(d: Date): { startMin: number, dinnerStartMin: number, dinnerEndMin: number, bedtimeMin: number, totalStudyCapacityMin: number, usedStudyMin: number } | null }): { collapsedText: string, sections: { id: string, title: string, lines: string[] }[] }` — un module sans donnée est omis ; `collapsedText` retombe sur l'heure si le module choisi est vide.
- Produces: `shouldAutoOpen(ctx, minutes: number): boolean` — vrai si un cours commence dans `0 < t ≤ minutes` ; `minutes === 0` → toujours faux.
- Produces: registre `ISLAND_MODULES: Record<'next-class'|'missions-due'|'evening'|'clock'|'countdown', { label: string }>` extensible par une entrée.

- [ ] **Step 1: Tests qui échouent** (`now` fixé au lundi 2026-11-09 08:30, `slotsForDate` simulé) : `next-class` choisit le premier créneau commençant après `now` et affiche heure, matière, salle ; `missions-due` ignore les missions terminées (`completed` ou `status:'done'`) et celles dues au-delà de `dueWithinDays` ; `evening` avec un modèle `{startMin:1050, dinnerStartMin:1140, dinnerEndMin:1200, bedtimeMin:1380, totalStudyCapacityMin:240, usedStudyMin:90}` produit les lignes « Soirée dès 17:30 », « Dîner 19:00–20:00 », « Coucher 23:00 », « Étude : 2 h 30 restantes » et s'omet si `eveningModel` renvoie `null` ; `countdown` calcule les jours restants vers `countdownTaskId` et s'omet si l'identifiant est inconnu ; état vide (`schedule: []`, `tasks: []`) → `sections` vide et `collapsedText` = heure (Review Focus 4) ; `collapsed:'next-class'` sans cours restant → heure ; `shouldAutoOpen` vrai à 08:30 pour un cours à 08:38 avec `minutes:10`, faux avec `minutes:0` ; `getIslandConfig({}, 'linux').trigger === 'shortcut'`, `getIslandConfig({}, 'win32').trigger === 'hover'`, `expanded` par défaut conforme aux contraintes globales.
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm test` — Expected: FAIL.
- [ ] **Step 3: Implémenter les fonctions pures** (`getIslandConfig`, `selectIslandView`, `shouldAutoOpen`, `ISLAND_MODULES`) et la clé `island` de `DEFAULT_SETTINGS`. Run: `cd desktop && npm test` — Expected: PASS.
- [ ] **Step 4: Implémenter le DOM et les réglages.** Les fonctions injectées valent, dans le navigateur, `slotsForDate = d => getDayScheduleSlots(d, (d.getDay() + 6) % 7)` et `eveningModel = d => buildEveningScheduleModel(d, (d.getDay() + 6) % 7)`. `js/island.js` rend la pilule et la carte (animation de taille avec la courbe imposée, contenu en fondu, `prefers-reduced-motion` sans animation), survol → `setInteractive(true)` et expansion, sortie → repli après 250 ms puis `setInteractive(false)`, actif seulement en `data-mode="hud"`, rafraîchissement toutes les 30 s, `trigger:'shortcut'` → ouverture par `onToggleIsland` et ouverture automatique temporaire (`shouldAutoOpen`). `js/island-settings.js` : carte « Île » dans « Portails & Réglages » (cases par module, boutons haut/bas pour l'ordre, module replié, déclencheur, minutes d'ouverture automatique, jours d'échéance, mission du compte à rebours), enregistrée dans `state.settings.island` via `saveState()`.
- [ ] **Step 5: Vérifier le succès.** Run: `cd desktop && npm test` — Expected: PASS. Ajouter à `TESTING.md` : île repliée/étendue au survol (Windows), `Ctrl+Alt+I` et `--toggle-island` (Linux), ouverture automatique, réglages conservés après changement de mode, aucun défaut visible avec les données vides.
- [ ] **Step 6: Commit.** `git add desktop js css index.html && git commit -m "feat(desktop): île dynamique configurable"`

### Task 7: Écran de lancement (diagramme de flux SysML)

**Files:**
- Create: `css/splash.css`, `js/splash.js`
- Modify: `index.html` (lien `css/splash.css` en tête, bloc `.pcsi-splash` juste après `<body>`, balise `<script src="js/splash.js">` avant `js/app.js`, script de tête : `data-splash` depuis `?splash=1`), `desktop/src/modes.js`, `desktop/src/cli.js` (champ `noSplash`), `desktop/src/main.js`, `desktop/TESTING.md`
- Test: `desktop/tests/splash.test.js`

**Interfaces:**
- Consumes: `buildWindowOptions` / `Mode` (Tâche 2), `parseArgs` (Tâche 2, étendu), token `--accent-info` (Tâche 3), polices Oxanium et JetBrains Mono (Tâche 1).
- Produces: `shouldSplash(mode: Mode, opts: { firstWindow: boolean, noSplash: boolean }): boolean` (`modes.js`) — vrai seulement si `firstWindow && !noSplash && mode !== 'hud'`.
- Produces: `parseArgs(argv)` renvoie en plus `noSplash: boolean` (`--no-splash`).
- Produces: `computeSplashExit(ctx: { elapsedMs: number, appReady: boolean, skipped: boolean, reducedMotion: boolean }): { exit: boolean, remainingMs: number }` (`js/splash.js`, exporté ; `remainingMs` = délai restant avant la sortie quand `exit` est faux et que l'appli est prête, sinon 0).

- [ ] **Step 1: Écrire les tests qui échouent.** `shouldSplash('fullscreen', {firstWindow:true, noSplash:false})` → `true` ; `'widget'` idem → `true` ; `'hud'` → `false` ; `firstWindow:false` → `false` (aucune relecture à chaque changement de mode) ; `noSplash:true` → `false`. `parseArgs(['--no-splash']).noSplash === true`. `computeSplashExit` : `{elapsedMs:1000, appReady:true}` → `{exit:false, remainingMs:800}` ; `{elapsedMs:2000, appReady:true}` → `{exit:true, remainingMs:0}` ; `{elapsedMs:3000, appReady:false}` → `exit:false` ; `{elapsedMs:6000, appReady:false}` → `exit:true` (sécurité) ; `{elapsedMs:100, skipped:true}` → `exit:true` ; `{elapsedMs:700, appReady:true, reducedMotion:true}` → `exit:true`. Test de CSS (lecture de `css/splash.css`) : `.pcsi-splash` est `display: none` par défaut et affiché seulement sous `html[data-splash="1"]` ; contient au moins un bloc `@media (prefers-reduced-motion: reduce)`, un bloc `@media (max-width: 640px)` et les cinq `@keyframes` `splash-block-in`, `splash-arrow-draw`, `splash-packet`, `splash-scan`, `splash-pulse`. Test d'`index.html` : contient `class="pcsi-splash"`, les deux textes verbatim, `role="img"` et un `aria-label`.
- [ ] **Step 2: Vérifier l'échec.** Run: `cd desktop && npm test` — Expected: FAIL.
- [ ] **Step 3: Implémenter les fonctions pures** `shouldSplash`, l'option `--no-splash` de `parseArgs` et `computeSplashExit`. Run: `cd desktop && npm test` — Expected: PASS pour les tests de logique.
- [ ] **Step 4: Écrire le balisage et le CSS.** `index.html` : `<div class="pcsi-splash" role="img" aria-label="Chargement de PCSI.OS">` contenant le bloc central (en-tête `«block»` monospace, nom `PCSI.OS` en Oxanium, ligne de balayage), la flèche d'entrée (ligne + pointe en `clip-path`) avec son étiquette, la flèche de sortie avec la sienne, et deux « paquets » par flèche. `css/splash.css` : fond `--bg-canvas`, bloc en verre (`rgba(17,19,26,.6)`, `backdrop-filter: blur(12px)`, bordure `1px solid rgba(255,255,255,0.1)`), neon `--accent-info` ; séquence sur variables `--t-*` : bloc 0–0,4 s (`splash-block-in`), flèche d'entrée 0,2–1,0 s (`splash-arrow-draw`) avec paquets en boucle de 1,2 s (`splash-packet`, `translateX` + opacité), traitement 1,0–1,8 s (`splash-scan`, `splash-pulse`), flèche de sortie 1,4–2,0 s ; `@media (max-width: 640px)` : flux vertical ; `@media (prefers-reduced-motion: reduce)` : diagramme statique, aucune animation. Run: `cd desktop && npm test` — Expected: PASS (tests de CSS et d'`index.html`).
- [ ] **Step 5: Câbler le cycle de vie.** `js/splash.js` : si `data-splash="1"`, mesure `elapsedMs`, marque `appReady` quand `window.load` est passé et que l'état est chargé, appelle `computeSplashExit` à chaque image, passe sur clic ou touche, puis joue `splash-out` (fondu 250 ms), retire l'élément du DOM et pose `aria-hidden`. `main.js` : ajoute `splash=1` à l'URL uniquement quand `shouldSplash(mode, { firstWindow, noSplash })` ; `firstWindow` ne vaut `true` que pour la première fenêtre du processus.
- [ ] **Step 6: Vérifier le succès.** Run: `cd desktop && npm test && xvfb-run -a npx electron . --smoke` — Expected: PASS et exit 0. Ajouter à `TESTING.md` : le diagramme se joue au lancement en plein écran et en widget (flux vertical dans le widget), pas au changement de mode, pas en HUD, un clic le passe, `--no-splash` le désactive, sans animation avec « réduire les animations », et le site web servi sans `?splash=1` n'affiche aucun écran de lancement.
- [ ] **Step 7: Commit.** `git add css js index.html desktop && git commit -m "feat(desktop): écran de lancement en diagramme de flux SysML"`

### Task 8: Packaging et publication

**Files:**
- Create: `desktop/electron-builder.yml`, `.github/workflows/desktop-release.yml`, `desktop/README.md`
- Modify: `README.md` (renvoi vers `desktop/README.md`), `desktop/package.json` (scripts `dist:win`, `dist:linux`), `desktop/TESTING.md` (finalisation)
- Test: validation du YAML et de la configuration

**Interfaces:**
- Consumes: scripts `build:web` et `test` (Tâche 1).
- Produces: artefacts `PCSI.OS-<version>-setup.exe` (Windows) et `pcsi-os_<version>_amd64.deb` + `PCSI.OS-<version>.AppImage` (Linux), publiés dans les Releases à chaque étiquette `desktop-v*`.

- [ ] **Step 1: Écrire la configuration.** `electron-builder.yml` : `appId: com.pcsios.desktop`, `productName: PCSI.OS`, fichiers `src/**` et `web/**`, Windows `nsis`, Linux `deb` + `AppImage` avec `executableName: pcsi-os`, aucune signature. Workflow : déclenché par l'étiquette `desktop-v*`, deux tâches (`windows-latest`, `ubuntu-latest`) qui exécutent `npm ci`, `npm test`, `npm run build:web`, `npm run dist:<os>`, puis publient dans les Releases.
- [ ] **Step 2: Vérifier la configuration.** Run: `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/desktop-release.yml'));yaml.safe_load(open('desktop/electron-builder.yml'))"` — Expected: aucune erreur. Run: `cd desktop && npm test` — Expected: PASS.
- [ ] **Step 3: Rédiger `desktop/README.md`** : installation Windows avec l'écran SmartScreen (« Informations complémentaires » → « Exécuter quand même »), `.deb` en priorité sur Ubuntu et `libfuse2` pour l'AppImage, commandes `pcsi-os --…`, liaison des raccourcis dans les réglages de GNOME, `config.json` (`apiBase`), `ALLOWED_ORIGIN=app://pcsi` côté Vercel, premier lancement (Sync ID ou import JSON), option `--no-transparency`.
- [ ] **Step 4: Finaliser `TESTING.md`** avec la liste de risques de la spec §11 (focus Wayland, transparence Linux, `Origin`, icône système GNOME, AppImage sans `libfuse2`), chaque ligne avec son résultat attendu.
- [ ] **Step 5: Commit.** `git add .github desktop README.md && git commit -m "feat(desktop): packaging et publication"`
