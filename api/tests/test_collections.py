"""19 : collections éditoriales et listes personnelles partageables.
Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def user(role="user"):
    email = f"co-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Co"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = str(cur.fetchone()[0])
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}, uid


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
MOD, _ = user("moderator"); ORG, oid = user("organizer"); U, uid = user(); U2, _ = user()
tag = uuid.uuid4().hex[:6]
def mk(n, pub="published"):
    tid = requests.post(B + "/talks", headers=ADM, json={"title": f"Conf collection {n} {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + n + "abcdefghi")[:11], "rightsConfirmed": True, "publication": pub}).json()["id"]
    return tid
t1, t2, t3 = mk("a"), mk("b"), mk("c", "draft")

# --- collections : droits
C = B + "/studio/collections"
ok(requests.get(C, headers=U).status_code == 403 and requests.get(C, headers=ORG).status_code == 403 and requests.get(C).status_code in (401, 403), "collections (équipe) : réservées au modérateur et à l'administrateur")
ok(requests.post(C, headers=MOD, json={"title": "ab"}).status_code == 400, "titre trop court refusé")
r = requests.post(C, headers=MOD, json={"title": f"Cycle de test {tag}", "description": "Un cycle", "kind": "cycle"})
ok(r.status_code == 201, "le modérateur crée une collection"); cid = r.json()["id"]
r = requests.post(C, headers=ADM, json={"title": f"Thème du moment {tag}", "kind": "theme", "published": True, "pinned": True})
ok(r.status_code == 201, "l'administrateur crée une collection"); pid = r.json()["id"]
ok(requests.post(C, headers=ADM, json={"title": f"Autre {tag}", "kind": "inconnu"}).status_code == 400, "type inconnu refusé")

# --- conférences de la collection
ok(requests.put(f"{C}/{cid}/items", headers=MOD, json={"talkIds": [t1, str(uuid.uuid4())]}).status_code == 400, "conférence inconnue refusée")
ok(requests.put(f"{C}/{cid}/items", headers=U, json={"talkIds": [t1]}).status_code == 403, "un membre ne peut pas modifier")
ok(requests.put(f"{C}/{cid}/items", headers=MOD, json={"talkIds": [t2, t1, t3, t1]}).json()["count"] == 3, "ordre enregistré (doublon ignoré)")
ed = requests.get(f"{C}/{cid}", headers=MOD).json()
ok([x["id"] for x in ed["talks"]] == [t2, t1, t3] and ed["talks"][2]["visible"] is False and ed["max"] == 100, "éditeur : ordre conservé, conférence invisible signalée")

# --- publique
ok(requests.get(f"{B}/collections/{cid}").status_code == 404, "collection non publiée : introuvable")
ok(cid not in [x["id"] for x in requests.get(B + "/collections").json()], "collection non publiée : absente de la liste")
requests.patch(f"{C}/{cid}", headers=MOD, json={"published": True})
pub = requests.get(f"{B}/collections/{cid}").json()
ok([x["id"] for x in pub["talks"]] == [t2, t1], "publique : ordre respecté, brouillon masqué")
lst = requests.get(B + "/collections").json()
mine = [x for x in lst if x["id"] == cid][0]
ok(mine["talks"] == 2 and mine["kind"] == "cycle", "liste publique : nombre de conférences visibles")
requests.put(f"{C}/{pid}/items", headers=ADM, json={"talkIds": [t1]})
lst = requests.get(B + "/collections").json()
ok(lst[0]["id"] == pid and lst[0]["pinned"] is True, "collection épinglée en tête")
cur.execute("update talks set publication='draft' where id in (%s,%s)", (t1, t2))
ok(cid not in [x["id"] for x in requests.get(B + "/collections").json()], "collection sans conférence visible : masquée")
cur.execute("update talks set publication='published' where id in (%s,%s)", (t1, t2))
ok(requests.patch(f"{C}/{cid}", headers=MOD, json={"title": f"Cycle renommé {tag}"}).status_code == 200 and requests.get(f"{B}/collections/{cid}").json()["title"].startswith("Cycle renommé"), "renommer")
ok(requests.patch(f"{C}/{uuid.uuid4()}", headers=MOD, json={"title": "Introuvable"}).status_code == 404, "collection inconnue : 404")

# --- listes personnelles
L = B + "/me/lists"
ok(requests.get(L).status_code == 401, "listes : connexion requise")
d = requests.get(L, headers=U).json()
ok(d["lists"] == [] and d["limit"] == 20, "aucune liste au départ")
ok(requests.post(L, headers=U, json={"title": ""}).status_code == 400, "titre vide refusé")
l1 = requests.post(L, headers=U, json={"title": "À regarder ce week-end", "description": "Pour la route"}).json(); lid = l1["id"]
ok(l1["shared"] is False and l1["items"] == 0, "liste créée, non partagée")
ok(requests.put(f"{L}/{lid}/items/{t1}", headers=U2).status_code == 404, "un autre membre ne peut pas modifier ma liste")
ok(requests.put(f"{L}/{lid}/items/{t1}", headers=U).status_code == 204 and requests.put(f"{L}/{lid}/items/{t2}", headers=U).status_code == 204, "ajout de deux conférences")
ok(requests.put(f"{L}/{lid}/items/{t1}", headers=U).status_code == 204 and requests.get(f"{L}/{lid}", headers=U).json()["items"] == 2, "ajout répété sans doublon")
ok(requests.put(f"{L}/{lid}/items/{t3}", headers=U).status_code == 404, "une conférence invisible ne peut pas être ajoutée")
ok(requests.get(f"{L}/containing/{t1}", headers=U).json() == [lid] and requests.get(f"{L}/containing/{t3}", headers=U).json() == [], "listes contenant une conférence")
det = requests.get(f"{L}/{lid}", headers=U).json()
ok([x["id"] for x in det["talks"]] == [t1, t2], "ordre d'ajout")
ok(requests.put(f"{L}/{lid}/items", headers=U, json={"talkIds": [t2, t1]}).status_code == 200 and [x["id"] for x in requests.get(f"{L}/{lid}", headers=U).json()["talks"]] == [t2, t1], "réordonner")
ok(requests.put(f"{L}/{lid}/items", headers=U, json={"talkIds": [t2, t1, t3]}).status_code == 400, "réordonner ne peut pas ajouter")
ok(requests.get(f"{L}/{lid}", headers=U2).status_code == 404, "la liste d'un autre est introuvable")

# partage
ok(requests.get(f"{B}/lists/shared/abcdefghijklmnopqrstuv").status_code == 404, "lien inconnu : 404")
tok = requests.post(f"{L}/{lid}/share", headers=U, json={}).json()["shareToken"]
ok(len(tok) >= 16 and requests.post(f"{L}/{lid}/share", headers=U, json={}).json()["shareToken"] == tok, "partage : lien stable")
sh = requests.get(f"{B}/lists/shared/{tok}")
j = sh.json()
ok(sh.status_code == 200 and j["title"] == "À regarder ce week-end" and [x["id"] for x in j["talks"]] == [t2, t1] and sh.headers.get("x-robots-tag") == "noindex", "liste partagée lisible sans compte, non indexée")
ok(uid not in sh.text and "email" not in sh.text.lower(), "la liste partagée ne révèle pas le membre")
cur.execute("update talks set publication='draft' where id=%s", (t2,))
ok([x["id"] for x in requests.get(f"{B}/lists/shared/{tok}").json()["talks"]] == [t1], "une conférence retirée du site disparaît de la liste partagée")
cur.execute("update talks set publication='published' where id=%s", (t2,))
tok2 = requests.post(f"{L}/{lid}/share", headers=U, json={"renew": True}).json()["shareToken"]
ok(tok2 != tok and requests.get(f"{B}/lists/shared/{tok}").status_code == 404 and requests.get(f"{B}/lists/shared/{tok2}").status_code == 200, "renouveler invalide l'ancien lien")
ok(requests.delete(f"{L}/{lid}/share", headers=U).status_code == 204 and requests.get(f"{B}/lists/shared/{tok2}").status_code == 404, "couper le partage")
ok(requests.delete(f"{L}/{lid}/items/{t1}", headers=U).status_code == 204 and requests.get(f"{L}/{lid}", headers=U).json()["items"] == 1, "retirer une conférence")
ok(requests.patch(f"{L}/{lid}", headers=U, json={"title": "Renommée"}).status_code == 200 and requests.get(L, headers=U).json()["lists"][0]["title"] == "Renommée", "renommer la liste")

# limites
cur.execute("insert into user_lists(user_id,title) select %s, 'x' || g from generate_series(1,19) g", (uid,))
r = requests.post(L, headers=U, json={"title": "21e"})
ok(r.status_code == 409 and r.json()["code"] == "limit", "limite de 20 listes")
ok(requests.delete(f"{L}/{lid}", headers=U2).status_code == 204 and len(requests.get(L, headers=U).json()["lists"]) == 20, "supprimer la liste d'un autre ne fait rien")
ok(requests.delete(f"{L}/{lid}", headers=U).status_code == 204 and requests.get(f"{L}/{lid}", headers=U).status_code == 404, "supprimer sa liste")

cur.execute("delete from collections where id=%s", (pid,))
# suppression d'une collection et du compte
ok(requests.delete(f"{C}/{cid}", headers=MOD).status_code == 204 and requests.get(f"{B}/collections/{cid}").status_code == 404, "supprimer une collection")
cur.execute("delete from users where id=%s", (uid,)); cur.execute("select count(*) from user_lists where user_id=%s", (uid,)); ok(cur.fetchone()[0] == 0, "compte supprimé : listes effacées")

# journal : le modérateur est tracé sur les collections
rows = requests.get(B + "/admin/audit?days=1&q=collection&limit=100", headers=ADM).json()["items"]
ok(any(r["actorRole"] == "moderator" and "Collection" in r["summary"] for r in rows), "journal : actions du modérateur sur les collections")
print("TOUT EST OK")
