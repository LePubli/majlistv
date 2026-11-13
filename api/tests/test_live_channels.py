"""Chaînes TV en direct 24 h/24 (module « Événements en direct » 1.1, fonction « livetv ») : gestion, page publique, recherche du
direct en cours par le transcripteur (yt-dlp simulé), fonction coupée. Prérequis : API :3055 et Postgres :5544 (comme la suite CI)."""
import os, sys, uuid
import psycopg2, psycopg2.extras, requests
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "transcriber", "src"))
import live_channels  # noqa: E402

B = os.environ.get("API", "http://127.0.0.1:3055")
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails += 1
def login(e, p): return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test"); tag = uuid.uuid4().hex[:6]
em = f"lv-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Membre"})
U = login(em, "Passw0rd-test")
db = psycopg2.connect(os.environ.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis")); db.autocommit = True
def q(sql, params=None, fetch=False):
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
        c.execute(sql, params)
        return c.fetchall() if fetch else c.rowcount
q("DELETE FROM live_channels")
S = B + "/studio/live"

# 1. Gestion (administrateur seulement), liens acceptés
ok(requests.get(S, headers=U).status_code == 403 and requests.post(S, headers=U, json={"name": "x", "url": "https://www.youtube.com/@x"}).status_code == 403, "gestion réservée à l'administration")
r = requests.post(S, headers=A, json={"name": "La Mecque", "url": "https://youtube.com/@MaChaineMecque/live"}); ok(r.status_code == 201 and r.json()["url"] == "https://www.youtube.com/@MaChaineMecque", f"lien de chaîne normalisé ({r.text[:120]})")
mk = r.json()["id"]
r = requests.post(S, headers=A, json={"name": "Médine", "url": "https://youtu.be/AbCdEfGhIjK", "position": 10}); ok(r.status_code == 201 and r.json()["url"] == "https://www.youtube.com/watch?v=AbCdEfGhIjK", "lien d'un direct accepté")
md = r.json()["id"]
for bad in ["https://evil.example/@x", "javascript:alert(1)", "https://www.youtube.com/results?search_query=x"]:
    ok(requests.post(S, headers=A, json={"name": "x", "url": bad}).status_code == 400, f"lien refusé : {bad}")
ok(requests.post(S, headers=A, json={"name": "", "url": "https://www.youtube.com/@x"}).status_code == 400, "nom obligatoire")
ok(requests.get(B + "/live").json()["channels"] == [], "public : rien tant que le direct n'a pas été trouvé")

# 2. Le transcripteur retrouve le direct (yt-dlp simulé)
seen = []
def fake(url, opts):
    seen.append(url)
    if "MaChaineMecque" in url: return {"id": "MeccaLive01", "is_live": True, "title": "Makkah Live"}
    raise Exception("ERROR: [youtube] AbCdEfGhIjK: This live event has ended.")
log = []
ok(live_channels.run_once(q, {}, log.append, fetch=fake) == 2, "deux chaînes vérifiées")
ok("https://www.youtube.com/@MaChaineMecque/live" in seen and "https://www.youtube.com/watch?v=AbCdEfGhIjK" in seen, f"chaîne → page /live ; lien d'un direct → la vidéo ({seen})")
pub = requests.get(B + "/live").json()["channels"]
ok(len(pub) == 1 and pub[0] == {"id": mk, "name": "La Mecque", "live": True, "video": {"source": "youtube", "ref": "MeccaLive01"}, "title": "Makkah Live"}, f"public : chaîne en direct ({pub})")
adm = {c["id"]: c for c in requests.get(S, headers=A).json()["channels"]}
ok(adm[md]["error"] and adm[md]["checkedAt"] and not adm[md]["live"], "échec noté pour l'administrateur")
ok(live_channels.run_once(q, {}, log.append, fetch=fake) == 0, "pas de nouvelle vérification avant 15 minutes")
ok(requests.post(f"{S}/{mk}/check", headers=A).status_code == 202 and live_channels.run_once(q, {}, log.append, fetch=lambda u, o: (_ for _ in ()).throw(Exception("ERROR: Sign in to confirm you're not a bot"))) == 1, "« Vérifier maintenant »")
pub = requests.get(B + "/live").json()["channels"]
ok(len(pub) == 1 and pub[0]["video"]["ref"] == "MeccaLive01" and pub[0]["live"] is False, "échec de vérification : identifiant connu gardé (lecteur toujours là)")
ok(q("SELECT error FROM live_channels WHERE id = %s", (mk,), fetch=True)[0]["error"].startswith("YouTube bloque"), "blocage YouTube : message lisible")

# 3. Modifier, masquer, ordre, supprimer
ok(requests.patch(f"{S}/{mk}", headers=A, json={"enabled": False}).json()["enabled"] is False and requests.get(B + "/live").json()["channels"] == [], "chaîne masquée : plus affichée")
r = requests.patch(f"{S}/{mk}", headers=A, json={"enabled": True, "url": "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"}).json()
ok(r["url"] == "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv" and r["video"] is None and r["checkedAt"] is None, "nouveau lien : direct recherché à nouveau")
ok(requests.patch(f"{S}/{mk}", headers=A, json={"url": "https://x.example"}).status_code == 400, "nouveau lien invalide refusé")
ok(requests.patch(f"{S}/{mk}", headers=A, json={"position": 50}).json()["position"] == 50 and [c["id"] for c in requests.get(S, headers=A).json()["channels"]] == [md, mk], "ordre d'affichage")
ok(requests.delete(f"{S}/{md}", headers=A).status_code == 200 and requests.delete(f"{S}/{md}", headers=A).status_code == 404, "suppression")
cur = db.cursor(); cur.execute("select summary from audit_log where summary like %s", ("Direct : chaîne « La Mecque »%",)); ok(cur.fetchone() is not None, "journal d'audit")

# 4. Fonction coupée
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_livetv": "false"}})
ok(requests.get(B + "/live").status_code in (403, 404) and requests.get(S, headers=A).status_code in (403, 404), "fonction coupée (Admin → Fonctions) : routes fermées")
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_livetv": None}})
ok(requests.get(B + "/live").status_code == 200, "fonction rétablie")
q("DELETE FROM live_channels")
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
