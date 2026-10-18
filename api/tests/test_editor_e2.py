"""Étape E2 — éditeur de montage, audio pro : réglages du son dans le document de montage, formes d'onde et niveau sonore
mesurés par FFmpeg (voix d'origine, voix française, musiques), bibliothèque de musiques (import, analyse, suppression),
écoute « réduction du bruit », Studio → Activité, droits.

Prérequis (tout en local) : API (3055) avec FFmpeg dans le PATH, PG (5544), S3 de test moto (5599, bucket majlis-videos).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e2.py"""
import base64, os, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls, add_transcript

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []; assets = []; fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=90, **kw)
    if r.status_code == 429 and "/auth/" in path: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=90, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test")
for m in ("editor", "dubbing"): rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
em = f"e2-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {tag}"})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
O = login(em, "Passw0rd-test")
def until(fn, timeout=60):
    t0 = time.time(); v = None
    while time.time() - t0 < timeout:
        v = fn()
        if v: return v
        time.sleep(0.5)
    return v
def audio_file(seconds, freq, path, fmt=("-c:a", "libmp3lame", "-b:a", "128k")):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}", *fmt, path], check=True)
    return path

try:
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',60,'ar','ar') returning id""", (f"E2 {tag}", f"talks/{tag}", oid))
    T = str(cur.fetchone()[0]); talks.append(T)
    make_hls(s3, T, 60); add_transcript(cur, T, 60)
    # Piste « voix seule » du doublage : 2 phrases parlées (sons), du silence ailleurs.
    d = tempfile.mkdtemp(prefix="e2-")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=60", "-af",
                    "volume='if(between(t,6,11)+between(t,24,29),1,0)':eval=frame", "-c:a", "aac", "-b:a", "64k", os.path.join(d, "voice.m4a")], check=True)
    vkey = f"dubbing/tracks/{T}/test-voice.m4a"; s3.upload_file(os.path.join(d, "voice.m4a"), "majlis-videos", vkey, ExtraArgs={"ContentType": "audio/mp4"}); keys.append(vkey)
    cur.execute("insert into dub_jobs(talk_id, kind, status, params, finished_at) values (%s,'full','done','{}', now()) returning id", (T,)); jd = cur.fetchone()[0]
    cur.execute("insert into dub_tracks(talk_id, job_id, voice_key, duration_s) values (%s,%s,%s,60)", (T, jd, vkey))

    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    S = "sess-" + tag + "-e2"
    p = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()
    md = p["media"]
    ok(md["dub"]["voiceUrl"] and "trackId" not in md["dub"] and md["dub"]["duck"] == 15, "voix française : lien d'écoute, réglage de la baisse (15 %) venu du doublage")
    ok(md["audioDefaults"]["orig"] == {"gainDb": 0, "mute": False, "joinFadeMs": 30, "denoise": "off"} and md["audioDefaults"]["dub"]["duck"] == 15
       and md["audioDefaults"]["loudness"] == {"on": True, "target": -16}, "réglages du son par défaut")
    ok(md["denoiseLevels"] == ["off", "light", "strong"], "niveaux de réduction du bruit")

    # --- formes d'onde et niveau sonore
    a = rq("GET", f"/studio/editor/projects/{pid}/audio", headers=O).json()
    if "ffmpeg" not in a: print("   réponse :", a)
    ok(a.get("ffmpeg") is True and a["orig"]["status"] in ("queued", "running", "ready") and a["dub"] is not None, "analyse de la voix d'origine et de la voix française mise en file")
    a = until(lambda: (lambda x: x if x["orig"]["status"] == "ready" and x["dub"]["status"] == "ready" else None)(rq("GET", f"/studio/editor/projects/{pid}/audio", headers=O).json()), 90)
    ok(a and a["orig"]["status"] == "ready", f"voix d'origine analysée ({a and a['orig'].get('error')})")
    if a:
        pk = base64.b64decode(a["orig"]["peaks"])
        ok(abs(len(pk) - 600) <= 3 and abs(a["orig"]["durationS"] - 60) < 0.5, f"forme d'onde : un pic toutes les 100 ms ({len(pk)} pics, {a['orig']['durationS']:.1f} s)")
        ok(max(pk) > 50, "forme d'onde : le son (bips) est visible")
        ok(isinstance(a["orig"]["lufs"], (int, float)) and -60 < a["orig"]["lufs"] < 0, f"niveau sonore mesuré : {a['orig']['lufs']} LUFS")
        dp = base64.b64decode(a["dub"]["peaks"])
        ok(dp[80] > 20 and dp[150] < 5 and dp[260] > 20, "voix française : forme d'onde avec les phrases parlées (6-11 s, 24-29 s) et le silence")
    cur.execute("select status from editor_waveforms where talk_id=%s", (T,)); ok(len(cur.fetchall()) == 2, "une analyse par piste (pas de doublon)")
    rq("GET", f"/studio/editor/projects/{pid}/audio", headers=O)
    cur.execute("select count(*) from editor_waveforms where talk_id=%s and status='ready'", (T,)); ok(cur.fetchone()[0] == 2, "deuxième ouverture : rien n'est recalculé")
    # nouvelle piste française → forme d'onde périmée et recalculée
    cur.execute("update dub_tracks set created_at = now() + interval '1 minute' where talk_id=%s", (T,))
    a2 = rq("GET", f"/studio/editor/projects/{pid}/audio", headers=O).json()
    ok(a2["dub"]["status"] in ("queued", "running") or a2["dub"]["peaks"] is None, "nouvelle piste française : forme d'onde recalculée")
    until(lambda: rq("GET", f"/studio/editor/projects/{pid}/audio", headers=O).json()["dub"]["status"] == "ready", 60)

    # --- écoute « réduction du bruit »
    for lvl in ("off", "strong"):
        r = rq("POST", f"/studio/editor/projects/{pid}/denoise-sample", headers=O, json={"at": 5, "level": lvl})
        ok(r.status_code == 200 and r.headers["content-type"].startswith("audio/mp4") and len(r.content) > 5000, f"écoute de 10 s ({lvl}) : {len(r.content)} octets")
    ok(rq("POST", f"/studio/editor/projects/{pid}/denoise-sample", headers=O, json={"at": 5, "level": "max"}).status_code == 400, "niveau inconnu : refusé")

    # --- bibliothèque de musiques
    ok(rq("POST", "/studio/editor/music/upload-url", headers=O, json={"contentType": "audio/mpeg"}).status_code == 403, "organisateur : n'importe pas de musique")
    ok(rq("POST", "/studio/editor/music/upload-url", headers=A, json={"contentType": "video/mp4"}).json().get("code") == "bad_type", "format non audio : refusé")
    ok(rq("POST", "/studio/editor/music/upload-url", headers=A, json={"contentType": "audio/mpeg", "size": 90 * 1048576}).json().get("code") == "too_big", "fichier trop lourd : refusé")
    def upload(title, seconds, freq):
        u = rq("POST", "/studio/editor/music/upload-url", headers=A, json={"contentType": "audio/mpeg"}).json()
        f = audio_file(seconds, freq, os.path.join(d, f"{title}.mp3"))
        requests.put(u["url"], data=open(f, "rb").read(), headers={"content-type": "audio/mpeg"}).raise_for_status()
        keys.append(u["key"])
        r = rq("POST", "/studio/editor/music", headers=A, json={"key": u["key"], "title": f"{title} {tag}", "license": "Libre de droits (test)", "contentType": "audio/mpeg"})
        return r
    r = upload("Nasheed", 20, 440); ok(r.status_code == 201, "musique importée")
    M = r.json()["music"]["id"]; assets.append(M)
    m = until(lambda: (lambda x: x if x["status"] == "ready" else None)(rq("GET", f"/studio/editor/music/{M}", headers=O).json()["music"]), 60)
    ok(m and abs(m["durationS"] - 20) < 0.3 and m["wave"]["peaks"] and m["url"], f"musique analysée : durée {m and m['durationS']} s, forme d'onde, lien d'écoute")
    lst = rq("GET", "/studio/editor/music", headers=O).json()
    ok(any(x["id"] == M for x in lst["music"]) and lst["canImport"] is False, "organisateur : voit la bibliothèque, sans bouton d'import")
    ok(rq("POST", "/studio/editor/music", headers=A, json={"key": f"editor/music/{uuid.uuid4()}.mp3", "title": "x", "contentType": "audio/mpeg"}).json().get("code") == "missing", "fichier jamais envoyé : refusé")
    ok(rq("PATCH", f"/studio/editor/music/{M}", headers=A, json={"license": "CC-BY Test"}).json()["music"]["license"] == "CC-BY Test", "licence modifiée")

    # --- réglages du son dans le montage
    rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S})
    rev = p["project"]["rev"]
    def save(audio, clips=None):
        tl = {"v": 1, "duration": 60, "clips": clips or [{"id": "c1", "in": 0, "out": 60}], "audio": audio}
        return rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": tl, "rev": rev, "session": S})
    audio = {"orig": {"gainDb": -2, "mute": False, "joinFadeMs": 40, "denoise": "light"}, "dub": {"use": True, "gainDb": 1, "duck": 20, "fade": 0.5},
             "music": [{"id": "m1", "asset": M, "start": 2, "len": 40, "offset": 0, "gainDb": -14, "fadeIn": 2, "fadeOut": 3, "loop": True, "duck": True, "duckDb": -10}],
             "loudness": {"on": True, "target": -16}}
    r = save(audio); ok(r.status_code == 200, f"réglages du son enregistrés ({r.json().get('error')})")
    rev = r.json().get("rev", rev)
    cur.execute("select timeline->'audio' from editor_projects where id=%s", (pid,)); ad = cur.fetchone()[0]
    ok(ad["orig"]["denoise"] == "light" and ad["dub"]["duck"] == 20 and ad["music"][0]["loop"] is True, "base : réglages du son conservés")
    bad = [({**audio, "music": [{**audio["music"][0], "loop": False}]}, "musique plus longue que son fichier sans boucle"),
           ({**audio, "music": [{**audio["music"][0], "asset": str(uuid.uuid4())}]}, "musique inconnue"),
           ({**audio, "music": [{**audio["music"][0], "len": 3, "fadeIn": 2, "fadeOut": 2}]}, "fondus plus longs que la musique"),
           ({**audio, "orig": {**audio["orig"], "denoise": "max"}}, "réduction du bruit inconnue"),
           ({**audio, "dub": {**audio["dub"], "duck": 150}}, "baisse au-delà de 100 %"),
           ({**audio, "music": [audio["music"][0], audio["music"][0]]}, "musique en double")]
    for au, why in bad:
        r = save(au); ok(r.status_code == 400, f"refusé : {why} ({r.json().get('error')})")
    a = rq("GET", f"/studio/editor/projects/{pid}/audio", headers=O).json()
    ok(M in a["music"] and a["music"][M]["wave"]["status"] == "ready", "formes d'onde des musiques utilisées fournies avec le projet")
    r = save({"orig": {"mute": True}}); ok(r.status_code == 200, "réglages partiels : complétés par les valeurs par défaut")
    rev = r.json().get("rev", rev)
    cur.execute("select timeline->'audio' from editor_projects where id=%s", (pid,)); ad = cur.fetchone()[0]
    ok(ad["orig"] == {"gainDb": 0, "mute": True, "joinFadeMs": 30, "denoise": "off"} and ad["dub"]["duck"] == 15 and ad["music"] == [], "base : valeurs par défaut écrites")
    r = save(audio); rev = r.json().get("rev", rev)

    # --- suppression d'une musique
    r = rq("DELETE", f"/studio/editor/music/{M}", headers=A); ok(r.status_code == 409 and r.json()["count"] == 1, "musique utilisée par un montage : suppression refusée")
    r2 = upload("Autre", 5, 550); M2 = r2.json()["music"]["id"]; assets.append(M2)
    ok(rq("DELETE", f"/studio/editor/music/{M2}", headers=O).status_code == 403, "organisateur : ne supprime pas de musique")
    ok(rq("DELETE", f"/studio/editor/music/{M2}", headers=A).json().get("deleted"), "musique inutilisée supprimée")
    cur.execute("select count(*) from editor_waveforms where asset_id=%s", (M2,)); ok(cur.fetchone()[0] == 0, "sa forme d'onde est supprimée avec elle")

    # --- échec d'analyse visible dans Studio → Activité
    cur.execute("insert into editor_assets(title, key, mime) values (%s, %s, 'audio/mpeg') returning id", (f"Cassée {tag}", f"editor/music/{uuid.uuid4()}.mp3")); MB = str(cur.fetchone()[0]); assets.append(MB)
    cur.execute("insert into editor_waveforms(kind, asset_id, src) values ('music', %s, 'x')", (MB,))
    rq("GET", "/studio/editor/music", headers=A)  # relance la file
    st = until(lambda: (lambda r: r[0] if r and r[0] == "failed" else None)(cur.execute("select status from editor_waveforms where asset_id=%s", (MB,)) or cur.fetchone()), 60)
    ok(st == "failed", "fichier illisible : analyse « en échec » après deux essais")
    tasks = rq("GET", "/studio/activity", headers=A).json()["tasks"]
    ok(any(t["queue"] == "editor" and t["status"] == "failed" and t["light"] for t in tasks), "Studio → Activité : l'analyse en échec apparaît (file « editor », tâche légère)")
    cur.execute("select 1 from audit_log where route = '/studio/editor/projects/:id/denoise-sample'"); ok(cur.fetchone() is None, "journal : les écoutes ne remplissent pas le journal")
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for a_ in assets: cur.execute("delete from editor_assets where id=%s", (a_,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    for k in keys:
        try: s3.delete_object(Bucket="majlis-videos", Key=k)
        except Exception: pass
    for t in talks:
        for o in s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"hls/{t}/").get("Contents", []): s3.delete_object(Bucket="majlis-videos", Key=o["Key"])

print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'Tout est bon'}")
sys.exit(1 if fails else 0)
