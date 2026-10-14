#!/usr/bin/env bash
# restore-test.sh — test de restauration RÉEL : récupère le dernier dump de Mejliss TV depuis le dépôt distant (chiffré),
# le charge dans une base PostgreSQL jetable (sans réseau, en mémoire), compare avec la base en production, puis efface tout.
# Ne touche à aucune donnée de production : seule la lecture est utilisée sur le conteneur réel.
set -uo pipefail
export HOME=/root
. /root/.config/backup/env
LIVE=dockpanel-app-postgres-majlisstv
LABEL=majlisstv
WORK=$(mktemp -d /var/tmp/restore-test.XXXXXX)
TEST=restore-test-$$
cleanup() { docker rm -f "$TEST" >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT

U=$(docker exec "$LIVE" printenv POSTGRES_USER); U=${U:-postgres}
D=$(docker exec "$LIVE" printenv POSTGRES_DB);   D=${D:-$U}
IMG=$(docker inspect --format '{{.Config.Image}}' "$LIVE")

echo "1/4 Récupération du dernier dump depuis l'hébergement (déchiffrement local)..."
restic restore latest --tag vps-nightly --target "$WORK" --include "/var/backups/vps-dumps" >/dev/null || { echo "ECHEC : restic restore"; exit 1; }
F=$(ls -1t "$WORK"/var/backups/vps-dumps/${LABEL}_*.sql.gz 2>/dev/null | head -1)
[ -n "$F" ] || { echo "ECHEC : aucun dump $LABEL dans la dernière sauvegarde"; exit 1; }
echo "    dump restauré : $(basename "$F") ($(du -h "$F" | cut -f1))"

echo "2/4 Démarrage d'une base jetable ($IMG, sans réseau)..."
docker run -d --rm --name "$TEST" --network none --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER="$U" -e POSTGRES_DB="$D" -e POSTGRES_PASSWORD=restore-test "$IMG" >/dev/null || { echo "ECHEC : démarrage"; exit 1; }
for _ in $(seq 1 60); do docker exec "$TEST" pg_isready -U "$U" -d "$D" >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "3/4 Restauration du dump..."
gunzip -c "$F" | docker exec -i "$TEST" psql -U "$U" -d "$D" -v ON_ERROR_STOP=1 -q >/dev/null 2>"$WORK/err.log" || { echo "ECHEC : restauration"; head -5 "$WORK/err.log"; exit 1; }

echo "4/4 Comparaison avec la base en production :"
q() { docker exec "$1" psql -U "$U" -d "$D" -Atc "$2" 2>/dev/null; }
rc=0
for T in talks users series; do
  a=$(q "$TEST" "select count(*) from $T"); b=$(q "$LIVE" "select count(*) from $T")
  printf "    %-8s sauvegarde=%-6s production=%s\n" "$T" "${a:-?}" "${b:-?}"
  [ -n "$a" ] || rc=1
done
tabs=$(q "$TEST" "select count(*) from information_schema.tables where table_schema='public'")
echo "    tables restaurées : $tabs"
if [ "$rc" -eq 0 ] && [ "${tabs:-0}" -gt 5 ]; then echo "=== TEST DE RESTAURATION REUSSI ==="; else echo "=== ECHEC : données manquantes ==="; exit 1; fi
