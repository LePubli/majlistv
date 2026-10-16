#!/usr/bin/env bash
# Lance un essai de doublage. Usage :
#   ./run.sh <talk> [options de bench.py]
# Attend dans /root/dubbing-test/in/ : <talk>.vtt (français), <talk>.<mp3|mp4|wav|m4a> (audio d'origine)
# Écrit dans /root/dubbing-test/out/<talk>/
set -euo pipefail
TALK="${1:?Usage: ./run.sh <talk> [options]}"; shift || true
BASE=/root/dubbing-test
AUDIO=$(ls "$BASE/in/$TALK".{mp3,mp4,wav,m4a,mkv,webm} 2>/dev/null | head -1 || true)
[ -f "$BASE/in/$TALK.vtt" ] || { echo "Manque $BASE/in/$TALK.vtt"; exit 1; }
[ -n "$AUDIO" ] || { echo "Manque l'audio $BASE/in/$TALK.(mp3|mp4|wav|m4a)"; exit 1; }
mkdir -p "$BASE/out/$TALK" "$BASE/models"
# Limites : 4 cœurs et 8 Go max pour ne pas gêner les autres sites du serveur
docker run --rm --cpus 4 --memory 8g -e OMP_NUM_THREADS=4 \
  -v "$BASE/in":/in:ro -v "$BASE/out":/out -v "$BASE/models":/models \
  majlis-dub-test \
  --vtt "/in/$TALK.vtt" --audio "/in/${AUDIO##*/}" --out "/out/$TALK" "$@"
