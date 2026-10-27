#!/usr/bin/env bash
# backup-vps.sh — sauvegarde nocturne du VPS (étape 8)
#   1. dump vérifié de chaque base : Mejliss TV, TriMaint, Miel & Compagnie (MariaDB)
#   2. envoi chiffré vers l'hébergement PlanetHoster (dépôt restic, SFTP) avec les sauvegardes DockPanel et quelques fichiers de configuration
#   3. rotation : 7 jours, 4 semaines, 6 mois ; contrôle d'intégrité chaque dimanche
#   4. (étape 37) rapport au site Mejliss TV : visible dans Admin → Santé du serveur, alerte e-mail s'il manque ou signale un échec
# Aucun secret dans ce fichier : tout est lu dans /root/.config/backup/env (droits 600).
set -uo pipefail
export HOME=/root

CONF=/root/.config/backup/env
DUMPS=/var/backups/vps-dumps
STATE=/var/lib/backup-vps
LOG=/var/log/backup-vps.log
KEEP_LOCAL=3                       # dumps gardés sur le VPS (l'historique complet est dans le dépôt restic)

mkdir -p "$DUMPS" "$STATE"; chmod 700 "$DUMPS" "$STATE"
touch "$LOG"; chmod 600 "$LOG"
exec 9>/var/lock/backup-vps.lock
flock -n 9 || { echo "Une sauvegarde est déjà en cours."; exit 0; }

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
FAILS=()
fail() { log "ECHEC : $*"; FAILS+=("$*"); }

[ -r "$CONF" ] || { echo "Fichier $CONF introuvable"; exit 2; }
# shellcheck disable=SC1090
. "$CONF"
TS=$(date +%Y%m%d_%H%M%S)
START=$(date +%s)
# shellcheck disable=SC1091
[ -r "$(dirname "$0")/report-lib.sh" ] && . "$(dirname "$0")/report-lib.sh" || report_api() { :; }

# Supprime les vieux dumps locaux d'un même type (garde les KEEP_LOCAL plus récents).
prune_local() { ls -1t "$DUMPS/$1"_*.sql.gz 2>/dev/null | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -f; }

# --- PostgreSQL : utilisateur et base lus dans le conteneur ; un dump tronqué est écarté (comme le script DockPanel).
dump_pg() {
  local label=$1 c=$2 out="$DUMPS/${1}_$TS.sql.gz" u d
  docker inspect "$c" >/dev/null 2>&1 || { fail "$label : conteneur $c introuvable"; return; }
  u=$(docker exec "$c" printenv POSTGRES_USER 2>/dev/null); u=${u:-postgres}
  d=$(docker exec "$c" printenv POSTGRES_DB 2>/dev/null);   d=${d:-$u}
  if ! docker exec "$c" pg_dump -U "$u" -d "$d" | gzip > "$out"; then
    rm -f "$out"; fail "$label : pg_dump a échoué"; return
  fi
  if [ "$(gunzip -c "$out" 2>/dev/null | tail -20 | grep -c 'PostgreSQL database dump complete')" -lt 1 ]; then
    rm -f "$out"; fail "$label : dump incomplet, écarté"; return
  fi
  log "OK  $label ($(du -h "$out" | cut -f1))"
  prune_local "$label"
}

# --- MariaDB : le compte du site (MYSQL_USER) est lu DANS le conteneur (jamais affiché, jamais sur la ligne de commande de l'hôte).
#     Le mot de passe root de ce conteneur est aléatoire et inconnu (MYSQL_RANDOM_ROOT_PASSWORD) ; le compte du site a tous les droits sur sa base.
dump_maria() {
  local label=$1 c=$2 out="$DUMPS/${1}_$TS.sql.gz"
  docker inspect "$c" >/dev/null 2>&1 || { fail "$label : conteneur $c introuvable"; return; }
  if ! docker exec "$c" sh -c '
      U="${MYSQL_USER:-}"; P="${MYSQL_PASSWORD:-}"; DB="${MYSQL_DATABASE:-}"
      [ -n "$U" ] && [ -n "$P" ] && [ -n "$DB" ] || { echo "MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE absents du conteneur" >&2; exit 3; }
      MYSQL_PWD="$P" mariadb-dump -u"$U" --single-transaction --quick --databases "$DB"
    ' | gzip > "$out"; then
    rm -f "$out"; fail "$label : mariadb-dump a échoué"; return
  fi
  if [ "$(gunzip -c "$out" 2>/dev/null | tail -5 | grep -c 'Dump completed')" -lt 1 ]; then
    rm -f "$out"; fail "$label : dump incomplet, écarté"; return
  fi
  log "OK  $label ($(du -h "$out" | cut -f1))"
  prune_local "$label"
}

