# Mejliss TV

Plateforme de conférences vidéo à la demande (« Des conférences qui éclairent », noir et or), devenue plateforme
d'apprentissage : regarder → comprendre (quiz) → retenir (révision espacée) → mettre en pratique (engagements, bilan).
Espace enfants « Mejliss TV Kids ». Français, anglais, arabe (droite à gauche). Site, PWA et application Android.

Code technique : `majlistv`. Dépôt : GitHub `LePubli/majlistv`, branche `main`.

## Architecture

| Dossier | Rôle | Technique | Déploiement DockPanel |
|---|---|---|---|
| `api/` | API, migrations, 37 modules (`api/src/modules/`) | Node.js 22, Fastify 5, zod, PostgreSQL | `majlistv-api` (Dockerfile **racine** : `Dockerfile`) |
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

## Règles de code à connaître

- Textes du site : `web/lib/i18n.js` (un texte par ligne, trois langues). Un composant « use client » ne l'importe jamais : `web/lib/locales.js` pour la liste des langues, `useApp().t` pour les textes.
- Styles : `web/app/globals.css` pour tout ce qu'une page publique utilise ; `web/app/back.css` pour le Studio et l'administration seulement.
- Fichiers tenus en double entre l'API et le site (`navcfg.js`, `menus.js` / `menusCfg.js`, blocs, thème) : modifier les deux, un test vérifie leur égalité.
