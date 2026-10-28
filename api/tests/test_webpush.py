"""40 : notifications navigateur — clé publique, abonnement, refus des adresses non reconnues, plafond, retrait, essai, fonction coupée.
Prérequis : API de test (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member():
    email = f"wp-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Membre"})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    return login(email, "Passw0rd-test"), uid


ADM = login("admin@test.local", "AdminPassw0rd-test")
U, uid = member(); V, vid = member()
P = "B" + "A" * 86
sub = lambda n, host="fcm.googleapis.com": {"endpoint": f"https://{host}/fcm/send/{n}", "keys": {"p256dh": P, "auth": "a" * 22}, "locale": "en"}
tag = uuid.uuid4().hex[:6]

ok(requests.get(B + "/web-push/key").status_code == 401, "clé publique : connexion requise")
r = requests.get(B + "/web-push/key", headers=U)
ok(r.status_code == 200 and len(r.json()["publicKey"]) >= 80, "clé publique VAPID fournie")
ok(requests.get(B + "/web-push/key", headers=V).json()["publicKey"] == r.json()["publicKey"], "même clé pour tous les membres")

ok(requests.get(B + "/me/web-push", headers=U).json()["subscribed"] == 0, "aucun navigateur abonné au départ")
r = requests.post(B + "/me/web-push", headers=U, json=sub(f"a{tag}")); ok(r.status_code == 200, "abonnement enregistré")
ok(requests.post(B + "/me/web-push", headers=U, json=sub(f"a{tag}")).status_code == 200, "même navigateur : pas de doublon")
ok(requests.get(B + "/me/web-push", headers=U).json()["subscribed"] == 1, "1 navigateur abonné")
cur.execute("select locale from web_push_subscriptions where user_id=%s", (uid,)); ok(cur.fetchone()[0] == "en", "langue gardée")

ok(requests.post(B + "/me/web-push", headers=U, json=sub("x", "evil.example")).status_code == 400, "service inconnu refusé")
ok(requests.post(B + "/me/web-push", headers=U, json={"endpoint": "http://fcm.googleapis.com/x", "keys": {"p256dh": P, "auth": "a" * 22}}).status_code == 400, "http refusé")
ok(requests.post(B + "/me/web-push", headers=U, json={"endpoint": "https://fcm.googleapis.com/x", "keys": {"p256dh": "x", "auth": "y"}}).status_code == 400, "clés invalides refusées")
ok(requests.post(B + "/me/web-push", json=sub("z")).status_code == 401, "abonnement : connexion requise")

# navigateur partagé : l'abonnement passe au dernier compte connecté
ok(requests.post(B + "/me/web-push", headers=V, json=sub(f"a{tag}")).status_code == 200, "même navigateur, autre compte")
ok(requests.get(B + "/me/web-push", headers=U).json()["subscribed"] == 0 and requests.get(B + "/me/web-push", headers=V).json()["subscribed"] == 1, "l'abonnement a changé de compte")
ok(requests.delete(B + "/me/web-push", headers=U, json={"endpoint": f"https://fcm.googleapis.com/fcm/send/a{tag}"}).status_code == 204, "retrait par un autre compte : sans effet")
ok(requests.get(B + "/me/web-push", headers=V).json()["subscribed"] == 1, "abonnement de l'autre compte intact")

for i in range(11):
    requests.post(B + "/me/web-push", headers=U, json=sub(f"m{tag}{i}"))
ok(requests.get(B + "/me/web-push", headers=U).json()["subscribed"] == 10, "plafond de 10 navigateurs par compte")

ok(requests.delete(B + "/me/web-push", headers=V, json={"endpoint": f"https://fcm.googleapis.com/fcm/send/a{tag}"}).status_code == 204, "retrait de son propre navigateur")
ok(requests.get(B + "/me/web-push", headers=V).json()["subscribed"] == 0, "plus aucun navigateur")
r = requests.post(B + "/me/web-push/test", headers=V); ok(r.status_code == 409 and r.json().get("code") == "webpush_none", "essai sans navigateur : message clair")

# fonction coupée
r = requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_webpush": "false"}}); ok(r.status_code == 200, "fonction coupée")
ok(requests.get(B + "/web-push/key", headers=U).status_code in (403, 404), "clé fermée quand la fonction est coupée")
ok(requests.post(B + "/me/web-push", headers=U, json=sub("q")).status_code in (403, 404), "abonnement fermé quand la fonction est coupée")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_webpush": "true"}})
ok(requests.get(B + "/web-push/key", headers=U).status_code == 200, "fonction réactivée")

cur.execute("delete from web_push_subscriptions where user_id = any(%s::uuid[])", ([uid, vid],))
print("\nTout est OK")
