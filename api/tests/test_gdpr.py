"""36 : droits RGPD — export de mes données (complet, sans secrets, sans les données des autres) et suppression de mon compte
(mot de passe, double authentification, blocages, abonnement, données liées supprimées, preuves conservées sans lien).
Prérequis : API de test (3055), PG de test (5544)."""
import sys, uuid, json, os, subprocess, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]
PW = "UserPassw0rd-test"
API_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ENV = {**os.environ, "DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "JWT_SECRET": os.environ.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"),
       "SETTINGS_KEY": os.environ.get("SETTINGS_KEY", "test-settings-key-0123456789"), "PRACTICE_KEY": os.environ.get("PRACTICE_KEY", "practice-key-for-tests-0123456789")}


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def user(name):
    em = f"gd-{name}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": em, "password": PW, "name": name})
    cur.execute("select id from users where email = %s", (em,))
    return em, cur.fetchone()[0], login(em, PW)


cur.execute("select id from users where email = 'admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','S','youtube',%s,%s,'published','ready','free',600) returning id", (f"GD {tag}", "v" + uuid.uuid4().hex[:9], aid)); tid = cur.fetchone()[0]

# 0) Classement des tables : rien ne peut échapper à l'export sans décision explicite
out = subprocess.run(["node", "-e", "import('./src/gdpr.js').then(async (g) => { console.log(JSON.stringify({ c: await g.classify(), own: g.OWN_COLUMNS })); process.exit(0); })"], cwd=API_DIR, env=ENV, capture_output=True, text=True, timeout=60)
ok(out.returncode == 0, "classement des tables lu" + ("" if out.returncode == 0 else " : " + out.stderr[:200]))
cl = json.loads(out.stdout)
unknown = [f"{x['table']}.{x['column']}" for x in cl["c"] if x["kind"] == "export" and x["column"] not in cl["own"]]
ok(not unknown, "aucune colonne inconnue qui pointe vers un membre (à classer dans src/gdpr.js) : " + ", ".join(unknown))
exported = {x["table"] for x in cl["c"] if x["kind"] == "export"}
ok({"favorites", "watch_progress", "talk_notes", "kid_profiles", "subscriptions", "consents", "user_lists", "speaker_follows", "revision_items"} <= exported, "les tables de données personnelles sont toutes exportées")
ok(all(x["kind"] != "export" for x in cl["c"] if x["table"] in ("login_challenges", "two_factor_recovery", "password_resets", "device_tokens")), "tables de secrets exclues")

# 1) Export
em, uid, H = user("export")
em2, uid2, H2 = user("autre")
ok(requests.get(B + "/me/export").status_code == 401, "export sans connexion : 401")
requests.put(f"{B}/me/favorites/{tid}", headers=H); requests.put(f"{B}/me/favorites/{tid}", headers=H2)
cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms) values (%s,%s,1000,600000)", (uid, tid))
cur.execute("insert into speaker_follows(user_id, speaker_slug, speaker_name) values (%s,'s','S')", (uid,))
cur.execute("insert into user_lists(user_id, title, share_token) values (%s,'Ma liste',%s) returning id", (uid, f"tok-secret-{tag}")); lid = cur.fetchone()[0]
cur.execute("insert into user_list_items(list_id, talk_id, position) values (%s,%s,0)", (lid, tid))
cur.execute("insert into kid_profiles(user_id, name, band) values (%s,'Yusuf','7-10') returning id", (uid,)); kid = cur.fetchone()[0]
cur.execute("insert into kid_progress(profile_id, talk_id, position_ms) values (%s,%s,4000)", (kid, tid))
cur.execute("update users set kids_pin_hash = 'PINHASH-XYZ' where id = %s", (uid,))
cur.execute("insert into device_tokens(token, user_id, platform) values (%s,%s,'android')", ("tok-" + "x" * 30 + tag, uid))
cur.execute("insert into consents(user_id, email, kind, version, text) values (%s,%s,'terms','1','CGV')", (uid, em))
r = requests.get(B + "/me/export", headers=H)
ok(r.status_code == 200 and "attachment" in r.headers.get("content-disposition", "") and r.headers.get("cache-control") == "no-store", "export : fichier à télécharger, pas de cache")
j = r.json(); raw = r.text
ok(j["format"] == "mejliss-export-v1" and j["account"]["email"] == em and j["account"]["two_factor_enabled"] is False, "fiche du compte")
ok("favorites" in j["data"] and "watch_progress" in j["data"] and "speaker_follows" in j["data"] and "consents" in j["data"], "favoris, progression, intervenants suivis, consentements")
ok(len(j["data"]["kid_profiles"]) == 1 and j["data"]["kid_profiles"][0]["name"] == "Yusuf" and len(j["data"]["kid_progress"]) == 1, "profil enfant et son avancement (données rattachées)")
ok(len(j["data"]["user_list_items"]) == 1, "éléments de la liste")
ok(not any(k in raw for k in ("password_hash", "PINHASH-XYZ", "kids_pin_hash", "totp_secret", f"tok-secret-{tag}", "token_hash")), "aucun mot de passe, code PIN, jeton ni secret dans l'export")
ok("device_tokens" not in j["data"], "jetons du téléphone absents")
ok(em2 not in raw and str(uid2) not in raw, "rien des autres membres")

