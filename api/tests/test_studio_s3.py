"""Étape S3 — Studio : Activité (liste des tâches, pause, priorité, pause générale, plage horaire), tableau de bord (/studio/overview)
et état de production des contenus (/studio/production).
Prérequis : API (3055), PG (5544), S3 de test (5599), Python 3.11 du doublage (DUB_PY : numpy, psycopg2, boto3) pour la pause d'une demande en cours.
Lancement depuis la racine du dépôt : DUB_PY=/chemin/python3.11 python3 api/tests/test_studio_s3.py"""
import json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

B = "http://127.0.0.1:3055"; S3 = "http://127.0.0.1:5599"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PY = os.environ.get("DUB_PY", sys.executable)
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; talks = []; fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=60, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=60, **kw)
    return r
A = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
em = f"s3-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Orga S3"})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = cur.fetchone()[0]
O = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
def talk(n, owner, **kw):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,
                     transcript_status, created_at)
                   values (%s,'d',%s,'upload',%s,%s,%s,%s,'free',600,'ar','ar',%s, now() - make_interval(mins => %s)) returning id""",
                (f"S3 {tag} {n}", kw.get("speaker", f"Cheikh {tag}"), f"v-{tag}-{n}", owner, kw.get("pub", "published"), kw.get("video", "ready"),
                 kw.get("transcript", "unavailable"), kw.get("age", 0)))
    t = str(cur.fetchone()[0]); talks.append(t); return t
def tasks(h=A): return rq("GET", "/studio/activity", headers=h).json()
def find(ts, q, ref): return next((t for t in ts["tasks"] if t["queue"] == q and t["ref"] == ref), None)
for m in ("dubbing", "stats", "channels"):
    rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
rq("PUT", "/studio/activity/settings", headers=A, json={"pauseAll": False, "windowEnabled": False, "windowStart": 22, "windowEnd": 7})
svc = None
try:
    # --- Activité : liste
    V1 = talk("V1", aid, video="pending", age=30); V2 = talk("V2", oid, video="pending", age=20)
    T1 = talk("T1", oid, video="pending", transcript="pending", age=10)  # transcription qui attend la vidéo
    TF = talk("TF", oid, video="failed")
    cur.execute("update talks set video_error='ffmpeg a échoué' where id=%s", (TF,))
    a = tasks()
    ok(find(a, "video", V1) and find(a, "video", V2) and find(a, "video", V1)["status"] == "waiting", "admin : toutes les conversions en attente")
    ok(find(a, "transcript", T1)["status"] == "blocked" and find(a, "transcript", T1)["blockedBy"] == "video", "transcription qui attend la vidéo : « bloquée »")
    ok(find(a, "video", TF)["status"] == "failed" and "ffmpeg" in find(a, "video", TF)["error"], "conversion en échec avec son message")
    ok(a["canControl"] is True and "heavyAllowed" in a["settings"], "admin : peut agir, réglages renvoyés")
    o = tasks(O)
    ok(find(o, "video", V2) and not find(o, "video", V1) and o["canControl"] is False, "organisateur : seulement ses conférences, sans action")
    ok(rq("POST", f"/studio/activity/video/{V2}/pause", headers=O, json={"paused": True}).status_code == 403, "organisateur : pause refusée")
    c = rq("GET", "/studio/activity/count", headers=O).json(); ok(c["count"] >= 1 and c["failed"] >= 1, f"pastille du menu : {c}")
    # pause / reprise / priorité
    r = rq("POST", f"/studio/activity/video/{V1}/pause", headers=A, json={"paused": True}).json()
    ok(r["task"]["status"] == "paused" and r["task"]["paused"], "pause d'une conversion en attente")
    cur.execute("select activity_paused('video', %s)", (V1,)); ok(cur.fetchone()[0] is True, "pause visible des services (fonction SQL)")
    r = rq("POST", f"/studio/activity/video/{V1}/pause", headers=A, json={"paused": False}).json(); ok(r["task"]["status"] == "waiting", "reprise")
    cur.execute("select count(*) from activity_controls where queue='video' and ref=%s", (V1,)); ok(cur.fetchone()[0] == 0, "réglage retiré quand tout est revenu à la normale")
    r = rq("POST", f"/studio/activity/video/{V2}/priority", headers=A, json={"priority": 10}).json(); ok(r["task"]["priority"] == 10, "priorité haute")
    a = tasks(); w = [t["ref"] for t in a["tasks"] if t["queue"] == "video" and t["status"] == "waiting"]
    ok(w.index(V2) < w.index(V1), "liste dans l'ordre de passage : la prioritaire d'abord")
    cur.execute("update talks set video_status='processing', video_progress=40 where id=%s", (V1,))
    r = rq("POST", f"/studio/activity/video/{V1}/pause", headers=A, json={"paused": True}); ok(r.status_code == 409 and r.json()["code"] == "running", "conversion en cours : va jusqu'au bout (409)")
    ok(find(tasks(), "video", V1)["progress"] == 40, "progression d'une tâche en cours")
    r = rq("POST", f"/studio/activity/video/{TF}/pause", headers=A, json={"paused": True}); ok(r.status_code == 409 and r.json()["code"] == "failed", "tâche en échec : pas de pause")
    ok(rq("POST", "/studio/activity/video/inconnue/pause", headers=A, json={"paused": True}).status_code == 404, "tâche inconnue : 404")
    ok(rq("POST", f"/studio/activity/nope/{V1}/pause", headers=A, json={"paused": True}).status_code == 400, "file inconnue : refusée")
    # pause générale et plage horaire
    s = rq("PUT", "/studio/activity/settings", headers=A, json={"pauseAll": True}).json()["settings"]
    ok(s["pauseAll"] and s["heavyAllowed"] is False, "« tâches lourdes en pause »")
    ok(rq("PUT", "/studio/activity/settings", headers=A, json={"windowStart": 25}).status_code == 400, "heure invalide refusée")
    ok(rq("PUT", "/studio/activity/settings", headers=O, json={"pauseAll": False}).status_code == 403, "organisateur : réglages refusés")
    s = rq("PUT", "/studio/activity/settings", headers=A, json={"pauseAll": False, "windowEnabled": True, "windowStart": 3, "windowEnd": 3}).json()["settings"]
    ok(s["windowEnabled"] and s["heavyAllowed"] is True, "plage de 0 h (début = fin) : jamais bloquante")
    rq("PUT", "/studio/activity/settings", headers=A, json={"windowEnabled": False})
    cur.execute("update talks set video_status='ready' where id = any(%s::uuid[])", ([V1, V2, T1],))

    # --- Doublage : demande dans la liste, pause d'une demande EN COURS (vrai service, moteurs factices)
    D = talk("D", oid, video="ready", transcript="ready")
    lines = [f"Phrase numéro {i} de la conférence, assez longue pour prendre du temps." for i in range(40)]
    for i, txt in enumerate(lines): cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (D, i, i * 4000, i * 4000 + 3500, txt))
    cur.execute("update talks set duration_seconds=170 where id=%s", (D,))
    rq("PUT", "/admin/modules/dubbing", headers=A, json={"settings": {"mod_dubbing_queue_mode": "always", "mod_dubbing_require_review": "false"}})
    import boto3
    s3 = boto3.client("s3", endpoint_url=S3, aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "v.mp4"); subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=170", "-c:a", "aac", src], check=True)
        cur.execute("update talks set video_ref=%s where id=%s", (f"videos/s3-{tag}.mp4", D)); s3.upload_file(src, "majlis-videos", f"videos/s3-{tag}.mp4")
    j = rq("POST", f"/studio/dubbing/talks/{D}/jobs", headers=A, json={"kind": "full"}).json(); J = j["id"]
    ok(find(tasks(O), "dubbing", J)["status"] == "waiting", "doublage : la demande apparaît dans Activité (organisateur propriétaire)")
    work = tempfile.mkdtemp()
    env = dict(os.environ, DATABASE_URL="postgres://majlis:pw@127.0.0.1:5544/majlis", S3_ENDPOINT=S3, S3_ACCESS_KEY="test", S3_SECRET_KEY="test", S3_REGION="garage",
               DUB_ENGINE="fake", DUB_FAKE_DELAY="0.15", POLL_SECONDS="1", WORK_DIR=work, PORT="3074", SETTINGS_KEY="a" * 64)
    svc = subprocess.Popen([PY, os.path.join(ROOT, "dubbing", "src", "main.py")], env=env, stdout=open(os.path.join(work, "svc.log"), "w"), stderr=subprocess.STDOUT)
    t0 = time.time()
    while time.time() - t0 < 60 and (find(tasks(), "dubbing", J) or {}).get("status") != "running": time.sleep(0.3)
    ok((find(tasks(), "dubbing", J) or {}).get("status") == "running", "doublage : en cours")
    r = rq("POST", f"/studio/activity/dubbing/{J}/pause", headers=A, json={"paused": True}); ok(r.status_code == 200, "pause d'une demande de doublage en cours")
    t0 = time.time()
    while time.time() - t0 < 60:
        cur.execute("select status, cancel_requested from dub_jobs where id=%s", (J,)); st = cur.fetchone()
        if st[0] == "queued": break
        time.sleep(0.5)
    ok(st == ("queued", False), f"le service s'arrête au prochain bloc et la remet dans la file ({st})")
    time.sleep(3); cur.execute("select status from dub_jobs where id=%s", (J,)); ok(cur.fetchone()[0] == "queued", "en pause : le service ne la reprend pas")
    ok(find(tasks(), "dubbing", J)["status"] == "paused", "Activité : « en pause »")
    rq("POST", f"/studio/activity/dubbing/{J}/pause", headers=A, json={"paused": False})
    t0 = time.time()
    while time.time() - t0 < 120:
        cur.execute("select status from dub_jobs where id=%s", (J,)); st = cur.fetchone()[0]
        if st in ("done", "failed"): break
        time.sleep(1)
    ok(st == "done", f"reprise : le doublage repart du début et se termine ({st})")

    # --- Contenus : état de production
    cur.execute("insert into dub_requests(talk_id, user_id) values (%s,%s)", (D, aid))
    P = rq("GET", "/studio/production", headers=O).json()["talks"]
    dd = P[D]["dub"]
    ok(dd["track"] and dd["hasFrench"] and dd["review"] == "todo" and dd["requests"] == 1 and dd["job"] is None, f"production : piste, texte français, relecture à faire, demande ({dd})")
    ok(P[D]["views"] == 0 and V1 not in P, "production : vues (0) et seulement mes conférences")
    rq("PUT", "/admin/modules/dubbing", headers=A, json={"settings": {"mod_dubbing_require_review": "true"}})
    rq("POST", f"/studio/dubbing/talks/{D}/review", headers=A, json={"validated": True})
    ok(rq("GET", "/studio/production", headers=O).json()["talks"][D]["dub"]["review"] == "validated", "production : relecture validée")
    rq("PATCH", f"/studio/dubbing/talks/{D}/segments/0", headers=A, json={"text": "Phrase corrigée"})
    ok(rq("GET", "/studio/production", headers=O).json()["talks"][D]["dub"]["review"] == "stale", "production : relecture à refaire")

    # --- Tableau de bord
    cur.execute("insert into stat_talk_daily(day, talk_id, audience, views, plays, seconds) values ((now() at time zone 'utc')::date, %s, 'web', 30, 10, 3000), ((now() at time zone 'utc')::date - 40, %s, 'web', 20, 5, 600)", (D, D))
    cur.execute("insert into dub_listen(day, talk_id, audio_lang, seconds) values ((now() at time zone 'utc')::date, %s, 'fr', 300), ((now() at time zone 'utc')::date, %s, 'orig', 700)", (D, D))
    cur.execute("insert into speakers(slug, name, owner_id) values (%s, %s, %s) on conflict (slug) do update set owner_id = excluded.owner_id", (f"cheikh-{tag}", f"Cheikh {tag}", oid))
    cur.execute("insert into speaker_follows(user_id, speaker_slug, speaker_name, created_at) values (%s,%s,'x', now()), (%s,%s,'x', now() - interval '20 days')", (aid, f"cheikh-{tag}", oid, f"cheikh-{tag}"))
    ov = rq("GET", "/studio/overview", headers=O).json()
    ok(ov["last"] and ov["last"]["id"] in talks, "dernière conférence publiée")
    ok(ov["stats"]["views"] == 30 and ov["stats"]["prevViews"] == 20 and ov["stats"]["viewsChangePct"] == 50, f"vues sur 28 jours et évolution ({ov['stats']})")
    ok(ov["channel"] == {"channels": 1, "followers": 2, "followersWeek": 1}, f"abonnés de ma chaîne et nouveaux cette semaine ({ov['channel']})")
    ok(ov["dubbing"]["frPct"] == 30, f"écoute en français : 30 % ({ov['dubbing']['frPct']})")
    ok(ov["dubbing"]["todo"]["requests"] == 1, f"à faire : demandes de version française ({ov['dubbing']['todo']})")
    ok(ov["storage"] is None, "organisateur : pas de bloc stockage")
    ok(isinstance(ov["production"], list) and "productionCount" in ov, "production en cours")
    cur.execute("update talks set organizer_id=%s where id=%s", (aid, D))
    ova = rq("GET", "/studio/overview", headers=A).json()
    ok(ova["last"]["id"] == D and ova["stats"]["last"]["views"] == 50 and ova["dubbing"]["lastFrPct"] == 30, f"dernière conférence : vues depuis la publication, écoute en français ({ova['stats'].get('last')})")
    rq("PUT", "/admin/modules/storage", headers=A, json={"enabled": True})
    ova = rq("GET", "/studio/overview", headers=A).json()
    ok(ova["storage"] and ova["storage"]["space"]["capacityBytes"] > 0, "administrateur : espace de stockage (module activé)")
    ok(rq("GET", "/studio/storage/space", headers=A).json()["capacityBytes"] > 0, "encart « Stockage » du menu")
    rq("PUT", "/admin/modules/storage", headers=A, json={"enabled": False})
    # modules désactivés : leurs parties disparaissent
    rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": False})
    ova = rq("GET", "/studio/overview", headers=A).json()
    ok(ova["dubbing"] is None and ova["storage"] is None, "doublage et stockage désactivés : blocs absents")
    ok(not [t for t in tasks()["tasks"] if t["queue"] == "dubbing"], "doublage désactivé : plus de tâches de doublage dans Activité")
    ok("dub" not in rq("GET", "/studio/production", headers=A).json()["talks"].get(D, {}), "doublage désactivé : pas de colonne doublage")
    cur.execute("select count(*) from audit_log where route like '/studio/activity%%' and summary like 'Activité :%%'"); ok(cur.fetchone()[0] >= 4, "actions inscrites au journal d'audit")
finally:
    if svc: svc.terminate(); svc.wait(timeout=20)
    rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True, "settings": {"mod_dubbing_require_review": "true", "mod_dubbing_queue_mode": "night"}})
    rq("PUT", "/studio/activity/settings", headers=A, json={"pauseAll": False, "windowEnabled": False, "windowStart": 22, "windowEnd": 7})
    cur.execute("delete from activity_controls where ref like any(%s)", ([f"{t}%" for t in talks],))
    cur.execute("delete from activity_controls where queue='dubbing' and ref in (select id::text from dub_jobs where talk_id = any(%s::uuid[]))", (talks,))
    cur.execute("delete from speaker_follows where speaker_slug=%s", (f"cheikh-{tag}",)); cur.execute("delete from speakers where slug=%s", (f"cheikh-{tag}",))
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from users where email=%s", (em,))
print(f"\n{len(fails)} échec(s)" if fails else "\nTout est OK")
sys.exit(1 if fails else 0)
