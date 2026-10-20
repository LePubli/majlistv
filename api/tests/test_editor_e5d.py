"""Étape E5d — « le cadre suit le visage » (extraits 9:16), côté API et rendu :
  - migration 059 ; extrait sans suivi : cadre fixe, trajectoire à deux points ;
  - activer le suivi sans analyse : avertissement dans le plan ; lancer l'analyse (202), refaire, refus si elle tourne (409), autre organisateur (404) ;
  - analyse terminée (simulée comme le fait le service de transcription) : trajectoire qui bouge, à jour ; passage changé : analyse à refaire, cadre fixe ;
  - corrections à la main : enregistrées, recoupées au passage, chevauchement et position hors limites refusés ;
  - rendu réel par le worker : le cadre avance dans la vidéo (vrai FFmpeg) ; suppression de l'extrait efface l'analyse.
Prérequis (tout en local) : API (3055, module editor, redémarrée après la migration 059), PG (5544), S3 de test moto (5599), FFmpeg, dépendances du worker.
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e5d.py"""
import json, os, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
BUCKET = "majlis-videos"
tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []; fails = []
WENV = {**os.environ, "DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:5599", "S3_ACCESS_KEY": "test",
        "S3_SECRET_KEY": "test", "S3_REGION": "garage", "S3_BUCKET": BUCKET, "WORK_DIR": tempfile.mkdtemp(prefix="e5dw-"), "FFMPEG_THREADS": "2"}
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    if r.status_code == 429 and "/auth/" in path: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
def worker_once():
    p = subprocess.run(["node", os.path.join(ROOT, "worker", "tests", "run_render_once.mjs")], env=WENV, capture_output=True, text=True, timeout=600)
    try: return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: print(p.stdout, p.stderr); return {}
def fetch(url):
    d = tempfile.mkdtemp(prefix="e5dp-"); f = os.path.join(d, "v.mp4"); open(f, "wb").write(requests.get(url, timeout=120).content); return f
def red_center(f, t):
    b = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-ss", str(t), "-i", f, "-frames:v", "1", "-vf", "format=rgb24,crop=4:4:in_w/2-2:in_h/2-2", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return sum(b[i] for i in range(0, len(b), 3)) / (len(b) / 3)
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None
def short(sid, O): return rq("GET", f"/studio/editor/shorts/{sid}", headers=O).json()["short"]
def put(sid, O, **kw):
    s = short(sid, O); return rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": s["rev"], **kw})

A = login("admin@test.local", "AdminPassw0rd-test")
rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": True})
def organizer(label):
    em = f"e5d{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
oid, O = organizer("a"); oid2, O2 = organizer("b")

