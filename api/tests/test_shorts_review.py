"""Validation des shorts avant publication (23/11) : réglage shorts_review. Sans validation : l'organisateur publie directement (comportement d'avant).
Avec validation : « publié » devient « pending » pour un organisateur, le personnel publie directement ; seul un modérateur / administrateur relit
(valider = publié, refuser = brouillon avec motif obligatoire) ; retoucher le titre d'un short publié le remet en attente ; le fil public ne montre
jamais un short en attente. Les shorts sont insérés directement en base (pas de S3). Prérequis : API (3055), PG (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks, shorts = [], [], []
cur.execute("select value from app_settings where key='shorts_review'"); was = cur.fetchone()


def cleanup():
    for s in shorts: cur.execute("delete from public_shorts where id=%s", (s,))
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    if was: cur.execute("update app_settings set value=%s where key='shorts_review'", (was[0],))
    else: cur.execute("delete from app_settings where key='shorts_review'")


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def login(email):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test" if "admin" not in email else "AdminPassw0rd-test"}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)


def member(role, label):
    email = f"shr-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]; users.append(uid)
    return login(email), uid


def review(on):
    requests.put(B + "/admin/settings", json={"values": {"shorts_review": "true" if on else "false"}}, headers=ADM)


def short(talk_id, owner, status="draft", title="Court"):
    cur.execute("""insert into public_shorts(talk_id, title, video_key, duration_s, bytes, status, published_at, created_by)
                   values (%s,%s,%s,12,1000,%s, case when %s='published' then now() end, %s) returning id""",
                (talk_id, title, f"shorts/{tag}-{uuid.uuid4().hex[:4]}.mp4", status, status, owner))
    s = str(cur.fetchone()[0]); shorts.append(s); return s


def state(s):
    cur.execute("select status, review_note, submitted_at is not null from public_shorts where id=%s", (s,)); return cur.fetchone()


ADM = login("admin@test.local")
ORG, oid = member("organizer", "orga"); MOD, mid = member("moderator", "modo"); ORG2, _ = member("organizer", "orgb")
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,show_adults)
               values (%s,'d',%s,'upload',%s,%s,'published','ready','free',300,true) returning id""", (f"Talk {tag}", f"Cheikh Rv{tag}", f"talks/{tag}", oid))
T = str(cur.fetchone()[0]); talks.append(T)

# --- Validation désactivée : comportement d'avant
review(False)
s1 = short(T, oid)
r = requests.put(f"{B}/studio/shorts/{s1}", json={"status": "published"}, headers=ORG)
ok(r.status_code == 200 and r.json()["status"] == "published", "validation coupée : l'organisateur publie directement")

# --- Validation activée
review(True)
s2 = short(T, oid)
r = requests.get(B + "/studio/shorts", headers=ORG).json()
ok(r["review"] is True and r["canReview"] is False, "la liste indique que la validation est active (organisateur : pas relecteur)")
r = requests.put(f"{B}/studio/shorts/{s2}", json={"status": "published"}, headers=ORG)
ok(r.status_code == 200 and r.json()["status"] == "pending" and state(s2)[0] == "pending" and state(s2)[2], "organisateur : « publié » devient « en attente de validation »")
ok(s2 not in [x["id"] for x in requests.get(B + "/shorts?limit=30").json()], "le fil public ne montre pas un short en attente")
ok(requests.put(f"{B}/studio/shorts/{s2}", json={"status": "pending"}, headers=ORG).status_code == 400, "le statut « pending » ne peut pas être demandé directement")
ok(requests.post(f"{B}/studio/shorts/{s2}/review", json={"decision": "approve"}, headers=ORG).status_code == 403, "un organisateur ne peut pas relire")
ok(requests.post(f"{B}/studio/shorts/{s2}/review", json={"decision": "approve"}, headers=ORG2).status_code == 403, "un autre organisateur non plus")
r = requests.get(B + "/studio/shorts", headers=MOD).json()
mine = [x for x in r["shorts"] if x["id"] == s2]
ok(r["canReview"] is True and mine and mine[0]["status"] == "pending" and mine[0]["author"], "le modérateur voit la demande avec son auteur")
ok(r["shorts"][0]["id"] == s2 or r["shorts"][0]["status"] == "pending", "les shorts en attente sont en tête de liste")

