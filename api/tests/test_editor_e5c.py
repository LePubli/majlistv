"""Étape E5c — « Préciser la place des mots », côté API : GET /words (alignable, align), POST /words/align.
  - conférence envoyée et transcrite : alignable, demande créée (202, en attente), deuxième demande refusée (409 busy) ;
  - état suivi (processing, done avec chiffres, failed avec message) ; nouvelle demande possible une fois terminée ;
  - vidéo externe (YouTube) : refus clair (409 unsupported) ; pas de texte : 409 ; autre organisateur : 404 ;
  - migration 058 appliquée ; version du module.
Prérequis : API (3055) avec le module editor, PG (5544), S3 de test moto (5599).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e5c.py"""
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
    em = f"e5c{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
def talk(oid, source="upload", status="ready", text=True):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
                   values (%s,'d','X',%s,%s,%s,'published','ready','free',20,'fr','fr',%s) returning id""", (f"E5c {tag} {source}", source, f"talks/{tag}-{source}", oid, status))
    t = str(cur.fetchone()[0]); talks.append(t)
    if text:
        for i in range(3): cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',%s,%s,%s,%s)", (t, i, i * 5000, i * 5000 + 4900, f"Phrase {i} de test."))
    make_hls(s3, t, 20)
    return t
def project(O, t): return rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t}).json()["id"]

try:
    cur.execute("select 1 from information_schema.tables where table_name='word_align_jobs'"); ok(cur.fetchone() is not None, "migration 058 appliquée (table word_align_jobs)")
    oid, O = organizer("a"); oid2, O2 = organizer("b")
    T = talk(oid); P = project(O, T)
    w = rq("GET", f"/studio/editor/projects/{P}/words", headers=O).json()
    ok(w["alignable"] is True and w["align"] is None and w["precise"] == 0 and w["total"] == 3, "mots estimés : alignable, aucune demande")
    ok(rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O2).status_code == 404, "autre organisateur : 404")
    r = rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O)
    ok(r.status_code == 202 and r.json()["align"]["status"] == "pending" and r.json()["align"]["lang"] == "fr", f"demande créée : en attente ({r.status_code})")
    ok(rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O).json().get("code") == "busy", "deuxième demande : refusée (busy)")
    cur.execute("update word_align_jobs set status='processing', progress=40 where talk_id=%s", (T,))
    w = rq("GET", f"/studio/editor/projects/{P}/words", headers=O).json()
    ok(w["align"]["status"] == "processing" and w["align"]["progress"] == 40, "suivi : en cours, 40 %")
    ok(rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O).status_code == 409, "demande pendant le calcul : 409")
    cur.execute("update word_align_jobs set status='done', progress=100, aligned=3, total=3 where talk_id=%s", (T,))
    w = rq("GET", f"/studio/editor/projects/{P}/words", headers=O).json()
    ok(w["align"]["status"] == "done" and w["align"]["aligned"] == 3 and w["align"]["total"] == 3, "suivi : terminé, 3 phrases sur 3")
    r = rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O)
    ok(r.status_code == 202 and r.json()["align"]["status"] == "pending" and r.json()["align"]["aligned"] is None, "nouvelle demande possible après la fin (remise à zéro)")
    cur.execute("update word_align_jobs set status='failed', error='la vidéo n''a pas de piste audio' where talk_id=%s", (T,))
    w = rq("GET", f"/studio/editor/projects/{P}/words", headers=O).json()
    ok(w["align"]["status"] == "failed" and "piste audio" in w["align"]["error"], "suivi : échec avec son message")
    ok(rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O).status_code == 202, "nouvelle demande possible après un échec")
    # vidéo externe (la source change après la création du montage) : refus clair
    cur.execute("update talks set source='youtube' where id=%s", (T,))
    w = rq("GET", f"/studio/editor/projects/{P}/words", headers=O).json()
    r = rq("DELETE", f"/studio/editor/projects/{P}", headers=O) if False else None
    cur.execute("delete from word_align_jobs where talk_id=%s", (T,))
    r = rq("POST", f"/studio/editor/projects/{P}/words/align", headers=O)
    ok(w["alignable"] is False and r.status_code == 409 and r.json()["code"] == "unsupported", f"vidéo externe : non alignable, demande refusée ({r.status_code})")
    cur.execute("update talks set source='upload' where id=%s", (T,))
    # pas de texte
    T2 = talk(oid, text=False); P2 = project(O, T2)
    r = rq("POST", f"/studio/editor/projects/{P2}/words/align", headers=O)
    ok(r.status_code == 409 and r.json()["code"] == "no_text", f"pas de texte : refusé ({r.status_code})")
    # transcription pas prête
    cur.execute("update talks set transcript_status='processing' where id=%s", (T2,))
    ok(rq("POST", f"/studio/editor/projects/{P2}/words/align", headers=O).json().get("code") == "unsupported", "transcription pas prête : refusé")
    # supprimer la conférence supprime la demande
    cur.execute("insert into word_align_jobs(talk_id, lang) values (%s,'fr') on conflict do nothing", (T2,))
    cur.execute("delete from talks where id=%s", (T2,)); talks.remove(T2)
    cur.execute("select count(*) from word_align_jobs where talk_id=%s", (T2,)); ok(cur.fetchone()[0] == 0, "conférence supprimée : sa demande aussi")
    mods = rq("GET", "/admin/modules", headers=A).json(); mods = mods.get("modules", mods)
    ed = next((m for m in mods if m["id"] == "editor"), {}) if isinstance(mods, list) else mods.get("editor", {})
    ok(ed.get("version") == "0.9.0" and "E5c" in ed.get("description", "") and len(ed.get("description", "")) <= 600, f"module editor 0.9.0 ({ed.get('version')})")
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
