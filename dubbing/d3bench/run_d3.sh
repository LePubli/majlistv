#!/usr/bin/env bash
# Étape D3a : compare, pour chaque échantillon de voix, la méthode actuelle (Piper Tom + conversion ChatterboxVC)
# et Qwen3-TTS (clonage direct), sur les N premières phrases d'une conférence. Usage :
#   ./run_d3.sh <conférence> [nombre de phrases, 40 par défaut]
# Attend dans /root/dubbing-test/in/ : <conférence>.vtt (français) et <conférence>.(mp3|mp4|wav|m4a),
#   et dans /root/dubbing-test/in/voix/ : un fichier par voix (femme.wav, fille.wav, garcon.wav, homme-age.wav…), et pour chacune :
#   - VRAIE PERSONNE (autorisation obligatoire) : <voix>.consent contenant une seule ligne « AAAA-MM-JJ|Nom de la personne (ou de son représentant légal) » ;
#   - VOIX DE SYNTHÈSE (Voicebox) : pas de fichier .consent ;
#   - texte lu dans l'échantillon (facultatif, plus fidèle) : <voix>.txt ; pour les voix de synthèse, texte.txt à défaut ; sinon empreinte de voix seule.
# Écrit dans /root/dubbing-test/out/<conférence>/d3/ : un dossier par essai + comparaison.md
set -euo pipefail
TALK="${1:?Usage: ./run_d3.sh <conférence> [phrases]}"
N="${2:-40}"
QWEN_MODEL="${QWEN_MODEL:-Qwen/Qwen3-TTS-12Hz-0.6B-Base}"
# METHODS="qwen" : seulement Qwen (défaut : conversion et qwen) ; ONLY="fille-6ans femme-1" : seulement ces voix (noms de fichiers sans extension)
METHODS="${METHODS:-conversion qwen}"; ONLY="${ONLY:-}"
want() { [[ " $METHODS " == *" $1 "* ]]; }
BASE=/root/dubbing-test
AUDIO=$(ls "$BASE/in/$TALK".{mp3,mp4,wav,m4a,mkv,webm} 2>/dev/null | head -1 || true)
[ -f "$BASE/in/$TALK.vtt" ] || { echo "Manque $BASE/in/$TALK.vtt"; exit 1; }
[ -n "$AUDIO" ] || { echo "Manque l'audio $BASE/in/$TALK.(mp3|mp4|wav|m4a)"; exit 1; }
VOICES=$(ls "$BASE"/in/voix/*.{wav,mp3,m4a} 2>/dev/null || true)
[ -n "$VOICES" ] || { echo "Aucun échantillon dans $BASE/in/voix/ (femme.wav, fille.wav…)"; exit 1; }
OUT="$BASE/out/$TALK/d3"; mkdir -p "$OUT" "$BASE/models"
# Limites : 4 cœurs et 8 Go au plus, pour ne pas gêner les autres sites du serveur
RUN=(docker run --rm --cpus 4 --memory 8g -e OMP_NUM_THREADS=4 -v "$BASE/in:/in:ro" -v "$BASE/out:/out" -v "$BASE/models:/models")
for V in $VOICES; do
  NAME=$(basename "${V%.*}")
  if [ -n "$ONLY" ] && [[ " $ONLY " != *" $NAME "* ]]; then continue; fi
  # Autorisation (vraie personne) ou voix de synthèse
  CONSENT_ARGS=(--synthetic)
  if [ -f "$BASE/in/voix/$NAME.consent" ]; then
    CDATE=$(cut -d'|' -f1 "$BASE/in/voix/$NAME.consent" | tr -d ' \r\n'); CBY=$(cut -d'|' -f2- "$BASE/in/voix/$NAME.consent" | tr -d '\r\n')
    { [[ "$CDATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [ -n "$CBY" ]; } || { echo "$NAME.consent : format attendu AAAA-MM-JJ|Nom"; exit 1; }
    CONSENT_ARGS=(--consent-date "$CDATE" --consent-by "$CBY")
  fi
  # Texte lu dans l'échantillon (facultatif)
  REF_ARGS=()
  if [ -f "$BASE/in/voix/$NAME.txt" ]; then REF_ARGS=(--ref-text "/in/voix/$NAME.txt")
  elif [ "${CONSENT_ARGS[0]}" = "--synthetic" ] && [ -f "$BASE/in/voix/texte.txt" ]; then REF_ARGS=(--ref-text /in/voix/texte.txt); fi
  echo "--- $NAME : $([ "${CONSENT_ARGS[0]}" = "--synthetic" ] && echo "voix de synthèse" || echo "vraie voix, autorisation $CDATE / $CBY") ; texte de référence : ${REF_ARGS[1]:-aucun}"
  if want conversion; then
  echo "=== $NAME : Tom + conversion (méthode actuelle)"
  "${RUN[@]}" majlis-dub-test --vtt "/in/$TALK.vtt" --audio "/in/${AUDIO##*/}" --out "/out/$TALK/d3/$NAME-conversion" \
    --engine piper --piper-voice fr_FR-tom-medium --vc-voice "/in/voix/${V##*/}" --vc-steps 3 --vc-chunk 20 "${CONSENT_ARGS[@]}" --max-segments "$N" \
    > "$OUT/$NAME-conversion.log" 2>&1 || echo "    échec : voir $OUT/$NAME-conversion.log"
  fi
  if want qwen; then
  echo "=== $NAME : Qwen3-TTS (clonage direct)"
  "${RUN[@]}" majlis-dub-d3 --vtt "/in/$TALK.vtt" --audio "/in/${AUDIO##*/}" --out "/out/$TALK/d3/$NAME-qwen" \
    --engine qwen --qwen-model "$QWEN_MODEL" --voice "/in/voix/${V##*/}" "${REF_ARGS[@]}" "${CONSENT_ARGS[@]}" --max-segments "$N" \
    > "$OUT/$NAME-qwen.log" 2>&1 || echo "    échec : voir $OUT/$NAME-qwen.log"
  fi
done
docker run --rm -v "$BASE/out":/out --entrypoint python majlis-dub-d3 compare.py "/out/$TALK/d3"
echo "Fichiers à écouter : $OUT/<voix>-<méthode>/dub_mix.mp3"
