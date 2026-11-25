"""Chaînes : un même nom ne peut pas exister deux fois (création et renommage), majuscules et accents ignorés. Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


H = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
n = uuid.uuid4().hex[:6]
a, b = f"Cheikh Zéta {n}", f"Autre Chaîne {n}"
r = requests.post(B + "/studio/channels", headers=H, json={"name": a}); ok(r.status_code == 201, "chaîne créée")
sa = r.json()["slug"]
for v in (a, a.upper(), a.replace("é", "e"), f"  {a}  "):
    ok(requests.post(B + "/studio/channels", headers=H, json={"name": v}).status_code == 409, f"même nom refusé à la création : « {v.strip()} »")
r = requests.post(B + "/studio/channels", headers=H, json={"name": b}); ok(r.status_code == 201, "seconde chaîne (autre nom) créée")
sb = r.json()["slug"]
ok(requests.put(f"{B}/studio/channels/{sb}", headers=H, json={"name": a}).status_code == 409, "renommer vers le nom d'une autre chaîne : refusé")
ok(requests.put(f"{B}/studio/channels/{sb}", headers=H, json={"name": a.upper()}).status_code == 409, "… même en majuscules : refusé")
ok(requests.put(f"{B}/studio/channels/{sb}", headers=H, json={"name": b.upper()}).status_code == 200, "changer la casse de son propre nom : permis")
ok(requests.put(f"{B}/studio/channels/{sa}", headers=H, json={"bio": "Présentation"}).status_code == 200, "modifier autre chose que le nom : permis")

# Nom d'un intervenant déjà utilisé par un autre organisateur : refusé aux organisateurs, permis au staff
def mk(label):
    email = f"cu-{label}-{n}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": label})
    cur.execute("update users set role='organizer' where email=%s returning id", (email,)); uid = cur.fetchone()[0]
    return uid, {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}
u1, H1 = mk("un"); u2, H2 = mk("deux")
spk = f"Intervenant Libre {n}"
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language) values ('t','d',%s,'youtube',%s,%s,'draft','ready','free',600,'fr') returning id", (spk, "v" + n * 2, u1)); tid = cur.fetchone()[0]
ok(requests.post(B + "/studio/channels", headers=H2, json={"name": spk.upper()}).status_code == 409, "organisateur : ne peut pas créer la chaîne d'un intervenant d'un autre")
r = requests.post(B + "/studio/channels", headers=H1, json={"name": spk}); ok(r.status_code == 201, "l'organisateur dont c'est la vidéo peut la créer")
sc = r.json()["slug"]; cur.execute("delete from speakers where slug=%s", (sc,))
r = requests.post(B + "/studio/channels", headers=H, json={"name": spk}); ok(r.status_code == 201, "le staff peut la créer")
sd = r.json()["slug"]
cur.execute("delete from talks where id=%s", (tid,)); cur.execute("delete from speakers where slug in (%s,%s,%s)", (sa, sb, sd)); cur.execute("delete from users where id in (%s,%s)", (u1, u2))
print("TOUT OK")
