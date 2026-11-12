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

## Saisie rapide Anki

Prérequis : Anki ouvert, greffon AnkiConnect (code `2055492159`) installé. Aucune règle CORS à configurer pour l'appli de bureau.

| Vérification | Résultat attendu |
|---|---|
| `Ctrl+Alt+A` en plein écran, en widget et en HUD | Un panneau « Ajout rapide Anki » s'ouvre en haut au centre, le curseur est dans « Mot » |
| Saisir un mot, sa traduction, puis `Entrée` | La carte apparaît dans Anki (paquet `PCSI::Vocabulaire` par défaut), message vert, champs vidés, curseur de retour sur « Mot » pour la carte suivante |
| `Échap`, ou clic en dehors du panneau | Le panneau se ferme ; en HUD les clics traversent de nouveau la fenêtre |
| HUD sous Windows : après fermeture, survoler et cliquer le panneau principal | Le HUD réagit comme avant la saisie rapide (survol, clics) |
| HUD sous Linux : après fermeture | Le HUD est de nouveau en lecture seule, les clics atteignent le bureau |
| Anki fermé | Message « Anki est fermé ou le greffon AnkiConnect n'est pas installé » et bouton « Copier la carte » |
| Mot ou traduction vide | « Renseigne le mot et sa traduction. » |
| Mot avec `<`, `&` ou des guillemets | Le texte apparaît tel quel dans la carte |
| `pcsi-os --quick-add` depuis un terminal (widget masqué par `Ctrl+Alt+P`) | Le widget réapparaît avec le panneau ouvert |
| Wayland, HUD : taper tout de suite après `Ctrl+Alt+A` | Le texte arrive dans « Mot ». Sinon : le noter (repli prévu : saisie rapide depuis le widget) |
| Fenêtre « Ajouter à Anki » du Daily Drop | Fonctionne comme avant |

## Île dynamique (HUD)

| Vérification | Windows | Linux |
|---|---|---|
| Passer en HUD | Pilule centrée en haut, avec l'heure ou le prochain cours | Idem |
| Survoler la pilule | Elle s'étend en carte (animation douce) ; en sortant, elle se replie après un court délai, sans clignoter | Aucun effet (HUD en lecture seule) |
| `Ctrl+Alt+I` ou `pcsi-os --toggle-island` | Ouvre l'île ; un second appui la replie | Idem (c'est la voie normale sous Linux) |
| Ouverture automatique avant un cours (10 minutes par défaut) | L'île s'ouvre toute seule environ 8 secondes, une seule fois par cours, puis se replie | Idem |
| Pendant l'animation d'ouverture, glisser la souris vers le bas de la carte | La carte reste cliquable et ne se replie pas tant que la souris est dessus | Sans objet |
| « Portails & Réglages » : carte « Île dynamique (HUD) » | Cocher ou décocher un module, changer l'ordre, le module replié, le déclencheur, les minutes, les jours, la mission du compte à rebours : l'île reflète le changement sans relancer | Idem, mais le déclencheur est grisé sur « Raccourci » |
| Profil vierge (aucun cours ni mission) | L'île affiche l'heure et la date, jamais une carte vide | Idem |
| Changer de mode puis revenir en HUD, ou relancer l'appli | Les réglages de l'île sont conservés | Idem |
| Activer « réduire les animations » dans le système | L'île s'ouvre et se replie sans animation | Idem |

## Écran de lancement

| Vérification | Résultat attendu |
|---|---|
| Lancer l'appli en plein écran | Un bloc « boîte noire » `«block» PCSI.OS` au centre ; une flèche « Données / Fichiers bruts » entre par la gauche avec des paquets lumineux ; le bloc « traite » (balayage, bordure bleue qui pulse) ; la flèche « ENS · ULM · Polytechnique · etc. » s'allume à droite ; l'appli apparaît en fondu au bout d'environ 2 secondes |
| Lancer l'appli en widget | Même séquence, avec un flux vertical (de haut en bas) et les coins arrondis du widget |
| Lancer l'appli en HUD | Aucun écran de lancement |
| Changer de mode avec l'icône système après le démarrage | L'écran de lancement ne se rejoue pas |
| Cliquer ou appuyer sur une touche pendant le diagramme | Il se ferme immédiatement |
| Lancer avec `--no-splash` | Aucun écran de lancement |
| Activer « réduire les animations » dans le système | Diagramme statique, sans mouvement, fermé au bout d'environ 0,6 seconde |
| Machine très lente ou démarrage anormalement long | L'écran ne reste jamais plus de 6 secondes |
| Ouvrir le site web dans un navigateur | Aucun écran de lancement |

## Paquets et installation

| Vérification | Résultat attendu |
|---|---|
| Windows : lancer `PCSI.OS-<version>-setup.exe` | L'écran SmartScreen apparaît (appli non signée) ; « Informations complémentaires » puis « Exécuter quand même » ; l'installeur propose le dossier et crée un raccourci |
| Windows : lancer l'appli installée, puis `PCSI.OS.exe --next-mode` depuis un terminal | L'appli s'ouvre ; la commande change le mode de l'instance déjà ouverte |
| Ubuntu : `sudo apt install ./pcsi-os_<version>_amd64.deb` | Installation sans erreur ; la commande `pcsi-os` existe ; l'entrée « PCSI.OS » apparaît dans le menu des applications |
| Ubuntu : `sudo apt remove pcsi-os` | Désinstallation propre ; la commande `pcsi-os` disparaît |
| Ubuntu récent : lancer l'AppImage sans `libfuse2` | Message d'erreur sur FUSE ; avec `--appimage-extract-and-run`, l'appli se lance |
| Lancer l'appli installée sans réseau | L'interface s'affiche complètement (icônes, polices, style) |

## Risques à vérifier au premier essai (spec §11)

| Risque | À vérifier | Si ça échoue |
|---|---|---|
| Focus clavier de la saisie rapide sous Wayland | `pcsi-os --quick-add` depuis un raccourci GNOME en HUD : le curseur est dans le champ « mot » | Utiliser la saisie rapide depuis le widget |
| Transparence et « toujours au-dessus » sous Linux | Le widget et le HUD sont transparents et restent au-dessus | Lancer avec `--no-transparency` |
| `Origin` envoyé à la fonction Vercel | Une lecture IA depuis l'appli de bureau aboutit (`ALLOWED_ORIGIN` contient `app://pcsi`) | Ajuster `ALLOWED_ORIGIN` selon l'origine réellement reçue |
| Icône système sous GNOME | L'icône apparaît (extension d'indicateurs d'applications) | Utiliser les commandes `pcsi-os --…` liées à des raccourcis |
| AppImage sans `libfuse2` | Voir tableau précédent | Installer `libfuse2` ou utiliser le `.deb` |

## Notes d'environnement de développement

- `npm run build:web` télécharge Tailwind depuis `https://cdn.tailwindcss.com/3.4.17`. Hors ligne : `TAILWIND_LOCAL=/chemin/vers/tailwind.js npm run build:web`.
- Sous Linux en conteneur (exécution en root), Electron demande `--no-sandbox`.
