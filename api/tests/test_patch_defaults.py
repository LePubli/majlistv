"""Passage à zod 4 (audit 11/2026) — une modification partielle (PATCH) ne remet PAS les autres champs à leur valeur par défaut.

Avec zod 4, `objet.partial()` applique les valeurs par défaut des champs absents ; les routes PATCH passent par `patchOf`
(api/src/zpatch.js). Ce test le vérifie de bout en bout sur deux routes, et contrôle les dates et les messages en français.

    python3 api/tests/test_patch_defaults.py        (API de test sur :3055)
"""
import sys, requests

B = "http://127.0.0.1:3055"
fails = []
def ok(c, m):
    if not c: fails.append(m); print("FAIL", m)
    else: print("OK  ", m)

r = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"})
assert r.status_code == 200, r.text
H = {"Authorization": "Bearer " + r.json()["token"]}

# --- liste personnelle : description = '' par défaut à la création
l = requests.post(B + "/me/lists", headers=H, json={"title": "Liste zod", "description": "ma description"}).json()
ok(l.get("description") == "ma description", "liste créée avec sa description")
ok(requests.patch(B + f"/me/lists/{l['id']}", headers=H, json={"title": "Liste zod 2"}).status_code == 200, "PATCH du titre seul")
rows = requests.get(B + "/me/lists", headers=H).json()
rows = rows if isinstance(rows, list) else rows.get("lists", rows.get("items", []))
mine = [x for x in rows if x["id"] == l["id"]]
ok(mine and mine[0]["title"] == "Liste zod 2" and mine[0]["description"] == "ma description", "la description n'a pas été remise à vide")
requests.delete(B + f"/me/lists/{l['id']}", headers=H)

# --- événement en direct : langue 'fr', durée 60, statut 'draft' par défaut à la création
body = {"title": "Direct zod", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "startsAt": "2031-01-01T10:00:00.000Z",
        "language": "ar", "durationMinutes": 120, "speaker": "Intervenant", "status": "published"}
e = requests.post(B + "/studio/events", headers=H, json=body)
if e.status_code == 404:
    print("IGNORÉ  module « événements » coupé")
else:
    ok(e.status_code in (200, 201), f"événement créé ({e.status_code})"); e = e.json()
    p = requests.patch(B + f"/studio/events/{e['id']}", headers=H, json={"title": "Direct zod 2"})
    ok(p.status_code == 200, "PATCH du titre seul"); p = p.json()
    ok(p.get("title") == "Direct zod 2" and p.get("language") == "ar" and p.get("durationMinutes") == 120 and p.get("status") == "published" and p.get("speaker") == "Intervenant",
       "langue, durée, statut et intervenant gardés")
    # dates acceptées comme avant : sans secondes, décalage sans deux-points ; date impossible refusée
    for v, good in [("2031-02-01T10:00Z", True), ("2031-02-01T10:00:00+0100", True), ("2031-02-01T10:00:00+01:00", True), ("2031-02-30T10:00:00Z", False), ("2031-02-01", False)]:
        s = requests.patch(B + f"/studio/events/{e['id']}", headers=H, json={"startsAt": v}).status_code
        ok((s == 200) == good, f"date {v} : {'acceptée' if good else 'refusée'} ({s})")
    ok(requests.patch(B + f"/studio/events/{e['id']}", headers=H, json={"inconnu": 1}).status_code == 400, "champ inconnu refusé (mode strict gardé)")
    requests.delete(B + f"/studio/events/{e['id']}", headers=H)

# --- messages de contrôle par défaut en français
d = requests.post(B + "/auth/login", json={})
ok(d.status_code == 400 and d.json().get("error") == "Données invalides", "corps vide : 400")
ok(any("Entrée invalide" in (i.get("message") or "") for i in d.json().get("details", [])), "message par défaut en français")
# identifiant au format 8-4-4-4-12 hors norme RFC : accepté par le contrôle (réponse 404, pas 400)
ok(requests.get(B + "/talks/11111111-1111-1111-1111-111111111111").status_code == 404, "identifiant inconnu : 404 (pas 400)")
ok(requests.get(B + "/talks/pas-un-identifiant").status_code in (400, 404), "identifiant mal formé refusé")

print("TOUT OK" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
