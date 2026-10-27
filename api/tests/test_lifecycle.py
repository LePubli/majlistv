"""33 : e-mails de cycle de vie — désactivé par défaut, aperçu, trois situations, garde-fous (préférence, délai minimum, un seul par situation,
plage horaire, plafond), désinscription en un clic, droits.
Prérequis : API de test (3055), PG de test (5544). Les e-mails sont seulement mis en file (aucun envoi réel n'est nécessaire)."""
import sys, uuid, hmac, hashlib, base64, os, requests, psycopg2

B = "http://127.0.0.1:3055"
JWT = os.environ.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test")
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def setting(A, **kv):
    r = requests.put(B + "/admin/settings", headers=A, json={"values": kv})
    ok(r.status_code == 200, f"réglage {list(kv)} : {r.status_code}")


def user(name):
    em = f"lc-{name}-{tag}@test.local"
    r = requests.post(B + "/auth/register", json={"email": em, "password": "UserPassw0rd-test", "name": name})
    ok(r.status_code in (200, 201), f"compte {name} créé")
    cur.execute("select id from users where email = %s", (em,))
    return em, cur.fetchone()[0]


def mails(em):
    cur.execute("select kind from email_outbox where to_email = %s and kind in ('resume_talk','welcome_nudge','winback') order by id", (em,))
    return [r[0] for r in cur.fetchall()]


def talk(title, access="free"):
    cur.execute("select id from users where email = 'admin@test.local'"); aid = cur.fetchone()[0]
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','Intervenant Test','youtube',%s,%s,'published','ready',%s,1800) returning id",
                (title, "v" + uuid.uuid4().hex[:9], aid, access))
    return cur.fetchone()[0]


def progress(uid, tid, pos_ms, days_ago, completed=False):
    cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms, completed, updated_at) values (%s,%s,%s,1800000,%s, now() - make_interval(days => %s))", (uid, tid, pos_ms, completed, days_ago))


A = login("admin@test.local", "AdminPassw0rd-test")
t1, t2, t3 = talk(f"Reprise A {tag}"), talk(f"Reprise B {tag}"), talk(f"Autre {tag}")

# 0) Droits
for m, p in (("get", "/admin/lifecycle"), ("post", "/admin/lifecycle/run"), ("post", "/admin/lifecycle/test")):
    ok(getattr(requests, m)(B + p).status_code == 401, f"sans jeton : 401 sur {p}")
em0, _ = user("simple")
U0 = login(em0, "UserPassw0rd-test")
for m, p in (("get", "/admin/lifecycle"), ("post", "/admin/lifecycle/run"), ("post", "/admin/lifecycle/test")):
    ok(getattr(requests, m)(B + p, headers=U0).status_code == 403, f"membre : 403 sur {p}")

# 1) Personnages de test
em_r, u_r = user("resume");   progress(u_r, t1, 600000, 5)                         # à relancer
em_c, u_c = user("complete"); progress(u_c, t1, 1700000, 5, True)                  # a terminé : rien
em_s, u_s = user("short");    progress(u_s, t1, 60000, 5)                          # moins de 2 min : rien
em_n, u_n = user("newer");    progress(u_n, t1, 600000, 5); progress(u_n, t2, 100000, 1)  # a regardé hier : rien
em_o, u_o = user("optout");   progress(u_o, t1, 600000, 5)
cur.execute("update users set notify_lifecycle = false where id = %s", (u_o,))     # refuse ces e-mails
em_b, u_b = user("newbie");   cur.execute("update users set created_at = now() - interval '5 days' where id = %s", (u_b,))   # n'a rien regardé
em_y, u_y = user("young")                                                          # inscrit à l'instant : rien
em_w, u_w = user("winback")
cur.execute("insert into subscriptions(id, user_id, status, current_period_end) values (%s,%s,'canceled', now() - interval '20 days')", ("sub_lc_" + tag, u_w))
em_a, u_a = user("active")
cur.execute("insert into subscriptions(id, user_id, status, current_period_end) values (%s,%s,'active', now() + interval '20 days')", ("sub_lca_" + tag, u_a))
em_x, u_x = user("both");     progress(u_x, t1, 600000, 5)                         # reprise ET retour possibles → un seul e-mail
cur.execute("insert into subscriptions(id, user_id, status, current_period_end) values (%s,%s,'canceled', now() - interval '20 days')", ("sub_lcx_" + tag, u_x))
cur.execute("delete from lifecycle_log where user_id in (select id from users where email like %s)", (f"lc-%-{tag}@test.local",))

