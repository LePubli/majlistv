# Audit de vitesse et d'accessibilité (amélioration 6.8)

Mesure les pages principales du site (visiteur **et** membre) en **mobile** (Moto G, 4G simulée) et **ordinateur** avec **Lighthouse**, puis passe **axe** (WCAG 2 A/AA) sur chacune. Rien n'est envoyé à l'extérieur : tout tourne sur ton poste contre le site local.

## Prérequis
- Poste WSL Ubuntu 24.04 (ou tout Linux/macOS), Node 20 ou plus.
- Un Chrome ou Chromium installé (sinon : `sudo apt install -y chromium-browser` ou `npx playwright install chromium`).
- Le site **en mode production** et l'API qui tournent en local, avec quelques conférences publiées.

## Lancer le site en mode production (depuis la racine du dépôt)
```bash
cd web && npm ci && npm run build
# lance aussi l'API (autre terminal, comme d'habitude), puis le site :
API_URL=http://127.0.0.1:3000 node .next/standalone/server.js   # PORT=3100 pour changer le port
```
Remarque : mesurer toujours sur la version **build** (`next build`), jamais sur `next dev` (les chiffres seraient faux).

## Lancer l'audit
```bash
cd ops/audit
npm install
SITE=http://localhost:3100 API=http://127.0.0.1:3000 CHROME_PATH=$(which chromium chromium-browser google-chrome 2>/dev/null | head -1) node audit.mjs
```
Variables : `SITE`, `API`, `CHROME_PATH`, `OUT` (fichier JSON, défaut `audit-result.json`), `MODES` (`mobile,desktop`).
Durée : 10 à 15 minutes pour 30 mesures. Le script crée un compte de test `audit@test.local` (à supprimer ensuite dans Admin → Membres si le site n'est pas un site de test).

## Lire le résultat
Une ligne par page : score performance, score accessibilité, **LCP** (affichage du plus gros élément, bon < 2 500 ms), **CLS** (décalage de mise en page, bon < 0,1), **TBT** (blocage du fil principal, bon < 200 ms), poids en Ko, nombre de violations axe.
Le script se termine en **erreur** (code 1) si une page dépasse CLS 0,1, descend sous 95 en accessibilité ou a une violation axe « serious/critical » : utile avant une mise en ligne.

## Debug
- `ECONNREFUSED` : l'API ou le site ne tourne pas (vérifier `SITE` et `API`).
- `ERRORED_DOCUMENT_REQUEST` sur une page : la conférence choisie n'existe plus (page 404) ; le script prend la première conférence du catalogue.
- Erreurs de console « ERR_TUNNEL_CONNECTION_FAILED » sur des miniatures YouTube : le poste n'a pas Internet ou le proxy bloque ; sans effet sur le site.
- Scores très variables d'une exécution à l'autre : normal à ±5 points ; refaire 2 fois avant de conclure.

## Les garde-fous automatiques (sans navigateur)
`web/tests/test_perf_a11y.mjs` (lancé par la CI) vérifie que les défauts corrigés ne reviennent pas : images avec `alt`, logos légers, pied de page qui ne saute pas, lien d'évitement, libellés cohérents.
