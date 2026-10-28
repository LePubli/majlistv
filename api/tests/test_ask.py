"""41 : « Pose une question sur cette conférence » — palier, réponses sourcées, refus, plafonds, coût, fonction coupée, nettoyage.
Démarre sa propre copie de l'API (port 3066) branchée sur un FAUX serveur Claude local (port 3098) : aucun appel réel, aucune clé réelle.
Prérequis : PG de test (5544) ; les variables de l'API de test sont reprises de l'environnement (valeurs par défaut de la CI)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, threading, time, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT, MOCK = 3066, 3098
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "ASK_RATE_MAX": "1000", "ANTHROPIC_API_URL": f"http://127.0.0.1:{MOCK}/v1/messages",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        stop(); sys.exit(1)


# ---- Faux Claude : le comportement dépend d'un marqueur dans la question
SEEN = []


class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
        SEEN.append({"headers": dict(self.headers), "body": body})
        q = body["messages"][0]["content"].split("Viewer's question")[-1]
        first = 1
        if "mock-fail" in q:
            self.send_response(500); self.end_headers(); self.wfile.write(b'{"error":{"message":"boom"}}'); return
        if "mock-ruling" in q:
            inp = {"status": "religious_ruling", "answer": "C'est permis.", "passages": [first]}
        elif "mock-off" in q:
            inp = {"status": "off_topic", "answer": "", "passages": []}
        elif "mock-none" in q:
            inp = {"status": "not_in_talk", "answer": "", "passages": []}
        elif "mock-badcite" in q:
            inp = {"status": "answered", "answer": "Réponse sans source valide.", "passages": [9999]}
        else:
            inp = {"status": "answered", "answer": "Selon l'intervenant, la patience est essentielle.", "passages": [first]}
        out = json.dumps({"content": [{"type": "tool_use", "name": "answer", "input": inp}], "usage": {"input_tokens": 1200, "output_tokens": 80}}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(out)


srv = HTTPServer(("127.0.0.1", MOCK), Mock)
threading.Thread(target=srv.serve_forever, daemon=True).start()

LOG = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
proc = subprocess.Popen(["node", "src/index.js"], cwd=API_DIR, env=ENV, stdout=LOG, stderr=subprocess.STDOUT)


def stop():
    proc.terminate()
    srv.shutdown()


for _ in range(60):
    try:
        if requests.get(B + "/health", timeout=1).status_code == 200:
            break
    except Exception:
        time.sleep(0.5)
else:
    print("FAIL l'API de test ne démarre pas"); print(open(LOG.name).read()[-1500:]); stop(); sys.exit(1)


def b64(x):
    return base64.urlsafe_b64encode(x).decode().rstrip("=")


def token(uid, role="user"):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); p = b64(json.dumps({"sub": str(uid), "role": role, "iat": int(time.time())}).encode())
    return {"authorization": "Bearer " + h + "." + p + "." + b64(hmac.new(ENV["JWT_SECRET"].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())}


def member(tier=None, locale="fr"):
    cur.execute("insert into users(email, password_hash, name, role, locale) values (%s,'x','Membre','user',%s) returning id", (f"ask-{uuid.uuid4().hex[:8]}@test.local", locale)); uid = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:8], uid, tier))
    return token(uid), uid


cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ADM = token(aid, "admin")
L, lu = member("learning"); S, su = member("standard"); AR, aru = member("learning", "ar")
tag = uuid.uuid4().hex[:6]


def talk(title, segs=60, status="ready"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language) values (%s,'d','Cheikh Test','youtube','abc',%s,'published','ready','free',600,%s,'fr') returning id", (f"{title} {tag}", aid, status))
    tid = str(cur.fetchone()[0])
    for i in range(segs):
        cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (tid, i, i * 10000, i * 10000 + 9000, f"La patience est une vertu, segment {i}."))
    return tid


T = talk("Conférence sur la patience"); T0 = talk("Sans transcription", 0, "pending")
ask = lambda h, tid, q: requests.post(f"{B}/talks/{tid}/ask", headers=h, json={"question": q})

# Réglage de la clé (fausse) et des plafonds, via l'admin
r = requests.put(B + "/admin/settings", headers=ADM, json={"values": {"ask_daily_max": "4", "ask_global_daily_max": "1000"}}); ok(r.status_code == 200, "plafonds réglés")

# 1. Sans clé Claude : indisponible
r = requests.get(f"{B}/talks/{T}/ask", headers=L); ok(r.status_code == 200 and r.json()["available"] is False and r.json()["reason"] == "ask_unavailable", "sans clé Claude : assistant indisponible (état)")
ok(ask(L, T, "Que dit-il ?").status_code == 503, "sans clé Claude : question refusée proprement (503)")
r = requests.put(B + "/admin/settings", headers=ADM, json={"values": {"anthropic_key": "test-claude-key-not-real"}}); ok(r.status_code == 200, "clé de test enregistrée (chiffrée)")

# 2. Droits
ok(requests.post(f"{B}/talks/{T}/ask", json={"question": "Bonjour ?"}).status_code == 401, "connexion requise")
r = ask(S, T, "Que dit-il ?"); ok(r.status_code == 403 and r.json()["code"] == "learning_required", "abonnement standard : palier Apprentissage requis")
ok(requests.get(f"{B}/talks/{T}/ask", headers=S).status_code == 403, "état aussi réservé au palier")
ok(ask(L, str(uuid.uuid4()), "Que dit-il ?").status_code == 404, "conférence inconnue : 404")
r = ask(L, T0, "Que dit-il ?"); ok(r.status_code == 409 and r.json()["code"] == "no_transcript", "sans transcription : message clair")
ok(requests.get(f"{B}/talks/{T0}/ask", headers=L).json()["reason"] == "no_transcript", "état : pas de transcription")
ok(ask(L, T, "ab").status_code == 400 and ask(L, T, "x" * 500).status_code == 400, "question trop courte ou trop longue refusée")
ok(requests.get(f"{B}/talks/{T}/ask", headers=ADM).json()["available"] is True, "administrateur : accès (comme le palier)")

# 3. Réponse sourcée
SEEN.clear()
r = ask(L, T, "Que dit-il sur la patience ?"); j = r.json()
ok(r.status_code == 200 and j["status"] == "answered" and "patience" in j["answer"], "réponse obtenue")
ok(len(j["sources"]) == 1 and j["sources"][0]["startMs"] == 0 and "segment 0" in j["sources"][0]["text"], "source = texte réel de la transcription avec sa minute")
ok(j["remaining"] == 3 and j["dailyMax"] == 4, "compteur du jour : 3 restantes sur 4")
b = SEEN[0]["body"]
ok(SEEN[0]["headers"].get("x-api-key") == "test-claude-key-not-real" and b["tool_choice"]["name"] == "answer" and b["temperature"] == 0, "appel à Claude : clé, réponse forcée en outil, température 0")
ok("[1] (00:00)" in b["messages"][0]["content"] and "Que dit-il sur la patience" in b["messages"][0]["content"], "message : passages numérotés + question")
ok("untrusted" in b["system"] and "Que dit-il" not in b["system"], "la question n'entre jamais dans les consignes")
cur.execute("select status, tokens_in, tokens_out, model, lang from ask_log where user_id=%s", (lu,)); row = cur.fetchone()
ok(row == ("answered", 1200, 80, "claude-haiku-5-5", "fr"), "coût (jetons), modèle et langue journalisés")

# 4. Refus : textes fixes, jamais ceux de l'IA
r = ask(L, T, "mock-ruling est-ce halal ?").json(); ok(r["status"] == "religious_ruling" and "permis" not in r["answer"] and "savant" in r["answer"] and r["sources"] == [], "avis religieux : texte fixe, la réponse de l'IA est jetée")
r = ask(L, T, "mock-off recette de cuisine").json(); ok(r["status"] == "off_topic" and "ne concerne pas" in r["answer"], "hors sujet : texte fixe")
r = ask(L, T, "mock-badcite question").json(); ok(r["status"] == "not_in_talk" and r["sources"] == [] and "n'aborde pas" in r["answer"], "réponse sans passage valide : refusée")

# 5. Plafond par membre (4/jour)
r = ask(L, T, "Encore une question ?"); ok(r.status_code == 429 and r.json()["code"] == "ask_quota" and r.json()["remaining"] == 0, "plafond du jour atteint : 429")
ok(requests.get(f"{B}/talks/{T}/ask", headers=L).json()["remaining"] == 0, "état : 0 restante")
r = ask(AR, T, "Que dit-il sur la patience ?"); j = r.json(); ok(r.status_code == 200, "un autre membre n'est pas touché par ce plafond")
cur.execute("select lang from ask_log where user_id=%s", (aru,)); ok(cur.fetchone()[0] == "ar", "langue du membre (arabe) utilisée")
ok("Arabic" in SEEN[-1]["body"]["system"], "consigne : répondre en arabe")

# 6. Échec du modèle : non décompté
L2, l2u = member("learning")
r = ask(L2, T, "mock-fail question"); ok(r.status_code == 502 and r.json()["code"] == "ask_failed", "erreur du modèle : 502 clair")
cur.execute("select count(*) from ask_log where user_id=%s", (l2u,)); ok(cur.fetchone()[0] == 0, "question en échec non décomptée")
ok(requests.get(f"{B}/talks/{T}/ask", headers=L2).json()["remaining"] == 4, "compteur inchangé")

# 7. Plafond global
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"ask_global_daily_max": "1"}})
r = ask(L2, T, "Que dit-il ?"); ok(r.status_code == 429 and r.json()["code"] == "ask_busy", "plafond global atteint : l'assistant s'arrête pour tous")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"ask_global_daily_max": "1000"}})
ok(ask(L2, T, "Que dit-il ?").status_code == 200, "plafond global relevé : reprise")

# 8. Taille du contexte sur une longue conférence
TL = talk("Très longue conférence", 400)
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"ask_context_chars": "4000"}})
cur.execute("update talks set transcript_status='ready' where id=%s", (TL,))
SEEN.clear(); L3, _ = member("learning"); ask(L3, TL, "Que dit-elle sur la patience ?")
ok(len(SEEN[0]["body"]["messages"][0]["content"]) < 6500, "longue conférence : seule une partie (≈ 4 000 caractères) est envoyée")

# 9. Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ask": "false"}})
ok(ask(L3, T, "Que dit-il ?").status_code in (403, 404) and requests.get(f"{B}/talks/{T}/ask", headers=L3).status_code in (403, 404), "fonction coupée dans Admin → Fonctions : routes fermées")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ask": "true"}})

# 10. Nettoyage et suppression de compte
cur.execute("update ask_log set created_at = now() - interval '120 days' where user_id=%s", (lu,))
cur.execute("select count(*) from ask_log where user_id=%s", (lu,)); before = cur.fetchone()[0]
purge = subprocess.run(["node", "-e", "import('./src/modules/ask/routes.js').then(async m=>{console.log(await m.purgeAsk());process.exit(0)})"], cwd=API_DIR, env=ENV, capture_output=True, text=True)
cur.execute("select count(*) from ask_log where user_id=%s", (lu,)); after = cur.fetchone()[0]
ok(before >= 1 and after == 0, "questions de plus de 90 jours supprimées")
cur.execute("delete from users where id=%s", (aru,)); cur.execute("select count(*) from ask_log where user_id=%s", (aru,)); ok(cur.fetchone()[0] == 0, "suppression du compte : questions supprimées")

# Remise en état
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"anthropic_key": None, "ask_daily_max": None, "ask_global_daily_max": None, "ask_context_chars": None, "feat_ask": None}})
cur.execute("delete from talks where id = any(%s::uuid[])", ([T, T0, TL],))
stop()
print("\nTout est OK")
