#!/usr/bin/env bash
# restore-test.sh — test de restauration RÉEL (étapes 8 et 37).
#   1. récupère le dernier dump de Mejliss TV depuis le dépôt distant (chiffré), le charge dans une base PostgreSQL jetable
#      (sans réseau, en mémoire), le compare avec la base en production ;
#   2. vérifie que les VIDÉOS sont bien dans la dernière sauvegarde (instantané des métadonnées Garage restaurable + blocs présents) ;
#   3. mesure la taille du dépôt hors VPS ;
#   4. écrit l'état dans /var/lib/backup-vps/restore-status et envoie un rapport au site (Admin → Santé du serveur).
# Ne modifie aucune donnée de production : seule la lecture est utilisée sur le conteneur réel. Lancé chaque lundi par cron (/etc/cron.d/backup-vps).
set -uo pipefail
export HOME=/root
. /root/.config/backup/env
HERE=$(dirname "$0")
# shellcheck disable=SC1091
[ -r "$HERE/report-lib.sh" ] && . "$HERE/report-lib.sh" || report_api() { :; }
STATE=/var/lib/backup-vps; mkdir -p "$STATE"
LIVE=dockpanel-app-postgres-majlisstv
LABEL=majlisstv
GARAGE_DIR=/var/lib/dockpanel/git-data/majlistv-storage/var/lib/garage
START=$(date +%s)
WORK=$(mktemp -d /var/tmp/restore-test.XXXXXX)
TEST=restore-test-$$
cleanup() { docker rm -f "$TEST" >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT

# Échec : message, état local, rapport au site, code de sortie 1.
die() {
  echo "ECHEC : $*"
  echo "echec $(date -Is) : $*" > "$STATE/restore-status"
  report_api restore_test false "$*" "{\"durationSec\":$(( $(date +%s) - START ))}"
  exit 1
}

U=$(docker exec "$LIVE" printenv POSTGRES_USER 2>/dev/null); U=${U:-postgres}
D=$(docker exec "$LIVE" printenv POSTGRES_DB 2>/dev/null);   D=${D:-$U}
IMG=$(docker inspect --format '{{.Config.Image}}' "$LIVE" 2>/dev/null) || die "conteneur $LIVE introuvable"

echo "1/5 Récupération du dernier dump depuis l'hébergement (déchiffrement local)..."
restic restore latest --tag vps-nightly --target "$WORK" --include "/var/backups/vps-dumps" >/dev/null 2>"$WORK/restic.err" || die "restic restore impossible ($(head -c 200 "$WORK/restic.err" | tr '\n' ' '))"
F=$(ls -1t "$WORK"/var/backups/vps-dumps/${LABEL}_*.sql.gz 2>/dev/null | head -1)
[ -n "$F" ] || die "aucun dump $LABEL dans la dernière sauvegarde"
echo "    dump restauré : $(basename "$F") ($(du -h "$F" | cut -f1))"
# Un dump de plus de 36 h signifie que la sauvegarde nocturne ne tourne plus correctement (la date du fichier restauré est celle du dump).
AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$F") ) / 3600 ))
echo "    dump vieux de ${AGE_H} h"
[ "$AGE_H" -le 36 ] || die "le dernier dump a ${AGE_H} h (attendu : moins de 36 h)"

echo "2/5 Démarrage d'une base jetable ($IMG, sans réseau)..."
docker run -d --rm --name "$TEST" --network none --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER="$U" -e POSTGRES_DB="$D" -e POSTGRES_PASSWORD=restore-test "$IMG" >/dev/null || die "démarrage de la base jetable"
for _ in $(seq 1 60); do docker exec "$TEST" pg_isready -U "$U" -d "$D" >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "3/5 Restauration du dump..."
gunzip -c "$F" | docker exec -i "$TEST" psql -U "$U" -d "$D" -v ON_ERROR_STOP=1 -q >/dev/null 2>"$WORK/err.log" || die "restauration du dump ($(head -c 200 "$WORK/err.log" | tr '\n' ' '))"

echo "4/5 Comparaison avec la base en production :"
q() { docker exec "$1" psql -U "$U" -d "$D" -Atc "$2" 2>/dev/null; }
rc=0
declare -A RES PROD
for T in talks users series; do
  RES[$T]=$(q "$TEST" "select count(*) from $T"); PROD[$T]=$(q "$LIVE" "select count(*) from $T")
  printf "    %-8s sauvegarde=%-6s production=%s\n" "$T" "${RES[$T]:-?}" "${PROD[$T]:-?}"
  [ -n "${RES[$T]}" ] || rc=1
  # La sauvegarde date de la nuit : elle peut avoir un peu moins de lignes que la production, jamais beaucoup moins.
  if [ -n "${RES[$T]}" ] && [ -n "${PROD[$T]}" ] && [ "${PROD[$T]}" -gt 20 ] && [ $(( ${RES[$T]} * 100 )) -lt $(( ${PROD[$T]} * 90 )) ]; then
    echo "    !! $T : la sauvegarde contient moins de 90 % de la production"; rc=1
  fi
done
TABS=$(q "$TEST" "select count(*) from information_schema.tables where table_schema='public'")
echo "    tables restaurées : $TABS"
[ "$rc" -eq 0 ] && [ "${TABS:-0}" -gt 5 ] || die "données manquantes ou très en retard (talks ${RES[talks]:-?}/${PROD[talks]:-?}, users ${RES[users]:-?}/${PROD[users]:-?})"

echo "5/5 Vidéos (Garage) et taille du dépôt hors VPS..."
GARAGE_FILES=$(restic ls latest --tag vps-nightly "$GARAGE_DIR/data" 2>/dev/null | grep -c . || true)
restic restore latest --tag vps-nightly --target "$WORK/garage" --include "$GARAGE_DIR/meta/snapshots" >/dev/null 2>&1
META_FILES=$(find "$WORK/garage" -type f -size +0 2>/dev/null | wc -l)
echo "    fichiers vidéo dans la sauvegarde : $GARAGE_FILES ; fichiers de l'instantané des métadonnées : $META_FILES"
GARAGE_OK=true
if [ "${META_FILES:-0}" -lt 1 ] || [ "${GARAGE_FILES:-0}" -lt 1 ]; then GARAGE_OK=false; fi
REPO_BYTES=$(restic stats --mode raw-data --json 2>/dev/null | grep -o '"total_size":[0-9]*' | head -1 | cut -d: -f2)
SNAPS=$(restic snapshots --tag vps-nightly --json 2>/dev/null | grep -o '"short_id"' | wc -l)
echo "    taille du dépôt hors VPS : $(( ${REPO_BYTES:-0} / 1048576 )) Mo ; sauvegardes disponibles : $SNAPS"
[ "$GARAGE_OK" = true ] || die "les vidéos ne sont pas (ou plus) dans la dernière sauvegarde (instantané Garage : $META_FILES fichiers, blocs : $GARAGE_FILES)"

DETAILS="{\"restoreTalks\":${RES[talks]:-0},\"prodTalks\":${PROD[talks]:-0},\"restoreUsers\":${RES[users]:-0},\"prodUsers\":${PROD[users]:-0},\"restoreSeries\":${RES[series]:-0},\"prodSeries\":${PROD[series]:-0},\"tables\":${TABS:-0},\"garageFiles\":${GARAGE_FILES:-0},\"garageOk\":true,\"repoBytes\":${REPO_BYTES:-0},\"snapshots\":${SNAPS:-0},\"durationSec\":$(( $(date +%s) - START ))}"
echo "ok $(date -Is)" > "$STATE/restore-status"
report_api restore_test true "Test de restauration réussi : ${RES[talks]} conférences, ${RES[users]} comptes, vidéos présentes." "$DETAILS"
echo "=== TEST DE RESTAURATION REUSSI ==="
