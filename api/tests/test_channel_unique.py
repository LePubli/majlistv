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
cur.execute("delete from speakers where slug in (%s,%s)", (sa, sb))
print("TOUT OK")
