"""11.3 : réglages des moteurs par langue (listes de langues) via /admin/settings. Prérequis : API (3055)."""
import sys, requests

B = "http://127.0.0.1:3055"


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
get = lambda: {f["key"]: f for f in requests.get(B + "/admin/settings", headers=A).json()["fields"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v})

r = put({"translate_azure_langs": "ar,tr", "translate_deepseek_langs": "ur", "translate_claude_langs": ""})
ok(r.status_code == 200, "enregistrement des listes de langues")
f = get()
ok(set(f["translate_azure_langs"]["value"].split(",")) == {"ar", "tr"}, "Azure : ar, tr")
ok(f["translate_deepseek_langs"]["value"] == "ur", "DeepSeek : ur")
ok(f["translate_claude_langs"]["value"] == "", "Claude : aucune langue forcée")
ok(put({"translate_azure_langs": "xx"}).status_code == 400, "langue inconnue refusée")
ok(requests.get(B + "/admin/settings").status_code == 401, "réservé aux admins")
put({"translate_azure_langs": "", "translate_deepseek_langs": ""})
ok(get()["translate_azure_langs"]["value"] == "", "remise à zéro")
print("TOUT OK")
