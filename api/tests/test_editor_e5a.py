"""Étape E5a — montage par le texte, côté API : GET /studio/editor/projects/:id/words.
  - langue parlée par défaut, liste des langues, traduction à la demande ;
  - mots précis (horodatage Whisper) quand ils correspondent à la phrase ; estimés sinon (phrase corrigée, pas de mots, traduction) ;
  - mot qui déborde de sa phrase ramené dedans ; droits (organisateur d'une autre conférence : 404) ; langue invalide : 400 ;
  - conférence sans transcription : texte vide.
Prérequis : API (3055) avec le module editor, PG (5544), S3 de test moto (5599).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e5a.py"""
import os, sys, time, uuid
import boto3, psycopg2, requests
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks = []; users = []; fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=60, **kw)
    if r.status_code == 429 and "/auth/" in path: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=60, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test")
rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": True})
def organizer(label):
    em = f"e5{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
oid, O = organizer("a"); oid2, O2 = organizer("b")
def talk(title, owner):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','X','upload','talks/none.mp4',%s,'published','ready','free',30,'ar','ar') returning id""", (title, owner))
    t = str(cur.fetchone()[0]); talks.append(t); return t
def seg(t, lang, idx, s, e, text):
    cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,%s,%s,%s,%s,%s)", (t, lang, idx, s, e, text))
def words(t, lang, si, items):
    for k, (s, e, w) in enumerate(items):
        cur.execute("insert into transcript_words(talk_id, lang, seg_idx, idx, start_ms, end_ms, word) values (%s,%s,%s,%s,%s,%s,%s)", (t, lang, si, k, s, e, w))

try:
    T = talk(f"E5a texte {tag}", oid); make_hls(s3, T, 30)
    seg(T, "ar", 0, 0, 3000, "بسم الله الرحمن"); words(T, "ar", 0, [(100, 700, "بسم"), (800, 1400, "الله"), (1500, 3400, "الرحمن")])
    seg(T, "ar", 1, 4000, 8000, "الصبر نور عظيم"); words(T, "ar", 1, [(4000, 5000, "الصبر"), (5100, 6000, "ضياء")])  # phrase corrigée ensuite
    seg(T, "ar", 2, 9000, 12000, "ثم الختام")  # pas de mots (transcrite avant E5a)
    for i, (s, e, x) in enumerate([(0, 3000, "Au nom de Dieu, le Clément."), (4000, 8000, "La patience est une lumière."), (9000, 12000, "Puis la fin.")]): seg(T, "fr", i, s, e, x)
    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]

    r = rq("GET", f"/studio/editor/projects/{pid}/words", headers=O); d = r.json()
    ok(r.status_code == 200 and d["lang"] == "ar" and d["origin"] == "ar" and d["langs"] == ["ar", "fr"], f"langue parlée par défaut, langues disponibles ({d.get('lang')}, {d.get('langs')})")
    s0, s1, s2 = d["segments"]
    ok(s0["precise"] and [w["w"] for w in s0["words"]] == ["بسم", "الله", "الرحمن"] and s0["words"][0] == {"s": 0.1, "e": 0.7, "w": "بسم"}, "phrase 1 : mots précis (Whisper)")
    ok(s0["words"][2]["e"] == 3.0, "mot qui déborde de sa phrase : ramené à la fin de la phrase")
    ok(not s1["precise"] and [w["w"] for w in s1["words"]] == ["الصبر", "نور", "عظيم"], "phrase corrigée (mots différents) : place estimée, mots du texte corrigé")
    ok(s1["words"][0]["s"] == 4.0 and s1["words"][-1]["e"] == 8.0 and all(a["e"] == b["s"] for a, b in zip(s1["words"], s1["words"][1:])), "estimation : la phrase entière est répartie, sans trou")
    ok(not s2["precise"] and len(s2["words"]) == 2 and d["precise"] == 1 and d["total"] == 3, f"phrase sans mots : estimée ; compte des phrases précises ({d['precise']}/{d['total']})")

    d = rq("GET", f"/studio/editor/projects/{pid}/words?lang=fr", headers=O).json()
    ok(d["lang"] == "fr" and d["origin"] == "ar" and d["precise"] == 0 and d["segments"][1]["text"] == "La patience est une lumière." and len(d["segments"][1]["words"]) == 5, "traduction française à la demande (estimée)")
    ok(rq("GET", f"/studio/editor/projects/{pid}/words?lang=de", headers=O).json()["lang"] == "ar", "langue absente : langue parlée")
    ok(rq("GET", f"/studio/editor/projects/{pid}/words?lang=x%27%3B", headers=O).status_code == 400, "langue invalide : 400")
    ok(rq("GET", f"/studio/editor/projects/{pid}/words", headers=O2).status_code == 404, "organisateur d’une autre conférence : 404")
    ok(rq("GET", f"/studio/editor/projects/{pid}/words", headers=A).status_code == 200, "administrateur : accès")
    ok(rq("GET", f"/studio/editor/projects/{pid}/words").status_code == 401, "sans connexion : 401")

    # Phrase corrigée à la main en gardant les mêmes mots (ponctuation, majuscules) : reste précise.
    cur.execute("update transcript_segments set text='بسم  الله الرحمن' where talk_id=%s and lang='ar' and idx=0", (T,))
    ok(rq("GET", f"/studio/editor/projects/{pid}/words", headers=O).json()["segments"][0]["precise"], "espaces différents : toujours précis")

    T2 = talk(f"E5a sans texte {tag}", oid); make_hls(s3, T2, 10)
    p2 = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T2}).json()["id"]
    d = rq("GET", f"/studio/editor/projects/{p2}/words", headers=O).json()
    ok(d["lang"] is None and d["segments"] == [] and d["langs"] == [], "sans transcription : texte vide")

    mods = rq("GET", "/admin/modules", headers=A).json(); mods = mods.get("modules", mods)
    ed = next((m for m in mods if m["id"] == "editor"), {}) if isinstance(mods, list) else mods.get("editor", {})
    ok(ed.get("version") == "0.6.0" and "E5a" in ed.get("description", ""), f"module editor 0.6.0 ({ed.get('version')})")

    # Conférence supprimée : les mots partent avec elle.
    cur.execute("delete from talks where id=%s", (T,))
    ok(rq("GET", "/health").ok and (cur.execute("select count(*) from transcript_words where talk_id=%s", (T,)) or cur.fetchone()[0]) == 0, "conférence supprimée : mots effacés (cascade)")
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
