# Worker de conversion vidéo (Majlis TV)

## Description
Service qui surveille la base de données et convertit chaque vidéo envoyée par un organisateur (statut `pending`) en **HLS** : lecture adaptative (360p / 720p / 1080p selon la source), segments fMP4 de 6 s, miniature (`poster.jpg`) et durée. Les fichiers sont écrits dans le bucket Garage sous `hls/<id de la conférence>/`. Le fichier d'origine est conservé (il servira à Whisper à l'étape 3B).

Cycle de vie d'une vidéo : `pending` (en attente) → `processing` (progression en %) → `ready` (publiée dans le catalogue) ou `failed` (3 tentatives échouées, message dans `talks.video_error`).

## Prérequis
- L'API déjà déployée avec la migration `004_transcoding.sql` (appliquée automatiquement à son démarrage) : **déployer l'API avant le worker**.
- Garage opérationnel (mêmes identifiants S3 que l'API).
- Disque libre sur le VPS : prévoir environ **2 × la taille de la plus grosse vidéo** pour le travail temporaire, et dans le bucket l'original + environ 1 × sa taille en HLS (quota Garage actuel : 30 Go, à augmenter si besoin).
- CPU : la conversion est lourde (compter 0,5 à 2 × la durée de la vidéo sur 2 à 4 cœurs). Le worker tourne en priorité basse (`nice`) et traite **une vidéo à la fois**.

## Installation (DockPanel Git Deploy)
Nouveau déploiement :
- Nom : `majlistv-worker` (minuscules)
- Dépôt / branche : les mêmes que l'API
- Dockerfile : `worker/Dockerfile`, contexte de build : `.`
- Port du conteneur : `3000` (simple page de santé, **aucun domaine** à configurer)
- Variables (mêmes valeurs que `majlistv-api` pour les 6 dernières) :
```
DATABASE_URL=postgres://majlisstv:<mot de passe>@172.17.0.3:5432/appmajlistv
S3_ENDPOINT=https://s3-majlisstv.le-publicitaire.fr
S3_REGION=garage
S3_BUCKET=majlis-videos
S3_ACCESS_KEY=<Key ID de majlis-api>
S3_SECRET_KEY=<secret de majlis-api>
```
Optionnelles : `FFMPEG_THREADS` (0 = automatique, mettre 2 pour limiter la charge CPU), `POLL_SECONDS` (10).

Si DockPanel affiche « port is already allocated », changer le port hôte du worker comme pour les autres déploiements (exemple : 7030) :
```bash
docker exec dockpanel-postgres psql -U postgres -d <base de DockPanel> -c "UPDATE git_deploys SET host_port=7030 WHERE name='majlistv-worker';"
```
puis Deploy Now.

## Lancement et vérification
```bash
docker logs -f dockpanel-git-majlistv-worker      # doit afficher « Worker prêt. »
curl -s http://127.0.0.1:7030/health              # {"status":"ok",...} (adapter le port hôte)
```

## Utilisation
Rien à faire : après un upload depuis `/organizer`, la liste affiche « En attente de conversion » puis « Conversion XX % », puis la conférence apparaît dans le catalogue avec sa miniature et sa durée. Les vidéos déjà envoyées avant cette étape sont converties automatiquement au premier démarrage.

## Pause, priorité et plage horaire (étape S3)
Avant de prendre une tâche, le service consulte les réglages de **Studio → Activité** : il saute une tâche en pause, passe une tâche prioritaire avant les autres, et ne démarre pas de tâche lourde (conversion) pendant la pause générale ou hors de la plage horaire. Ces réglages sont lus en base par les fonctions SQL `activity_allows`, `activity_paused` et `activity_priority`, créées par la migration `055_activity.sql` de l'API. **Redéployer l'API avant ce service.** Si les fonctions n'existent pas encore, le service le signale dans son journal (« Pause et priorité indisponibles… ») et garde la file d'origine. Une conversion déjà en cours va jusqu'au bout.

## Debug
- Rien ne se passe : `docker logs dockpanel-git-majlistv-worker`. Le message « Base pas prête » signifie que la migration 004 n'est pas appliquée (redéployer l'API).
- Voir l'état des vidéos :
```bash
docker exec dockpanel-postgres psql -U postgres -d appmajlistv -c "SELECT title, video_status, video_progress, transcode_attempts, left(video_error,120) FROM talks WHERE source='upload';"
```
- `failed` : lire `video_error`. Pour relancer : `UPDATE talks SET video_status='pending', transcode_attempts=0 WHERE id='<id>';`
- Plus d'espace disque : `df -h` sur le VPS ; les fichiers temporaires sont supprimés après chaque conversion.
- Le worker redémarré en cours de conversion remet la vidéo en attente et la reprend depuis le début.
- Un seul worker doit tourner (ne pas dupliquer le déploiement).

## Développement local
```bash
cd worker && npm install
DATABASE_URL=... S3_ENDPOINT=... S3_ACCESS_KEY=... S3_SECRET_KEY=... WORK_DIR=/tmp/work node src/index.js
```
(ffmpeg et ffprobe doivent être installés sur la machine.)


## Étape E4a — rendu des montages de l'éditeur
Le worker calcule aussi les **rendus** demandés dans l'éditeur (« Rendre la vidéo ») : quand aucune vidéo n'attend sa conversion, il prend le rendu suivant (`editor_renders`, table créée par l'API), télécharge l'original (ou la meilleure qualité convertie s'il n'existe plus), la voix française, les musiques et le logo, mesure le son (première passe), encode le MP4 (H.264/AAC) et le range dans `editor/renders/<projet>/`. Code : `src/render.js` ; le plan (graphe FFmpeg, textes, courbes) est préparé par l'API (`api/src/modules/editor/plan.js`).
- Pause, priorité, pause générale et plage horaire : Studio → Activité (le rendu est une tâche lourde, comme la conversion).
- Un rendu interrompu par un redéploiement repart du début ; 2 essais puis « en échec ».
- Polices des textes : paquet Alpine `font-dejavu` (`/usr/share/fonts/dejavu`), ou variable `FONTS_DIR`.
- Disque : prévoir l'original + le fichier rendu dans `/work` pendant le calcul (effacés ensuite).
- Test local : `node tests/run_render_once.mjs` (prend un rendu en attente et le calcule) avec les variables `DATABASE_URL`, `S3_*`.


## Étape E4b — nouvelles versions des vidéos publiées
Quand une vidéo publiée est remplacée par un montage (ou que l'original est restauré), le worker prépare la nouvelle version : il convertit le fichier (copie du rendu final, ou original) comme une vidéo envoyée (qualités HLS, miniatures, audio seul) dans un **dossier à part** `hls/<conférence>/r/<remplacement>/`. La version publiée ne bouge pas ; la bascule est faite ensuite par l'API. Code : `src/replace.js` (fichiers du stockage : `src/files.js`).
- Ordre de passage : conversions des vidéos envoyées, puis nouvelles versions (quelqu'un attend la bascule), puis rendus, puis versions audio.
- Pause, priorité, plage horaire : Studio → Activité (file « replace », tâche lourde). Annulation possible avant la bascule.
- Test local : `node tests/run_replace_once.mjs` (mêmes variables que `run_render_once.mjs`).
