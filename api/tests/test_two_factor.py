"""31 : double authentification — activation, connexion en deux temps, codes de secours, rejeu, verrou, désactivation, réinitialisation par l'admin.
Prérequis : API de test (3055), PG de test (5544)."""
import base64, hashlib, hmac, struct, sys, time, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def totp(secret, step):
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    h = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000).zfill(6)


def now_step():
    return int(time.time() // 30)


def login(email, pw):
    return requests.post(B + "/auth/login", json={"email": email, "password": pw})


def hdr(tok):
    return {"authorization": "Bearer " + tok}


EM, PW = "twofa@test.local", "TwoFaPassw0rd-test"
cur.execute("delete from users where email = %s", (EM,))
r = requests.post(B + "/auth/register", json={"email": EM, "password": PW, "name": "Deux Facteurs"})
ok(r.status_code == 201, "inscription")
tok = r.json()["token"]; uid = r.json()["user"]["id"]
A = hdr(requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"])

# 1) Sans 2FA : connexion normale
r = login(EM, PW)
ok(r.status_code == 200 and "token" in r.json() and "twoFactor" not in r.json(), "sans 2FA : jeton direct")
s = requests.get(B + "/me/2fa", headers=hdr(tok)).json()
ok(s["enabled"] is False and s["recoveryLeft"] == 0 and s["available"] is True, "état : désactivée")
ok(requests.get(B + "/me/2fa").status_code == 401, "état sans jeton : 401")

# 2) Activation
ok(requests.post(B + "/me/2fa/setup", headers=hdr(tok), json={"password": "mauvais"}).status_code == 403, "activation : mauvais mot de passe refusé")
r = requests.post(B + "/me/2fa/setup", headers=hdr(tok), json={"password": PW}); j = r.json()
ok(r.status_code == 200 and len(j["secret"]) == 32 and j["uri"].startswith("otpauth://totp/") and j["secret"] in j["uri"], "activation : clé et adresse du QR code")
secret = j["secret"]
cur.execute("select totp_pending, totp_secret from users where id = %s", (uid,)); pend, sec = cur.fetchone()
ok(pend and secret not in pend and sec is None, "clé gardée chiffrée, pas encore active")
ok(login(EM, PW).json().get("token"), "tant que non confirmée : connexion sans code")
ok(requests.post(B + "/me/2fa/enable", headers=hdr(tok), json={"code": "000000"}).status_code == 400, "confirmation : mauvais code refusé")
st = now_step()
r = requests.post(B + "/me/2fa/enable", headers=hdr(tok), json={"code": totp(secret, st)}); rc = r.json().get("recoveryCodes", [])
ok(r.status_code == 200 and len(rc) == 10 and len(set(rc)) == 10, "confirmation : 10 codes de secours")
cur.execute("select count(*) from two_factor_recovery where user_id = %s", (uid,)); ok(cur.fetchone()[0] == 10, "codes de secours : 10 empreintes en base")
cur.execute("select count(*) from two_factor_recovery where user_id = %s and code_hash = %s", (uid, rc[0])); ok(cur.fetchone()[0] == 0, "codes de secours jamais gardés en clair")
ok(requests.post(B + "/me/2fa/setup", headers=hdr(tok), json={"password": PW}).status_code == 409, "déjà activée : nouvelle activation refusée")
s = requests.get(B + "/me/2fa", headers=hdr(tok)).json(); ok(s["enabled"] and s["recoveryLeft"] == 10, "état : activée, 10 codes restants")

# 3) Connexion en deux temps
r = login(EM, PW); j = r.json()
ok(r.status_code == 200 and j.get("twoFactor") is True and j.get("challenge") and "token" not in j, "mot de passe juste : pas de jeton, un défi")
ch = j["challenge"]
ok(requests.get(B + "/auth/me", headers=hdr(ch)).status_code == 401, "le défi ne sert pas de jeton")
ok(login(EM, "mauvais").status_code == 401, "mauvais mot de passe : 401 comme avant")
r = requests.post(B + "/auth/2fa/verify", json={"challenge": ch, "code": "000000"}); ok(r.status_code == 401 and r.json()["code"] == "bad_code", "mauvais code : 401")
ok(requests.post(B + "/auth/2fa/verify", json={"challenge": "x" * 43, "code": "123456"}).status_code == 401, "défi inconnu : 401")
code_next = totp(secret, st + 1)  # le code du pas courant est déjà pris (activation) : on utilise le pas suivant (±30 s toléré)
r = requests.post(B + "/auth/2fa/verify", json={"challenge": ch, "code": code_next}); j = r.json()
ok(r.status_code == 200 and j["token"] and j["user"]["email"] == EM and "password_hash" not in j["user"], "bon code : jeton et profil")
ok(requests.get(B + "/auth/me", headers=hdr(j["token"])).status_code == 200, "le jeton obtenu fonctionne")
ch2 = login(EM, PW).json()["challenge"]
ok(requests.post(B + "/auth/2fa/verify", json={"challenge": ch2, "code": code_next}).status_code == 401, "rejeu du même code refusé")
r = requests.post(B + "/auth/2fa/verify", json={"challenge": ch, "code": code_next}); ok(r.status_code == 401, "défi déjà utilisé : refusé")

# 4) Code de secours
r = requests.post(B + "/auth/2fa/verify", json={"challenge": ch2, "code": rc[0].upper().replace("-", " ")}); j = r.json()
ok(r.status_code == 200 and j["usedRecovery"] is True and j["recoveryLeft"] == 9, "code de secours accepté (9 restants)")
ch3 = login(EM, PW).json()["challenge"]
ok(requests.post(B + "/auth/2fa/verify", json={"challenge": ch3, "code": rc[0]}).status_code == 401, "code de secours : une seule utilisation")

# 5) Défi expiré
cur.execute("update login_challenges set expires_at = now() - interval '1 minute' where user_id = %s", (uid,))
r = requests.post(B + "/auth/2fa/verify", json={"challenge": ch3, "code": rc[1]}); ok(r.status_code == 401 and r.json()["code"] == "challenge_expired", "défi expiré : refusé")

# 6) Verrou après 5 erreurs
cur.execute("update users set totp_failures = 0, totp_locked_until = null where id = %s", (uid,))
last = None
for i in range(5):
    c = login(EM, PW).json()["challenge"]
    last = requests.post(B + "/auth/2fa/verify", json={"challenge": c, "code": "111111"})
ok(last.status_code == 429 and last.json()["code"] == "locked", "5 erreurs : compte verrouillé (429)")
c = login(EM, PW).json()["challenge"]
r = requests.post(B + "/auth/2fa/verify", json={"challenge": c, "code": rc[1]}); ok(r.status_code == 429, "verrouillé : même un code de secours valable est refusé")
cur.execute("update users set totp_locked_until = now() - interval '1 minute' where id = %s", (uid,))
c = login(EM, PW).json()["challenge"]
r = requests.post(B + "/auth/2fa/verify", json={"challenge": c, "code": rc[1]}); ok(r.status_code == 200, "après le délai : connexion à nouveau possible")
# erreurs répétées sur UN défi : il s'éteint après 5 essais
c = login(EM, PW).json()["challenge"]
for i in range(4):
    requests.post(B + "/auth/2fa/verify", json={"challenge": c, "code": "222222"})
cur.execute("update users set totp_failures = 0, totp_locked_until = null where id = %s", (uid,))
cur.execute("update login_challenges set failures = 5 where user_id = %s", (uid,))
r = requests.post(B + "/auth/2fa/verify", json={"challenge": c, "code": rc[2]}); ok(r.status_code == 401, "défi épuisé (5 essais) : refusé")
cur.execute("update users set totp_failures = 0, totp_locked_until = null where id = %s", (uid,))

# 7) Nouveaux codes de secours
cur.execute("update users set totp_last_step = null where id = %s", (uid,))
body = {"password": PW, "code": totp(secret, now_step())}
ok(requests.post(B + "/me/2fa/recovery", headers=hdr(tok), json={**body, "password": "mauvais"}).status_code == 403, "nouveaux codes : mauvais mot de passe refusé")
ok(requests.post(B + "/me/2fa/recovery", headers=hdr(tok), json={"password": PW, "code": "000000"}).status_code == 400, "nouveaux codes : mauvais code refusé")
r = requests.post(B + "/me/2fa/recovery", headers=hdr(tok), json=body); rc2 = r.json().get("recoveryCodes", [])
ok(r.status_code == 200 and len(rc2) == 10 and not set(rc2) & set(rc), "nouveaux codes de secours, anciens périmés")
cur.execute("update users set totp_last_step = null where id = %s", (uid,))
cc = login(EM, PW).json()["challenge"]
ok(requests.post(B + "/auth/2fa/verify", json={"challenge": cc, "code": rc[3]}).status_code == 401, "ancien code de secours refusé")

# 8) Réinitialisation par l'administrateur
O = hdr(tok)
ok(requests.post(B + f"/admin/users/{uid}/2fa/reset", headers=O).status_code == 403, "réinitialisation : réservée à l'admin")
users = requests.get(B + "/admin/users?q=twofa@test.local", headers=A).json()["users"]
ok(users and users[0]["twoFactor"] is True, "liste admin : 2FA activée")
ok(requests.post(B + "/admin/users/00000000-0000-0000-0000-000000000000/2fa/reset", headers=A).status_code == 404, "réinitialisation : compte inconnu 404")
ok(requests.post(B + f"/admin/users/{uid}/2fa/reset", headers=A).status_code == 200, "réinitialisation par l'admin")
r = login(EM, PW); ok(r.status_code == 200 and "token" in r.json(), "après réinitialisation : connexion sans code")
users = requests.get(B + "/admin/users?q=twofa@test.local", headers=A).json()["users"]; ok(users[0]["twoFactor"] is False, "liste admin : 2FA désactivée")
cur.execute("select count(*) from audit_log where route like '%2fa/reset%'"); ok(cur.fetchone()[0] >= 1, "action inscrite au journal d'audit")

# 9) Désactivation par l'utilisateur
tok = login(EM, PW).json()["token"]
j = requests.post(B + "/me/2fa/setup", headers=hdr(tok), json={"password": PW}).json(); secret = j["secret"]
requests.post(B + "/me/2fa/enable", headers=hdr(tok), json={"code": totp(secret, now_step())})
cur.execute("update users set totp_last_step = null where id = %s", (uid,))
ok(requests.post(B + "/me/2fa/disable", headers=hdr(tok), json={"password": "mauvais", "code": totp(secret, now_step())}).status_code == 403, "désactivation : mauvais mot de passe refusé")
ok(requests.post(B + "/me/2fa/disable", headers=hdr(tok), json={"password": PW, "code": "000000"}).status_code == 400, "désactivation : mauvais code refusé")
ok(requests.post(B + "/me/2fa/disable", headers=hdr(tok), json={"password": PW, "code": totp(secret, now_step())}).status_code == 200, "désactivation réussie")
cur.execute("select totp_secret, totp_enabled_at from users where id = %s", (uid,)); ok(cur.fetchone() == (None, None), "clé effacée")
cur.execute("select count(*) from two_factor_recovery where user_id = %s", (uid,)); ok(cur.fetchone()[0] == 0, "codes de secours effacés")
ok(login(EM, PW).json().get("token"), "après désactivation : connexion sans code")
print("\nTout est OK")
