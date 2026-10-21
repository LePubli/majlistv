#!/usr/bin/env bash
# Étape F — essai réel « relance d'un import en échec », sans passer par le navigateur.
# À lancer sur le VPS (root). Crée une conférence de test (brouillon, invisible), demande l'import d'un fichier qui n'existe pas,
# attend l'échec, relance l'import comme le bouton « Réessayer l'import », attend le second échec, puis efface tout.
# Ce qui est testé : le vrai transcripteur (téléchargement, erreur 404 lisible, échec définitif, conférence en échec) et la relance.
# Ce qui ne l'est pas : le bouton lui-même (la relance est faite ici par SQL, comme le fait l'API ; l'API est testée à part).
set -uo pipefail
PG=${PG:-dockpanel-app-postgres-majlisstv}
URL=${URL:-https://www.w3schools.com/html/fichier-absent.mp4}
WAIT=${WAIT:-300}
q() { if [ -n "${LOCAL_PSQL:-}" ]; then $LOCAL_PSQL -qAt -v ON_ERROR_STOP=1 <<<"$1"; else docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1' <<<"$1"; fi; }
ok()   { printf '  OK     %s\n' "$*"; }
fail() { printf '  ÉCHEC  %s\n' "$*"; BAD=1; }
BAD=0; TID=""
cleanup() { [ -n "$TID" ] && q "DELETE FROM talks WHERE id = '$TID';" >/dev/null && echo "  ·      conférence de test effacée"; }
trap cleanup EXIT

ADMIN=$(q "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;")
[ -n "$ADMIN" ] || { echo "Aucun administrateur"; exit 1; }
new_import() { # $1 = conférence
  q "INSERT INTO media_imports(talk_id, requested_by, requested_by_name, source_url, origin, new_talk, object_key, rights_confirmed_at, rights_text)
     VALUES ('$1', '$ADMIN', 'Test automatique (étape F)', '$URL', 'web', true, 'talks/' || gen_random_uuid(), now(), 'v1 : essai automatique de relance') RETURNING id;"
}
wait_end() { # $1 = demande ; attend un état final
  local t=0 st
  while [ "$t" -lt "$WAIT" ]; do
    st=$(q "SELECT status FROM media_imports WHERE id = '$1';")
    case "$st" in failed|done|canceled) echo "$st"; return;; esac
    sleep 5; t=$((t + 5))
  done
  echo "timeout"
}

echo "Essai de relance d'un import en échec — $(date '+%F %T')"
TID=$(q "INSERT INTO talks(title, speaker, language, access, source, video_ref, video_status, organizer_id, rights_confirmed, publication)
         VALUES ('Test échec import (automatique)', 'Test', 'fr', 'free', 'upload', 'talks/pending', 'importing', '$ADMIN', true, 'draft') RETURNING id;")
[ -n "$TID" ] && ok "conférence de test créée (brouillon) : $TID" || { fail "création de la conférence"; exit 1; }

I1=$(new_import "$TID"); echo "  ·      1re demande : le transcripteur la prend dans les secondes qui suivent (jusqu'à ${WAIT} s s'il est occupé)…"
st=$(wait_end "$I1")
err=$(q "SELECT coalesce(error, '') FROM media_imports WHERE id = '$I1';")
[ "$st" = failed ] && ok "1re demande en échec : $err" || fail "1re demande : état « $st » (attendu : failed) ${err}"
[ "$(q "SELECT video_status FROM talks WHERE id = '$TID';")" = failed ] && ok "conférence passée en échec (message visible sur la fiche)" || fail "la conférence n'est pas en échec"

# Relance : exactement ce que fait POST /talks/:id/import pour une conférence créée par import.
q "UPDATE talks SET video_status = 'importing', video_error = NULL, video_progress = 0, video_ref = 'talks/' || gen_random_uuid() WHERE id = '$TID';" >/dev/null
I2=$(new_import "$TID")
[ -n "$I2" ] && ok "relance acceptée (nouvelle demande ; une seule demande active à la fois)" || fail "relance refusée"
[ "$(q "SELECT video_status FROM talks WHERE id = '$TID';")" = importing ] && ok "conférence de nouveau « import en cours »" || fail "conférence pas repassée en import"
st=$(wait_end "$I2"); err2=$(q "SELECT coalesce(error, '') FROM media_imports WHERE id = '$I2';")
[ "$st" = failed ] && ok "2e demande en échec, même message lisible : $err2" || fail "2e demande : état « $st »"
n=$(q "SELECT count(*) FROM media_imports WHERE talk_id = '$TID';"); [ "$n" = 2 ] && ok "journal : 2 demandes gardées pour cette conférence" || fail "journal : $n demande(s)"

[ "$BAD" = 0 ] && echo "TOUT EST OK" || { echo "Au moins un échec : copier ces lignes à Claude, avec : docker logs --tail 40 dockpanel-git-majlistv-transcriber"; exit 1; }
