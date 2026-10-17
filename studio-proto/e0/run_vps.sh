#!/bin/sh
# Étape E0 — mesure du prototype de rendu SUR LE VPS, dans l'image du worker (FFmpeg + Node déjà installés), limitée à 4 cœurs / 6 Go.
# Rien n'est installé ni modifié sur le serveur : un conteneur jetable lit ce dossier et écrit dans ./out.
# Usage (dans le dossier décompressé) :
#   sh run_vps.sh                    → médias d'essai synthétiques (3 min en 1080p)
#   sh run_vps.sh /chemin/video.mp4  → une vraie vidéo d'au moins 2 min 45 (elle remplace media/source.mp4)
set -e
cd "$(dirname "$0")"
IMG=$(docker inspect --format '{{.Config.Image}}' dockpanel-git-majlistv-worker 2>/dev/null || true)
[ -n "$IMG" ] || { echo "Conteneur dockpanel-git-majlistv-worker introuvable : vérifie son nom avec « docker ps | grep worker »"; exit 1; }
echo "Image utilisée : $IMG"
RUN="docker run --rm --cpus 4 --memory 6g --user root -v $(pwd):/e0 -w /e0 --entrypoint sh $IMG -c"
$RUN 'for f in ass xfade sidechaincompress loudnorm; do ffmpeg -hide_banner -filters 2>/dev/null | grep -q " $f " && echo "FFmpeg : filtre $f présent" || echo "ATTENTION : filtre $f absent de FFmpeg"; done'
[ -f media/source.mp4 ] || $RUN "sh make_media.sh media"
if [ -n "$1" ]; then cp "$1" media/source.mp4; echo "Vraie vidéo copiée dans media/source.mp4"; fi
$RUN "node render.mjs timeline.json --media media --out out/montage-preview.mp4 --preview --threads 4"
$RUN "node render.mjs timeline.json --media media --out out/montage.mp4 --threads 4"
echo "=== Résultats ==="
$RUN "cat out/report-preview.json out/report.json" | grep -E '"(cpus|threads|preview|width|durationS|renderS|rtf|sizeMB)"'
echo "Montages : $(pwd)/out/montage-preview.mp4 et $(pwd)/out/montage.mp4"
