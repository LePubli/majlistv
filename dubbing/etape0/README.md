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


---

# Étape 0 bis — moteurs légers et réglages de vitesse

## Pourquoi
Premier essai (16/10/2026, VPS, 4 cœurs, conférence `arabe1`, 10 phrases) : la voix Chatterbox clonée est **ressemblante**, mais le calcul est **trop lent** : environ 34 secondes de calcul par seconde de voix (RTF médian 34), pic de mémoire 6,95 Go. Une conférence d'1 h demanderait plus d'une journée de calcul. L'étape 0 bis cherche une solution plus rapide.

## Ce qui est ajouté
| Essai | Idée | Clonage de ta voix |
|---|---|---|
| **A. Chatterbox réglé** | `--cfg-weight 0` (une seule passe de calcul au lieu de deux) et `--threads 4` (le conteneur voyait 6 cœurs pour 4 autorisés : le calcul se bousculait) | oui |
| **B. Piper** | voix française légère (ONNX), très rapide | non (voix prédéfinie) |
| **C. Kokoro** | voix française légère (82 M de paramètres, licence Apache 2.0) | non (voix prédéfinie) |
| **D. Voix légère + conversion vers ta voix** | on génère le français avec Piper ou Kokoro, puis `--vc-voice` donne ta voix par-dessus (conversion de voix de Chatterbox, qui ne génère pas mot à mot) | oui, qualité à écouter |

Les phrases qui commencent par `#` restent protégées. Toute conversion ou tout clonage vers ta voix exige `--consent-date` et `--consent-by`.

## Honnêteté sur ce qui est testé
- **Testé** : branchement des moteurs, conversion, garde-fous, rapport (27 contrôles avec de faux moteurs) ; la ligne de commande de Piper existe bien avec les options utilisées ; la résolution des paquets (Chatterbox + Kokoro + Piper dans la même image, Python 3.11).
- **NON testé** : le fonctionnement réel de Kokoro, de Piper avec une voix française et de la conversion de voix sur ce serveur ; leur vitesse, leur qualité et leur mémoire sont **inconnues**. Les licences des voix Piper varient d'une voix à l'autre : à vérifier avant tout usage commercial (Piper lui-même est sous GPL-3, ce qui n'empêche pas de l'utiliser en interne ; ses voix ont chacune leur licence).

## Mise à jour (VPS)
Les nouveaux moteurs sont dans l'image Docker : il faut la reconstruire (5 à 10 minutes ; le modèle déjà téléchargé est conservé).
```bash
cd /root/dubbing-test/src && git pull
docker build -t majlis-dub-test dubbing/etape0
docker run --rm --entrypoint python majlis-dub-test test_pipeline.py | tail -3
```
Résultat attendu : « 0 échec(s) ».

## Les essais (même conférence `arab1`, mêmes 10 phrases)
```bash
cd /root/dubbing-test/src/dubbing/etape0
mkdir -p /root/dubbing-test/out
# garder le premier essai de côté
mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_0 2>/dev/null || true

# A. Chatterbox réglé (même voix qu'avant, peut-être 2 fois plus rapide)
./run.sh arab1 --voice /in/epok.wav --consent-date 2026-10-16 --consent-by "Epok" --cfg-weight 0 --max-segments 10
mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_A

# B. Piper (voix française prédéfinie)
./run.sh arab1 --engine piper --max-segments 10
mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_B

# C. Kokoro
./run.sh arab1 --engine kokoro --max-segments 10
mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_C

# D. Kokoro puis ta voix
./run.sh arab1 --engine kokoro --vc-voice /in/epok.wav --consent-date 2026-10-16 --consent-by "Epok" --max-segments 10
mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_D

# Résumé des quatre
grep -H -E "Vitesse|Phrases qui débordent|Mémoire|conversion" /root/dubbing-test/out/arab1_*/report.md
```
Chaque essai affiche son rapport à la fin. Le premier lancement de B et de C télécharge leur voix (quelques dizaines de Mo). Un essai à la fois, ne les enchaîne pas en parallèle. Pour changer de voix : `--piper-voice` (liste : `docker run --rm --entrypoint python majlis-dub-test -m piper.download_voices | grep fr_FR`) ou `--kokoro-voice`.

Écoute ensuite les quatre `dub_mix.mp3` (dans `arab1_A` à `arab1_D`) et compare : naturel du français, ressemblance à ta voix, vitesse.

## Debug (en plus de l'étape 0)
- `Téléchargement de la voix Piper impossible` : le VPS n'atteint pas huggingface.co, ou le nom de la voix est faux (voir la liste ci-dessus).
- Erreur sur `espeak` avec Kokoro : l'image n'a pas été reconstruite (étape « Mise à jour »).
- `--voice s'utilise avec chatterbox` : avec Piper et Kokoro, la voix cible se donne avec `--vc-voice`.
- Mémoire insuffisante (`Killed`) : relance avec `--max-segments 5`.

## Lecture des résultats (seuils proposés, inchangés)
Vitesse (RTF) ≤ 3 pour un doublage de nuit raisonnable ; idéalement ≤ 1. En dessous de 1, une conférence d'1 h se double en moins d'1 h.

