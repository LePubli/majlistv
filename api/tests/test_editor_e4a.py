"""Étape E4a — rendu de la vidéo montée : demande (montage enregistré), file d'attente, worker (même code que le service), fichier MP4,
lecture et téléchargement, annulation (en attente et en cours), échec après 2 essais, source de secours (vidéo convertie quand l'original
n'existe plus), 3 rendus gardés par projet, effacement, Studio → Activité (pause, priorité), droits, journal d'audit.

Prérequis (tout en local) : API (3055), PG (5544), S3 de test moto (5599, bucket majlis-videos), FFmpeg, dépendances du worker (npm ci dans worker/).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e4a.py"""
import json, os, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls, add_transcript

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
BUCKET = "majlis-videos"
tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []; assets = []; fails = []
WENV = {**os.environ, "DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:5599", "S3_ACCESS_KEY": "test",
        "S3_SECRET_KEY": "test", "S3_REGION": "garage", "S3_BUCKET": BUCKET, "WORK_DIR": tempfile.mkdtemp(prefix="e4w-"), "FFMPEG_THREADS": "2"}
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
def until(fn, t=60, step=0.3):
    end = time.time() + t
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(step)
    return None
def probe_url(url):
    d = tempfile.mkdtemp(prefix="e4p-"); f = os.path.join(d, "v.mp4")
    r = requests.get(url, timeout=120); open(f, "wb").write(r.content)
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", f], capture_output=True, text=True).stdout)
    return r, j

A = login("admin@test.local", "AdminPassw0rd-test")
for m in ("editor", "dubbing"): rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
def organizer(label):
    em = f"e4{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
oid, O = organizer("a"); oid2, O2 = organizer("b")