# Refus : motif obligatoire, visible de l'auteur, retour en brouillon
ok(requests.post(f"{B}/studio/shorts/{s2}/review", json={"decision": "reject"}, headers=MOD).status_code == 400, "refus sans motif refusé")
r = requests.post(f"{B}/studio/shorts/{s2}/review", json={"decision": "reject", "note": "Son trop faible"}, headers=MOD)
ok(r.status_code == 200 and state(s2)[0] == "draft" and state(s2)[1] == "Son trop faible", "refus : brouillon + motif conservé")
mine = [x for x in requests.get(B + "/studio/shorts", headers=ORG).json()["shorts"] if x["id"] == s2]
ok(mine and mine[0]["reviewNote"] == "Son trop faible", "l'auteur voit le motif du refus")
ok(requests.post(f"{B}/studio/shorts/{s2}/review", json={"decision": "approve"}, headers=MOD).status_code == 409, "on ne relit pas un short qui n'est pas en attente")

# Nouvelle demande efface le motif ; retrait de la demande ; validation
requests.put(f"{B}/studio/shorts/{s2}", json={"status": "published"}, headers=ORG)
ok(state(s2)[0] == "pending" and state(s2)[1] is None, "nouvelle demande : motif effacé")
r = requests.put(f"{B}/studio/shorts/{s2}", json={"status": "draft"}, headers=ORG)
ok(r.json()["status"] == "draft", "l'organisateur retire sa demande")
requests.put(f"{B}/studio/shorts/{s2}", json={"status": "published"}, headers=ORG)
r = requests.post(f"{B}/studio/shorts/{s2}/review", json={"decision": "approve"}, headers=MOD)
cur.execute("select status, published_at is not null, reviewed_by from public_shorts where id=%s", (s2,)); row = cur.fetchone()
ok(r.status_code == 200 and row[0] == "published" and row[1] and str(row[2]) == str(mid), "validation : publié, date de publication et relecteur enregistrés")
ok(s2 in [x["id"] for x in requests.get(B + "/shorts?limit=30").json()], "le short validé apparaît dans le fil public")

# Retoucher le titre d'un short publié le remet en attente (sinon la validation serait contournée)
r = requests.put(f"{B}/studio/shorts/{s2}", json={"title": "Nouveau titre"}, headers=ORG)
ok(r.json()["status"] == "pending", "titre modifié par l'organisateur : retour en attente")
ok(s2 not in [x["id"] for x in requests.get(B + "/shorts?limit=30").json()], "…et retiré du fil public en attendant")

# Le personnel publie directement
s3 = short(T, oid)
r = requests.put(f"{B}/studio/shorts/{s3}", json={"status": "published"}, headers=MOD)
ok(r.json()["status"] == "published", "modérateur : publie directement")
s4 = short(T, oid)
r = requests.put(f"{B}/studio/shorts/{s4}", json={"status": "published"}, headers=ADM)
ok(r.json()["status"] == "published", "administrateur : publie directement")
r = requests.put(f"{B}/studio/shorts/{s3}", json={"title": "Renommé par le personnel"}, headers=MOD)
ok(r.json()["status"] == "published", "le personnel renomme sans repasser par la validation")

# Journal des actions
time.sleep(1)
cur.execute("select count(*) from audit_log where route='/studio/shorts/:id/review'"); ok(cur.fetchone()[0] >= 2, "relectures inscrites au journal des actions")

# Validation coupée à nouveau : un organisateur publie directement
review(False)
s5 = short(T, oid)
ok(requests.put(f"{B}/studio/shorts/{s5}", json={"status": "published"}, headers=ORG).json()["status"] == "published", "validation coupée de nouveau : publication directe")

cleanup()
print("TOUT EST BON", flush=True)
