"""GET /studio/link-info : droits et refus d'adresses (la lecture chez les plateformes est testée dans test_link_info.mjs)."""
import sys, uuid, requests, urllib.parse

B = "http://127.0.0.1:3055"


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


tag = uuid.uuid4().hex[:6]
email = f"li-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Li"})
USER = login(email, "Passw0rd-test")
ADM = login("admin@test.local", "AdminPassw0rd-test")
q = lambda u: {"url": u}
ok(requests.get(B + "/studio/link-info", params=q("https://vimeo.com/1")).status_code in (401, 403), "visiteur : refusé")
ok(requests.get(B + "/studio/link-info", params=q("https://vimeo.com/1"), headers=USER).status_code == 403, "simple membre : refusé")
for bad in ["http://127.0.0.1/x", "http://localhost/x", "http://169.254.169.254/latest", "ftp://exemple.org/x", "pas une adresse", ""]:
    r = requests.get(B + "/studio/link-info", params=q(bad), headers=ADM)
    ok(r.status_code == 400 and r.json().get("error"), f"adresse refusée : {bad or '(vide)'}")
print("TOUT EST BON")
