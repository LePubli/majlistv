# Doublage — Étape 0 : test de voix et mesures

## Description
Banc d'essai **jetable** (rien n'est branché au site) pour répondre à trois questions avant d'écrire le vrai module de doublage :
1. **La voix française** de Chatterbox est-elle assez naturelle (accent, prononciation, ton) ?
2. **La voix clonée d'Epok** est-elle ressemblante et acceptable ?
3. **Est-ce assez rapide sur le VPS** (6 cœurs, sans carte graphique, partagé avec Miel & Co et TriMaint) ?

Le script prend les sous-titres **français** d'une conférence et son audio d'origine, fabrique la voix française, cale chaque phrase dans son créneau (accélération maximale ×1,35), mixe avec l'original baissé à 15 %, et écrit un rapport chiffré.

Règles de sécurité intégrées :
- une phrase dont le texte **commence par `#`** n'est **jamais synthétisée** (verset, hadith, invocation) : l'original reste à plein volume ;
- cloner une voix **exige** `--consent-date AAAA-MM-JJ` et `--consent-by "Nom"` ; ils sont inscrits dans le rapport.

## Honnêteté sur ce qui est testé
- **Testé** : lecture des sous-titres, calage, mixage, protection des phrases `#`, garde-fous du consentement, rapport (`python3 test_pipeline.py` avec un faux moteur, 15 contrôles).
- **NON testé** : le vrai modèle Chatterbox (téléchargement impossible depuis mon environnement), donc **aucune vitesse ni qualité n'est connue**. Les seuils du verdict (vitesse ≤ 3 × le temps réel, ≤ 20 % de phrases qui débordent, ≤ 6 Go de mémoire) sont des **propositions**, à valider ensemble après ton écoute.

## Prérequis
- Accès SSH root au VPS, Docker installé (déjà le cas avec DockPanel), ~8 Go de disque libres (image ≈ 3 Go + modèle ≈ 3 Go).
- Accès Internet du VPS vers huggingface.co (téléchargement du modèle au premier lancement).
- Ne lance pas l'essai pendant un pic de trafic : il est limité à 4 cœurs / 8 Go, mais il ralentira un peu les autres sites.

## Ce que tu dois me fournir (fichiers de test)
1. **Échantillon de ta voix** : 10 à 30 secondes, une seule voix, sans musique ni écho, calme. Format mp3 ou wav. Enregistre-le avec ton téléphone dans une pièce silencieuse. Note la **date** : c'est la date de consentement.
2. **3 conférences courtes** (5 à 10 minutes chacune suffisent) : une en **arabe**, une en **turc**, une en **anglais**, avec pour chacune : l'**audio d'origine** (mp3/mp4) et les **sous-titres français**.
3. Dans l'une d'elles, ajoute `# ` au début d'une phrase (par exemple une récitation) pour vérifier qu'elle est bien gardée en voix d'origine.

## Installation (étape par étape, sur le VPS)
```bash
# 1. Récupérer le code (le dépôt est déjà sur GitHub)
mkdir -p /root/dubbing-test/in /root/dubbing-test/out /root/dubbing-test/models
cd /root/dubbing-test
git clone --depth 1 https://github.com/LePubli/majlistv.git src || (cd src && git pull)

# 2. Construire l'image (5 à 10 minutes la première fois)
docker build -t majlis-dub-test src/dubbing/etape0

# 3. Vérifier la chaîne sans modèle (15 contrôles, 20 secondes)
docker run --rm --entrypoint python majlis-dub-test test_pipeline.py
```
Si le dépôt est privé, `git clone` demandera un identifiant : dans ce cas, envoie-moi plutôt les fichiers par WinSCP dans `/root/dubbing-test/src/dubbing/etape0/`.

## Préparer les fichiers d'une conférence
**Audio d'origine** : copie-le avec WinSCP (ou `scp`) dans `/root/dubbing-test/in/` en le nommant `arabe1.mp3` (ou `.mp4`, `.wav`, `.m4a`).

