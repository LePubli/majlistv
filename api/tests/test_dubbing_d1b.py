"""Étape D1b — relecture, marquage « voix d'origine », glossaire de prononciation, contrôle qualité.
Prérequis : API (3055) avec le module « dubbing » 0.4.0, PG (5544)."""
import sys, time, uuid
import psycopg2, requests

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; talks, gl = [], []
def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for g in gl: cur.execute("delete from dub_glossary where id=%s", (g,))
    cur.execute("delete from dub_glossary where term like %s", (f"%{tag}%",))
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: cleanup(); sys.exit(1)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, **kw)
    return r
A = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
em = f"d1b-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = cur.fetchone()[0]
O = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True, "settings": {"mod_dubbing_require_review": "true"}})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
               values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',60,'ar','ar') returning id""", (f"D1b {tag}", "y" + tag, aid)); T = str(cur.fetchone()[0]); talks.append(T)
lines = ["Au nom d'Allah", "Que nous éclaire l'Imam Ibn Outhaymine", "Une phrase trop longue pour son créneau", "# ancienne convention"]
for i, txt in enumerate(lines):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (T, i, i * 5000, i * 5000 + 4000, txt))
P = f"/studio/dubbing/talks/{T}"

# --- glossaire
ok(rq("POST", "/studio/dubbing/glossary", headers=A, json={"term": "", "say": "x"}).status_code == 400, "terme vide refusé")
ok(rq("POST", "/studio/dubbing/glossary", headers=O, json={"term": "x", "say": "y"}).status_code == 403, "organisateur : glossaire refusé")
g1 = rq("POST", "/studio/dubbing/glossary", headers=A, json={"term": f"Ibn Outhaymine{tag}", "say": "Ibne Outhaïmine"}).json()
r = rq("POST", "/studio/dubbing/glossary", headers=A, json={"term": "Ibn Outhaymine", "say": "Ibne Outhaïmine", "notes": tag}); ok(r.status_code == 201 and r.json()["wholeWord"], "terme ajouté (mot entier par défaut)"); gl += [g1["id"], r.json()["id"]]
r = rq("POST", "/studio/dubbing/glossary", headers=A, json={"term": "Imam", "say": "Imame", "notes": tag}); gl.append(r.json()["id"]); gimam = r.json()["id"]
ok(rq("POST", "/studio/dubbing/glossary", headers=A, json={"term": "imam", "say": "x"}).json().get("code") == "duplicate", "terme en double refusé (majuscules ignorées)")
pv = rq("GET", "/studio/dubbing/glossary", headers=A, params={"text": "L'Imam Ibn Outhaymine. Imamat."}).json()["preview"]
ok(pv["text"] == "L'Imame Ibne Outhaïmine. Imamat.", f"essai de prononciation : remplacements, mot entier respecté ({pv['text']})")
ok(rq("PATCH", f"/studio/dubbing/glossary/{gimam}", headers=A, json={"say": "Imâme"}).json()["say"] == "Imâme", "prononciation modifiée")
ok(any(e["term"] == "Imam" for e in rq("GET", "/studio/dubbing/glossary?q=ima", headers=A).json()["entries"]), "recherche dans le glossaire")

