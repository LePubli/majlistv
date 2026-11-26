# Mejliss TV

Plateforme de conférences vidéo à la demande (« Des conférences qui éclairent », noir et or), devenue plateforme
d'apprentissage : regarder → comprendre (quiz) → retenir (révision espacée) → mettre en pratique (engagements, bilan).
Espace enfants « Mejliss TV Kids ». Français, anglais, arabe (droite à gauche). Site, PWA et application Android.

Code technique : `majlistv`. Dépôt : GitHub `LePubli/majlistv`, branche `main`.

## Architecture

| Dossier | Rôle | Technique | Déploiement DockPanel |
|---|---|---|---|
| `api/` | API, migrations, 37 modules (`api/src/modules/`) | Node.js 22, Fastify 5, zod 4, PostgreSQL | `majlistv-api` (Dockerfile **racine** : `Dockerfile`) |
| `web/` | Site et PWA | Next.js 15, React 18 | `majlistv-web` (`web/Dockerfile`) |
| `mobile/` | Application Android | Expo 58, React Native | APK fabriqué par GitHub Actions |
| `worker/` | Conversion vidéo, rendus du montage | Node.js, FFmpeg | `majlistv-worker` |
| `transcriber/` | Transcription Whisper, import de vidéos, intervenants, suivi du visage | Python 3.12 | `majlistv-transcriber` |
| `translator/` | Traduction des sous-titres, résumés | Python 3.12 | `majlistv-translator` |
| `dubbing/` | Doublage français (Piper + conversion de voix) | Python 3.11 | `majlistv-dubbing` |
| `search/` | Recherche | Meilisearch | `majlistv-search` |
| `garage/` | Stockage vidéo (S3) | Garage | `majlistv-storage` |
| `ops/` | Scripts du serveur : limites, contrôle après déploiement, sauvegarde, audits | bash, Node | copiés sur le VPS |
| `local/` | Essai sur un poste (Docker Compose) | — | jamais en production |
| `docs/` | Documentation | — | — |

Base de données : PostgreSQL (Docker App DockPanel `postgres-majlisstv`). Les migrations (`api/migrations/` et
`api/src/modules/*/migrations/`) s'appliquent toutes seules au démarrage de l'API.

**Ne jamais mettre de `docker-compose.yml` à la racine du dépôt** : DockPanel passerait en mode Compose et refuserait la construction.

## Prérequis

- Production : un VPS Ubuntu 24.04 avec DockPanel (Git Deploy), nginx, un nom de domaine par service public.
- Poste local (facultatif) : Docker et Docker Compose, Node.js 22, Python 3.12.

## Installation complète (serveur neuf)

Le guide pas à pas est `docs/RECONSTRUIRE-DE-ZERO.md` (ordre des services, variables de chacun, restauration des données, contrôle final).

## Configuration

Variables de l'API (DockPanel → `majlistv-api` → Variables) : `APP_NAME`, `CORS_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES`,
`SETTINGS_KEY`, `PRACTICE_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MEILI_MASTER_KEY`, `S3_*`. Site : `API_URL`, `CSP_STORAGE_ORIGINS`.
Modèle : `.env.example`.

- `SETTINGS_KEY` est identique sur api, translator, transcriber et dubbing.
- **Ne jamais changer `SETTINGS_KEY` ni `PRACTICE_KEY`** : les réglages secrets et les engagements des membres deviendraient illisibles.
- Les autres réglages (paiement Stripe, e-mails, traduction, fonctions activables, menus, apparence) se font dans le site : Admin → Paramètres, Fonctions, Menus, Apparence.

## Lancement en local (essai)

```bash
cp .env.example .env        # puis remplir POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD
cd local
docker compose --env-file ../.env up -d --build
docker compose logs -f api
curl http://127.0.0.1:3000/health
```

Site en développement :

```bash
cd web
npm ci
API_URL=http://127.0.0.1:3000 npm run dev
```

## Mise à jour en production

1. Le code est poussé sur `main`.
2. DockPanel → Git Deploy → **Redeploy**, dans l'ordre : `majlistv-api` (migrations au démarrage), puis `majlistv-web`, puis seulement les services modifiés (worker, transcriber, translator, dubbing).
3. Sur le VPS :

