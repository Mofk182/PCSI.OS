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

## Notes d'environnement de développement

- `npm run build:web` télécharge Tailwind depuis `https://cdn.tailwindcss.com/3.4.17`. Hors ligne : `TAILWIND_LOCAL=/chemin/vers/tailwind.js npm run build:web`.
- Sous Linux en conteneur (exécution en root), Electron demande `--no-sandbox`.
