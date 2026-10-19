# Doublage — Étape D3a : banc d'essai des nouvelles voix (femme, enfants, autres hommes)

## Description
Banc d'essai **jetable**, comme l'étape 0 : rien n'est branché au site. Il répond à trois questions avant d'ajouter des voix au doublage :
1. **Quelle méthode sonne le mieux** pour une voix de femme, de fille, de garçon ou d'un autre homme ?
   - **A. Méthode actuelle** : voix Tom (Piper) puis **conversion** ChatterboxVC vers l'échantillon (comme votre voix aujourd'hui) ;
   - **B. Qwen3-TTS** (licence Apache 2.0) : **clonage direct** de l'échantillon, sans passer par Tom.
2. **Combien de temps** pour une conférence d'une heure, sur le processeur du VPS (4 cœurs, 8 Go au plus) ?
3. **Combien de mémoire** ?

Les **échantillons de voix** (20 à 30 s chacun) sont fabriqués par vous avec **Voicebox** sur votre PC : ce sont des voix **de synthèse**, créées par une description, sans personne réelle derrière (l'option `--synthetic` du banc l'indique dans le rapport ; aucun consentement à fournir).

## Honnêteté sur ce qui est testé
- **Testé** (`test_d3.py`, faux Qwen) : le moteur « qwen » du banc (échantillon obligatoire, texte de référence, français, phrases `#` jamais lues, rééchantillonnage), l'option `--synthetic`, le refus d'une vraie voix sans consentement, le tableau de comparaison. Le code a été vérifié contre la vraie bibliothèque `qwen-tts` 0.1.1 (signatures des fonctions).
- **NON testé** : le vrai modèle Qwen3-TTS (téléchargement impossible depuis mon environnement), donc **aucune qualité ni vitesse n'est connue**. Les chiffres publiés (environ 2,5 à 3 s de calcul par seconde de voix sur 4 cœurs) restent à vérifier sur le VPS. L'image Docker n'a pas été construite chez moi. Voicebox n'a pas été essayé par moi.

## Prérequis
- Le banc de l'étape 0 sur le VPS (`/root/dubbing-test`, image `majlis-dub-test`), et une conférence de test (par exemple `arabe1` : `in/arabe1.mp3` + `in/arabe1.vtt`). S'ils n'existent plus, suivre « Installation » et « Préparer les fichiers d'une conférence » dans `dubbing/etape0/README.md`.
- ~6 Go de disque libres (image Qwen ≈ 3 Go, modèle 0.6B ≈ 2,5 Go au premier lancement).
- Accès du VPS à huggingface.co (téléchargement du modèle).
- Sur votre PC : **Voicebox** (gratuit, licence MIT) — https://voicebox.sh (installateur Windows .msi). Sans carte graphique, la création d'une voix est lente (plusieurs minutes) et le modèle de création de voix (Qwen VoiceDesign 1.7B) demande beaucoup de mémoire (16 Go au moins).

## 1. Fabriquer les échantillons avec Voicebox (sur votre PC)
Pour chaque voix : créer une voix par description (**Voice Design** / Qwen VoiceDesign), puis lui faire lire **le texte de référence** ci-dessous, et enregistrer le résultat en **WAV** (ou MP3). Les descriptions marchent mieux **en anglais** (le modèle est plus précis en anglais) ; le texte lu, lui, est en **français**.

| Fichier à produire | Description à coller (anglais) | En français |
|---|---|---|
| `femme.wav` | A warm, calm French woman in her thirties, clear and gentle voice, measured pace, like a documentary narrator. | Femme d'une trentaine d'années, voix chaude, calme et claire, débit posé. |
| `fille.wav` | A cheerful French girl about nine years old, bright and clear voice, natural, not exaggerated, moderate pace. | Fillette d'environ 9 ans, voix claire et joyeuse, naturelle. |
| `garcon.wav` | A curious French boy about ten years old, clear and lively voice, natural and friendly, moderate pace. | Garçon d'environ 10 ans, voix vive et claire, naturelle. |
| `homme-age.wav` | A wise French man in his sixties, deep, warm and slightly raspy voice, slow and calm, like a respected teacher. | Homme d'une soixantaine d'années, voix grave et chaude, lente et calme. |
| `homme-jeune.wav` | A young French man in his twenties, clear and calm voice, friendly, moderate pace. | Jeune homme d'une vingtaine d'années, voix claire et calme. |

**Texte de référence à faire lire** (identique pour toutes les voix ; fichier `texte-reference.txt`) :
> Bonjour et bienvenue. Aujourd'hui, nous allons parler de la patience, de la gratitude et de la confiance. Chacun traverse des épreuves : un examen difficile, une maladie, une séparation. Pourtant, le cœur apaisé trouve toujours une lumière. Prenons le temps d'écouter, de réfléchir, puis d'agir avec douceur.

