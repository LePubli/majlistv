# Transcripteur Whisper (Majlis TV)

## Description
Service qui transcrit automatiquement les conférences hébergées : il prend les vidéos prêtes (`video_status = ready`), extrait l'audio, le transcrit avec **faster-whisper** (Whisper optimisé, sur processeur, quantification int8) et enregistre le texte horodaté dans la base (table `transcript_segments`). Le site en tire :
- un panneau de **transcription cliquable** à côté du lecteur (clic = saut au bon moment, phrase en cours surlignée, recherche dans le texte) ;
- des **sous-titres** activables dans le lecteur (WebVTT généré à la volée par l'API) ;
- la **recherche du catalogue** étendue au contenu parlé.

Cycle de vie : `pending` → `processing` (progression en %) → `ready` ; `failed` après 3 tentatives ; `unavailable` pour les liens YouTube/Vimeo, les vidéos sans piste audio et les vidéos sans parole.

## Prérequis
- API déployée avec la migration `005_transcripts.sql` (appliquée au démarrage de l'API) : **déployer l'API avant le transcripteur**.
- Worker de conversion (étape 3A) en place : le transcripteur attend que la vidéo soit `ready`.
- RAM : `small` ≈ 1 Go, `medium` ≈ 2-3 Go, `large-v3-turbo` ≈ 3-4 Go (en plus des autres services).
- Disque : le modèle est téléchargé une fois (small ≈ 0,5 Go, medium ≈ 1,5 Go, large-v3-turbo ≈ 1,6 Go) puis conservé dans le volume `/models`.
- Accès Internet du VPS vers huggingface.co au premier lancement (téléchargement du modèle).

## Choix du modèle (`WHISPER_MODEL`)
| Modèle | Vitesse sur CPU | Qualité | Conseil |
|---|---|---|---|
| `small` | la plus rapide | correcte en français/anglais, moyenne en arabe | **test de la chaîne** (valeur par défaut) |
| `medium` | environ 3 × plus lent que small | bonne, arabe correct | compromis |
| `large-v3-turbo` | proche de medium | très bonne, meilleur arabe | **production recommandée** |
| `large-v3` | très lent | la meilleure | seulement si la qualité prime sur le délai |

Ces vitesses sont des ordres de grandeur, pas des mesures sur ton VPS : après chaque transcription, les logs affichent la vitesse réelle (« 1.8x temps réel » = 1 h de conférence transcrite en environ 33 min). Mesure avec `small`, puis avec `large-v3-turbo`, et choisis selon le résultat. Changer de modèle = modifier la variable puis Deploy Now ; pour retranscrire des conférences déjà traitées, voir Debug.

> **Réglages dans le site (étape 5)** : toutes les variables de moteurs, clés et modèles ci-dessous se règlent désormais dans **Admin → Paramètres** (prise en compte en moins de 10 s, sans redéploiement). Seule `SETTINGS_KEY` (identique à l'API) et `DATABASE_URL` restent obligatoires ici. Les variables listées servent de valeur de secours.

## Installation (DockPanel Git Deploy)
Nouveau déploiement :
- Nom : `majlistv-transcriber` (minuscules)
- Dépôt / branche : les mêmes que l'API
- Dockerfile : `transcriber/Dockerfile`, contexte de build : `.`
- Port du conteneur : `3000` (page de santé), **aucun domaine**
- **Persistent Volume** : chemin dans le conteneur `/models` (sinon le modèle est retéléchargé à chaque redéploiement)
- Variables :
```
DATABASE_URL=<même valeur que majlistv-api>
S3_ENDPOINT=https://s3-majlisstv.le-publicitaire.fr
S3_REGION=garage
S3_BUCKET=majlis-videos
S3_ACCESS_KEY=<même valeur que majlistv-api>
S3_SECRET_KEY=<même valeur que majlistv-api>
WHISPER_MODEL=small
WHISPER_THREADS=4
```
Optionnelles : `WHISPER_BEAM` (3 ; 1 = plus rapide, 5 = plus précis), `WHISPER_LANGUAGE_MODE` (`declared` = langue saisie sur la conférence, `auto` = détection automatique), `POLL_SECONDS` (10).

`WHISPER_THREADS=4` laisse 2 cœurs aux autres services du VPS (6 cœurs au total). Si DockPanel affiche « port is already allocated », imposer un port hôte libre (exemple 7040) :
```bash
ss -ltn | grep ':7040 ' || echo "7040 libre"
docker exec dockpanel-postgres sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -c "UPDATE git_deploys SET host_port=7040 WHERE name='"'"'majlistv-transcriber'"'"';"'
```
puis Deploy Now.

## Lancement et vérification
```bash
docker logs -f dockpanel-git-majlistv-transcriber    # « Transcripteur prêt », puis chargement du modèle au premier job
curl -s http://127.0.0.1:7040/health                 # adapter le port hôte
```
Les conférences déjà converties sont prises automatiquement (statut `pending` par défaut).

## Dépendances épinglées
`requirements.txt` fixe `av==14.2.0` et `huggingface_hub<1.0` : `faster-whisper 1.1.1` n'est pas compatible avec les versions plus récentes de ces bibliothèques (erreurs `No module named 'requests'` puis `metadata_errors`). Ne pas les mettre à jour sans tester une transcription complète.

## Utilisation
Rien à faire côté organisateur : « Mes conférences » affiche « Transcription en cours XX % », puis la page de la conférence montre le panneau de transcription et le bouton de sous-titres du lecteur. Vidéo sans parole détectée (musique, silence, image fixe) : statut `unavailable`, sans nouvel essai.

## Pause, priorité et plage horaire (étape S3)
Avant de prendre une tâche, le service consulte les réglages de **Studio → Activité** : il saute une tâche en pause, passe une tâche prioritaire avant les autres, et ne démarre pas de tâche lourde (transcription) pendant la pause générale ou hors de la plage horaire. Ces réglages sont lus en base par les fonctions SQL `activity_allows`, `activity_paused` et `activity_priority`, créées par la migration `055_activity.sql` de l'API. **Redéployer l'API avant ce service.** Si les fonctions n'existent pas encore, le service le signale dans son journal (« Pause et priorité indisponibles… ») et garde la file d'origine. Une transcription déjà en cours va jusqu'au bout.

## Debug
- État de toutes les transcriptions (le conteneur PostgreSQL de l'application est celui qui contient la base `appmajlistv`) :
```sql
SELECT title, transcript_status, transcript_progress, transcript_language, transcript_attempts, left(transcript_error,100)
FROM talks WHERE source='upload';
```
- Relancer une transcription (échec, ou changement de modèle) : `UPDATE talks SET transcript_status='pending', transcript_attempts=0 WHERE id='<id>';`
- Téléchargement du modèle impossible : vérifier l'accès du VPS à huggingface.co (`curl -sI https://huggingface.co | head -1`).
- Mémoire insuffisante (conteneur tué) : choisir un modèle plus petit ou baisser `WHISPER_THREADS`.
- Mots mal reconnus (noms propres, termes arabes translittérés) : tester un modèle plus gros ; une correction manuelle par l'organisateur est prévue plus tard.
- Un seul transcripteur doit tourner.

## Développement local
```bash
cd transcriber && pip install -r requirements.txt   # ffmpeg et ffprobe requis
DATABASE_URL=... S3_ENDPOINT=... S3_ACCESS_KEY=... S3_SECRET_KEY=... WORK_DIR=/tmp/work MODELS_DIR=/tmp/models python src/main.py
```

## Vidéos YouTube et Vimeo (étape 9 bis)
Le service traite aussi les conférences YouTube et Vimeo dont l'organisateur a confirmé l'accord de l'auteur. Il essaie d'abord les sous-titres de l'auteur, puis l'audio avec Whisper, puis les sous-titres automatiques. Il liste aussi les vidéos des playlists et chaînes à importer. Réglages : Admin → Paramètres → Vidéos YouTube et Vimeo (méthode, cookies, proxy, maximum par import). Outils embarqués : `yt-dlp[default]` (mis à jour au démarrage, `YTDLP_AUTO_UPDATE=0` pour figer la version) et `deno` (moteur JavaScript exigé par yt-dlp pour YouTube).

Vérifications :
```bash
docker exec dockpanel-git-majlistv-transcriber deno --version
docker exec dockpanel-git-majlistv-transcriber python -m yt_dlp --version
docker exec dockpanel-git-majlistv-transcriber python -m yt_dlp --skip-download --list-subs "https://www.youtube.com/watch?v=IDENTIFIANT"
```

