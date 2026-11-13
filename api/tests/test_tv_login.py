"""Application TV — connexion par code (migration 117) : code, attente, validation depuis un compte connecté, jeton remis une fois,
refus, expiration, code inconnu. Prérequis : API :3055 et Postgres :5544 (comme la suite CI)."""
import os, sys, uuid
import psycopg2, requests

B = os.environ.get("API", "http://127.0.0.1:3055")
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails += 1
tag = uuid.uuid4().hex[:6]
em = f"tv-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Téléspectateur"})
U = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
db = psycopg2.connect(os.environ.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis")); db.autocommit = True; cur = db.cursor()

r = requests.post(B + "/auth/tv/start", json={"device": "Google Chromecast"}); s = r.json()
ok(r.status_code == 201 and len(s["code"]) == 8 and all(c in "ABCDEFGHJKMNPQRSTUVWXYZ23456789" for c in s["code"]) and s["expiresIn"] == 600 and s["interval"] >= 2, f"code de la télé ({s.get('code')})")
ok(s["url"].endswith(f"/tv?code={s['code']}"), f"adresse du QR code ({s['url']})")
cur.execute("select secret_hash from tv_logins where code=%s", (s["code"],)); ok(cur.fetchone()[0] != s["secret"], "seule l'empreinte du secret est gardée")
ok(requests.post(B + "/auth/tv/poll", json={"secret": s["secret"]}).status_code == 202, "en attente tant que personne n'a validé")
ok(requests.get(f"{B}/auth/tv/code/{s['code']}").status_code == 401, "confirmation : connexion obligatoire")
info = requests.get(f"{B}/auth/tv/code/{s['code'][:4]}-{s['code'][4:].lower()}", headers=U)
ok(info.status_code == 200 and info.json()["device"] == "Google Chromecast", "code reconnu (tirets et minuscules acceptés), nom de l'appareil affiché")
ok(requests.post(B + "/auth/tv/approve", headers=U, json={"code": "ZZZZ2222"}).status_code == 404, "code inconnu : 404")
ok(requests.post(B + "/auth/tv/approve", headers=U, json={"code": "abc"}).status_code == 400, "code mal formé : 400")
ok(requests.post(B + "/auth/tv/approve", headers=U, json={"code": s["code"]}).json() == {"ok": True, "allowed": True}, "télé validée")
r = requests.post(B + "/auth/tv/poll", json={"secret": s["secret"]})
ok(r.status_code == 200 and r.json()["user"]["email"] == em and r.json()["token"], "la télé reçoit son jeton")
me = requests.get(B + "/auth/me", headers={"authorization": "Bearer " + r.json()["token"]})
ok(me.status_code == 200 and me.json()["email"] == em, "jeton valable : la télé est connectée au compte")
ok(requests.post(B + "/auth/tv/poll", json={"secret": s["secret"]}).status_code == 410, "jeton remis une seule fois")
ok(requests.post(B + "/auth/tv/approve", headers=U, json={"code": s["code"]}).status_code == 404, "code déjà utilisé")

# Refus
s2 = requests.post(B + "/auth/tv/start", json={}).json()
ok(requests.post(B + "/auth/tv/approve", headers=U, json={"code": s2["code"], "allow": False}).json()["allowed"] is False, "connexion refusée")
r = requests.post(B + "/auth/tv/poll", json={"secret": s2["secret"]}); ok(r.status_code == 410 and r.json()["code"] == "denied", "la télé apprend le refus")
# Expiration
s3 = requests.post(B + "/auth/tv/start", json={}).json()
cur.execute("update tv_logins set expires_at = now() - interval '1 second' where code=%s", (s3["code"],))
ok(requests.post(B + "/auth/tv/poll", json={"secret": s3["secret"]}).status_code == 410, "code expiré : la télé en demande un autre")
ok(requests.get(f"{B}/auth/tv/code/{s3['code']}", headers=U).status_code == 404 and requests.post(B + "/auth/tv/approve", headers=U, json={"code": s3["code"]}).status_code == 404, "code expiré : plus validable")
ok(requests.post(B + "/auth/tv/poll", json={"secret": "x" * 40}).status_code == 410, "secret inconnu : 410")
# Compte suspendu entre la validation et la remise du jeton
s4 = requests.post(B + "/auth/tv/start", json={}).json()
requests.post(B + "/auth/tv/approve", headers=U, json={"code": s4["code"]})
cur.execute("update users set disabled_at = now() where email=%s", (em,))
ok(requests.post(B + "/auth/tv/poll", json={"secret": s4["secret"]}).status_code == 410, "compte suspendu : pas de jeton")
cur.execute("delete from users where email=%s", (em,))
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