---

# Étape 0 ter — accélérer la conversion vers la voix d'Epok

Résultat de l'écoute (16/10/2026) : l'essai D (Kokoro puis voix d'Epok) est **retenu** ; Piper et Kokoro seuls sonnent comme des voix féminines trop « IA ». D mesure RTF 8,5 (≈ 8 h 30 de calcul pour 1 h de conférence), dont l'essentiel (≈ 19 s par phrase) est la conversion de voix. Option ajoutée : `--vc-steps N` (nombre d'étapes de génération de la conversion ; défaut du modèle : 10). Moins d'étapes = plus rapide, mais la qualité peut baisser : à écouter.

```bash
cd /root/dubbing-test/src && git pull
docker build -t majlis-dub-test dubbing/etape0
cd dubbing/etape0
for n in 5 3; do
  ./run.sh arab1 --engine kokoro --vc-voice /in/epok.wav --consent-date 2026-10-16 --consent-by "Epok" --vc-steps $n --max-segments 10
  mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_D$n
done
grep -H -E "Vitesse|conversion|Mémoire" /root/dubbing-test/out/arab1_D*/report.md
mkdir -p /root/dubbing-test/out/ecoute
for n in 5 3; do cp /root/dubbing-test/out/arab1_D$n/dub_mix.mp3 /root/dubbing-test/out/ecoute/essai_D$n.mp3; done
```
Non testé sur le vrai modèle : seulement l'acheminement de l'option (28 contrôles avec faux moteurs).

## Voix masculines libres de Piper (à écouter)
Voix françaises de Piper (fr_FR) : `tom` (medium), `gilles` (low), `upmc` (medium, 2 locuteurs : `--piper-speaker 0` puis `1`), `mls_1840` (low), `mls`, `siwis` (féminine, déjà testée). Les fiches des modèles ne donnent pas le genre : il se vérifie à l'écoute. Licences relevées sur les fiches : tom AGPL-3.0 ; gilles CC0 ; upmc CC BY-SA 4.0 ; mls_1840 CC BY 4.0 (à valider avant usage commercial).
```bash
cd /root/dubbing-test/src && git pull && docker build -t majlis-dub-test dubbing/etape0
cd dubbing/etape0 && mkdir -p /root/dubbing-test/out/ecoute
for v in fr_FR-tom-medium fr_FR-gilles-low fr_FR-mls_1840-low; do
  ./run.sh arab1 --engine piper --piper-voice $v --max-segments 6 >/dev/null 2>&1
  cp /root/dubbing-test/out/arab1/dub_mix.mp3 /root/dubbing-test/out/ecoute/piper_$v.mp3
done
for s in 0 1; do
  ./run.sh arab1 --engine piper --piper-voice fr_FR-upmc-medium --piper-speaker $s --max-segments 6 >/dev/null 2>&1
  cp /root/dubbing-test/out/arab1/dub_mix.mp3 /root/dubbing-test/out/ecoute/piper_upmc_locuteur$s.mp3
done
ls -la /root/dubbing-test/out/ecoute
```

---

# Étape 0 quater — conversion de voix par blocs

## Constat (mesures du 16/10/2026, voix de Tom puis voix d'Epok, 6 phrases)
| Étapes de conversion | Conversion par phrase | RTF global |
|---|---|---|
| 10 (défaut) | 17,5 s | 11,4 |
| 5 | 9,3 s | 7,1 |

Piper (Tom) tient dans les créneaux : 0 % de débordement, contre 30 % avec Kokoro. Les durées de conversion mesurées sont presque les mêmes pour une phrase de 1,2 s et de 2,2 s : **chaque appel semble avoir un coût fixe élevé** (la voix de référence est retraitée à chaque appel), et la durée de la phrase pèse peu. C'est une **hypothèse tirée de 6 mesures**, pas une certitude.

## Option `--vc-chunk N`
Au lieu d'un appel par phrase, regroupe les phrases voisines en blocs d'au plus N secondes (max 25) et convertit chaque bloc en un seul appel. La durée est conservée, les phrases restent à leur place. Le rapport donne le **RTF global** (voix de base + conversion).

```bash
cd /root/dubbing-test/src && git pull && docker build -t majlis-dub-test dubbing/etape0
cd dubbing/etape0 && mkdir -p /root/dubbing-test/out/ecoute
for n in 5 10; do
  ./run.sh arab1 --engine piper --piper-voice fr_FR-tom-medium --vc-voice /in/epok.wav --consent-date 2026-10-16 --consent-by "Epok" --vc-steps $n --vc-chunk 20 --max-segments 30
  cp /root/dubbing-test/out/arab1/dub_mix.mp3 /root/dubbing-test/out/ecoute/tom_blocs_${n}etapes.mp3
  mv /root/dubbing-test/out/arab1 /root/dubbing-test/out/arab1_F$n
done
grep -H -E "RTF global|Mémoire|débordent" /root/dubbing-test/out/arab1_F*/report.md
```
Si le RTF global tombe nettement sous 7, l'hypothèse est confirmée. Si la qualité change entre phrases courtes et blocs, c'est à l'écoute qu'on le verra.
