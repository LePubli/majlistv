"""45B : socle Coran — ressources, import (contenu et adresse), lecteur, tafsir, recherche, droits, fonction coupée.
Données FICTIVES (aucun texte réel). Démarre sa propre API (port 3068) et un petit serveur local qui sert un fichier à importer.
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, threading, time, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT, FILES = 3068, 3097
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "QURAN_ALLOW_PRIVATE_URLS": "1",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()

TANZIL_TR = "# traduction fictive\n1|1|Premier verset un\n1|2|Deuxième verset un\n2|1|Verset de la sourate deux\n18|1|Verset <b>dix-huit</b> un\n"


class Files(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/tr.txt":
            body = TANZIL_TR.encode(); self.send_response(200); self.end_headers(); self.wfile.write(body)
        elif self.path == "/redir":
            self.send_response(302); self.send_header("location", "/tr.txt"); self.end_headers()
        else:
            self.send_response(404); self.end_headers()


srv = HTTPServer(("127.0.0.1", FILES), Files)
threading.Thread(target=srv.serve_forever, daemon=True).start()
LOG = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
proc = subprocess.Popen(["node", "src/index.js"], cwd=API_DIR, env=ENV, stdout=LOG, stderr=subprocess.STDOUT)


def stop():
    proc.terminate(); srv.shutdown()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        stop(); sys.exit(1)


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


cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ADM = token(aid, "admin")
cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"qr-{uuid.uuid4().hex[:8]}@test.local",)); uid = cur.fetchone()[0]
USR = token(uid)
cur.execute("delete from quran_resources"); cur.execute("delete from app_settings where key = 'feat_quran'")

# Rien d'importé : lecteur pas prêt
r = requests.get(B + "/quran/suras"); j = r.json()
ok(r.status_code == 200 and j["ready"] is False and len(j["suras"]) == 114 and j["suras"][17]["en"] == "Al-Kahf", "sans contenu : 114 sourates, lecteur « pas prêt »")
ok(requests.get(B + "/quran/suras/1").status_code == 404, "sourate sans texte : 404 clair")

# Droits
ok(requests.get(B + "/admin/quran/resources").status_code == 401 and requests.get(B + "/admin/quran/resources", headers=USR).status_code == 403, "admin : refusé sans connexion et aux membres")

meta = lambda **k: {**{"slug": "zt-ar", "kind": "text", "lang": "ar", "name": "Texte fictif", "author": "Auteur", "sourceUrl": "https://example.org/x", "license": "Licence fictive", "credit": "Crédit fictif", "enabled": False, "position": 0}, **k}
for bad, why in [({"slug": "Mauvais Slug"}, "identifiant invalide"), ({"kind": "autre"}, "type inconnu"), ({"lang": "francais"}, "langue invalide"), ({"name": "x"}, "nom trop court")]:
    ok(requests.post(B + "/admin/quran/resources", headers=ADM, json=meta(**bad)).status_code == 400, f"création refusée : {why}")
r = requests.post(B + "/admin/quran/resources", headers=ADM, json=meta()); ok(r.status_code == 200, "ressource texte créée"); AR = r.json()["id"]
ok(requests.post(B + "/admin/quran/resources", headers=ADM, json=meta()).status_code == 409, "identifiant en double refusé")
ok(requests.put(f"{B}/admin/quran/resources/{AR}", headers=ADM, json={k: v for k, v in meta(enabled=True).items() if k not in ("slug", "kind")}).status_code == 400, "activation refusée tant que rien n'est importé")

# Import par contenu : texte arabe fictif avec signes (recherche sans signes)
ar_lines = "1|1|نَصٌّ تَجْرِيبِيٌّ أَوَّل\n1|2|نَصٌّ ثَانٍ\n2|1|بَابٌ آخَر\n18|1|مِثَالٌ لِلْبَحْث\n18|2|وَآيَةٌ أُخْرَى\n"
r = requests.post(f"{B}/admin/quran/resources/{AR}/import", headers=ADM, json={"format": "tanzil", "content": ar_lines}); j = r.json()
ok(r.status_code == 200 and j["imported"] == 5 and j["suras"] == 3 and j["warning"], "import du texte : 5 versets, avertissement (total ≠ 6236)")
ok(requests.post(f"{B}/admin/quran/resources/{AR}/import", headers=USR, json={"format": "tanzil", "content": ar_lines}).status_code == 403, "import refusé à un membre")
ok(requests.post(f"{B}/admin/quran/resources/{AR}/import", headers=ADM, json={"format": "tanzil"}).status_code == 400, "import sans adresse ni contenu refusé")
ok(requests.post(f"{B}/admin/quran/resources/{AR}/import", headers=ADM, json={"format": "tanzil", "content": "n'importe quoi"}).status_code == 400, "fichier sans verset valide refusé (ancien contenu conservé)")
cur.execute("select count(*) from quran_verses where resource_id=%s", (AR,)); ok(cur.fetchone()[0] == 5, "l'échec n'a pas effacé le contenu")
body = {k: v for k, v in meta(enabled=True).items() if k not in ("slug", "kind")}
ok(requests.put(f"{B}/admin/quran/resources/{AR}", headers=ADM, json=body).status_code == 200, "texte activé")

# Traduction par adresse (redirection suivie)
r = requests.post(B + "/admin/quran/resources", headers=ADM, json=meta(slug="zt-fr", kind="translation", lang="fr", name="Traduction fictive", credit="Traducteur fictif", position=1)); FR = r.json()["id"]
r = requests.post(f"{B}/admin/quran/resources/{FR}/import", headers=ADM, json={"format": "tanzil", "url": f"http://127.0.0.1:{FILES}/redir"})
ok(r.status_code == 200 and r.json()["imported"] == 4, "import par adresse (avec redirection)")
ok(requests.post(f"{B}/admin/quran/resources/{FR}/import", headers=ADM, json={"format": "tanzil", "url": f"http://127.0.0.1:{FILES}/absent"}).status_code == 400, "adresse en erreur 404 : message clair")
requests.put(f"{B}/admin/quran/resources/{FR}", headers=ADM, json={k: v for k, v in meta(slug="zt-fr", lang="fr", name="Traduction fictive", credit="Traducteur fictif", position=1, enabled=True).items() if k not in ("slug", "kind")})
# Traduction anglaise en JSON, phonétique, tafsir
r = requests.post(B + "/admin/quran/resources", headers=ADM, json=meta(slug="zt-en", kind="translation", lang="en", name="Translation", position=2)); EN = r.json()["id"]
requests.post(f"{B}/admin/quran/resources/{EN}/import", headers=ADM, json={"format": "json", "content": json.dumps({"1": {"1": "First verse one"}, "18": ["Eighteen one"]})})
requests.put(f"{B}/admin/quran/resources/{EN}", headers=ADM, json={k: v for k, v in meta(slug="zt-en", lang="en", name="Translation", position=2, enabled=True).items() if k not in ("slug", "kind")})
r = requests.post(B + "/admin/quran/resources", headers=ADM, json=meta(slug="zt-ph", kind="transliteration", lang="fr", name="Phonétique fictive", position=3)); PH = r.json()["id"]
requests.post(f"{B}/admin/quran/resources/{PH}/import", headers=ADM, json={"format": "tanzil", "content": "1|1|fonétik un\n1|2|fonétik deux\n"})
requests.put(f"{B}/admin/quran/resources/{PH}", headers=ADM, json={k: v for k, v in meta(slug="zt-ph", lang="fr", name="Phonétique fictive", position=3, enabled=True).items() if k not in ("slug", "kind")})
r = requests.post(B + "/admin/quran/resources", headers=ADM, json=meta(slug="zt-tf", kind="tafsir", lang="fr", name="Tafsir fictif", position=4)); TF = r.json()["id"]
requests.post(f"{B}/admin/quran/resources/{TF}/import", headers=ADM, json={"format": "tanzil", "content": "18|1|<p>Commentaire du verset un.</p>\n18|2|Commentaire deux\n"})
requests.put(f"{B}/admin/quran/resources/{TF}", headers=ADM, json={k: v for k, v in meta(slug="zt-tf", lang="fr", name="Tafsir fictif", position=4, enabled=True).items() if k not in ("slug", "kind")})

# Liste et lecteur publics
j = requests.get(B + "/quran/suras").json()
ok(j["ready"] and j["suras"][0]["verses"] == 2 and j["suras"][17]["verses"] == 2 and j["suras"][4]["verses"] is None, "liste : lecteur prêt, nombre de versets d'après le texte")
res = requests.get(B + "/quran/resources").json()
ok([x["slug"] for x in res] == ["zt-ar", "zt-fr", "zt-en", "zt-ph", "zt-tf"] and res[0]["credit"] == "Crédit fictif" and res[0]["license"], "ressources publiques avec source, licence et crédit")
j = requests.get(B + "/quran/suras/1?lang=fr").json()
ok(len(j["verses"]) == 2 and j["verses"][0]["ar"].startswith("نَ") and j["verses"][0]["tr"] == "Premier verset un" and j["verses"][0]["ph"] == "fonétik un" and j["translation"]["slug"] == "zt-fr", "lecteur FR : arabe + traduction FR + phonétique")
j = requests.get(B + "/quran/suras/1?lang=en").json(); ok(j["verses"][0]["tr"] == "First verse one" and j["verses"][1]["tr"] is None, "lecteur EN : traduction anglaise par défaut (verset manquant = null)")
j = requests.get(B + "/quran/suras/1?lang=ar").json(); ok(j["translation"]["lang"] in ("fr", "en"), "langue sans traduction : repli sur la première")
j = requests.get(B + "/quran/suras/1?translation=none&translit=none").json(); ok("tr" not in j["verses"][0] and "ph" not in j["verses"][0] and j["translation"] is None, "traduction et phonétique désactivables (none)")
j = requests.get(B + "/quran/suras/1?translation=zt-en").json(); ok(j["verses"][0]["tr"] == "First verse one", "traduction choisie par identifiant")
ok(len(j["translations"]) == 2 and len(j["tafsirs"]) == 1 and j["tafsirs"][0]["slug"] == "zt-tf", "le lecteur liste les traductions et tafsirs disponibles")
ok(requests.get(B + "/quran/suras/5").status_code == 404 and requests.get(B + "/quran/suras/115").status_code == 400, "sourate sans texte : 404 ; numéro hors limites : 400")
j = requests.get(B + "/quran/tafsir/zt-tf/18").json()
ok([i["aya"] for i in j["items"]] == [1, 2] and j["items"][0]["text"] == "Commentaire du verset un." and j["resource"]["name"] == "Tafsir fictif", "tafsir d'une sourate (HTML nettoyé)")
ok(requests.get(B + "/quran/tafsir/zt-ar/18").status_code == 404 and requests.get(B + "/quran/tafsir/inconnu/18").status_code == 404, "tafsir : seulement les ressources de type tafsir")

# Recherche
j = requests.get(B + "/quran/search", params={"q": "تجريبي", "lang": "fr"}).json()["results"]
ok(len(j) == 1 and j[0]["sura"] == 1 and j[0]["aya"] == 1 and j[0]["tr"] == "Premier verset un", "recherche en arabe SANS signes dans un texte avec signes")
j = requests.get(B + "/quran/search", params={"q": "sourate deux"}).json()["results"]; ok(len(j) == 1 and j[0]["sura"] == 2 and j[0]["name"] == "Al-Baqara", "recherche dans la traduction")
j = requests.get(B + "/quran/search", params={"q": "fonétik"}).json()["results"]; ok(len(j) == 2, "recherche dans la phonétique")
ok(requests.get(B + "/quran/search", params={"q": "Commentaire"}).json()["results"] == [], "le tafsir n'est pas fouillé")
ok(requests.get(B + "/quran/search", params={"q": "%_"}).json()["results"] == [] and requests.get(B + "/quran/search", params={"q": "a"}).status_code == 400, "caractères spéciaux sans effet ; requête trop courte refusée")

# Désactiver une ressource la retire ; fonction coupée
requests.put(f"{B}/admin/quran/resources/{FR}", headers=ADM, json={k: v for k, v in meta(slug="zt-fr", lang="fr", name="Traduction fictive", position=1, enabled=False).items() if k not in ("slug", "kind")})
ok("zt-fr" not in [x["slug"] for x in requests.get(B + "/quran/resources").json()], "ressource désactivée : retirée du lecteur")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quran": "false"}})
ok(requests.get(B + "/quran/suras").status_code in (403, 404), "fonction coupée : le lecteur répond « indisponible »")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quran": "true"}})
ok(requests.get(B + "/quran/suras").status_code == 200, "fonction réactivée")

# Suppression et nettoyage
ok(requests.delete(f"{B}/admin/quran/resources/{TF}", headers=ADM).status_code == 200, "ressource supprimée")
cur.execute("select count(*) from quran_verses where resource_id=%s", (TF,)); ok(cur.fetchone()[0] == 0, "ses versets sont supprimés avec elle")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quran": None}})
cur.execute("delete from quran_resources"); cur.execute("delete from users where id=%s", (uid,))
stop(); print("quran OK")
