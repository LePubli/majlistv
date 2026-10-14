"""20 : modération — rôle modérateur, relecture, signalements, journal des actions.
Prérequis : API (3055, avec REPORT_RATE_MAX élevé), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def user(role="user"):
    email = f"mo-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Mo"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = str(cur.fetchone()[0])
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}, uid, email


def setting(k, v):
    requests.put(B + "/admin/settings", headers=ADM, json={"values": {k: v}}); time.sleep(0.2)


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:6]
mk = lambda h, n, pub="published": requests.post(B + "/talks", headers=h, json={"title": f"Conf modération {n} {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + n + "abcdefghi")[:11], "rightsConfirmed": True, "publication": pub}).json()["id"]
status = lambda tid: cur.execute("select review_status, publication from talks where id=%s", (tid,)) or cur.fetchone()
setting("review_required", "false")

O1, o1, o1mail = user("organizer"); O2, o2, _ = user("organizer"); MOD, mid, _ = user(); U, uid, _ = user(); U2, u2, _ = user()

# --- rôle modérateur (attribué par l'administrateur)
ok(requests.patch(f"{B}/admin/users/{mid}/role", headers=ADM, json={"role": "moderator"}).status_code == 200, "l'administrateur donne le rôle modérateur")
ok(requests.get(B + "/admin/users", headers=MOD).status_code == 403, "le modérateur n'a pas accès à l'administration")
ok(requests.get(B + "/moderation/summary", headers=MOD).status_code == 200 and requests.get(B + "/moderation/summary", headers=U).status_code == 403
   and requests.get(B + "/moderation/summary").status_code in (401, 403), "file de modération : modérateur et admin seulement")
ok(requests.get(B + "/admin/audit", headers=MOD).status_code == 403, "le journal est réservé à l'administrateur")

# --- sans relecture (défaut) : rien ne change
t0 = mk(O1, "a")
ok(status(t0) == ("none", "published") and requests.get(f"{B}/talks/{t0}").status_code == 200, "relecture désactivée : conférence en ligne tout de suite")

# --- relecture activée
setting("review_required", "true")
t1 = mk(O1, "b"); t2 = mk(O1, "c", "draft"); t3 = mk(O2, "d")
ok(status(t1)[0] == "pending" and requests.get(f"{B}/talks/{t1}").status_code == 404, "organisateur externe : conférence publiée → en attente, invisible du public")
ok(status(t2)[0] == "none", "brouillon : pas de relecture")
requests.patch(f"{B}/talks/{t2}", headers=O1, json={"publication": "published"})
ok(status(t2)[0] == "pending", "brouillon publié ensuite → en attente")
ok(status(t0)[0] == "none" and requests.get(f"{B}/talks/{t0}").status_code == 200, "les conférences déjà en ligne ne sont pas touchées")
mine = {x["id"]: x for x in requests.get(B + "/me/talks", headers=O1).json()}
ok(mine[t1]["reviewStatus"] == "pending" and mine[t1]["visible"] is False, "l'organisateur voit « en attente » dans le Studio")
ok(requests.get(f"{B}/talks/{t1}", headers=O1).status_code == 200, "le propriétaire voit sa conférence en attente")
ok(requests.get(f"{B}/talks/{t1}", headers=MOD).status_code == 200 and requests.get(f"{B}/talks/{t1}", headers=U).status_code == 404, "le modérateur peut la prévisualiser, un membre non")
cur.execute("update users set trusted_publisher=true where id=%s", (o2,))
t4 = mk(O2, "e")
ok(status(t4)[0] == "none", "organisateur de confiance : pas de relecture")
ok(requests.patch(f"{B}/admin/users/{o2}", headers=ADM, json={"trustedPublisher": False}).status_code == 200
   and [u for u in requests.get(B + "/admin/users", headers=ADM, params={"q": o2[:0] or "mo-"}).json()["users"] if u["id"] == o2][0]["trustedPublisher"] is False, "l'administrateur règle « de confiance » (liste des utilisateurs)")
ta = mk(ADM, "f")
ok(status(ta)[0] == "none", "conférence d'un administrateur : pas de relecture")

# --- file et décisions
q = requests.get(B + "/moderation/queue", headers=MOD).json()["items"]
ids = [x["id"] for x in q]
ok(t1 in ids and t2 in ids and t0 not in ids and q[0]["organizerEmail"], "file : les conférences en attente avec leur organisateur")
D = lambda tid, body, h=None: requests.post(f"{B}/moderation/talks/{tid}/decision", headers=h or MOD, json=body)
ok(D(t1, {"decision": "reject"}).status_code == 400 and D(t1, {"decision": "reject", "note": "non"}).status_code == 400, "refus sans motif : refusé")
ok(D(t1, {"decision": "approve"}, U).status_code == 403, "un membre ne peut pas décider")
r = D(t1, {"decision": "reject", "note": "Le titre ne correspond pas à la vidéo"})
ok(r.status_code == 200 and status(t1)[0] == "rejected" and requests.get(f"{B}/talks/{t1}").status_code == 404, "refus avec motif : conférence refusée, toujours invisible")
cur.execute("select count(*) from email_outbox where kind='review_rejected' and to_email=%s", (o1mail,)); n = cur.fetchone()[0]
ok(n == 1, "e-mail de refus envoyé à l'organisateur")
mine = {x["id"]: x for x in requests.get(B + "/me/talks", headers=O1).json()}
ok(mine[t1]["reviewStatus"] == "rejected" and "titre" in mine[t1]["reviewNote"], "l'organisateur lit le motif dans le Studio")
ok(D(t1, {"decision": "reject", "note": "encore une fois"}).status_code == 409, "déjà refusée : 409")
ok(requests.post(f"{B}/talks/{t1}/review/submit", headers=O2).status_code == 404, "un autre organisateur ne peut pas renvoyer")
r = requests.post(f"{B}/talks/{t1}/review/submit", headers=O1)
ok(r.status_code == 200 and status(t1)[0] == "pending", "l'organisateur corrige et renvoie à la relecture")
ok(requests.post(f"{B}/talks/{t1}/review/submit", headers=O1).status_code == 409, "renvoi impossible si pas refusée")
ok(D(t1, {"decision": "approve", "note": "Merci"}).status_code == 200 and status(t1)[0] == "approved" and requests.get(f"{B}/talks/{t1}").status_code == 200, "validée : conférence en ligne")
cur.execute("select count(*) from email_outbox where kind='review_approved' and to_email=%s", (o1mail,)); ok(cur.fetchone()[0] == 1, "e-mail de validation envoyé")
ok(D(t1, {"decision": "approve"}).status_code == 409, "valider une conférence déjà validée : 409")
# republier un brouillon refusé
D(t2, {"decision": "reject", "note": "Description absente"})
requests.patch(f"{B}/talks/{t2}", headers=O1, json={"publication": "draft"})
ok(status(t2) == ("rejected", "draft"), "brouillon refusé reste refusé")
requests.patch(f"{B}/talks/{t2}", headers=O1, json={"publication": "published"})
ok(status(t2)[0] == "pending", "republier une conférence refusée la renvoie en relecture")
# listes publiques
home = requests.get(B + "/talks").json()
items = home if isinstance(home, list) else home.get("items", home.get("talks", []))
ok(t2 not in [x["id"] for x in items] and t1 in [x["id"] for x in items], "liste publique : seule la conférence validée apparaît")

# --- signalements
R = f"{B}/talks/{t1}/report"
ok(requests.post(R, json={"reason": "autre"}).status_code == 400, "motif inconnu refusé")
ok(requests.post(f"{B}/talks/{t2}/report", json={"reason": "other"}).status_code == 404, "conférence invisible : on ne peut pas la signaler")
r = requests.post(R, json={"reason": "copyright", "details": "Cette vidéo appartient à un tiers"})
ok(r.status_code == 201, "visiteur sans compte : signalement accepté")
ok(requests.post(R, headers=U, json={"reason": "misleading"}).status_code == 201, "membre : signalement accepté")
r = requests.post(R, headers=U, json={"reason": "misleading"})
ok(r.status_code == 200 and r.json().get("duplicate") is True, "même membre, même conférence : pas de doublon")
ok(requests.post(R, headers=U2, json={"reason": "inappropriate", "details": "x" * 1001}).status_code == 400, "détails de plus de 1000 caractères refusés")
ok(requests.post(R, headers=U2, json={"reason": "doctrinal"}).status_code == 201, "autre membre : signalement accepté")
rep = requests.get(B + "/moderation/reports", headers=MOD).json()["items"]
mine_r = [x for x in rep if x["talkId"] == t1]
ok(len(mine_r) == 3 and mine_r[0]["openOnTalk"] == 3 and any(x["reporterEmail"] is None for x in mine_r), "file des signalements : 3 ouverts, un anonyme")
ok(requests.get(B + "/moderation/reports", headers=U).status_code == 403, "signalements : réservés à l'équipe")
RS = lambda rid, body: requests.post(f"{B}/moderation/reports/{rid}/resolve", headers=MOD, json=body)
ok(RS(mine_r[0]["id"], {"action": "dismiss", "note": "Faux signalement"}).json()["status"] == "dismissed", "classer sans suite")
ok(RS(mine_r[0]["id"], {"action": "dismiss"}).status_code == 409, "signalement déjà traité : 409")
ok(RS(mine_r[1]["id"], {"action": "unpublish"}).status_code == 400, "retrait sans motif refusé")
ok(RS(mine_r[1]["id"], {"action": "unpublish", "note": "Contenu protégé par des droits"}).json()["status"] == "actioned" and status(t1)[0] == "rejected" and requests.get(f"{B}/talks/{t1}").status_code == 404, "retrait : conférence retirée du public")
left = [x for x in requests.get(B + "/moderation/reports", headers=MOD).json()["items"] if x["talkId"] == t1]
ok(left == [], "retrait : tous les signalements ouverts de la conférence sont réglés")
done = requests.get(B + "/moderation/reports?status=handled", headers=MOD).json()["items"]
ok(len([x for x in done if x["talkId"] == t1]) == 3 and {x["status"] for x in done if x["talkId"] == t1} == {"dismissed", "actioned"}, "historique des signalements traités")
ok("droits" in {x["id"]: x for x in requests.get(B + "/me/talks", headers=O1).json()}[t1]["reviewNote"], "l'organisateur lit le motif du retrait")

# --- journal
A = requests.get(B + "/admin/audit?days=1&limit=500", headers=ADM).json()
rows = A["items"]
ok(any(r["route"] == "PATCH /admin/users/:id/role".split(" ", 1)[1] and f"id={mid}" in r["target"] for r in rows), "journal : changement de rôle enregistré")
ok(any(r["actorRole"] == "moderator" and "refusée" in r["summary"].lower() or "retirée" in r["summary"] for r in rows), "journal : décisions du modérateur avec leur motif")
requests.post(f"{B}/admin/users/{uid}/password", headers=ADM, json={"password": "Secret-Tres-Long-9876"})
rows = requests.get(B + "/admin/audit?days=1&q=password&limit=50", headers=ADM).json()["items"]
ok(rows and "password" in rows[0]["fields"] and "Secret-Tres-Long" not in str(rows), "journal : le champ « password » est noté, jamais sa valeur")
requests.patch(f"{B}/talks/{t1}", headers=ADM, json={"access": "premium"})
rows = requests.get(B + "/admin/audit?days=1&q=talks&limit=50", headers=ADM).json()["items"]
ok(any(r["method"] == "PATCH" and r["route"] == "/talks/:id" and r["actorRole"] == "admin" and f"id={t1}" in r["target"] for r in rows), "journal : l'administrateur modifie une conférence")
before = requests.get(B + "/admin/audit?days=1&limit=1", headers=ADM).json()["total"]
requests.get(B + "/admin/users", headers=ADM); requests.get(f"{B}/talks/{t1}", headers=ADM); requests.put(f"{B}/me/learning/prefs", headers=ADM, json={})
ok(requests.get(B + "/admin/audit?days=1&limit=1", headers=ADM).json()["total"] == before, "journal : lectures et gestes personnels non enregistrés")
ok(requests.patch(f"{B}/talks/{t1}", headers=O1, json={"title": "Titre modifié"}).status_code == 200
   and not any(r["actorId"] == o1 for r in requests.get(B + "/admin/audit?days=1&limit=500", headers=ADM).json()["items"]), "journal : les actions d'un organisateur ne sont pas dedans")
ok(requests.get(B + f"/admin/audit?days=1&role=moderator", headers=ADM).json()["items"] and all(x["actorRole"] == "moderator" for x in requests.get(B + "/admin/audit?days=1&role=moderator", headers=ADM).json()["items"]), "journal : filtre par rôle")
c = requests.get(B + "/admin/audit?days=1&format=csv", headers=ADM)
ok(c.status_code == 200 and "Date;Qui" in c.text and "text/csv" in c.headers["content-type"], "journal : export CSV")
cur.execute("select count(*) from audit_log where fields @> ARRAY['password'] and summary like '%Secret%'"); ok(cur.fetchone()[0] == 0, "base : aucune valeur sensible dans le journal")
cur.execute("update users set role='user' where id=%s", (o1,))
cur.execute("update app_settings set value='false' where key='review_required'")  # direct : la limite de requêtes ne doit pas laisser le réglage activé
print("TOUT EST OK")
