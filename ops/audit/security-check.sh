#!/usr/bin/env bash
# Mejliss TV — contrôle de sécurité du serveur (LECTURE SEULE : ne modifie rien, n'affiche aucun secret).
# Audit 11/2026, étape 4. À lancer sur le VPS, en root :
#     bash security-check.sh            (ou : bash security-check.sh | tee /root/security-check.txt)
# Réglages : SITE, API, S3 (noms de domaine), API_CONTAINER, WEB_CONTAINER, PG_CONTAINER.
# Chaque ligne commence par OK, ATTENTION ou INFO. « ATTENTION » = à regarder, pas forcément une faille.
set -u
SITE="${SITE:-majlisstv.le-publicitaire.fr}"
API="${API:-api-majlisstv.le-publicitaire.fr}"
S3="${S3:-s3-majlisstv.le-publicitaire.fr}"
API_C="${API_CONTAINER:-dockpanel-git-majlistv-api}"
WEB_C="${WEB_CONTAINER:-dockpanel-git-majlistv-web}"
PG_C="${PG_CONTAINER:-dockpanel-app-postgres-majlisstv}"
n_ok=0; n_warn=0
ok()   { n_ok=$((n_ok + 1)); echo "  OK        $*"; }
warn() { n_warn=$((n_warn + 1)); echo "  ATTENTION $*"; }
info() { echo "  INFO      $*"; }
has()  { command -v "$1" >/dev/null 2>&1; }

echo "Contrôle de sécurité Mejliss TV — $(date '+%Y-%m-%d %H:%M:%S')"

echo; echo "== 1. Système"
if has apt-get; then
  sec=$(apt-get -s -o Debug::NoLocking=true upgrade 2>/dev/null | grep -c '^Inst.*-security' || true)
  all=$(apt-get -s -o Debug::NoLocking=true upgrade 2>/dev/null | grep -c '^Inst' || true)
  [ "${sec:-0}" = 0 ] && ok "aucune mise à jour de sécurité en attente ($all mise(s) à jour ordinaire(s))" || warn "$sec mise(s) à jour de SÉCURITÉ en attente (sur $all) : apt update && apt upgrade"
fi
[ -f /var/run/reboot-required ] && warn "redémarrage du serveur demandé par une mise à jour (noyau ou bibliothèque)" || ok "pas de redémarrage en attente"
if dpkg -l unattended-upgrades 2>/dev/null | grep -q '^ii'; then
  grep -qs 'Unattended-Upgrade "1"' /etc/apt/apt.conf.d/20auto-upgrades && ok "mises à jour de sécurité automatiques actives" || warn "unattended-upgrades installé mais pas activé (/etc/apt/apt.conf.d/20auto-upgrades)"
else warn "mises à jour de sécurité automatiques absentes (paquet unattended-upgrades)"; fi

echo; echo "== 2. Accès SSH"
if has sshd; then
  eff=$(sshd -T 2>/dev/null)
  v() { echo "$eff" | awk -v k="$1" '$1==k{print $2; exit}'; }
  pr=$(v permitrootlogin); pa=$(v passwordauthentication); port=$(v port)
  info "port SSH : ${port:-?}"
  [ "$pa" = "no" ] && ok "connexion par mot de passe désactivée (clés seulement)" || warn "connexion SSH par MOT DE PASSE autorisée (passwordauthentication $pa) : préférer les clés"
  case "$pr" in no) ok "root ne peut pas se connecter en SSH";; prohibit-password|without-password) ok "root : connexion par clé seulement";; *) warn "root peut se connecter en SSH par mot de passe (permitrootlogin $pr)";; esac
fi
if has fail2ban-client; then
  fail2ban-client status sshd >/dev/null 2>&1 && ok "fail2ban surveille SSH ($(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/{gsub(/ /,"",$2); print $2}') adresse(s) bannie(s) en ce moment)" || warn "fail2ban installé mais la surveillance de SSH n'est pas active"
else warn "fail2ban absent : rien ne bloque les essais répétés de connexion SSH"; fi

echo; echo "== 3. Pare-feu et ports ouverts sur Internet"
if has ufw; then
  ufw status 2>/dev/null | grep -q "Status: active" && ok "pare-feu ufw actif" || warn "pare-feu ufw inactif"
else info "ufw absent (le pare-feu peut être chez l'hébergeur ou dans iptables / nftables)"; fi
# Docker publie ses ports en contournant ufw : on regarde ce qui écoute réellement sur toutes les interfaces.
pub=$(ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -E '^(0\.0\.0\.0|\*|\[::\]):' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un | tr '\n' ' ')
info "ports qui écoutent sur toutes les interfaces : ${pub:-aucun}"
for p in $pub; do
  case "$p" in 22|80|443) ;; *)
    who=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E "0\.0\.0\.0:$p->|:::$p->" | awk '{print $1}' | head -1)
    proc=$(ss -H -ltnp 2>/dev/null | grep -E "[:.]$p " | grep -o 'users:(("[^"]*"' | head -1 | sed 's/users:(("//;s/"//')
    warn "port $p ouvert sur toutes les interfaces (${who:-${proc:-processus inconnu}}) : joignable depuis Internet si aucun pare-feu ne le ferme" ;;
  esac
