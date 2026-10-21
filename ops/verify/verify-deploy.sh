#!/usr/bin/env bash
# verify-deploy.sh — vérification après déploiement de Mejliss TV (étape F).
# À lancer sur le VPS, en root, APRÈS chaque série de redéploiements DockPanel (en plus des 3 commandes habituelles) :
#   bash /root/verify-deploy.sh            # vérification complète
#   bash /root/verify-deploy.sh --quick    # sans les mesures de charge ni la recherche d'erreurs dans les journaux
#   bash /root/verify-deploy.sh --no-public   # sans tester les adresses publiques (DNS / HTTPS)
# Ne modifie rien : lit l'état de Docker, de nginx, de la base et du disque. Code de sortie : 0 = aucun ÉCHEC, 1 = au moins un ÉCHEC.
# Variables facultatives : EXPECT_MIGRATION (dernière migration attendue, défaut 061_media_import.sql), SITE_URL, API_URL_PUBLIC, S3_URL_PUBLIC.
set -uo pipefail

QUICK=0; PUBLIC=1
for a in "$@"; do case "$a" in --quick) QUICK=1 ;; --no-public) PUBLIC=0 ;; -h|--help) sed -n 2,9p "$0"; exit 0 ;; *) echo "Option inconnue : $a"; exit 2 ;; esac; done

EXPECT_MIGRATION=${EXPECT_MIGRATION:-061_media_import.sql}
SITE_URL=${SITE_URL:-https://majlisstv.le-publicitaire.fr}
API_URL_PUBLIC=${API_URL_PUBLIC:-https://api-majlisstv.le-publicitaire.fr}
S3_URL_PUBLIC=${S3_URL_PUBLIC:-https://s3-majlisstv.le-publicitaire.fr}
PREFIX=dockpanel-git-majlistv
PG=dockpanel-app-postgres-majlisstv
API_PORT=7000; WEB_PORT=7010; FOREIGN_PORT=7001   # 7001 = trimaint_frontend : ne jamais y toucher

N_OK=0; N_WARN=0; N_FAIL=0
ok()   { N_OK=$((N_OK + 1));     printf '  \033[32mOK\033[0m     %s\n' "$*"; }
warn() { N_WARN=$((N_WARN + 1)); printf '  \033[33mATTENTION\033[0m %s\n' "$*"; }
fail() { N_FAIL=$((N_FAIL + 1)); printf '  \033[31mÉCHEC\033[0m  %s\n' "$*"; }
info() { printf '  ·      %s\n' "$*"; }
title() { printf '\n== %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }
dx() { local c=$1; shift; docker exec "$c" "$@" 2>&1; }
psql_q() { # requête SQL (une valeur) dans la base de Mejliss TV
  docker exec "$PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"' _ "$1" 2>/dev/null
}
http_code() { local c; c=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" 2>/dev/null); echo "${c:-000}"; }

have docker || { echo "docker introuvable : à lancer sur le VPS."; exit 2; }
echo "Vérification Mejliss TV — $(date '+%F %T')"

# --- 1. Conteneurs ---------------------------------------------------------------------------------------------------------------
title "1. Conteneurs"
for svc in api web worker transcriber translator search storage dubbing; do
  c=$PREFIX-$svc
  if ! docker inspect "$c" >/dev/null 2>&1; then
    if [ "$svc" = dubbing ]; then warn "$c absent (service de doublage facultatif)"; else fail "$c absent : DockPanel → Git Deploy → vérifier le déploiement majlistv-$svc"; fi
    continue
  fi
  if ! running "$c"; then fail "$c arrêté : docker logs --tail 50 $c"; continue; fi
  st=$(docker inspect -f '{{.State.Restarting}} {{.RestartCount}} {{.State.OOMKilled}}' "$c")
  read -r restarting count oom <<<"$st"
  if [ "$restarting" = "true" ]; then fail "$c redémarre en boucle : docker logs --tail 50 $c"
  elif [ "$oom" = "true" ]; then fail "$c a été tué par manque de mémoire (OOM) : augmenter sa limite dans /root/apply-limits.sh"
  elif [ "${count:-0}" -gt 3 ]; then warn "$c : $count redémarrages depuis sa création (docker logs --tail 80 $c)"
  else ok "$c en marche (depuis $(docker inspect -f '{{.State.StartedAt}}' "$c" | cut -c1-16))"; fi
done
if running "$PG"; then ok "$PG en marche"; else fail "$PG arrêté ou absent (base PostgreSQL de DockPanel)"; fi

# --- 2. Ports et santé -----------------------------------------------------------------------------------------------------------
title "2. Ports et santé des services"
owner=$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E "(:|->)${FOREIGN_PORT}->" | awk '{print $1}' | head -1)
case "$owner" in "") info "port $FOREIGN_PORT : non publié (rien à signaler)";; *trimaint*) ok "port $FOREIGN_PORT : $owner (TriMaint, intact)";; *) fail "port $FOREIGN_PORT utilisé par $owner : il doit rester à TriMaint";; esac
code=$(http_code "http://127.0.0.1:$API_PORT/health"); [ "$code" = 200 ] && ok "API : http://127.0.0.1:$API_PORT/health → 200" || fail "API : /health répond $code sur le port $API_PORT (conteneur $PREFIX-api : port hôte ≠ $API_PORT ?)"
code=$(http_code "http://127.0.0.1:$WEB_PORT/"); case "$code" in 200|301|302|307|308) ok "Site : http://127.0.0.1:$WEB_PORT/ → $code";; *) fail "Site : répond $code sur le port $WEB_PORT";; esac
for svc in worker transcriber translator dubbing; do
  c=$PREFIX-$svc; running "$c" || continue
  hp=$(docker port "$c" 3000/tcp 2>/dev/null | head -1 | sed 's/.*://')
  if [ -z "$hp" ]; then warn "$c : port hôte inconnu (docker port $c)"; continue; fi
  code=$(http_code "http://127.0.0.1:$hp/health"); [ "$code" = 200 ] || code=$(http_code "http://127.0.0.1:$hp/")
  [ "$code" = 200 ] && ok "$svc : santé sur le port hôte $hp" || warn "$svc : page de santé répond $code (port hôte $hp)"