**Sous-titres français** : les récupérer depuis la base du site (si la conférence a une transcription ou une traduction en français) :
```bash
# nom du conteneur PostgreSQL
docker ps --format '{{.Names}}' | grep -i postgres
# repérer l'identifiant (UUID) de la conférence : Studio → Contenus → ouvrir la conférence, il est dans l'adresse (…/studio/<UUID>)
# puis, en remplaçant NOM_CONTENEUR et UUID_CONFERENCE :
sed "s/IDENTIFIANT/UUID_CONFERENCE/; s/'zz'/'fr'/" /root/dubbing-test/src/dubbing/etape0/export_vtt.sql \
 | docker exec -i NOM_CONTENEUR sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -q' > /root/dubbing-test/in/arabe1.vtt
head -12 /root/dubbing-test/in/arabe1.vtt
```
Le fichier doit commencer par `WEBVTT` suivi de blocs `00:00:01.000 --> 00:00:03.500` puis le texte. S'il est vide, cette conférence n'a pas de texte français : traduis-la d'abord (Studio → Sous-titres).

## Lancement
```bash
cd /root/dubbing-test/src/dubbing/etape0

# Essai 1 : voix par défaut du modèle (aucun clonage, aucun consentement requis), 10 premières phrases
./run.sh arabe1 --max-segments 10

# Essai 2 : ta voix clonée (échantillon posé dans /root/dubbing-test/in/epok.wav)
./run.sh arabe1 --voice /in/epok.wav --consent-date 2026-10-16 --consent-by "Epok" --max-segments 10

# Essai complet (toute la conférence) une fois les essais courts concluants
./run.sh arabe1 --voice /in/epok.wav --consent-date 2026-10-16 --consent-by "Epok"
```
Le premier lancement télécharge le modèle (quelques minutes). Remplace `2026-10-16` par la vraie date du consentement.

Résultats dans `/root/dubbing-test/out/arabe1/` : `dub_mix.mp3` (**à écouter**), `voice_only.wav` (voix seule), `report.md` (chiffres), `report.json`.
Récupère-les avec WinSCP, ou affiche le rapport : `cat /root/dubbing-test/out/arabe1/report.md`.

### Options utiles
| Option | Rôle | Défaut |
|---|---|---|
| `--max-segments N` | ne traite que les N premières phrases | toutes |
| `--duck 0.15` | volume de l'original sous la voix | 0,15 |
| `--max-speedup 1.35` | accélération maximale d'une phrase | 1,35 |
| `--device cpu` | processeur | cpu |
| `--engine fake` | faux moteur (test de la chaîne) | chatterbox |

## Comment lire le rapport
- **RTF** = temps de calcul ÷ durée de voix produite. RTF 2 : 1 minute de voix demande 2 minutes de calcul. Une conférence d'1 h avec RTF 2 ≈ 2 h de calcul (acceptable de nuit, une seule à la fois).
- **Accélération** : de combien il a fallu accélérer la voix pour tenir dans le créneau. Au-dessus de ×1,25 en moyenne, le débit paraît pressé.
- **Débordements** : phrases qui dépassent encore leur créneau même accélérées au maximum.
- **Mémoire max** : à comparer à ce qui reste libre sur le VPS (`free -h`).

## Debug
- `ERREUR : un clonage de voix exige --consent-date…` : normal, ajoute les deux options.
- `Manque /root/dubbing-test/in/…` : vérifie les noms de fichiers (même nom pour le `.vtt` et l'audio).
- `aucune phrase trouvée dans le .vtt` : le fichier est vide ou mal formé (voir « Préparer les fichiers »).
- Tué / `Killed` : manque de mémoire ; relance avec `--max-segments 5`, ou arrête temporairement un service lourd.
- Téléchargement du modèle bloqué : `docker run --rm majlis-dub-test --help` doit répondre ; teste `curl -I https://huggingface.co` depuis le VPS.
- Voix qui ne ressemble pas : échantillon trop court, bruité ou avec plusieurs voix. Refais-le.
- Nettoyer : `rm -rf /root/dubbing-test/out/*` ; supprimer l'essai entier : `docker rmi majlis-dub-test && rm -rf /root/dubbing-test`.

## Déploiement
Aucun. Ce banc n'est **pas** un service du site : il ne passe pas par DockPanel et n'ouvre aucun port. Le vrai service (`dubbing/`, Git Deploy DockPanel, port hors 7000/7001/7010) ne sera créé qu'à l'étape suivante, après ta décision.

## Décision après l'étape 0
Sur la base de ton écoute et du rapport, on tranche : **(A)** Chatterbox convient → étape S1 ; **(B)** qualité insuffisante en arabe/turc → autre moteur auto-hébergé ou doublage limité au français/anglais ; **(C)** trop lent sur CPU → une conférence à la fois la nuit, ou voix de base plus rapide. Je ne choisis rien sans ton accord.
