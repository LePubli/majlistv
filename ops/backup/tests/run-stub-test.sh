#!/usr/bin/env bash
# Essai des scripts de sauvegarde SANS VPS : de faux « docker » et « restic » simulent le serveur, un petit récepteur HTTP joue le site.
# Vérifie : rapport envoyé (succès et échec), jeton hors ligne de commande, échec détecté si les vidéos manquent ou si le dump est trop vieux.
# Usage : bash ops/backup/tests/run-stub-test.sh   (aucun droit particulier ; tout est créé dans un dossier temporaire)
set -uo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/root/.config/backup" "$T/dumps/var/backups/vps-dumps" "$T/state"
fail=0; ok() { echo "OK   $1"; }; ko() { echo "FAIL $1"; fail=1; }

# --- faux récepteur du site : garde le dernier corps + l'en-tête Authorization
cat > "$T/srv.py" <<PY
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('content-length', 0)); b = self.rfile.read(n).decode()
        open('$T/reports.log', 'a').write(json.dumps({'auth': self.headers.get('authorization'), 'body': json.loads(b)}) + '\n')
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 0), H).serve_forever()
PY
python3 -u - <<PY &
import http.server, json, threading
exec(open('$T/srv.py').read().replace("http.server.HTTPServer(('127.0.0.1', 0), H).serve_forever()", "s = http.server.HTTPServer(('127.0.0.1', 5599), H); s.serve_forever()"))
PY
SRV=$!; sleep 1

# --- faux docker / restic
cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
case "$1" in
  exec) if [[ "$*" == *printenv* ]]; then echo "${FAKE_ENV:-majlis}"; elif [[ "$*" == *"select count"* ]]; then
          if [[ "$*" == *"restore-test"* ]]; then echo "${FAKE_RESTORED_TALKS:-100}"; else echo 100; fi
        elif [[ "$*" == *tables* ]]; then echo 40; elif [[ "$*" == *pg_isready* ]]; then exit 0; else cat >/dev/null; fi ;;
  inspect) echo "postgres:16" ;;
  run|rm) exit 0 ;;
esac
SH
cat > "$T/bin/restic" <<'SH'
#!/usr/bin/env bash
case "$1" in
  restore)
    tgt=""; while [ $# -gt 0 ]; do [ "$1" = "--target" ] && tgt=$2; shift; done
    if [[ "$tgt" == */garage ]]; then [ "${FAKE_NO_GARAGE:-0}" = 1 ] || { mkdir -p "$tgt/meta/snapshots"; echo x > "$tgt/meta/snapshots/data.mdb"; }
    else mkdir -p "$tgt/var/backups/vps-dumps"; echo "-- dump" | gzip > "$tgt/var/backups/vps-dumps/majlisstv_20260101_041500.sql.gz"
         touch -d "${FAKE_DUMP_AGE:-2 hours ago}" "$tgt/var/backups/vps-dumps/majlisstv_20260101_041500.sql.gz"; fi ;;
  ls) [ "${FAKE_NO_GARAGE:-0}" = 1 ] || { echo /g/data/aa; echo /g/data/bb; } ;;
  stats) echo '{"total_size":123456789,"total_file_count":10}' ;;
  snapshots) echo '[{"short_id":"a1"},{"short_id":"b2"},{"short_id":"c3"}]' ;;
esac
SH
chmod +x "$T/bin/"*
# faux `date`/`mktemp` inutiles : on garde les vrais ; le dossier STATE est redirigé par sed dans une copie du script
cp "$HERE/restore-test.sh" "$HERE/report-lib.sh" "$T/"
sed -i "s#/root/.config/backup/env#$T/root/.config/backup/env#; s#STATE=/var/lib/backup-vps#STATE=$T/state#" "$T/restore-test.sh"
printf 'MAJLIS_REPORT_URL=http://127.0.0.1:5599/backup/report\nMAJLIS_REPORT_TOKEN=secret-token-123\nRESTIC_PASSWORD=x\n' > "$T/root/.config/backup/env"
export PATH="$T/bin:$PATH"
run() { env "$@" bash "$T/restore-test.sh" > "$T/out.txt" 2>&1; echo $?; }
last() { tail -1 "$T/reports.log" 2>/dev/null; }

c=$(run FAKE_X=1)
[ "$c" = 0 ] && grep -q "TEST DE RESTAURATION REUSSI" "$T/out.txt" && ok "test de restauration réussi (sortie 0)" || { ko "réussite attendue"; cat "$T/out.txt"; }
last | grep -q '"ok": true' && last | grep -q '"kind": "restore_test"' && ok "rapport de réussite reçu par le site" || ko "rapport de réussite"
last | grep -q '"auth": "Bearer secret-token-123"' && ok "jeton transmis en en-tête" || ko "jeton"
last | grep -q '"repoBytes": 123456789' && last | grep -q '"snapshots": 3' && ok "taille du dépôt et nombre de sauvegardes rapportés" || ko "détails"
grep -q "^ok " "$T/state/restore-status" && ok "état local écrit" || ko "état local"

c=$(run FAKE_NO_GARAGE=1)
[ "$c" = 1 ] && last | grep -q '"ok": false' && last | grep -qi "vid" && ok "échec rapporté si les vidéos manquent" || { ko "vidéos manquantes"; cat "$T/out.txt"; }

c=$(run FAKE_DUMP_AGE="3 days ago")
[ "$c" = 1 ] && last | grep -q '"ok": false' && last | grep -q "dernier dump" && ok "échec rapporté si le dump est trop vieux" || { ko "dump trop vieux"; cat "$T/out.txt"; }

c=$(run FAKE_RESTORED_TALKS=10)
[ "$c" = 1 ] && last | grep -q '"ok": false' && ok "échec rapporté si la sauvegarde est très en retard sur la production" || { ko "données en retard"; cat "$T/out.txt"; }

sed -i 's#MAJLIS_REPORT_TOKEN=.*#MAJLIS_REPORT_TOKEN=#' "$T/root/.config/backup/env"
n=$(wc -l < "$T/reports.log"); c=$(run FAKE_X=1)
[ "$c" = 0 ] && [ "$(wc -l < "$T/reports.log")" = "$n" ] && ok "sans jeton : aucun envoi, le test fonctionne quand même" || ko "sans jeton"
[ "$fail" = 0 ] && echo "=== TOUT EST OK ===" || { echo "=== ECHEC ==="; exit 1; }