done
if running "$PREFIX-search"; then
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PREFIX-search")
  code=$(http_code "http://$ip:3000/health"); [ "$code" = 200 ] && ok "Meilisearch : santé (adresse du conteneur $ip)" || fail "Meilisearch ne répond pas ($code) à l'adresse $ip : Admin → Paramètres → Recherche doit utiliser cette adresse"
fi
if [ "$PUBLIC" = 1 ]; then
  code=$(http_code "$API_URL_PUBLIC/health"); [ "$code" = 200 ] && ok "Adresse publique de l'API : $code" || fail "Adresse publique de l'API ($API_URL_PUBLIC/health) : $code"
  code=$(http_code "$SITE_URL/"); case "$code" in 200|301|302|307|308) ok "Adresse publique du site : $code";; *) fail "Adresse publique du site ($SITE_URL) : $code";; esac
  code=$(http_code "$S3_URL_PUBLIC/"); case "$code" in 200|400|403|404) ok "Stockage S3 public : répond ($code, un refus d'accès est normal)";; *) fail "Stockage S3 public ($S3_URL_PUBLIC) : $code";; esac
fi

# --- 3. nginx et limites ---------------------------------------------------------------------------------------------------------
title "3. nginx et limites de ressources"
if have nginx; then
  nginx -t >/dev/null 2>&1 && ok "nginx -t : configuration valide" || fail "nginx -t échoue : nginx -t (lire le message) — ne pas recharger nginx tant que ce n'est pas corrigé"
  lines=$(grep -n proxy_pass /etc/nginx/sites-enabled/* 2>/dev/null | grep -i mejliss)
  if [ -z "$lines" ]; then warn "aucune ligne proxy_pass « mejliss » dans /etc/nginx/sites-enabled"
  else
    info "$(echo "$lines" | sed 's/^/ /' | tr '\n' ';')"
    echo "$lines" | grep -qE "127\.0\.0\.1:$API_PORT" && ok "nginx : l'API pointe sur le port $API_PORT" || fail "nginx : aucun proxy_pass vers le port $API_PORT pour l'API (DockPanel a changé le port ? corriger le vhost, puis nginx -t && systemctl reload nginx)"
    echo "$lines" | grep -qE "127\.0\.0\.1:$WEB_PORT" && ok "nginx : le site pointe sur le port $WEB_PORT" || fail "nginx : aucun proxy_pass vers le port $WEB_PORT pour le site"
    echo "$lines" | grep -qE "127\.0\.0\.1:$FOREIGN_PORT" && fail "nginx : un vhost Mejliss pointe sur $FOREIGN_PORT (TriMaint)"
  fi
else warn "nginx absent de cette machine"; fi
[ -x /root/apply-limits.sh ] && ok "/root/apply-limits.sh présent" || warn "/root/apply-limits.sh absent ou non exécutable"
for svc in api web worker transcriber translator search dubbing; do
  c=$PREFIX-$svc; running "$c" || continue
  mem=$(docker inspect -f '{{.HostConfig.Memory}}' "$c"); cpus=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$c")
  if [ "${mem:-0}" = 0 ] && [ "${cpus:-0}" = 0 ]; then warn "$c sans limite de mémoire ni de processeur : lancer /root/apply-limits.sh (le redéploiement les efface)"; else ok "$c limité (mémoire $((mem / 1048576)) Mo, processeurs $(awk "BEGIN{print ${cpus:-0}/1000000000}"))"; fi
done

# --- 4. Base de données ----------------------------------------------------------------------------------------------------------
title "4. Base de données"
if running "$PG"; then
  last=$(psql_q "select name from schema_migrations order by name desc limit 1")
  if [ -z "$last" ]; then fail "table schema_migrations illisible : l'API a-t-elle démarré une fois ? (docker logs $PREFIX-api | grep -i migrat)"
  elif [[ "$last" < "$EXPECT_MIGRATION" ]]; then fail "dernière migration appliquée : $last (attendue : $EXPECT_MIGRATION ou plus) — redéployer majlistv-api et lire ses journaux"
  else ok "migrations à jour (dernière : $last)"; fi
  [ "$(psql_q "select to_regclass('public.media_imports') is not null")" = t ] && ok "table media_imports présente (étape Import)" || fail "table media_imports absente (migration 061)"
  info "conférences : $(psql_q "select count(*) from talks") ; hébergées : $(psql_q "select count(*) from talks where source='upload'") ; utilisateurs : $(psql_q "select count(*) from users")"
  f=$(psql_q "select count(*) from talks where video_status='failed'"); [ "${f:-0}" = 0 ] && ok "aucune conférence avec une conversion vidéo en échec" || warn "$f conférence(s) avec une conversion vidéo en échec (Studio → Contenus, filtre « À corriger »)"
  s=$(psql_q "select count(*) from talks where video_status in ('pending','processing','importing') and created_at < now() - interval '6 hours'"); [ "${s:-0}" = 0 ] && ok "aucune conversion bloquée depuis plus de 6 h" || warn "$s conversion(s) en cours depuis plus de 6 h (worker : docker logs $PREFIX-worker)"
  t=$(psql_q "select count(*) from talks where transcript_status='failed'"); [ "${t:-0}" = 0 ] && ok "aucune transcription en échec" || warn "$t transcription(s) en échec (message sur la fiche de la conférence)"
  i=$(psql_q "select count(*) from media_imports where status='failed' and created_at > now() - interval '7 days'"); [ "${i:-0}" = 0 ] && ok "aucun import de vidéo en échec cette semaine" || warn "$i import(s) en échec cette semaine (Studio → Activité → Journal des imports)"
  [ "$(psql_q "select count(*) from users where role='admin'")" -ge 1 ] 2>/dev/null && ok "au moins un compte administrateur" || fail "aucun compte administrateur"
fi

# --- 5. Services de calcul -------------------------------------------------------------------------------------------------------
title "5. Worker, transcripteur, doublage"
w=$PREFIX-worker
if running "$w"; then
  dx "$w" ls /usr/share/fonts/dejavu 2>/dev/null | grep -qi dejavu && ok "worker : polices DejaVu présentes" || fail "worker : polices DejaVu absentes (image du worker à reconstruire)"
  filt=$(dx "$w" sh -c "ffmpeg -hide_banner -filters" 2>/dev/null); missing=""
  for f in ass amultiply loudnorm afftdn; do echo "$filt" | grep -qE " $f " || missing="$missing $f"; done
  [ -z "$missing" ] && ok "worker : FFmpeg a les filtres ass, amultiply, loudnorm, afftdn" || fail "worker : filtres FFmpeg manquants :$missing"
  free=$(dx "$w" df -Pk /work 2>/dev/null | awk 'NR==2{print int($4/1048576)}')
  [ -z "$free" ] && info "worker : /work illisible" || { [ "$free" -ge 5 ] && ok "worker : ${free} Go libres dans /work" || warn "worker : seulement ${free} Go libres dans /work (un rendu ou un import peut échouer)"; }
fi
t=$PREFIX-transcriber
if running "$t"; then
  v=$(dx "$t" python -m yt_dlp --version 2>/dev/null | tail -1); [ -n "$v" ] && ok "transcripteur : yt-dlp $v" || fail "transcripteur : yt-dlp introuvable"
  dx "$t" deno --version >/dev/null 2>&1 && ok "transcripteur : deno présent (YouTube)" || warn "transcripteur : deno absent (certaines vidéos YouTube peuvent échouer)"
  n=$(dx "$t" sh -c 'ls /models 2>/dev/null | wc -l'); [ "${n:-0}" -gt 0 ] && ok "transcripteur : volume /models rempli ($n éléments)" || warn "transcripteur : /models vide (modèle Whisper téléchargé à chaque redéploiement : volume persistant manquant ?)"
  dx "$t" sh -c 'ls /models/speakers/*.onnx' >/dev/null 2>&1 && ok "transcripteur : modèle de voix des intervenants présent" || info "transcripteur : modèle de voix des intervenants pas encore téléchargé (première détection)"
  free=$(dx "$t" df -Pk "${WORK_DIR:-/work}" 2>/dev/null | awk 'NR==2{print int($4/1048576)}'); [ -n "$free" ] && { [ "$free" -ge 5 ] && ok "transcripteur : ${free} Go libres (dossier de travail)" || warn "transcripteur : ${free} Go libres seulement (téléchargements d'import)"; }
fi
d=$PREFIX-dubbing
if running "$d"; then
  dx "$d" sh -c 'ffmpeg -hide_banner -filters | grep -q rubberband' >/dev/null 2>&1 && ok "doublage : FFmpeg « rubberband » présent (hauteur de voix)" || warn "doublage : « rubberband » absent : méthode de secours pour la hauteur de voix"
  dx "$d" sh -c 'ls /models | wc -l' | grep -qv '^0$' && ok "doublage : volume /models rempli" || warn "doublage : /models vide (modèles téléchargés au premier doublage)"
fi

# --- 6. Stockage Garage et disque ------------------------------------------------------------------------------------------------
title "6. Stockage vidéo et disque"
s=$PREFIX-storage
if running "$s"; then
  dx "$s" /garage status >/dev/null 2>&1 && ok "Garage : cluster en état" || fail "Garage : « /garage status » échoue ($s)"
  b=$(dx "$s" /garage bucket info majlis-videos 2>/dev/null)
  if [ -n "$b" ] && ! echo "$b" | grep -qi "error"; then ok "Garage : bucket majlis-videos présent"; echo "$b" | grep -iE "size|objects|quota" | head -4 | sed 's/^/         /'; else fail "Garage : bucket majlis-videos introuvable"; fi
fi
use=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
if [ -n "$use" ]; then if [ "$use" -ge 90 ]; then fail "disque du VPS plein à ${use} %"; elif [ "$use" -ge 80 ]; then warn "disque du VPS plein à ${use} %"; else ok "disque du VPS : ${use} % utilisé"; fi; fi
if [ -r /var/lib/backup-vps/last-status ]; then
  age=$(( ( $(date +%s) - $(stat -c %Y /var/lib/backup-vps/last-status) ) / 3600 ))
  if [ "$age" -le 36 ]; then ok "sauvegarde : dernier état il y a ${age} h ($(head -c 80 /var/lib/backup-vps/last-status | tr '\n' ' '))"; else warn "sauvegarde : dernier état il y a ${age} h (> 36 h) : /root/backup/backup-vps.sh"; fi
else warn "sauvegarde : /var/lib/backup-vps/last-status absent (sauvegarde nocturne non installée ?)"; fi

# --- 7. Charge du VPS partagé ----------------------------------------------------------------------------------------------------
if [ "$QUICK" = 0 ]; then
  title "7. Charge du VPS (partagé avec Miel & Co et TriMaint)"
  cores=$(nproc); load=$(awk '{print $1}' /proc/loadavg)
  if awk "BEGIN{exit !($load > $cores)}"; then warn "charge $load supérieure au nombre de cœurs ($cores)"; else ok "charge $load pour $cores cœurs"; fi
  sw=$(free -m | awk '/Swap/{print $3}'); [ "${sw:-0}" -gt 1024 ] && warn "swap utilisé : ${sw} Mo" || ok "swap utilisé : ${sw:-0} Mo"
  bad=$(docker ps --filter status=restarting --format '{{.Names}}'); [ -z "$bad" ] && ok "aucun conteneur en redémarrage" || fail "conteneur(s) en redémarrage : $bad"
  docker stats --no-stream --format '         {{.Name}}  UC {{.CPUPerc}}  mémoire {{.MemUsage}}' 2>/dev/null | grep -iE "majlis|trimaint|miel" | head -20

  title "8. Journaux récents (200 dernières lignes de chaque service)"
  for svc in api web worker transcriber translator dubbing; do
    c=$PREFIX-$svc; running "$c" || continue
    n=$(docker logs --tail 200 "$c" 2>&1 | grep -ciE "unhandled|fatal|ECONNREFUSED|password authentication failed|Killed")
    [ "${n:-0}" = 0 ] && ok "$svc : rien d'inquiétant dans les journaux" || warn "$svc : $n ligne(s) suspecte(s) — docker logs --tail 200 $c 2>&1 | grep -iE 'unhandled|fatal|ECONNREFUSED|password authentication failed|Killed'"
  done
fi

printf '\n== Résumé : %d OK, %d attention, %d échec(s)\n' "$N_OK" "$N_WARN" "$N_FAIL"
if [ "$N_FAIL" -gt 0 ]; then echo "→ Copier les lignes ÉCHEC / ATTENTION à Claude."; exit 1; fi
[ "$N_WARN" -gt 0 ] && echo "→ Aucun échec ; relire les lignes ATTENTION."
exit 0