# --- fiche : marquages, prononciation, relecture
d = rq("GET", P, headers=A).json()
seg = {s["idx"]: s for s in d["segments"]}
ok(d["kept"] == 1 and seg[3]["keep"] and not seg[0]["keep"], "« # » reste compris (ancienne convention)")
ok({"term": "Imam", "say": "Imâme"} in seg[1]["say"] and {"term": "Ibn Outhaymine", "say": "Ibne Outhaïmine"} in seg[1]["say"], "colonne prononciation : remplacements du glossaire par phrase")
ok(d["glossaryCount"] >= 2 and d["requireReview"] and d["review"] == {"validated": False, "stale": False}, "relecture pas encore faite")
ok(rq("POST", f"{P}/jobs", headers=A, json={"kind": "full"}).json().get("code") == "review_required", "doublage complet refusé tant que la relecture n'est pas validée")
cur.execute("delete from dub_jobs where talk_id=%s", (T,))
ok(rq("POST", f"{P}/jobs", headers=A, json={"kind": "preview"}).status_code == 201, "écoute de 60 s possible sans relecture")
cur.execute("delete from dub_jobs where talk_id=%s", (T,))
r = rq("PATCH", f"{P}/segments/0", headers=A, json={"keepOriginal": True}).json()
ok(r["segment"]["keep"] and r["kept"] == 2 and r["segment"]["say"] == [], "phrase marquée « voix d'origine » d'un clic (exclue du temps de parole)")
r = rq("PATCH", f"{P}/segments/3", headers=A, json={"keepOriginal": False}).json()
ok(not r["segment"]["keep"] and r["segment"]["text"] == "ancienne convention", "retirer la case enlève aussi l'ancien « # » du texte")
ok(rq("PATCH", f"{P}/segments/1", headers=A, json={"text": "   "}).status_code == 400, "texte vide refusé")
ok(rq("PATCH", f"{P}/segments/99", headers=A, json={"text": "x"}).status_code == 404, "phrase inconnue : 404")
ok(rq("PATCH", f"{P}/segments/1", headers=O, json={"text": "x"}).status_code == 403, "organisateur : modification refusée")
r = rq("POST", f"{P}/review", headers=A, json={"validated": True}).json()
ok(r["review"]["validated"] and r["review"]["reviewedBy"], "relecture validée (qui, quand)")
code = rq("POST", f"{P}/jobs", headers=A, json={"kind": "full"}).status_code; ok(code == 201, "doublage complet accepté après relecture")
cur.execute("delete from dub_jobs where talk_id=%s", (T,))
r = rq("PATCH", f"{P}/segments/2", headers=A, json={"text": "Phrase raccourcie"}).json()
ok(r["segment"]["text"] == "Phrase raccourcie" and r["review"] == {"validated": False, "stale": True, "reviewedAt": r["review"]["reviewedAt"], "reviewedBy": r["review"]["reviewedBy"]}, "texte corrigé : relecture « à refaire »")
cur.execute("select text from transcript_segments where talk_id=%s and lang='fr' and idx=2", (T,)); ok(cur.fetchone()[0] == "Phrase raccourcie", "la correction vaut aussi pour les sous-titres français")
ok(rq("POST", f"{P}/jobs", headers=A, json={"kind": "full"}).json().get("code") == "review_required", "relecture à refaire : doublage complet refusé")
ok({x["id"]: x for x in rq("GET", f"/studio/dubbing/talks?q={tag}", headers=A).json()["talks"]}[T]["reviewed"] is False, "liste : relecture à refaire n'est plus « relue »")
rq("POST", f"{P}/review", headers=A, json={"validated": True})
r = rq("PATCH", f"{P}/segments/2", headers=A, json={"accepted": True}).json(); ok(r["segment"]["accepted"] and r["review"]["validated"], "contrôle qualité : « accepter tel quel » ne remet pas en cause la relecture")
r = rq("PATCH", f"{P}/segments/2", headers=A, json={"text": "Encore plus court"}).json(); ok(not r["segment"]["accepted"], "texte changé : l'acceptation est retirée")
ok(rq("POST", f"{P}/review", headers=A, json={"validated": False}).json()["review"]["validated"] is False, "annuler la validation")
lst = {x["id"]: x for x in rq("GET", f"/studio/dubbing/talks?q={tag}", headers=A).json()["talks"]}; ok(lst[T]["reviewed"] is False, "liste : relecture non validée")
rq("POST", f"{P}/review", headers=A, json={"validated": True})
ok({x["id"]: x for x in rq("GET", f"/studio/dubbing/talks?q={tag}", headers=A).json()["talks"]}[T]["reviewed"], "liste : « relue »")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"settings": {"mod_dubbing_require_review": "false"}})
rq("PATCH", f"{P}/segments/2", headers=A, json={"text": "Autre texte"})
ok(rq("POST", f"{P}/jobs", headers=A, json={"kind": "full"}).status_code == 201, "relecture non obligatoire (réglage) : doublage complet accepté")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"settings": {"mod_dubbing_require_review": "true"}})
ok(rq("DELETE", f"/studio/dubbing/glossary/{gimam}", headers=A).status_code == 204, "terme supprimé")
cur.execute("delete from users where email=%s", (em,))
cleanup(); print("Tout est OK")