try:
    ok(one("select 1 from information_schema.tables where table_name='face_track_jobs'") == 1, "migration 059 appliquée (table face_track_jobs)")
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',40,'fr','fr') returning id""", (f"E5d suivi {tag}", f"talks/{tag}-orig", oid))
    T = str(cur.fetchone()[0]); talks.append(T)
    d = tempfile.mkdtemp(prefix="e5d-")
    # Source 1280 × 720 dont le rouge croît de gauche à droite : le rouge au centre de l'image verticale dit où est le cadre.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=25:d=40,geq=r='255*X/W':g=0:b=0", "-f", "lavfi", "-i", "sine=frequency=440:duration=40",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv444p", "-c:a", "aac", "-shortest", os.path.join(d, "orig.mp4")], check=True)
    s3.upload_file(os.path.join(d, "orig.mp4"), BUCKET, f"talks/{tag}-orig"); keys.append(f"talks/{tag}-orig")
    make_hls(s3, T, 40)
    expect_red = lambda x: 255 * ((x / 100) * (1280 - 404) + 202) / 1280
    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    sid = rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json={"from": 10, "to": 20, "cropX": 40}).json()["short"]["id"]

    S = short(sid, O)
    ok(S["follow"] is False and S["manual"] == [] and S["track"] is None, "extrait neuf : suivi éteint, aucune correction, aucune analyse")
    ok(len(S["path"]) == 2 and S["path"][0]["x"] == 40 and S["path"][1]["x"] == 40 and S["path"][0]["t"] == 10 and S["path"][1]["t"] == 20, f"trajectoire = cadre fixe à 40 % de 10 à 20 s ({S['path']})")

    # --- suivi demandé sans analyse
    r = put(sid, O, follow=True); ok(r.status_code == 200 and r.json()["short"]["follow"] is True, "suivi activé")
    S = short(sid, O); R0 = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "preview", "rev": S["rev"]}).json()["render"]["id"]
    plan = one("select plan from editor_renders where id=%s", R0)
    ok(any("suivi du visage n’est pas prêt" in w for w in plan["warnings"]) and "x='(iw-ow)*0.4'" in plan["script"]["video"], "rendu sans analyse : avertissement et cadre fixe (comme avant)")
    rq("POST", f"/studio/editor/renders/{R0}/cancel", headers=O)

    # --- analyse
    ok(rq("POST", f"/studio/editor/shorts/{sid}/track", headers=O2).status_code == 404, "analyse de l’extrait d’un autre : 404")
    r = rq("POST", f"/studio/editor/shorts/{sid}/track", headers=O)
    tr = r.json()["short"]["track"]
    ok(r.status_code == 202 and tr["status"] == "pending" and tr["fresh"] is True, "analyse demandée : en attente, à jour")
    ok(one("select from_s::float from face_track_jobs where project_id=%s", sid) == 10.0 and one("select to_s::float from face_track_jobs where project_id=%s", sid) == 20.0, "demande enregistrée avec le passage 10 → 20 s")
    ok(rq("POST", f"/studio/editor/shorts/{sid}/track", headers=O).status_code == 202, "refaire la demande pendant l’attente : accepté")
    cur.execute("update face_track_jobs set status='processing', progress=40 where project_id=%s", (sid,))
    S = short(sid, O); ok(S["track"]["status"] == "processing" and S["track"]["progress"] == 40, "suivi de l’avancement : 40 %")
    r = rq("POST", f"/studio/editor/shorts/{sid}/track", headers=O); ok(r.status_code == 409 and r.json()["code"] == "busy", "demande pendant le calcul : 409")
    cur.execute("update face_track_jobs set status='failed', error='Aucun visage repéré dans ce passage : le cadre reste fixe.' where project_id=%s", (sid,))
    S = short(sid, O); ok(S["track"]["status"] == "failed" and "Aucun visage" in S["track"]["error"] and S["path"][0]["x"] == S["path"][1]["x"], "analyse sans visage : message clair, cadre reste fixe")
    ok(rq("POST", f"/studio/editor/shorts/{sid}/track", headers=O).status_code == 202 and short(sid, O)["track"]["error"] is None, "nouvelle analyse après un échec : remise à zéro")

    # --- analyse terminée (comme le service de transcription l'écrit)
    cur.execute("update face_track_jobs set status='done', progress=100, keys=%s, coverage=0.9, faces=1, samples=30 where project_id=%s", (json.dumps([{"t": 10, "x": 0}, {"t": 20, "x": 100}]), sid))
    S = short(sid, O)
    ok(S["track"]["status"] == "done" and S["track"]["fresh"] and S["track"]["coverage"] == 0.9 and S["track"]["faces"] == 1, "analyse terminée : visage vu 90 % du temps, 1 personne")
    ok(S["path"][0]["x"] == 0 and S["path"][-1]["x"] == 100 and len(S["path"]) >= 2, f"trajectoire qui bouge : {S['path'][0]['x']} % → {S['path'][-1]['x']} %")

    # --- rendu réel : le cadre avance
    R1 = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "preview", "rev": S["rev"]}).json()["render"]["id"]
    plan = one("select plan from editor_renders where id=%s", R1)
    ok("clip(" in plan["script"]["video"] and not any("suivi du visage" in x for x in plan["warnings"]), "plan : cadrage par la trajectoire, aucun avertissement de suivi")
    w = worker_once(); ok(w.get("claimed") and w.get("ok"), f"le worker calcule l’aperçu ({w})")
    r1 = next(x for x in rq("GET", f"/studio/editor/projects/{sid}/renders", headers=O).json()["renders"] if x["id"] == R1)
    f = fetch(r1["url"]); reds = [red_center(f, t) for t in (1, 3, 5, 7, 9)]
    ok(r1["status"] == "ready" and all(abs(v - expect_red(x)) < 12 for v, x in zip(reds, (10, 30, 50, 70, 90))), f"aperçu réel : le cadre avance (rouge au centre {' → '.join(f'{v:.0f}' for v in reds)})")

    # --- corrections à la main
    r = put(sid, O, manual=[{"from": 14, "to": 16, "x": 100}]); M = r.json()["short"]
    ok(r.status_code == 200 and M["manual"] == [{"from": 14, "to": 16, "x": 100}], "correction enregistrée (14–16 s, cadre à droite)")
    xs = {p["t"]: p["x"] for p in M["path"]}; ok(xs.get(14) == 100 and xs.get(16) == 100, "trajectoire : cadre à 100 % pendant 14–16 s")
    ok(put(sid, O, manual=[{"from": 14, "to": 16, "x": 100}, {"from": 15, "to": 17, "x": 0}]).status_code == 400, "deux corrections qui se chevauchent : 400")
    ok(put(sid, O, manual=[{"from": 14, "to": 16, "x": 130}]).status_code == 400, "position hors limites : 400")
    ok(put(sid, O, manual=[{"from": 14, "to": 14.2, "x": 30}]).status_code == 400, "correction trop courte : 400")
    ok(short(sid, O)["manual"] == [{"from": 14, "to": 16, "x": 100}], "les refus ne changent rien")
    # --- passage raccourci : correction recoupée / écartée ; analyse devenue périmée
    r = put(sid, O, to=15); M = r.json()["short"]
    ok(r.status_code == 200 and M["manual"] == [{"from": 14, "to": 15, "x": 100}], "passage raccourci à 10–15 s : correction recoupée (14–15 s)")
    ok(M["track"]["fresh"] is False and M["path"][0]["x"] == 40 and any(p["x"] == 100 for p in M["path"]), "passage changé : l’analyse n’est plus à jour (cadre fixe à 40 %, correction à 100 % gardée)")
    r = put(sid, O, to=13); M = r.json()["short"]; ok(M["manual"] == [], "passage 10–13 s : correction hors passage écartée")
    S = short(sid, O); R2 = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "preview", "rev": S["rev"]}).json()["render"]["id"]
    plan = one("select plan from editor_renders where id=%s", R2)
    ok(any("suivi du visage n’est pas prêt" in x for x in plan["warnings"]), "rendu avec analyse périmée : avertissement")
    rq("POST", f"/studio/editor/renders/{R2}/cancel", headers=O)
    ok(rq("POST", f"/studio/editor/shorts/{sid}/track", headers=O).status_code == 202 and one("select to_s::float from face_track_jobs where project_id=%s", sid) == 13.0 and one("select keys from face_track_jobs where project_id=%s", sid) is None, "nouvelle analyse sur 10–13 s : ancienne trajectoire effacée")

    # --- suppression
    ok(rq("DELETE", f"/studio/editor/shorts/{sid}", headers=O).json().get("deleted") and one("select count(*) from face_track_jobs where project_id=%s", sid) == 0, "supprimer l’extrait efface son analyse")
    mods = rq("GET", "/admin/modules", headers=A).json(); mods = mods.get("modules", mods)
    ed = next((m for m in mods if m["id"] == "editor"), {}) if isinstance(mods, list) else mods.get("editor", {})
    ok(ed.get("version") == "0.9.0" and "E5d" in ed.get("description", "") and len(ed.get("description", "")) <= 600, f"module editor 0.9.0 ({ed.get('version')})")
finally:
    for t in talks:
        cur.execute("delete from activity_controls where queue='render' and ref in (select id::text from editor_renders where talk_id=%s)", (t,))
        cur.execute("delete from face_track_jobs where talk_id=%s", (t,))
        cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    for k in keys:
        try: s3.delete_object(Bucket=BUCKET, Key=k)
        except Exception: pass

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
