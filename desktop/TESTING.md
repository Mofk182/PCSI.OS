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

## Widget et cadre qui coulisse

| Vérification | Résultat attendu |
|---|---|
| Passer en widget (icône système ou bouton de mode) | Petite carte arrondie, sans cadre de fenêtre, fond transparent aux coins, au-dessus des autres fenêtres |
| Glisser la poignée grise en haut du widget | Le widget se déplace ; la position est retrouvée après relance |
| Survoler un bouton de la barre de navigation | Un cadre lumineux (bleu `#38BDF8`) glisse vers ce bouton |
| Sortir la souris de la barre | Le cadre revient sur l'onglet actif |
| Naviguer au clavier (`Tab`) dans la barre | Le cadre suit le bouton qui a le focus |
| Cliquer sur un autre onglet | Le cadre se place sur le nouvel onglet actif |
| Activer « réduire les animations » dans le système | Le cadre saute d'un bouton à l'autre sans animation |
| Bouton rond en haut à droite du widget | Passe au mode suivant (widget vers HUD) |
| Plein écran | Aucun cadre lumineux, pas de poignée ; seul un petit bouton de mode apparaît en bas à droite |
| Ouvrir le site web normalement (navigateur, sans l'appli) | Aucun changement : pas de cadre, pas de bouton de mode, pas de poignée |

## HUD

| Vérification | Windows | Linux |
|---|---|---|
| Passer en HUD (icône système ou `--mode=hud`) | Fenêtre plein écran transparente ; panneau de verre en haut à droite (440 px), navigation en icônes | Idem |
| Cliquer sur le bureau en dehors du panneau | Le clic atteint le bureau ou la fenêtre située dessous | Idem |
| Cliquer dans le panneau (onglets, champs, boutons) | Fonctionne | Ne fonctionne pas (lecture seule, comportement attendu) |
| Survoler un onglet du panneau | Le cadre lumineux suit le survol, puis revient sur l'onglet actif | Le cadre reste sur l'onglet actif |
| Ouvrir une modale (par exemple « Ajouter à Anki ») | La modale est cliquable et se ferme | Aucune modale ne s'affiche |
| Mini-barre en bas à droite | Visible ; ses deux boutons ramènent au widget et au plein écran | Absente |
| Sortie de secours | Icône système, `--mode=fullscreen` et mini-barre | Icône système ou `--mode=fullscreen` |
| Parcourir les 5 onglets dans le panneau | Aucun défilement horizontal, grilles en une colonne | Idem |
| Fenêtre qui reste au-dessus des autres | Oui | À vérifier (rapports d'échecs sous Ubuntu) |

## Notes d'environnement de développement

- `npm run build:web` télécharge Tailwind depuis `https://cdn.tailwindcss.com/3.4.17`. Hors ligne : `TAILWIND_LOCAL=/chemin/vers/tailwind.js npm run build:web`.
- Sous Linux en conteneur (exécution en root), Electron demande `--no-sandbox`.
