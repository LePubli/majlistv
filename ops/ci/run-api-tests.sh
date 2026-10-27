#!/usr/bin/env bash
# Étape 30 — Lance les tests de l'API (GitHub Actions ou poste local).
# Prérequis : API de test sur http://127.0.0.1:3055 et PostgreSQL de test sur 127.0.0.1:5544 (base/utilisateur « majlis », mot de passe « pw »),
# python3 + paquets requests et psycopg2-binary, Node 22. Voir README « Étape 30 » pour la mise en route locale.
# Sortie : une ligne par test (OK / ÉCHEC), détail des échecs à la fin ; code de sortie 1 s'il y a au moins un échec.
set -u
cd "$(dirname "$0")/../.."
LOGS="${CI_LOGS:-/tmp/ci-logs}"; mkdir -p "$LOGS"
export DATABASE_URL="${DATABASE_URL:-postgres://majlis:pw@127.0.0.1:5544/majlis}"
export PRACTICE_KEY="${PRACTICE_KEY:-practice-key-for-tests-0123456789}" JWT_SECRET="${JWT_SECRET:-0123456789abcdef0123456789abcdef-test}" SETTINGS_KEY="${SETTINGS_KEY:-test-settings-key-0123456789}"
fail=0; total=0; failed=()

run() { # run <libellé> <commande…>
  local label="$1"; shift
  total=$((total + 1))
  if (cd api && timeout 300 "$@" < /dev/null) > "$LOGS/$(echo "$label" | tr '/ ' '__').log" 2>&1; then echo "OK     $label"; else echo "ÉCHEC  $label"; fail=$((fail + 1)); failed+=("$label"); fi
}

echo "== Tests unitaires (Node, sans API) =="
# test_citations_auto.mjs : demande un corpus de citations importé (hors CI), il est lancé à la main.
SKIP_MJS=" test_citations_auto.mjs "
for f in api/tests/*.mjs; do
  b="$(basename "$f")"
  case "$SKIP_MJS" in *" $b "*) echo "IGNORÉ $b (corpus de citations requis)"; continue ;; esac
  run "$b" node "tests/$b"
done
echo "== Tests de l'API (Python) =="
while read -r f; do
  case "$f" in ''|'#'*) continue ;; esac
  run "$f" python3 "tests/$f"
done < api/tests/ci-suite.txt

echo
echo "$((total - fail)) réussis, $fail en échec sur $total"
for l in "${failed[@]:-}"; do
  [ -z "$l" ] && continue
  echo; echo "----- $l (dernières lignes) -----"; tail -n 15 "$LOGS/$(echo "$l" | tr '/ ' '__').log"
  # Chez GitHub : l'échec apparaît aussi en annotation rouge, lisible tout en haut de la page de l'exécution.
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    msg="$(tail -n 4 "$LOGS/$(echo "$l" | tr '/ ' '__').log" | tr '\n\r' '  ' | tr -d '%' | cut -c1-400)"
    echo "::error title=Test en échec : $l::$msg"
  fi
done
[ "$fail" -eq 0 ]
