# Étape E0 — prototype jetable du moteur de rendu

**Ce dossier n'est pas déployé.** Il ne sert qu'à mesurer et à décider avant l'éditeur (étapes E1 à E5). Aucun service, aucune route, aucune table : rien n'est branché au site.

## Description
`render.mjs` lit un montage décrit en JSON (`timeline.json`) et le transforme en **une seule commande FFmpeg**. Il gère :
- le générique d'ouverture et de fin ;
- les extraits coupés et les fondus enchaînés ;
- le logo, les bandeaux de titre, et les sous-titres incrustés **recalés après les coupes** (carte du temps) ;
- les pistes audio ajoutées (voix française, musique avec boucle et fondus) ;
- le **ducking** : la voix d'origine et la musique baissent quand la voix française parle ;
- le volume normalisé (EBU R128), le H.264 et l'AAC ;
- un **aperçu 640x360** rapide.

Les textes passent par libass, donc **l'arabe s'affiche correctement, de droite à gauche**. Polices : DejaVu Sans (licence libre, `licenses/LICENSE-DejaVu.txt`).

## Prérequis
- Node 22 et FFmpeg avec libass, libx264, ainsi que les filtres xfade, sidechaincompress et loudnorm.
- **Sur le VPS**, l'image du worker les contient déjà. Le script `run_vps.sh` l'utilise dans un conteneur jetable limité à 4 cœurs et 6 Go.

## Installation et lancement sur le VPS
1. Depuis PowerShell sur ton PC, copie le zip sur le serveur (remplace `IP_DU_VPS`) :
```powershell
scp "$env:USERPROFILE\Downloads\majlistv-etape-E0.zip" root@IP_DU_VPS:/root/
```
2. Sur le VPS :
```bash
cd /root && rm -rf e0 && python3 -m zipfile -e majlistv-etape-E0.zip e0 && cd e0/studio-proto/e0
sh run_vps.sh
```
Pour tester avec une **vraie conférence** d'au moins 2 min 45 (par exemple celle de l'étape 0), indique son chemin :
```bash
sh run_vps.sh /root/arab1.mp4
```
Le script affiche la vitesse (`rtf` = secondes de calcul par seconde de vidéo) de l'aperçu et du rendu 1080p. Les vidéos produites sont dans `out/`.

## Lancement local (développement)
```bash
sh make_media.sh media
node render.mjs timeline.json --media media --preview --threads 4
node render.mjs timeline.json --media media --threads 4
node render.mjs timeline.json --media media --dry      # affiche la commande FFmpeg sans rien calculer
```

## Format de `timeline.json` (version 1, provisoire)
- `output` : largeur, hauteur, images par seconde.
- `intro` / `outro` : durée, titre, sous-titre, fondu.
- `clips[]` : `src`, `in`, `out` (en secondes dans la source), `transition` (`fade`, plus d'autres effets xfade de FFmpeg).
- `overlays[]` :
  - `logo` : `src`, `position`, `size`, `opacity`, `from`, `to` ;
  - `banner` : `text`, `subtitle`, `start`, `end` (temps du montage).
- `audio` : `original.gain`, `tracks[]` (`src`, `start`, `gain`, `loop`, `fadeIn`, `fadeOut`, `duck`), `ducking`, `loudnessLufs`.
- `subtitles` : `src` (VTT, temps de la source), `burn`.

## Debug
- **« filtre … absent de FFmpeg »** : l'image du worker n'a pas ce filtre. Note-le dans ton retour, il faudra un autre paquet FFmpeg.
- **« Killed » ou code 137** : mémoire insuffisante ; baisse `--threads`. Le prototype ouvre déjà une entrée par extrait pour éviter de garder des images en mémoire.
- **Texte en carrés** : la police n'a pas les caractères ; le dossier `fonts/` doit être à côté de `render.mjs`.

## Exemples de résultat (mesurés le 17/10/2026, 2 cœurs, médias synthétiques)
- Aperçu 640x360 : 118,4 s de montage calculées en **35 s** (RTF 0,29).
- Rendu 1080p (preset medium, CRF 20) : **135 s** (RTF 1,14), 78 Mo.
- Ducking : la voix d'origine baisse d'environ **15 dB** quand la voix française parle.
- Sous-titres : sur 6, 5 sont recalés et 1 est retiré, car il tombait dans un passage coupé.
