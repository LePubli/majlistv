#!/usr/bin/env bash
# report-lib.sh — envoie un court rapport au site Mejliss TV (étape 37). À inclure avec « . report-lib.sh ».
# Variables lues dans /root/.config/backup/env : MAJLIS_REPORT_URL (https://api-majlisstv.le-publicitaire.fr/backup/report) et MAJLIS_REPORT_TOKEN.
# Sans l'une des deux, la fonction ne fait rien (la sauvegarde n'en dépend jamais). Le jeton ne passe pas par la ligne de commande (visible avec ps).
#   report_api <backup|restore_test> <true|false> "<résumé court>" '<json des détails>'
report_api() {
  [ -n "${MAJLIS_REPORT_URL:-}" ] && [ -n "${MAJLIS_REPORT_TOKEN:-}" ] || return 0
  local s=${3:-}; s=${s//[\"\\]/ }; s=${s//$'\n'/ }; s=${s:0:500}
  local d=${4:-}; [ -n "$d" ] || d='{}'
  printf 'header = "Authorization: Bearer %s"\n' "$MAJLIS_REPORT_TOKEN" | curl -fsS -m 20 --retry 2 -K - \
    -H 'Content-Type: application/json' \
    -d "{\"kind\":\"$1\",\"ok\":$2,\"summary\":\"$s\",\"details\":$d}" "$MAJLIS_REPORT_URL" >/dev/null 2>&1 \
    && echo "Rapport envoyé au site." || echo "(rapport au site non envoyé : site injoignable ou jeton invalide)"
}
