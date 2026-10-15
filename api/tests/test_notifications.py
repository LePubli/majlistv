"""21 (e-mails) : suivre un intervenant, préférences, désinscription en un clic, en-têtes List-Unsubscribe à l'envoi réel.
Prérequis : API (3055), PG de test (5544), SMTP factice (tests/smtp_sink.py 2525 → /tmp/claude-0/mails), /var/tmp/api-test.env."""
import base64, email, glob, hashlib, hmac, re, sys, time, uuid, requests, psycopg2
from email import policy

B = "http://127.0.0.1:3055"; MAILS = "/tmp/claude-0/mails"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
JWT = re.search(r"^JWT_SECRET=(.*)$", open("/var/tmp/api-test.env").read(), re.M).group(1).strip()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def user(prefix="nt"):
    em = f"{prefix}-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Amina"})
    cur.execute("select id from users where email=%s", (em,)); uid = str(cur.fetchone()[0])
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}, uid, em


def token(uid, cat):
    sig = base64.urlsafe_b64encode(hmac.new(JWT.encode(), f"unsub:{uid}:{cat}".encode(), hashlib.sha256).digest()).decode().rstrip("=")[:32]
    return f"{uid}.{cat}.{sig}"


def sink():
    out = []
    for f in glob.glob(MAILS + "/*.eml"):
        m = email.message_from_bytes(open(f, "rb").read(), policy=policy.default)
        out.append(m)
    return out


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:6]
name = f"Cheikh Notif {tag}"
r = requests.post(B + "/talks", headers=ADM, json={"title": f"Conf suivi {tag}", "speaker": name, "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "zzabcdefghij")[:11], "rightsConfirmed": True, "publication": "published"})
ok(r.status_code in (200, 201), "conférence de test créée")
sp = [x for x in requests.get(B + "/speakers").json() if x["name"] == name]
ok(len(sp) == 1, "l'intervenant apparaît dans la liste publique"); slug = sp[0]["slug"]

U, uid, uem = user(); V, vid, _ = user()
F = f"{B}/speakers/{slug}/follow"
ok(requests.put(F).status_code == 401, "suivre : connexion requise")
ok(requests.put(f"{B}/speakers/inconnu-{tag}/follow", headers=U).status_code == 404, "intervenant inconnu : refusé")
ok(requests.put(f"{B}/speakers/Mauvais_Slug/follow", headers=U).status_code == 400, "identifiant mal formé refusé")
r = requests.put(F, headers=U); ok(r.status_code == 200 and r.json()["following"] and r.json()["name"] == name, "suivre un intervenant")
ok(requests.put(F, headers=U).status_code == 200, "suivre deux fois : sans effet")
n = requests.get(B + "/me/notifications", headers=U).json()
ok([f["slug"] for f in n["follows"]] == [slug] and n["prefs"] == {"speakers": True, "weekly": False} and n["maxFollows"] == 100, "mes réglages : alertes actives, sélection de la semaine désactivée par défaut")
ok(requests.get(B + "/me/notifications", headers=V).json()["follows"] == [], "les abonnements d'un autre compte sont privés")
cur.execute("insert into speaker_follows(user_id, speaker_slug, speaker_name) select %s, 'faux-'||g, 'Faux' from generate_series(1, 99) g", (uid,))
ok(requests.put(f"{B}/speakers/{slug}/follow", headers=U).status_code == 200, "à 100 abonnements, ré-suivre le même reste possible")
cur.execute("insert into speaker_follows(user_id, speaker_slug, speaker_name) values (%s, 'faux-100', 'Faux')", (uid,))
sp2 = f"Autre Intervenant {tag}"
requests.post(B + "/talks", headers=ADM, json={"title": f"Autre {tag}", "speaker": sp2, "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "yyabcdefghij")[:11], "rightsConfirmed": True, "publication": "published"})
slug2 = [x for x in requests.get(B + "/speakers").json() if x["name"] == sp2][0]["slug"]
ok(requests.put(f"{B}/speakers/{slug2}/follow", headers=U).status_code == 409, "limite de 100 intervenants suivis")
cur.execute("delete from speaker_follows where user_id=%s and speaker_slug like 'faux-%%'", (uid,))
ok(requests.delete(F, headers=U).status_code == 204 and requests.get(B + "/me/notifications", headers=U).json()["follows"] == [], "ne plus suivre")
requests.put(F, headers=U)

# --- préférences
ok(requests.put(B + "/me/notifications", headers=U, json={"weekly": "oui"}).status_code == 400, "valeur invalide refusée")
r = requests.put(B + "/me/notifications", headers=U, json={"weekly": True}).json()
ok(r == {"speakers": True, "weekly": True}, "sélection de la semaine : activée sur demande")
ok(requests.put(B + "/me/notifications", headers=U, json={"speakers": False}).json() == {"speakers": False, "weekly": True}, "alertes d'intervenants désactivées, sélection conservée")
requests.put(B + "/me/notifications", headers=U, json={"speakers": True})

# --- désinscription en un clic
tk = token(uid, "speakers")
r = requests.get(f"{B}/unsubscribe/{tk}"); ok(r.status_code == 200 and r.json() == {"category": "speakers", "subscribed": True}, "lien de désinscription : lecture sans effet")
cur.execute("select notify_speakers from users where id=%s", (uid,)); ok(cur.fetchone()[0] is True, "ouvrir le lien (ex. antivirus) ne désinscrit personne")
ok(requests.get(f"{B}/unsubscribe/{uid}.speakers.{'A' * 32}").status_code == 404, "signature falsifiée refusée")
ok(requests.post(f"{B}/unsubscribe/{uid}.speakers.{'A' * 32}").status_code == 404, "signature falsifiée refusée (POST)")
ok(requests.post(f"{B}/unsubscribe/{vid}.speakers." + tk.split('.')[2]).status_code == 404, "jeton d'une autre personne refusé")
ok(requests.post(f"{B}/unsubscribe/{uid}.admin.{tk.split('.')[2]}").status_code == 404, "catégorie inventée refusée")
ok(requests.post(f"{B}/unsubscribe/{uid}.weekly.{tk.split('.')[2]}").status_code == 404, "jeton d'une catégorie inutilisable pour une autre")
ok(requests.post(f"{B}/unsubscribe/pas-un-jeton").status_code == 404, "jeton mal formé refusé")
r = requests.post(f"{B}/unsubscribe/{tk}", data="List-Unsubscribe=One-Click", headers={"content-type": "application/x-www-form-urlencoded"})
ok(r.status_code == 200 and r.json()["subscribed"] is False, "bouton « Se désabonner » des messageries (formulaire RFC 8058)")
cur.execute("select notify_speakers, notify_weekly from users where id=%s", (uid,)); ok(cur.fetchone() == (False, True), "seule la catégorie visée est désactivée, sans connexion")
ok(requests.post(f"{B}/unsubscribe/{tk}", json={}).status_code == 200, "répéter la désinscription : sans erreur")
ok(requests.post(f"{B}/unsubscribe/{token(uid, 'weekly')}", json={}).status_code == 200, "désinscription de la sélection hebdomadaire")
cur.execute("select notify_weekly from users where id=%s", (uid,)); ok(cur.fetchone()[0] is False, "sélection hebdomadaire désactivée")

# --- envoi réel : en-têtes, lien, et pas d'envoi après désinscription
cur.execute("update app_settings set value='smtp-sink' where false")
W, wid, wem = user("on"); X, xid, xem = user("off")
cur.execute("update users set notify_speakers=true where id=%s", (wid,)); cur.execute("update users set notify_speakers=false where id=%s", (xid,))
for u, em in ((wid, wem), (xid, xem)):
    cur.execute("insert into email_outbox(user_id,to_email,kind,locale,vars,dedupe_key) values (%s,%s,'speaker_new','fr',%s,%s)", (u, em, '{"name":"Amina","titles":"• Une conférence — Cheikh","path":"/conferences"}', f"t-{u}"))
got = None
for _ in range(80):
    cur.execute("select user_id, status from email_outbox where dedupe_key in (%s,%s)", (f"t-{wid}", f"t-{xid}")); st = dict(cur.fetchall())
    if st.get(wid) == "sent" and st.get(xid) == "expired": break
    time.sleep(0.5)
ok(st.get(wid) == "sent", f"envoi réel à un abonné ({st.get(wid)})")
ok(st.get(xid) == "expired", "désinscrit entre la mise en file et l'envoi : rien n'est envoyé")
time.sleep(1)
info = [m for m in sink() if str(m["Subject"]).startswith("Nouveau chez les intervenants")]
msgs = [m for m in info if str(m["To"]) == wem]
ok(len(msgs) == 1 and not [m for m in info if str(m["To"]) == xem], "un seul message d'information reçu, aucun pour le désinscrit")
m = msgs[0]
lu = m["List-Unsubscribe"]; tok = re.search(r"/api/unsubscribe/([^>]+)>", lu).group(1)
ok(tok == token(wid, "speakers") and m["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click", "en-têtes List-Unsubscribe + One-Click (jeton valide)")
html = m.get_body(preferencelist=("html",)).get_content(); text = m.get_body(preferencelist=("plain",)).get_content()
ok(f"/unsubscribe/{tok}" in html and "Se désabonner en un clic" in html and f"/unsubscribe/{tok}" in text and "Gérer mes e-mails" in html and "Une conférence" in text, "lien de désinscription dans le pied de page (HTML et texte)")
print("TOUT EST OK")