try:
    # Conférence : original 1280x720 de 40 s dans le stockage (comme un envoi), version convertie (HLS 360p), sous-titres, voix française.
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',40,'ar','ar') returning id""", (f"E4 rendu {tag}", f"talks/{tag}-orig", oid))
    T = str(cur.fetchone()[0]); talks.append(T)
    d = tempfile.mkdtemp(prefix="e4-")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=40", "-f", "lavfi", "-i", "sine=frequency=440:duration=40",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", os.path.join(d, "orig.mp4")], check=True)
    s3.upload_file(os.path.join(d, "orig.mp4"), BUCKET, f"talks/{tag}-orig"); keys.append(f"talks/{tag}-orig")
    make_hls(s3, T, 40); add_transcript(cur, T, 40)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:duration=40", "-af", "volume='if(between(t,6,11),1,0)':eval=frame",
                    "-c:a", "aac", "-b:a", "64k", os.path.join(d, "voice.m4a")], check=True)
    vkey = f"dubbing/tracks/{T}/test-voice.m4a"; s3.upload_file(os.path.join(d, "voice.m4a"), BUCKET, vkey); keys.append(vkey)
    cur.execute("insert into dub_jobs(talk_id, kind, status, params, finished_at) values (%s,'full','done','{}', now()) returning id", (T,)); jd = cur.fetchone()[0]
    cur.execute("insert into dub_tracks(talk_id, job_id, voice_key, duration_s) values (%s,%s,%s,40)", (T, jd, vkey))
    # Musique de la bibliothèque (analysée) et logo importé.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=15", "-c:a", "libmp3lame", os.path.join(d, "m.mp3")], check=True)
    mkey = f"editor/music/{uuid.uuid4()}.mp3"; s3.upload_file(os.path.join(d, "m.mp3"), BUCKET, mkey); keys.append(mkey)
    cur.execute("insert into editor_assets(title, key, mime) values (%s, %s, 'audio/mpeg') returning id", (f"Musique {tag}", mkey)); M = str(cur.fetchone()[0]); assets.append(M)
    cur.execute("insert into editor_waveforms(kind, asset_id, src, status, duration_s) values ('music', %s, %s, 'ready', 15)", (M, mkey))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=200x100:d=1", "-frames:v", "1", os.path.join(d, "logo.png")], check=True)
    lkey = f"editor/logos/{uuid.uuid4()}.png"; s3.upload_file(os.path.join(d, "logo.png"), BUCKET, lkey); keys.append(lkey)
    cur.execute("insert into editor_assets(kind, title, key, mime, meta) values ('logo', %s, %s, 'image/png', '{\"w\":200,\"h\":100}') returning id", (f"Logo {tag}", lkey)); LG = str(cur.fetchone()[0]); assets.append(LG)

    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    S = "sess-" + tag + "-e4"
    p = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()
    ok(p["media"]["dub"]["voiceUrl"] and "voiceKey" not in p["media"]["dub"], "voix française : la clé du stockage n’est pas envoyée au site")
    rev = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S}).json()["rev"]
    tl = {"v": 1, "duration": 40, "clips": [{"id": "c1", "in": 0, "out": 12}, {"id": "c2", "in": 20, "out": 32}],
          "audio": {"music": [{"id": "m1", "asset": M, "start": 0, "len": 20, "loop": True}], "dub": {"use": True}},
          "dress": {"items": [{"id": "t1", "kind": "title", "text": "{titre}", "sub": "", "start": 1, "len": 3}],
                    "logo": {"on": True, "asset": LG, "pos": "br", "size": 10, "opacity": 100, "from": 0, "to": None},
                    "intro": {"on": True, "len": 2, "title": "{titre}", "sub": "{intervenant}"}, "outro": {"on": False},
                    "transitions": {"all": {"type": "dip", "len": 0.8}, "byClip": {}}, "subs": {"burn": True}}}
    r = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": tl, "rev": rev, "session": S}); ok(r.ok, f"montage enregistré ({r.status_code})"); rev = r.json()["rev"]

    # --- demande
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "final", "rev": rev - 1})
    ok(r.status_code == 409 and r.json()["code"] == "not_saved" and r.json()["rev"] == rev, "révision dépassée : « pas encore enregistré » (409)")
    ok(rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "big", "rev": rev}).status_code == 400, "sorte de rendu inconnue : 400")
    ok(rq("POST", f"/studio/editor/projects/{pid}/render", headers=O2, json={"kind": "final", "rev": rev}).status_code == 404, "autre organisateur : 404")
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "final", "rev": rev})
    ok(r.status_code == 201 and r.json()["render"]["status"] == "queued" and r.json()["heavyAllowed"] is True, f"rendu final demandé ({r.status_code})")
    R1 = r.json()["render"]["id"]
    v = r.json()["render"]
    ok(v["duration"] == 26 and v["estimateS"] == 26 and v["summary"]["parts"] == 2 and v["summary"]["dub"] and v["summary"]["logo"] and v["summary"]["subs"], f"plan : 26 s (2 + 24), 2 passages, voix française, logo, sous-titres ({v['summary']})")
    ok(rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "preview", "rev": rev}).json().get("code") == "busy", "un seul rendu à la fois par projet (409 busy)")
    lst = rq("GET", f"/studio/editor/projects/{pid}/renders", headers=O).json()
    ok(lst["renders"][0]["id"] == R1 and lst["position"] >= 1 and lst["keep"] == 3 and lst["rev"] == rev, f"liste : en attente, position {lst['position']} dans la file")

    # --- Studio → Activité : la tâche apparaît, se met en pause (le worker ne la prend pas), reprend.
    acts = rq("GET", "/studio/activity", headers=O).json()["tasks"]
    t = next((x for x in acts if x["queue"] == "render" and x["ref"] == R1), None)
    ok(t and t["status"] == "waiting" and t["kind"] == "final" and t["heavy"], "Studio → Activité : rendu en attente (tâche lourde)")
    r = rq("POST", f"/studio/activity/render/{R1}/pause", headers=A, json={"paused": True})
    ok(r.ok and r.json()["task"]["status"] == "paused", f"pause d’un rendu en attente ({r.status_code})")
    ok(worker_once().get("claimed") is False, "rendu en pause : le worker ne le prend pas")
    ok(rq("POST", f"/studio/activity/render/{R1}/pause", headers=A, json={"paused": False}).ok, "reprise")
    ok(rq("POST", f"/studio/activity/render/{R1}/priority", headers=A, json={"priority": 10}).ok, "priorité haute")
    # Le correctif de la contrainte vaut aussi pour les analyses du son (file « editor », étape E2).
    cur.execute("insert into activity_controls(queue, ref, paused) values ('editor', %s, true)", (str(uuid.uuid4()),)); ok(True, "file « editor » acceptée par la base (pause des analyses du son)")
    cur.execute("delete from activity_controls where queue='editor' and ref not in (select id::text from editor_waveforms)")

    # --- calcul par le worker
    w = worker_once()
    ok(w.get("claimed") and w.get("id") == R1 and w.get("ok"), f"le worker calcule le rendu ({w})")
    r1 = next(x for x in rq("GET", f"/studio/editor/projects/{pid}/renders", headers=O).json()["renders"] if x["id"] == R1)
    ok(r1["status"] == "ready" and r1["progress"] == 100 and r1["url"] and r1["downloadUrl"] and r1["bytes"] > 10000, f"rendu prêt : {r1['bytes']} octets, {r1['report']['renderS']} s de calcul")
    ok(r1["report"]["width"] == 1280 and r1["report"]["height"] == 720 and r1["report"]["measured"] and r1["report"]["srcHeight"] == 720, "qualité de la source (original 720p) et niveau sonore mesuré")
    resp, pj = probe_url(r1["url"])
    vs = next(s for s in pj["streams"] if s["codec_type"] == "video")
    ok(abs(float(pj["format"]["duration"]) - 26) < 0.3 and vs["codec_name"] == "h264" and vs["width"] == 1280 and any(s["codec_type"] == "audio" for s in pj["streams"]),
       f"fichier lu dans le stockage : H.264 1280x720, {float(pj['format']['duration']):.2f} s")
    dl = requests.get(r1["downloadUrl"], timeout=60, stream=True)
    ok("attachment" in dl.headers.get("content-disposition", "") and ".mp4" in dl.headers.get("content-disposition", ""), f"téléchargement : {dl.headers.get('content-disposition')}")
    dl.close()
    cur.execute("select output_key from editor_renders where id=%s", (R1,)); okey = cur.fetchone()[0]
    ok(okey == f"editor/renders/{pid}/{R1}-final.mp4", "fichier rangé sous editor/renders/<projet>/")

    # --- annulation en attente
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=A, json={"kind": "preview", "rev": rev}); R2 = r.json()["render"]["id"]
    ok(until(lambda: cur.execute("select summary from audit_log where summary like %s order by id desc limit 1", (f"%aperçu rapide demandé (« E4 rendu {tag}%",)) or cur.fetchone(), 5), "journal d’audit : rendu demandé par l’administrateur")
    ok(rq("POST", f"/studio/editor/renders/{R2}/cancel", headers=O2).status_code == 404, "annuler le rendu d’un autre : 404")
    ok(rq("POST", f"/studio/editor/renders/{R2}/cancel", headers=O).json().get("canceled"), "annulé en attente")
    cur.execute("select status from editor_renders where id=%s", (R2,)); ok(cur.fetchone()[0] == "canceled", "statut « annulé »")
    ok(rq("POST", f"/studio/editor/renders/{R2}/cancel", headers=O).status_code == 409, "annuler deux fois : 409")

    # --- annulation pendant le calcul
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "final", "rev": rev}); R3 = r.json()["render"]["id"]
    proc = subprocess.Popen(["node", os.path.join(ROOT, "worker", "tests", "run_render_once.mjs")], env=WENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    run = until(lambda: (lambda x: x if x and x[0] == "running" and x[1] in ("measure", "encode") else None)(cur.execute("select status, stage from editor_renders where id=%s", (R3,)) or cur.fetchone()), 60, 0.1)
    ok(run is not None, f"rendu en cours ({run})")
    ok(rq("POST", f"/studio/activity/render/{R3}/pause", headers=A, json={"paused": True}).status_code == 409, "un rendu en cours ne se met pas en pause (il s’annule)")
    ok(rq("POST", f"/studio/editor/renders/{R3}/cancel", headers=O).json().get("canceled"), "annulation demandée pendant le calcul")
    out, _ = proc.communicate(timeout=120)
    cur.execute("select status from editor_renders where id=%s", (R3,)); st = cur.fetchone()[0]
    ok(st == "canceled" and '"canceled":true' in out, f"le worker arrête FFmpeg : {st}")

    # --- source de secours : l'original n'existe plus → meilleure qualité convertie (ici 360p) ; aperçu rapide
    s3.delete_object(Bucket=BUCKET, Key=f"talks/{tag}-orig")
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "final", "rev": rev}); R4 = r.json()["render"]["id"]
    w = worker_once(); r4 = next(x for x in rq("GET", f"/studio/editor/projects/{pid}/renders", headers=O).json()["renders"] if x["id"] == R4)
    ok(w.get("ok") and r4["status"] == "ready" and r4["report"]["height"] == 360 and r4["report"]["srcHeight"] == 360, f"original absent : rendu depuis la version convertie 360p ({r4['report'] and r4['report']['height']})")
    lst = rq("GET", f"/studio/editor/projects/{pid}/renders", headers=O).json()["renders"]
    ok(len(lst) == 3 and R1 not in [x["id"] for x in lst], f"3 rendus gardés par projet ({len(lst)})")
    cur.execute("select count(*) from editor_renders where id=%s", (R1,)); gone = cur.fetchone()[0] == 0
    try: s3.head_object(Bucket=BUCKET, Key=okey); still = True
    except Exception: still = False
    ok(gone and not still, "le plus ancien est effacé avec son fichier")

    # --- échec : la musique a disparu du stockage → 2 essais puis « en échec »
    s3.delete_object(Bucket=BUCKET, Key=mkey)
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "preview", "rev": rev}); R5 = r.json()["render"]["id"]
    w1 = worker_once(); cur.execute("select status, attempts from editor_renders where id=%s", (R5,)); s1 = cur.fetchone()
    w2 = worker_once(); cur.execute("select status, attempts, error from editor_renders where id=%s", (R5,)); s2 = cur.fetchone()
    ok(s1 == ("queued", 1) and s2[0] == "failed" and s2[1] == 2 and s2[2], f"échec : nouvel essai puis « en échec » ({s1}, {s2[:2]}, {s2[2][:80] if s2[2] else ''})")
    acts = rq("GET", "/studio/activity", headers=O).json()["tasks"]
    ok(any(x["queue"] == "render" and x["ref"] == R5 and x["status"] == "failed" for x in acts), "Studio → Activité : rendu en échec visible")

    # --- musique retirée de la bibliothèque : le rendu est refusé avant la file
    cur.execute("delete from editor_waveforms where asset_id=%s", (M,))
    r = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "preview", "rev": rev})
    ok(r.status_code == 400 and "musique" in r.json()["error"].lower(), f"musique plus dans la bibliothèque : refus clair ({r.json().get('error')})")

    # --- effacer un rendu, effacer le projet (fichiers compris)
    ok(rq("DELETE", f"/studio/editor/renders/{R4}", headers=O2).status_code == 404, "effacer le rendu d’un autre : 404")
    cur.execute("select output_key from editor_renders where id=%s", (R4,)); k4 = cur.fetchone()[0]
    ok(rq("DELETE", f"/studio/editor/renders/{R4}", headers=O).json().get("deleted"), "rendu effacé")
    try: s3.head_object(Bucket=BUCKET, Key=k4); ok(False, "fichier du rendu effacé")
    except Exception: ok(True, "fichier du rendu effacé")
    ok(rq("GET", f"/studio/editor/projects/{pid}/renders", headers=A).ok, "l’administrateur voit les rendus de tous")
    ok(rq("DELETE", f"/studio/editor/projects/{pid}?session={S}", headers=O).json().get("deleted"), "projet supprimé")
    cur.execute("select count(*) from editor_renders where project_id=%s", (pid,)); ok(cur.fetchone()[0] == 0, "ses rendus sont supprimés")
    ok(not s3.list_objects_v2(Bucket=BUCKET, Prefix=f"editor/renders/{pid}/").get("Contents"), "et leurs fichiers aussi")

    mods = rq("GET", "/admin/modules", headers=A).json()
    mods = mods.get("modules", mods)
    ed = next(m for m in mods if m["id"] == "editor"); du = next(m for m in mods if m["id"] == "dubbing")
    ok(ed["version"] == "0.5.0" and du["version"] == "0.8.0", f"versions : éditeur {ed['version']}, doublage {du['version']}")
finally:
    for t in talks:
        cur.execute("delete from activity_controls where queue='render' and ref in (select id::text from editor_renders where talk_id=%s)", (t,))
        cur.execute("delete from talks where id=%s", (t,))
    for a_ in assets: cur.execute("delete from editor_assets where id=%s", (a_,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    for k in keys:
        try: s3.delete_object(Bucket=BUCKET, Key=k)
        except Exception: pass

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