log "=== Début de la sauvegarde ==="
dump_pg    majlisstv  dockpanel-app-postgres-majlisstv
dump_pg    trimaint   trimaint_db
dump_maria mieletcompagnie dockpanel-db-mieletcompagnie_fr

# --- Vidéos Mejliss (Garage). Base LMDB : on demande à Garage un instantané cohérent des métadonnées (meta/snapshots),
#     puis on sauvegarde les blocs vidéo (data/, jamais modifiés une fois écrits : l'incrémental est très léger).
GARAGE_C=dockpanel-git-majlistv-storage
GARAGE_DIR=/var/lib/dockpanel/git-data/majlistv-storage/var/lib/garage
GARAGE_OK=0
if docker exec "$GARAGE_C" /garage meta snapshot >/dev/null 2>&1 && [ -n "$(ls -A "$GARAGE_DIR/meta/snapshots" 2>/dev/null)" ]; then
  GARAGE_OK=1; log "OK  garage : instantané des métadonnées créé"
else
  fail "garage : instantané des métadonnées impossible"
fi

# --- Envoi chiffré vers l'hébergement.
PATHS=("$DUMPS")
for p in /var/backups/dockpanel /etc/nginx /etc/cron.d /root/apply-limits.sh; do [ -e "$p" ] && PATHS+=("$p"); done
if [ "$GARAGE_OK" = 1 ]; then PATHS+=("$GARAGE_DIR/data" "$GARAGE_DIR/meta/snapshots"); fi
log "Envoi vers le dépôt restic : ${PATHS[*]}"
nice -n 19 ionice -c 3 restic backup "${PATHS[@]}" -o sftp.connections=2 \
  --tag vps-nightly --exclude /var/backups/dockpanel/.staging --one-file-system 2>&1 | tee -a "$LOG"
rc=${PIPESTATUS[0]}
if [ "$rc" -ne 0 ]; then fail "restic backup a échoué (code $rc)"; fi

# --- Rotation (la suppression physique, plus lente, n'a lieu que le dimanche) et contrôle d'intégrité.
if [ "$rc" -eq 0 ]; then
  if [ "$(date +%u)" = 7 ]; then
    restic forget --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune 2>&1 | tail -5 | tee -a "$LOG" || true
    restic check --read-data-subset=3% 2>&1 | tail -3 | tee -a "$LOG"
    [ "${PIPESTATUS[0]}" -eq 0 ] || fail "restic check a signalé un problème"
  else
    restic forget --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6 2>&1 | tail -2 | tee -a "$LOG" || true
  fi
fi

# --- Détails du rapport au site (étape 37).
DUMP_BYTES=$(du -sb "$DUMPS" 2>/dev/null | cut -f1)
SNAPS=$(restic snapshots --tag vps-nightly --json 2>/dev/null | grep -o '"short_id"' | wc -l)
DETAILS="{\"snapshotAt\":\"$(date -u +%FT%TZ)\",\"snapshots\":${SNAPS:-0},\"dumpBytes\":${DUMP_BYTES:-0},\"garageOk\":$([ "$GARAGE_OK" = 1 ] && echo true || echo false),\"durationSec\":$(( $(date +%s) - START ))}"
[ "$rc" -eq 0 ] || DETAILS="{\"garageOk\":$([ "$GARAGE_OK" = 1 ] && echo true || echo false),\"durationSec\":$(( $(date +%s) - START ))}"

# --- Bilan, et signal à Uptime Kuma si une URL « push » est définie (KUMA_PUSH_URL dans le fichier env).
if [ "${#FAILS[@]}" -eq 0 ]; then
  log "=== Sauvegarde terminée : tout est OK ==="
  echo "ok $(date -Is)" > "$STATE/last-status"
  [ -n "${KUMA_PUSH_URL:-}" ] && curl -fsS -m 15 "${KUMA_PUSH_URL}?status=up&msg=OK" >/dev/null 2>&1
  report_api backup true "Sauvegarde nocturne terminée, tout est OK." "$DETAILS"
  exit 0
fi
log "=== Sauvegarde terminée avec ${#FAILS[@]} échec(s) ==="
echo "echec $(date -Is) : ${FAILS[*]}" > "$STATE/last-status"
[ -n "${KUMA_PUSH_URL:-}" ] && curl -fsS -m 15 --get --data-urlencode "msg=${FAILS[*]}" "${KUMA_PUSH_URL}?status=down" >/dev/null 2>&1
report_api backup false "${FAILS[*]}" "$DETAILS"
exit 1
