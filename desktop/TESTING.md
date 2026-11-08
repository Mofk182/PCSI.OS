# Liste de contrôle manuelle (desktop)

À dérouler sur **Windows** et sur **Linux** après `cd desktop && npm install && npm run build:web`, puis `npm start`.
Les tests automatiques (`npm test`) et le test de démarrage (`xvfb-run -a npx electron . --smoke --no-sandbox`) ne couvrent pas ces points.

## Plein écran

| Vérification | Résultat attendu |
|---|---|
| Lancer l'appli sans connexion réseau | L'interface s'affiche avec ses icônes, ses polices et son style (aucune ressource distante) |
| Cliquer sur chaque onglet | Chaque onglet s'affiche sans erreur |
| Ajouter une mission, quitter, relancer | La mission est toujours là (`localStorage` de `app://pcsi` conservé) |
| Lire l'emploi du temps par photo sans clé serveur (`config.json` : `apiBase` vide) | Le chemin sans serveur existant s'applique (clé personnelle ou message d'erreur actuel), sans appel à `/api` |

## Modes, icône système et commandes

En développement, `pcsi-os --…` s'écrit `npx electron . --…` (dans `desktop/`).

| Vérification | Résultat attendu |
|---|---|
| Menu de l'icône système : choisir Widget (petit, moyen, grand), HUD, Plein écran | La fenêtre est recréée dans le mode choisi, la case du menu suit le mode courant |
| Quitter puis relancer | L'appli rouvre le dernier mode utilisé, avec la même taille de widget |
| Déplacer le widget, quitter, relancer | Le widget revient au même endroit ; si l'écran a changé, il reste dans la zone visible |
| `--next-mode` depuis un second terminal | Le mode passe à l'étape suivante (plein écran, widget, HUD, plein écran) sans ouvrir une seconde appli |
| `--mode=hud` sans icône système ni raccourci acceptés (Wayland sans indicateurs) | Le HUD n'est pas lancé : le widget s'ouvre et un message explique pourquoi |
| `Ctrl+Alt+P` sur le widget puis de nouveau `Ctrl+Alt+P` | Le widget disparaît puis réapparaît **toujours transparent** (si le fond devient opaque sous Linux : le signaler, repli `--no-transparency`) |
| Entrée « Fond opaque » du menu | Le widget (ou le HUD, remplacé par un widget) devient un fond sombre opaque, même mise en page |
| `--quit` | L'appli se ferme |

## Notes d'environnement de développement

- `npm run build:web` télécharge Tailwind depuis `https://cdn.tailwindcss.com/3.4.17`. Hors ligne : `TAILWIND_LOCAL=/chemin/vers/tailwind.js npm run build:web`.
- Sous Linux en conteneur (exécution en root), Electron demande `--no-sandbox`.
