"""22b-4 : routes téléphone. PUT/DELETE /me/push-token, /me/notifications (push, devices, available.push), test Admin « push » sans clé.
Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def user():
    em = f"pa-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Amina"})
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}, em


H, em = user(); H2, em2 = user()
tk = "fcm" + uuid.uuid4().hex + ":APA91b" + uuid.uuid4().hex
ok(requests.put(B + "/me/push-token", json={"token": tk}).status_code == 401, "sans connexion : 401")
ok(requests.put(B + "/me/push-token", headers=H, json={"token": "court"}).status_code == 400, "jeton trop court : 400")
ok(requests.put(B + "/me/push-token", headers=H, json={"token": "a b" * 10}).status_code == 400, "caractères interdits : 400")
r = requests.put(B + "/me/push-token", headers=H, json={"token": tk, "locale": "ar-MA"})
ok(r.status_code == 200 and r.json()["ok"], "enregistrement du téléphone")
cur.execute("select locale, platform from device_tokens where token=%s", (tk,)); ok(cur.fetchone() == ("ar", "android"), "langue réduite à « ar », plateforme android")
n = requests.get(B + "/me/notifications", headers=H).json()
ok(n["devices"] == 1 and n["prefs"]["push"] is True and n["available"]["push"] is False, "réglages : 1 appareil, interrupteur actif, envoi non configuré (pas de clé)")
ok(requests.put(B + "/me/push-token", headers=H, json={"token": tk}).status_code == 200, "ré-enregistrement idempotent")
cur.execute("select count(*) from device_tokens where token=%s", (tk,)); ok(cur.fetchone()[0] == 1, "toujours une seule ligne")
# Un autre compte se connecte sur le même téléphone : le jeton change de propriétaire
ok(requests.put(B + "/me/push-token", headers=H2, json={"token": tk}).status_code == 200, "autre compte sur le même téléphone")
cur.execute("select u.email from device_tokens d join users u on u.id=d.user_id where token=%s", (tk,)); ok(cur.fetchone()[0] == em2, "le jeton appartient au dernier compte connecté")
ok(requests.delete(B + "/me/push-token", headers=H, json={"token": tk}).status_code == 204, "l'ancien compte ne peut pas retirer le jeton d'un autre (sans effet)")
cur.execute("select count(*) from device_tokens where token=%s", (tk,)); ok(cur.fetchone()[0] == 1, "jeton conservé")
ok(requests.delete(B + "/me/push-token", headers=H2, json={"token": tk}).status_code == 204, "retrait par son propriétaire")
cur.execute("select count(*) from device_tokens where token=%s", (tk,)); ok(cur.fetchone()[0] == 0, "jeton supprimé")
# Limite de 10 appareils par compte
for i in range(12):
    requests.put(B + "/me/push-token", headers=H, json={"token": "lim" + uuid.uuid4().hex + "x" * 5})
cur.execute("select count(*) from device_tokens d join users u on u.id=d.user_id where u.email=%s", (em,)); ok(cur.fetchone()[0] <= 10, "au plus 10 appareils par compte (les plus anciens sont retirés)")
# Interrupteur
ok(requests.put(B + "/me/notifications", headers=H, json={"push": False}).json()["push"] is False, "interrupteur coupé")
ok(requests.get(B + "/me/notifications", headers=H).json()["prefs"]["push"] is False, "…et relu")
# Admin : test sans clé
ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("delete from app_settings where key='fcm_service_account'")
t = requests.post(B + "/admin/settings/test", headers=ADM, json={"target": "push"}).json()
ok(t["ok"] is False and "clé" in t["message"], "test Admin sans clé : message clair")
ok(requests.post(B + "/admin/settings/test", headers=H, json={"target": "push"}).status_code == 403, "test Admin refusé à un membre")
s = requests.get(B + "/admin/settings", headers=ADM).json()
flat = str(s)
ok("fcm_service_account" in flat, "réglage visible dans Admin → Paramètres")
print("TOUT EST OK")