```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

Résultat attendu du contrôle : 0 échec. (`apply-limits.sh` et `verify-deploy.sh` sont versionnés dans `ops/`.)

Application mobile : un changement d'écran ou de texte arrive par mise à jour en ligne (fermer et rouvrir l'application deux fois) ; un changement natif demande un nouvel APK (GitHub → Actions → « Application Android (APK) »).

## Tests

```bash
bash ops/ci/run-api-tests.sh                 # API : PostgreSQL de test sur 127.0.0.1:5544 et API de test sur :3055 (voir docs/historique/ETAPES.md, « Étape 30 »)
cd web && npm run build                      # site : construction
cd mobile && npm run check                   # application : typage + tests
```

Ces trois contrôles tournent sur GitHub à chaque envoi (Actions → « Tests automatiques »). Rouge = ne pas déployer.

## Debug

- Journaux d'un service : `docker logs --tail 100 dockpanel-git-majlistv-api` (ou `-web`, `-worker`, `-transcriber`, `-translator`, `-dubbing`).
- 502 Bad Gateway : le conteneur redémarre en boucle, lire ses journaux. `Invalid URL` = `DATABASE_URL` mal formée ; `password authentication failed` = mauvais mot de passe ; `ECONNREFUSED` = mauvaise adresse de la base (elle change si le conteneur PostgreSQL est recréé).
- Après un redéploiement, site inaccessible : `grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*` (le port choisi par DockPanel a pu changer), puis `nginx -t && systemctl reload nginx`.
- Disque plein : `docker builder prune -af` et `docker image prune -f`. **Jamais** `docker system prune --volumes` ni `docker volume prune` (ils effaceraient la base et les vidéos).
- Tâches bloquées (conversion, transcription, doublage) : Studio → Activité.

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/historique/ETAPES.md` | Une section par étape livrée (description, déploiement, debug, exemples) |
| `ROADMAP.md` | Ce qui est fait et ce qui reste |
| `docs/PROBLEMES-A-REGLER.md` | Registre des points ouverts et réglés |
| `docs/RECONSTRUIRE-DE-ZERO.md` | Reconstruction complète sur un serveur neuf |
| `docs/ETAPE-F-VERIFICATIONS.md` | Essais réels à faire sur le serveur et les téléphones |
| `docs/AUDIT-2026-11.md` | Audit de novembre 2026 (nettoyage, optimisations, sécurité, parcours) |
| `docs/IDEES-AMELIORATIONS.md` | Idées d'améliorations |

## Étape A — Shorts autonomes importés depuis YouTube (26/11)

**Description.** Studio → Shorts → « Importer depuis YouTube » : on colle l'adresse de la page « Shorts » d'une chaîne (ex. `https://www.youtube.com/@chaine/shorts`) ou d'une liste de lecture ; on coche les shorts, on choisit le mode (copie chez nous, ou lecture depuis YouTube sans copie), les catégories, le public (adultes / Kids + tranches d'âge) et on coche la case des droits (obligatoire, journalisée). Ces shorts n'ont pas de conférence liée.

**Prérequis.** Aucun nouveau réglage ni variable. La copie utilise yt-dlp, ffmpeg et Garage (déjà en place pour le transcripteur).

**Déploiement (DockPanel).** Git Deploy → Redeploy dans l'ordre : `majlistv-api` (migration `004_standalone.sql` au démarrage), `majlistv-web`, `majlistv-transcriber` (file de copie). Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

**Debug.** Une copie échouée affiche son motif dans la liste (bouton « Réessayer la copie »). Journal : `docker logs --tail 100 dockpanel-git-majlistv-transcriber | grep short`. Un blocage « confirmez que vous n'êtes pas un robot » de YouTube met la file en pause (voir `docs/PROBLEMES-A-REGLER.md`, point 374). Disque : Garage doit rester sous le plafond de 30 Go.

**Exemple.** Coller `https://www.youtube.com/@LUMI%C3%88REDELACr%C3%A9ation/shorts` → Analyser → tout cocher → « Lire depuis YouTube » → catégorie → case des droits → Importer.