# 2) Désactivé par défaut
cur.execute("delete from email_outbox where kind in ('resume_talk','welcome_nudge','winback')")
setting(A, smtp_host="127.0.0.1", smtp_port="2525", smtp_security="none", mail_from="Test <noreply@test.local>")
cur.execute("select 1 from app_settings where key = %s", ("lifecycle_enabled",)); jamais_regle = cur.fetchone() is None
setting(A, lifecycle_enabled="false")
r = requests.get(B + "/admin/lifecycle", headers=A); j = r.json()
ok(r.status_code == 200 and j["cfg"]["master"] is False, "désactivé" + (" par défaut (réglage jamais touché)" if jamais_regle else ""))
ok(set(j["kinds"]) == {"resume_talk", "welcome_nudge", "winback"}, "aperçu des trois situations")
ok(j["kinds"]["resume_talk"]["count"] >= 2 and j["kinds"]["welcome_nudge"]["count"] >= 1 and j["kinds"]["winback"]["count"] >= 2, "aperçu : le nombre d'e-mails qui partiraient")
ok(all("@" in s["email"] and "•" in s["email"] for k in j["kinds"].values() for s in k["sample"]), "adresses masquées dans l'aperçu")
ok(requests.post(B + "/admin/lifecycle/run", headers=A).json()["queued"] == 0, "interrupteur coupé : rien n'est mis en file")
ok(mails(em_r) == [] and mails(em_b) == [], "aucun e-mail tant que l'interrupteur est coupé")

# 3) Activation, toute la journée, plafond large
setting(A, lifecycle_enabled="true", lifecycle_hour_from="0", lifecycle_hour_to="0", lifecycle_daily_max="500", lifecycle_gap_days="7")
r = requests.post(B + "/admin/lifecycle/run", headers=A); ok(r.status_code == 200 and r.json()["queued"] >= 4, f"passage : {r.json()['queued']} e-mails mis en file")
ok(mails(em_r) == ["resume_talk"], "reprise envoyée à la personne qui a laissé une conférence")
ok(mails(em_c) == [] and mails(em_s) == [] and mails(em_n) == [], "terminée / moins de 2 min / a regardé depuis : rien")
ok(mails(em_o) == [], "préférence refusée : rien")
ok(mails(em_b) == ["welcome_nudge"], "« par où commencer » pour un compte qui n'a rien regardé")
ok(mails(em_y) == [] and mails(em_a) == [], "compte tout neuf ou abonné actif : rien")
ok(mails(em_w) == ["winback"], "retour après abonnement terminé")
ok(mails(em_x) == ["resume_talk"], "reprise ET retour possibles : un seul e-mail (le délai minimum bloque le second)")
cur.execute("select vars->>'path', vars->>'minutes', dedupe_key from email_outbox where to_email = %s and kind = 'resume_talk'", (em_r,)); path, minutes, dk = cur.fetchone()
ok(path == f"/conferences/{t1}" or path.startswith("/conferences/"), "le lien mène à la conférence") ; ok(minutes == "10", "minutes de reprise = 10")
ok(dk.startswith("lc:resume_talk:"), "clé anti-doublon")
cur.execute("select count(*) from lifecycle_log where user_id = %s", (u_x,)); ok(cur.fetchone()[0] == 1, "un seul passage dans le journal pour cette personne")

# 4) Pas de doublon
n_out = lambda: (cur.execute("select count(*) from email_outbox where kind in ('resume_talk','welcome_nudge','winback')"), cur.fetchone()[0])[1]
before = n_out()
ok(requests.post(B + "/admin/lifecycle/run", headers=A).json()["queued"] == 0 and n_out() == before, "second passage : rien de plus")
cur.execute("delete from lifecycle_log where user_id = %s", (u_r,))  # même si le journal est vidé, la clé anti-doublon de la file protège
cur.execute("update email_outbox set status = 'sent' where to_email = %s", (em_r,))
requests.post(B + "/admin/lifecycle/run", headers=A)
ok(mails(em_r) == ["resume_talk"], "jamais deux fois le même e-mail (clé de la file)")

