# PCSI.OS : application de bureau

Application Windows et Linux avec trois modes : **plein écran** (l'appli habituelle), **widget** (petite fenêtre flottante, transparente, toujours au-dessus) et **HUD** (panneaux de verre sur tout l'écran, les clics traversent). Le HUD affiche aussi une **île dynamique** configurable en haut de l'écran.

## Installer

Les fichiers sont dans la page **Releases** du dépôt.

### Windows

1. Télécharge `PCSI.OS-<version>-setup.exe` et lance-le.
2. L'appli n'est **pas signée** (un certificat de signature coûte de l'argent), donc Windows affiche « Windows a protégé votre PC ». Clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

### Linux (Ubuntu et dérivés)

- **Paquet `.deb` (recommandé)** : `sudo apt install ./pcsi-os_<version>_amd64.deb`. Il installe la commande `pcsi-os`, utile pour les raccourcis (voir plus bas). Pour désinstaller : `sudo apt remove pcsi-os`.
- **AppImage** : `chmod +x PCSI.OS-<version>.AppImage` puis lance-le. Sur les Ubuntu récents, il faut probablement `libfuse2` (`sudo apt install libfuse2`) ; sans lui, `./PCSI.OS-<version>.AppImage --appimage-extract-and-run` fonctionne.

## Premier lancement

L'appli de bureau a son propre stockage : tes données du navigateur n'y sont pas. Récupère-les avec ton **Sync ID** (synchronisation existante) ou avec l'**import JSON**.

## Commandes

`pcsi-os` accepte des options, aussi bien au lancement que sur une appli déjà ouverte (la commande est transmise à l'instance en cours).

| Commande | Effet |
|---|---|
| `pcsi-os --mode=fullscreen` / `--mode=widget` / `--mode=hud` | Passe dans ce mode (la commande `--mode=fullscreen` fonctionne toujours, même si le HUD est actif) |
| `pcsi-os --next-mode` | Mode suivant : plein écran, widget, HUD, plein écran |
| `pcsi-os --toggle` | Affiche ou masque l'overlay (widget ou HUD) |
| `pcsi-os --quick-add` | Ouvre la saisie rapide (mot et traduction vers Anki) |
| `pcsi-os --toggle-island` | Ouvre ou replie l'île dynamique |
| `pcsi-os --quit` | Ferme l'appli |
| `pcsi-os --no-transparency` | Repli sans transparence : fond sombre opaque, le HUD devient un widget opaque |
| `pcsi-os --no-splash` | Désactive l'écran de lancement |

Avec l'AppImage, remplace `pcsi-os` par le chemin complet du fichier.

## Raccourcis clavier

| Raccourci | Effet |
|---|---|
| `Ctrl+Alt+P` | Afficher ou masquer l'overlay |
| `Ctrl+Alt+M` | Mode suivant |
| `Ctrl+Alt+A` | Saisie rapide |
| `Ctrl+Alt+I` | Île dynamique |

**Sous Linux, les raccourcis globaux sont peu fiables (surtout sous Wayland).** La méthode sûre : dans les réglages du système (GNOME : *Paramètres, Clavier, Raccourcis personnalisés*), crée un raccourci par commande, par exemple `pcsi-os --toggle` et `pcsi-os --toggle-island`. Pour savoir si ta session est sous Wayland : `echo $XDG_SESSION_TYPE`.

Le HUD ne démarre que s'il existe une voie de sortie (icône système ou raccourci enregistré) ; sinon l'appli ouvre le widget et te le dit.

## Configuration

`config.json` (à côté de l'appli, dans `resources/app/`) :

```json
{ "apiBase": "https://ton-site.vercel.app" }
```

- `apiBase` : adresse du site Vercel qui fournit la lecture IA des emplois du temps. Vide : pas d'appel serveur, l'appli utilise ta clé Gemini personnelle ou affiche le message d'erreur habituel.
- Côté Vercel, ajoute `app://pcsi` à la variable d'environnement `ALLOWED_ORIGIN` de la fonction `api/ai-schedule`.

## Développer

```bash
cd desktop
npm install
npm run build:web     # copie le site dans desktop/web/ et télécharge Tailwind (TAILWIND_LOCAL=/chemin/tailwind.js hors ligne)
npm start             # lance l'appli
npm test              # tests automatiques (node --test)
npm run smoke         # démarrage sans interface : charge la page et vérifie son titre
```

En conteneur ou en root sous Linux, ajoute `--no-sandbox` à `electron`. Sans écran : `xvfb-run -a npx electron . --smoke --no-sandbox --disable-gpu`.

La liste de contrôle manuelle (transparence, clics qui traversent, raccourcis, etc.) est dans [`TESTING.md`](TESTING.md).

## Publier une version

1. Change `version` dans `desktop/package.json`, puis commit.
2. Pousse l'étiquette correspondante : `git tag desktop-v<version>` puis `git push origin desktop-v<version>`.
3. GitHub Actions (`.github/workflows/desktop-release.yml`) construit l'installeur Windows et les paquets Linux, puis les publie dans les Releases. Le workflow refuse une étiquette qui ne correspond pas à la version du `package.json`.
