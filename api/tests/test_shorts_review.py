"""Validation des shorts avant publication (23/11) : réglage shorts_review. Sans validation : l'organisateur publie directement (comportement d'avant).
Avec validation : « publié » devient « pending » pour un organisateur, le personnel publie directement ; seul un modérateur / administrateur relit
(valider = publié, refuser = brouillon avec motif obligatoire) ; retoucher le titre d'un short publié le remet en attente ; le fil public ne montre
jamais un short en attente. Les shorts sont insérés directement en base (pas de S3). Prérequis : API (3055), PG (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks, shorts = [], [], []
cur.execute("select value from app_settings where key='shorts_review'"); was = cur.fetchone()
cur.execute("select key, value, is_secret from app_settings where key in ('smtp_host','mail_from')"); smtp_was = {r[0]: r for r in cur.fetchall()}


def cleanup():
    for s in shorts: cur.execute("delete from public_shorts where id=%s", (s,))
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users:
        cur.execute("delete from email_outbox where user_id=%s", (u,)); cur.execute("delete from users where id=%s", (u,))
    for k in ('smtp_host', 'mail_from'):
        if k not in smtp_was: cur.execute("delete from app_settings where key=%s", (k,))
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

# --- Notification de l'auteur (e-mail mis en file ; le push est couvert par test_shorts_review_texts.mjs, sans Firebase ici)
requests.put(B + "/admin/settings", json={"values": {"smtp_host": "127.0.0.1", "mail_from": "test@example.org", "smtp_port": "1"}}, headers=ADM)
review(True)
n1 = short(T, oid); n2 = short(T, oid); n3 = short(T, oid, title="Sera refusé")
for x in (n1, n2, n3): requests.put(f"{B}/studio/shorts/{x}", json={"status": "published"}, headers=ORG)
ok(all(state(x)[0] == "pending" for x in (n1, n2, n3)), "trois shorts en attente")
def outbox(kind):
    cur.execute("select count(*) from email_outbox where user_id=%s and kind=%s", (oid, kind)); return cur.fetchone()[0]
requests.post(f"{B}/studio/shorts/{n1}/review", json={"decision": "approve"}, headers=MOD)
ok(outbox("shorts_approved") == 1, "validation : e-mail à l'auteur mis en file")
requests.post(f"{B}/studio/shorts/{n3}/review", json={"decision": "reject", "note": "Image floue"}, headers=MOD)
cur.execute("select vars->>'note' from email_outbox where user_id=%s and kind='shorts_rejected'", (oid,)); row = cur.fetchone()
ok(row is not None and row[0] == "Image floue", "refus : e-mail à l'auteur avec le motif")
ok(requests.get(B + "/studio/shorts", headers=MOD).status_code == 200, "liste toujours lisible")

# --- Relecture en lot
b1 = short(T, oid); b2 = short(T, oid); b3 = short(T, oid); bdraft = short(T, oid, "draft")
for x in (b1, b2, b3): requests.put(f"{B}/studio/shorts/{x}", json={"status": "published"}, headers=ORG)
ok(requests.post(B + "/studio/shorts/review-batch", json={"ids": [b1], "decision": "approve"}, headers=ORG).status_code == 403, "lot : un organisateur ne peut pas")
ok(requests.post(B + "/studio/shorts/review-batch", json={"ids": [], "decision": "approve"}, headers=MOD).status_code == 400, "lot : liste vide refusée")
ok(requests.post(B + "/studio/shorts/review-batch", json={"ids": [b1, b2], "decision": "reject"}, headers=MOD).status_code == 400, "lot : refus sans motif refusé")
r = requests.post(B + "/studio/shorts/review-batch", json={"ids": [b1, b2, bdraft, str(uuid.uuid4())], "decision": "approve"}, headers=MOD).json()
ok(r["done"] == 2 and len(r["skipped"]) == 2, "lot : 2 validés, le brouillon et l'inconnu ignorés et listés")
ok(state(b1)[0] == "published" and state(b2)[0] == "published" and state(b3)[0] == "pending", "lot : seuls les shorts choisis ont changé")
before = outbox("shorts_approved")
r = requests.post(B + "/studio/shorts/review-batch", json={"ids": [b3], "decision": "reject", "note": "Hors sujet"}, headers=MOD).json()
ok(r["done"] == 1 and state(b3)[:2] == ("draft", "Hors sujet"), "lot : refus avec motif commun, brouillon")
ok(outbox("shorts_approved") == before, "lot : le refus ne crée pas d'e-mail de validation")
time.sleep(1)
cur.execute("select count(*) from audit_log where route='/studio/shorts/review-batch'"); ok(cur.fetchone()[0] >= 2, "lots inscrits au journal des actions")
# un relecteur qui valide son propre short ne se notifie pas lui-même
ms = short(T, mid); requests.put(f"{B}/studio/shorts/{ms}", json={"status": "pending"}, headers=MOD)
cur.execute("update public_shorts set status='pending' where id=%s", (ms,))
requests.post(f"{B}/studio/shorts/{ms}/review", json={"decision": "approve"}, headers=MOD)
cur.execute("select count(*) from email_outbox where user_id=%s and kind like 'shorts_%%'", (mid,)); ok(cur.fetchone()[0] == 0, "le relecteur n'est pas notifié de sa propre décision")

cleanup()
print("TOUT EST BON", flush=True)