# 5) Aperçu après envoi
j = requests.get(B + "/admin/lifecycle", headers=A).json()
ok(j["sentToday"] >= 4 and j["sent14"].get("welcome_nudge", 0) >= 1, "aperçu : envois du jour et des 14 derniers jours")

# 6) Plage horaire et plafond
em_h, u_h = user("hours"); cur.execute("update users set created_at = now() - interval '5 days' where id = %s", (u_h,))
h = requests.get(B + "/admin/lifecycle", headers=A).json()["hour"]
setting(A, lifecycle_hour_from=str((h + 2) % 24), lifecycle_hour_to=str((h + 3) % 24))
ok(requests.post(B + "/admin/lifecycle/run", headers=A).json()["queued"] == 0 and mails(em_h) == [], "hors plage horaire : rien")
setting(A, lifecycle_hour_from="0", lifecycle_hour_to="0", lifecycle_daily_max="1")
ok(requests.post(B + "/admin/lifecycle/run", headers=A).json()["queued"] == 0 and mails(em_h) == [], "plafond quotidien atteint : rien")
setting(A, lifecycle_daily_max="500")
ok(requests.post(B + "/admin/lifecycle/run", headers=A).json()["queued"] >= 1 and mails(em_h) == ["welcome_nudge"], "plafond relevé : l'e-mail part")

# 7) Mon compte + désinscription
H = login(em_r, "UserPassw0rd-test")
r = requests.get(B + "/me/notifications", headers=H).json()
ok(r["prefs"]["lifecycle"] is True and r["available"]["lifecycle"] is True, "Mon compte : préférence lue (activée) et fonction disponible")
ok(requests.put(B + "/me/notifications", headers=H, json={"lifecycle": False}).json()["lifecycle"] is False, "Mon compte : refus enregistré")
requests.put(B + "/me/notifications", headers=H, json={"lifecycle": True})
tok = lambda uid: f"{uid}.lifecycle." + base64.urlsafe_b64encode(hmac.new(JWT.encode(), f"unsub:{uid}:lifecycle".encode(), hashlib.sha256).digest()).decode().rstrip("=")[:32]
r = requests.get(f"{B}/unsubscribe/{tok(u_r)}"); ok(r.status_code == 200 and r.json() == {"category": "lifecycle", "subscribed": True}, "lien de désinscription : lecture sans effet")
ok(requests.post(f"{B}/unsubscribe/{tok(u_r)}").status_code == 200, "désinscription en un clic")
cur.execute("select notify_lifecycle from users where id = %s", (u_r,)); ok(cur.fetchone()[0] is False, "préférence coupée en base")
ok(requests.post(f"{B}/unsubscribe/{u_r}.lifecycle.{'A' * 32}").status_code == 404, "signature falsifiée refusée")

# 8) E-mail d'essai
r = requests.post(B + "/admin/lifecycle/test", headers=A, json={"kind": "winback"}); ok(r.status_code == 200, "e-mail d'essai mis en file pour l'administrateur")
ok(requests.post(B + "/admin/lifecycle/test", headers=A, json={"kind": "inconnu"}).status_code == 400, "situation inconnue refusée")
cur.execute("select count(*) from lifecycle_log l join users u on u.id = l.user_id where u.email = 'admin@test.local'"); ok(cur.fetchone()[0] == 0, "l'essai ne touche pas au journal")

# 9) Remise à zéro (les autres tests ne doivent pas recevoir ces e-mails)
setting(A, lifecycle_enabled="false", lifecycle_daily_max="100", lifecycle_hour_from="10", lifecycle_hour_to="19")
cur.execute("delete from email_outbox where kind in ('resume_talk','welcome_nudge','winback')")
print("\nTous les contrôles de l'étape 33 sont passés")