# 2) Suppression : contrôles
ok(requests.post(B + "/me/delete", json={"password": PW}).status_code == 401, "suppression sans connexion : 401")
ok(requests.post(B + "/me/delete", headers=H, json={}).status_code == 400, "mot de passe obligatoire")
r = requests.post(B + "/me/delete", headers=H, json={"password": "mauvais-mot-de-passe"}); ok(r.status_code == 401 and r.json()["code"] == "bad_password", "mauvais mot de passe refusé")
cur.execute("select 1 from users where id = %s", (uid,)); ok(cur.fetchone() is not None, "le compte est intact après un refus")
c = requests.get(B + "/me/data/check", headers=H).json(); ok(c["blockers"] == [] and c["hasSubscription"] is False and c["twoFactor"] is False, "aperçu : rien ne bloque")

# 3) Abonnement en cours : Stripe non configuré → refus clair, compte intact
cur.execute("delete from app_settings where key = 'stripe_secret_key'")
cur.execute("insert into subscriptions(id, user_id, status, current_period_end) values (%s,%s,'active', now() + interval '10 days')", ("sub_gd_" + tag, uid))
ok(requests.get(B + "/me/data/check", headers=H).json()["hasSubscription"] is True, "aperçu : abonnement en cours signalé")
r = requests.post(B + "/me/delete", headers=H, json={"password": PW}); ok(r.status_code == 503 and r.json()["code"] == "stripe_unavailable", "abonnement en cours et paiement injoignable : refusé, expliqué")
cur.execute("select 1 from users where id = %s", (uid,)); ok(cur.fetchone() is not None, "compte intact")
cur.execute("update subscriptions set status = 'canceled' where id = %s", ("sub_gd_" + tag,))

# 4) Organisateur propriétaire de conférences : refusé
emo, uido, Ho = user("orga")
cur.execute("update users set role = 'organizer' where id = %s", (uido,))
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values ('Orga','d','S','youtube',%s,%s,'draft','ready','free',60)", ("v" + uuid.uuid4().hex[:9], uido))
r = requests.post(B + "/me/delete", headers=Ho, json={"password": PW}); ok(r.status_code == 409 and r.json()["code"] == "has_talks", "organisateur avec des conférences : refusé (à transférer)")

# 5) Dernier administrateur : refusé
cur.execute("select id from users where role = 'admin' and id <> %s and disabled_at is null", (aid,)); autres = [x[0] for x in cur.fetchall()]
cur.execute("update users set disabled_at = now() where id = any(%s::uuid[])", ([str(x) for x in autres],))  # les autres administrateurs de la base de test sont suspendus le temps du contrôle
r = requests.post(B + "/me/delete", headers=login("admin@test.local", "AdminPassw0rd-test"), json={"password": "AdminPassw0rd-test"})
cur.execute("update users set disabled_at = null where id = any(%s::uuid[])", ([str(x) for x in autres],))
ok(r.status_code == 409 and r.json()["code"] == "last_admin", "dernier administrateur : refusé")

# 6) Double authentification : code exigé
cur.execute("update users set totp_enabled_at = now(), totp_secret = 'x' where id = %s", (uid,))
r = requests.post(B + "/me/delete", headers=H, json={"password": PW}); ok(r.status_code == 401 and r.json()["code"] == "code_required", "double authentification active : code exigé")
cur.execute("update users set totp_enabled_at = null, totp_secret = null where id = %s", (uid,))

# 7) Suppression réussie
cur.execute("delete from email_outbox where kind = 'account_deleted'")
r = requests.post(B + "/me/delete", headers=H, json={"password": PW}); ok(r.status_code == 200 and r.json()["deleted"] is True, "suppression acceptée")
for tbl, col, v in (("users", "id", uid), ("favorites", "user_id", uid), ("watch_progress", "user_id", uid), ("speaker_follows", "user_id", uid), ("user_lists", "user_id", uid), ("kid_profiles", "user_id", uid), ("subscriptions", "user_id", uid)):
    cur.execute(f"select count(*) from {tbl} where {col} = %s", (v,)); ok(cur.fetchone()[0] == 0, f"{tbl} : données supprimées")
cur.execute("select count(*) from kid_progress where profile_id = %s", (kid,)); ok(cur.fetchone()[0] == 0, "avancement de l'enfant supprimé")
cur.execute("select user_id, email from consents where email = %s", (em,)); row = cur.fetchone(); ok(row is not None and row[0] is None, "preuve d'acceptation des CGV conservée, sans lien avec un compte")
cur.execute("select to_email, user_id, status from email_outbox where kind = 'account_deleted' and to_email = %s", (em,)); row = cur.fetchone(); ok(row is not None and row[1] is None, "e-mail de confirmation mis en file à l'ancienne adresse")
ok(requests.get(B + "/auth/me", headers=H).status_code == 401, "l'ancienne session ne marche plus")
ok(requests.post(B + "/auth/login", json={"email": em, "password": PW}).status_code == 401, "connexion impossible")
cur.execute("select 1 from users where id = %s", (uid2,)); ok(cur.fetchone() is not None, "les autres comptes sont intacts")
cur.execute("select count(*) from favorites where user_id = %s", (uid2,)); ok(cur.fetchone()[0] == 1, "données des autres membres intactes")
print("\nTous les contrôles de l'étape 36 sont passés")