Conseils :
- Une voix créée par description **change un peu à chaque génération** : quand une version vous plaît, **gardez ce fichier**, c'est lui qui fixe la voix.
- Pas d'exemple publié de voix d'enfant avec ce modèle : si la voix de fille ou de garçon sonne faux, essayez « about twelve years old », ou dites-le-moi.
- Si Voicebox n'arrive pas à enregistrer en WAV, un MP3 convient aussi.
- Ne pas mettre de musique ni d'écho ; 20 à 30 s suffisent (le texte de référence en fait environ 25).

## 2. Préparer le VPS
```bash
# Mettre à jour le code et reconstruire les deux images (10 à 15 minutes la première fois)
cd /root/dubbing-test
(cd src && git pull)
docker build -t majlis-dub-test src/dubbing/etape0
docker build -t majlis-dub-d3 -f src/dubbing/d3bench/Dockerfile src/dubbing

# Vérifier la chaîne sans modèle (17 contrôles, quelques secondes)
docker run --rm --entrypoint python majlis-dub-d3 test_d3.py

# Dossier des échantillons + texte de référence
mkdir -p /root/dubbing-test/in/voix
cp src/dubbing/d3bench/texte-reference.txt /root/dubbing-test/in/voix/texte.txt
```
Puis copier vos fichiers (`femme.wav`, `fille.wav`, `garcon.wav`, `homme-age.wav`, `homme-jeune.wav`) dans `/root/dubbing-test/in/voix/` avec WinSCP.

## 3. Lancer l'essai (de préférence le soir)
```bash
cd /root/dubbing-test
src/dubbing/d3bench/run_d3.sh arabe1 40
```
- `arabe1` : la conférence de test (fichiers `in/arabe1.mp3` et `in/arabe1.vtt`) ; `40` : nombre de phrases (≈ 3 à 4 minutes de voix).
- Pour chaque voix, deux essais : `<voix>-conversion` (méthode actuelle) et `<voix>-qwen` (Qwen3-TTS).
- Durée estimée : 15 à 25 minutes par voix (chiffres publiés, à vérifier), plus le téléchargement du modèle Qwen la première fois.
- Pour essayer aussi le grand modèle Qwen (plus lent, peut-être meilleur) :
```bash
QWEN_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-Base src/dubbing/d3bench/run_d3.sh arabe1 40
```
  (il écrit dans les mêmes dossiers : renommer d'abord `out/arabe1/d3` en `out/arabe1/d3-petit` pour garder le premier essai).

## 4. Résultats et écoute
```bash
cat /root/dubbing-test/out/arabe1/d3/comparaison.md
ls /root/dubbing-test/out/arabe1/d3/*/dub_mix.mp3
```
Récupérer les `dub_mix.mp3` avec WinSCP et les écouter. Pour chaque voix et chaque méthode, notez de 1 à 5 : **naturel**, **ressemblance avec l'échantillon**, **prononciation du français**, **absence de bruits ou de coupures**. Envoyez-moi `comparaison.md` et vos notes : on choisit alors la méthode à intégrer au service de doublage (étape D3b).

## Debug
- Un essai a échoué : lire le journal, par exemple
```bash
tail -40 /root/dubbing-test/out/arabe1/d3/femme-qwen.log
```
- `Manque /root/dubbing-test/in/voix/texte.txt` : refaire la commande `cp` de la partie 2.
- `Unsupported languages` : copier le message complet et me l'envoyer (nom de langue attendu par le modèle).
- Mémoire insuffisante (`Killed`, code 137) : le grand modèle 1.7B ne tient pas dans 8 Go ; rester sur le 0.6B.
- Téléchargement du modèle impossible : vérifier l'accès à huggingface.co depuis le VPS (`curl -I https://huggingface.co`).
- Le site n'est pas concerné : on peut tout supprimer avec `rm -rf /root/dubbing-test/out/arabe1/d3` et `docker rmi majlis-dub-d3`.

## Exemples
```bash
# Une seule voix, à la main, méthode Qwen, 20 phrases :
docker run --rm --cpus 4 --memory 8g -v /root/dubbing-test/in:/in:ro -v /root/dubbing-test/out:/out -v /root/dubbing-test/models:/models \
  majlis-dub-d3 --vtt /in/arabe1.vtt --audio /in/arabe1.mp3 --out /out/arabe1/d3/femme-qwen \
  --engine qwen --voice /in/voix/femme.wav --ref-text /in/voix/texte.txt --synthetic --max-segments 20
# Refaire seulement le tableau :
docker run --rm -v /root/dubbing-test/out:/out --entrypoint python majlis-dub-d3 compare.py /out/arabe1/d3
```