done
[ -z "$(echo "$pub" | tr ' ' '\n' | grep -vE '^(22|80|443)?$')" ] && ok "seuls SSH, HTTP et HTTPS écoutent sur toutes les interfaces"
# Vérité depuis l'extérieur : le serveur se joint lui-même par son adresse publique (un pare-feu d'hébergeur n'est pas vu d'ici).
myip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
info "adresse publique du serveur : ${myip:-?} (le test ci-dessus se fait depuis le serveur lui-même ; un pare-feu de l'hébergeur n'est pas visible d'ici)"

echo; echo "== 4. nginx et HTTPS"
vh=$(ls /etc/nginx/sites-enabled/*majlisstv* 2>/dev/null)
if [ -n "$vh" ]; then
  for f in $vh; do
    b=$(basename "$f")
    grep -qiE 'proxy_set_header\s+X-Forwarded-For' "$f" && ok "$b : transmet l'adresse du visiteur (X-Forwarded-For)" || warn "$b : X-Forwarded-For NON posé par nginx — l'API ne peut pas connaître l'adresse du visiteur ; dans ce cas mettre TRUST_PROXY=loopback sur majlistv-api et me prévenir"
  done
  nginx -T 2>/dev/null | grep -qE '^\s*server_tokens\s+off' && ok "version de nginx masquée (server_tokens off)" || info "version de nginx affichée dans les réponses (server_tokens off la masquerait ; sans gravité)"
fi
for d in "$SITE" "$API" "$S3"; do
  if has openssl; then
    end=$(echo | openssl s_client -servername "$d" -connect "$d:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$end" ]; then
      days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
      [ "$days" -gt 20 ] && ok "$d : certificat valable encore $days jours" || warn "$d : certificat expire dans $days jours"
    else warn "$d : certificat illisible"; fi
    for old in tls1 tls1_1; do
      echo | openssl s_client -"$old" -servername "$d" -connect "$d:443" >/dev/null 2>&1 && warn "$d : accepte encore l'ancien protocole $old"
    done
  fi
done
hdr() { curl -sS -m 15 -o /dev/null -D - "https://$1/" 2>/dev/null | tr -d '\r'; }
H=$(hdr "$SITE")
for h in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy; do
  echo "$H" | grep -qi "^$h:" && ok "site : en-tête $h présent" || warn "site : en-tête $h absent"
done
echo "$H" | grep -qi "^x-powered-by:" && info "site : en-tête X-Powered-By présent (sans gravité)"
code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://$SITE/"); case "$code" in 301|308) ok "http:// redirige vers https://";; *) warn "http://$SITE/ répond $code (redirection vers https attendue)";; esac

echo; echo "== 5. API : réglages (aucune valeur secrète n'est affichée)"
if docker inspect "$API_C" >/dev/null 2>&1; then
  envv() { docker exec "$API_C" printenv "$1" 2>/dev/null; }
  len=$(envv JWT_SECRET | tr -d '\n' | wc -c); [ "$len" -ge 32 ] && ok "JWT_SECRET : $len caractères" || warn "JWT_SECRET trop court ($len caractères ; 32 au moins)"
  for k in SETTINGS_KEY PRACTICE_KEY; do l=$(envv "$k" | tr -d '\n' | wc -c); [ "$l" -ge 24 ] && ok "$k : $l caractères" || warn "$k court ou absent ($l caractères)"; done
  al=$(envv ADMIN_PASSWORD | tr -d '\n' | wc -c); [ "$al" -ge 12 ] && ok "ADMIN_PASSWORD : $al caractères" || warn "ADMIN_PASSWORD court ($al caractères ; 12 au moins conseillés)"
  tp=$(envv TRUST_PROXY); info "TRUST_PROXY : ${tp:-(non réglé : valeur par défaut du code)}"
  rl=$(envv RATE_LIMIT_MAX); [ -z "$rl" ] && ok "RATE_LIMIT_MAX non réglé (100 requêtes par minute et par visiteur)" || warn "RATE_LIMIT_MAX=$rl (réglage prévu pour les tests ; à retirer en production)"
  for k in AUTH_RATE_MAX REPORT_RATE_MAX LOGIN_FAIL_MAX LINKINFO_ALLOW_PRIVATE; do [ -n "$(envv "$k")" ] && warn "$k est réglé en production (réglage de test : à retirer)"; done
  co=$(envv CORS_ORIGIN); case "$co" in *'*'*) warn "CORS_ORIGIN contient « * »";; '') warn "CORS_ORIGIN non réglé";; *) ok "CORS_ORIGIN limité à : $co";; esac
  uid=$(docker exec "$API_C" id -u 2>/dev/null); [ "${uid:-0}" != 0 ] && ok "l'API ne tourne pas en root (utilisateur $uid)" || warn "l'API tourne en root dans son conteneur"
  # Quelle adresse l'API voit-elle pour les visiteurs ? (une seule adresse privée pour tous = limites de débit communes à tous)
  ips=$(docker logs --tail 3000 "$API_C" 2>&1 | grep -o '"remoteAddress":"[^"]*"' | sort | uniq -c | sort -rn | head -5 | awk '{print $2" ×"$1}' | sed 's/"remoteAddress"://;s/"//g' | tr '\n' ' ')
  info "adresses de visiteurs retenues par l'API (3 000 dernières lignes du journal) : ${ips:-aucune} — une seule adresse privée (172.x, 10.x) pour presque tout = tous les visiteurs partagent les mêmes limites"
  # Le site appelle-t-il l'API par son adresse publique ? Alors l'adresse du serveur doit être de confiance, sinon elle remplace celle des visiteurs.
  wapi=$(docker exec "$WEB_C" printenv API_URL 2>/dev/null)
  case "$wapi" in https://*|http://*.*)
    if [ -n "${myip:-}" ] && ! echo "$tp" | grep -q "$myip"; then warn "le site appelle l'API par son adresse publique ($wapi) : régler TRUST_PROXY=loopback,uniquelocal,$myip sur majlistv-api, sinon les visiteurs du site portent tous l'adresse du serveur"
    else ok "adresse du serveur déclarée de confiance (TRUST_PROXY) : l'adresse des visiteurs du site arrive jusqu'à l'API"; fi ;;
  esac
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "https://$API/admin/users"); [ "$code" = 401 ] && ok "API : /admin/users sans connexion → 401" || warn "API : /admin/users sans connexion → $code (401 attendu)"
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"email":"controle@example.invalid","password":"x"}' "https://$API/auth/login"); case "$code" in 401|429) ok "API : connexion avec un compte inconnu → $code";; *) warn "API : connexion avec un compte inconnu → $code";; esac
else warn "conteneur $API_C introuvable"; fi
if docker inspect "$WEB_C" >/dev/null 2>&1; then
  uid=$(docker exec "$WEB_C" id -u 2>/dev/null); [ "${uid:-0}" != 0 ] && ok "le site ne tourne pas en root (utilisateur $uid)" || warn "le site tourne en root dans son conteneur"
fi

echo; echo "== 6. Base de données, recherche, stockage"
pgp=$(docker port "$PG_C" 2>/dev/null | tr '\n' ' ')
case "$pgp" in *0.0.0.0*|*':::'*) warn "PostgreSQL publié sur toutes les interfaces ($pgp) : la base ne doit pas être joignable depuis Internet";; '') ok "PostgreSQL : aucun port publié sur la machine";; *) ok "PostgreSQL publié en local seulement ($pgp)";; esac
for c in dockpanel-git-majlistv-search dockpanel-git-majlistv-storage dockpanel-git-majlistv-worker dockpanel-git-majlistv-transcriber dockpanel-git-majlistv-translator dockpanel-git-majlistv-dubbing; do
  pp=$(docker port "$c" 2>/dev/null | grep -E '0\.0\.0\.0|:::' | tr '\n' ' ')
  [ -n "$pp" ] && warn "$c : port publié sur toutes les interfaces ($pp)" || ok "$c : pas de port ouvert sur Internet"
done
priv=$(docker ps -q 2>/dev/null | xargs -r docker inspect --format '{{.Name}} {{.HostConfig.Privileged}}' 2>/dev/null | awk '$2=="true"{print $1}' | tr '\n' ' ')
[ -z "$priv" ] && ok "aucun conteneur en mode privilégié" || warn "conteneur(s) en mode privilégié : $priv"
sock=$(docker ps -q 2>/dev/null | xargs -r docker inspect --format '{{.Name}} {{range .Mounts}}{{.Source}} {{end}}' 2>/dev/null | grep 'docker.sock' | awk '{print $1}' | tr '\n' ' ')
[ -z "$sock" ] && ok "aucun conteneur n'a accès à Docker (docker.sock)" || info "conteneur(s) avec accès à Docker (normal pour un panneau comme DockPanel) : $sock"

echo; echo "== 7. Sauvegardes"
[ -x /root/verify-deploy.sh ] && info "l'état de la dernière sauvegarde est donné par : bash /root/verify-deploy.sh (section 6)"
ls /root/.ssh/authorized_keys >/dev/null 2>&1 && info "clés SSH autorisées pour root : $(grep -cvE '^\s*(#|$)' /root/.ssh/authorized_keys) (vérifier qu'elles sont toutes à vous)"

echo; echo "== Résumé : $n_ok OK, $n_warn attention"