**Tests.** `python3 api/tests/test_shorts_import.py` (API + PG + S3 de test), `python3 transcriber/tests/test_shorts_copy.py`, `node web/tests/test_shorts_import.mjs`.

## Étape B — Import d'une série complète depuis YouTube (26/11)

**Description.** Studio → Séries → « Importer une série depuis YouTube » : on colle l'adresse d'une liste de lecture ou d'une page « série » (ex. `https://www.youtube.com/show/VLPL…`), on coche et ordonne les épisodes, on place les saisons (détectées dans les titres « Saison 2 », « S02E05 »… sinon « la saison N commence à l'épisode X »), on choisit les épisodes à copier chez nous (les autres restent lus depuis YouTube), puis on coche la case des droits (obligatoire, journalisée) et on crée la série.

**Prérequis.** Aucun nouveau réglage. La liste est lue par le transcripteur (limite : réglage `import_max_videos`, 200 par défaut). La copie chez nous demande la fonction « Import de vidéos externes » (Admin → Fonctions) et de la place dans Garage (plafond 30 Go : une vidéo de 2 h pèse plusieurs Go).

**Déploiement (DockPanel).** Git Deploy → Redeploy dans l'ordre : `majlistv-api` (migration `001_import.sql` du module séries au démarrage), `majlistv-web`, `majlistv-transcriber`. Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

**Debug.** Liste en échec : message affiché + bouton « Relancer » (cookies YouTube si blocage). Copies : état visible sur la fiche de chaque vidéo (Studio → Contenus). Journal : `docker logs --tail 100 dockpanel-git-majlistv-transcriber`.

**Exemple.** Coller `https://www.youtube.com/show/VLPLDoK5CcjJZA6JIO4oRpfJwz1-4DAOKisZ` → Analyser → vérifier les saisons → ne rien copier → case des droits → « Importer la série ». Les épisodes sont créés en brouillon (choix « Publier tout de suite » possible).

**Tests.** `python3 api/tests/test_series_import.py`, `node api/tests/test_series_seasons.mjs`, `python3 transcriber/tests/test_external.py`, `node web/tests/test_series_import.mjs`.

## Étape C — Import de séries depuis d'autres sites (26/11)

**Description.** Même écran que l'étape B (Studio → Séries → « Importer une série »), ouvert à Vimeo (showcases, albums), Dailymotion (playlists) et archive.org (collections, recherches). Onglet « Liste d'adresses (autre site) » : une adresse par ligne (`adresse | titre facultatif`), liens directs ou pages de sites publics ; ces vidéos sont copiées chez nous d'office. Saisons, droits obligatoires, brouillon par défaut : comme à l'étape B.

**Prérequis.** Fonction « Import de vidéos externes » activée (Admin → Fonctions) et de la place dans Garage pour les copies.

**Déploiement (DockPanel).** Git Deploy → Redeploy : `majlistv-api`, puis `majlistv-web` (le transcripteur n'a pas changé depuis l'étape B). Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

**Debug.** Liste en échec : message + « Relancer ». Copie d'un autre site en échec : la vidéo passe en « échec » et se relance depuis sa fiche (Studio → Contenus). Adresses ignorées : numéros de lignes affichés.

**Exemple.** Onglet « Liste d'adresses » → coller `https://exemple.org/cours-1.mp4 | Cours 1` (une par ligne) → Préparer la liste → titre de la série → case des droits → Importer.

**Tests.** `python3 api/tests/test_series_import.py`, `node web/tests/test_series_import.mjs`.

## Règles de code à connaître

- Textes du site : `web/lib/i18n.js` (un texte par ligne, trois langues). Un composant « use client » ne l'importe jamais : `web/lib/locales.js` pour la liste des langues, `useApp().t` pour les textes.
- Styles : `web/app/globals.css` pour tout ce qu'une page publique utilise ; `web/app/back.css` pour le Studio et l'administration seulement.
- Fichiers tenus en double entre l'API et le site (`navcfg.js`, `menus.js` / `menusCfg.js`, blocs, thème) : modifier les deux, un test vérifie leur égalité.
