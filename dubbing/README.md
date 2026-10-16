# Service de doublage Mejliss TV (étape D1a)

## Description
Service Python qui fabrique la **version française** des conférences, à partir des phrases françaises déjà traduites (table `transcript_segments`, langue `fr`) :
1. **voix de base** : Piper (voix « Tom » par défaut), chargée **une seule fois en mémoire** (le banc d'essai la relançait à chaque phrase : c'était la moitié du temps de calcul) ;
2. **calage** : chaque phrase tient dans son créneau, en empruntant le silence qui suit, sinon accélérée sans changer la hauteur (jusqu'à × 1,35 par défaut) ; au-delà, elle est marquée « à revoir » ;
3. **conversion vers la voix cible** (ta voix clonée, avec consentement daté) avec ChatterboxVC, **par blocs de 20 s** et **3 étapes** par défaut (réglages validés à l'écoute) ;
4. **mélange** avec la voix d'origine baissée à 15 % (100 % pendant les phrases qui commencent par `#` : versets, hadiths, invocations, jamais lus par la voix de synthèse) ;
5. **fichiers AAC** envoyés dans le stockage (Garage) : `dubbing/previews/…` (écoutes de 60 s) et `dubbing/tracks/…` (doublages complets).

Les demandes viennent du Studio (**Audio et doublage → Écouter 60 secondes / Lancer le doublage**) et passent par la table `dub_jobs` :
- **écoute de 60 s** : traitée dès que le service est libre ;
- **doublage complet** : seulement pendant la **plage de nuit** (1 h – 7 h, heure de Paris, réglable dans Admin → Modules → Doublage français ; « always » = dès que libre). Un doublage commencé va jusqu'au bout.
- **une seule demande à la fois** ; annulation possible depuis le Studio (une demande en cours s'arrête au bloc suivant) ;
- après un arrêt ou un redéploiement, la demande en cours **repart dans la file** ; deux échecs = « échec » avec le message affiché dans le Studio.

Le service donne un **signe de vie toutes les 30 s** (table `dub_engine`) : le Studio affiche « Moteur de doublage prêt » ou « hors ligne ». Il enregistre la **vitesse réellement mesurée** de chaque travail : l'estimation du Studio s'en sert ensuite (médiane des 5 derniers travaux de la même configuration, d'au moins 20 s de parole).

Vidéos **YouTube / Vimeo / archive.org** : non hébergées, donc pas de voix d'origine à mélanger : la piste contient la **voix française seule** (le lecteur baissera le son de la vidéo, étape D2). Vidéos envoyées : deux fichiers, `…-mix.m4a` (voix française + voix d'origine baissée) et `…-voice.m4a` (voix seule).

## Prérequis
- API redéployée en premier (module « Doublage français » **0.2.0** : la migration `002_jobs.sql` crée `dub_jobs`, `dub_engine`, `dub_tracks`), module **activé** dans Admin → Modules.
- VPS : 4 cœurs et 8 Go de mémoire pour ce service (mesuré à l'étape 0 : ≈ 3 Go en conversion) ; ≈ 5 Go de disque pour l'image et ≈ 1,5 Go pour les modèles.
- Accès du VPS à huggingface.co au premier lancement (voix Piper « Tom » ≈ 60 Mo, conversion de voix ≈ 1 Go), puis tout reste dans le volume `/models`.

## Installation (DockPanel Git Deploy)
Nouveau déploiement :
- Nom : `majlistv-dubbing` (minuscules)
- Dépôt / branche : les mêmes que l'API (`LePubli/majlistv`, `main`)
- Dockerfile : `dubbing/Dockerfile`, contexte de build : `.`
- Port du conteneur : `3000` (page de santé), **aucun domaine**
- **Persistent Volume** : chemin dans le conteneur `/models`
- Variables (mêmes valeurs que le transcripteur / l'API) :
```
DATABASE_URL=<même valeur que majlistv-api>
SETTINGS_KEY=<même valeur que majlistv-api>
S3_ENDPOINT=https://s3-majlisstv.le-publicitaire.fr
S3_REGION=garage
S3_BUCKET=majlis-videos
S3_ACCESS_KEY=<même valeur que majlistv-api>
S3_SECRET_KEY=<même valeur que majlistv-api>
DUB_THREADS=4
```
Optionnelles : `POLL_SECONDS` (10). Le nombre de cœurs, la plage de nuit et la durée de l'écoute rapide se règlent ensuite dans **Admin → Modules → Doublage français** (relus toutes les 10 s).

Si DockPanel affiche « port is already allocated », imposer un port hôte libre (exemple 7041 ; jamais 7000, 7001 ni 7010) :
```bash
ss -ltn | grep ':7041 ' || echo "7041 libre"
docker exec dockpanel-postgres sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -c "UPDATE git_deploys SET host_port=7041 WHERE name='"'"'majlistv-dubbing'"'"';"'
```
puis Deploy Now.

**Limiter le service à 4 cœurs et 8 Go** (pour ne pas gêner les autres sites) :
```bash
docker update --cpus 4 --memory 8g --memory-swap 8g dockpanel-git-majlistv-dubbing
```
À refaire après chaque redéploiement du service, ou à ajouter dans `/root/apply-limits.sh`.

## Lancement et vérification
```bash
docker logs -f dockpanel-git-majlistv-dubbing     # « Service de doublage 0.2.0 prêt (moteur : real, 4 cœurs…) »
curl -s http://127.0.0.1:7041/                     # {"status":"ok",…} — adapter le port hôte
```
Puis dans le Studio : Audio et doublage → une conférence → **Écouter 60 secondes**. Le premier travail télécharge les modèles (quelques minutes), les suivants démarrent tout de suite.

## Debug
- **« Moteur de doublage hors ligne »** : le service est arrêté ou ne joint pas la base. `docker logs --tail 50 dockpanel-git-majlistv-dubbing`.
- **Demandes et état** (conteneur PostgreSQL de l'application) :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT j.kind, j.status, j.phase, j.progress, j.attempts, left(j.error, 120) AS erreur, j.result->>'rtf' AS rtf, t.title
FROM dub_jobs j JOIN talks t ON t.id = j.talk_id ORDER BY j.created_at DESC LIMIT 20;
SELECT last_seen, version, info FROM dub_engine;
SQL
```
- **Le doublage complet ne part pas** : il attend la plage de nuit (Admin → Modules → Doublage français → « queue_mode » = `always` pour tester).
- **Échec « Téléchargement de la voix Piper »** ou **conversion qui ne se charge pas** : le VPS n'atteint pas huggingface.co ; vérifier `curl -I https://huggingface.co`.
- **Tué (`Killed`, code 137)** : mémoire insuffisante ; garder 8 Go pour ce service, ou baisser la taille des blocs (Réglages avancés).
- **Trop lent** : regarder la vitesse dans les journaux (« RTF ») ; moins d'étapes de conversion (préréglage « Rapide ») ou voix de base seule (sans voix cible).
- **Phrase « à revoir »** : la traduction est trop longue pour le créneau ; la raccourcir (relecture, étape D1b) ou augmenter l'accélération maximale.

## Tests (sans modèle de voix réel : la conversion vers ta voix ne peut être testée que sur le VPS)
```bash
python3 dubbing/tests/test_pipeline.py                         # logique audio (19 contrôles)
DUB_PY=python3.11 python3 dubbing/tests/test_service.py        # service complet avec moteurs factices (31 contrôles)
```
Prérequis du second : API locale (3055), PostgreSQL de test (5544), stockage S3 de test (5599). Variante avec le **vrai Piper** : `DUB_ENGINE=piper DUB_PIPER_MODEL=fr_FR-siwis-low MODELS_DIR=<dossier contenant piper/fr_FR-siwis-low.onnx>`.

## Banc d'essai
Le dossier `etape0/` contient le banc d'essai des étapes 0 à 0 quater (mesures du 16/10/2026). Il n'est pas utilisé par ce service.
