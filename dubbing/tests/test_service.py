#!/usr/bin/env python3
"""Doublage (étape D1a) — service complet avec la vraie base, le vrai stockage S3 de test et de faux moteurs (ou le vrai Piper) :
signe de vie, écoute rapide, doublage complet, plage de nuit, annulation, piste en service, nettoyage des anciens fichiers,
vidéo YouTube (voix seule), reprise après arrêt brutal, vitesse mesurée reprise par l'estimation.
Prérequis : API (3055) avec le module « dubbing » 0.2.0, PG (5544), S3 de test (5599). Lancement depuis la racine du dépôt :
  DUB_PY=/chemin/python3.11 python3 dubbing/tests/test_service.py           (moteurs factices)
  DUB_ENGINE=piper DUB_PIPER_MODEL=fr_FR-siwis-low MODELS_DIR=… python3 dubbing/tests/test_service.py   (vrai Piper, conversion factice)"""
import datetime, os, subprocess, sys, tempfile, time, uuid
from zoneinfo import ZoneInfo
import boto3, psycopg2, requests

API = "http://127.0.0.1:3055"; S3 = "http://127.0.0.1:5599"; HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.environ.get("DUB_PY", sys.executable); ENGINE = os.environ.get("DUB_ENGINE", "fake")
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url=S3, aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks, voices = [], []
fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

A = {"authorization": "Bearer " + requests.post(API + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def api(method, path, **kw):
    r = requests.request(method, API + path, headers=A, **kw)
    return r.status_code, (r.json() if r.content else None)
def mod_settings(**kv):
    return api("PUT", "/admin/modules/dubbing", json={"enabled": True, "settings": {f"mod_dubbing_{k}": str(v) for k, v in kv.items()}})
cur.execute("delete from dub_engine"); cur.execute("update dub_jobs set status='cancelled' where status in ('queued','running')")
h = datetime.datetime.now(ZoneInfo("Europe/Paris")).hour
mod_settings(queue_mode="night", night_start=(h + 2) % 24, night_end=(h + 3) % 24, preview_seconds=30)  # la nuit n'est pas maintenant
ok(api("GET", "/studio/dubbing/state")[1]["engine"]["ready"] is False, "sans service : moteur « pas prêt »")

# --- données : vidéo envoyée de 40 s (audio), phrases françaises, voix cible
cur.execute("select id from users where email='admin@test.local'"); admin_id = cur.fetchone()[0]
with tempfile.TemporaryDirectory() as d:
    src = os.path.join(d, "v.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=40", "-c:a", "aac", src], check=True)
    key = f"videos/test-{tag}.mp4"; s3.upload_file(src, "majlis-videos", key)
def talk(source, ref):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh',%s,%s,%s,'published','ready','free',40,'ar','ar') returning id""", (f"Doublage {tag} {source}", source, ref, admin_id))
    t = str(cur.fetchone()[0]); talks.append(t)
    lines = ["# Bismillah", "Que la paix soit sur vous.", "Lequel est meilleur ?", "Réciter abondamment le Coran.", "Ou bien le mémoriser.",
             "La récompense obtenue par sa récitation est immense.", "Et c'est là une grande bénédiction.", "Deuxièmement, son effet sur le cœur."]
    for i, txt in enumerate(lines):
        cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (t, i, i * 4500, i * 4500 + 3800, txt))
    return t
T1 = talk("upload", key); T2 = talk("youtube", "yt" + tag)
up = api("POST", "/studio/dubbing/voices/upload-url", json={"contentType": "audio/wav", "size": 2048})[1]
requests.put(up["url"], data=b"RIFF" + b"\0" * 2044, headers={"content-type": "audio/wav"})
VT = api("POST", "/studio/dubbing/voices", json={"kind": "target", "name": f"Voix {tag}", "sampleKey": up["key"], "consentDate": datetime.date.today().isoformat(), "consentBy": "Epok", "consentConfirmed": True})[1]["id"]; voices.append(VT)
params = {"targetVoice": VT}
if ENGINE == "piper":
    vb = api("POST", "/studio/dubbing/voices", json={"kind": "base", "name": f"Siwis low {tag}", "model": os.environ.get("DUB_PIPER_MODEL", "fr_FR-siwis-low")})[1]["id"]; voices.append(vb)
    params["baseVoice"] = vb
api("PUT", f"/studio/dubbing/talks/{T1}", json={"params": params})
if ENGINE == "piper":
    api("PUT", f"/studio/dubbing/talks/{T2}", json={"params": {"baseVoice": params["baseVoice"]}})  # pas de téléchargement de Tom en test

ok(api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "nope"})[0] == 400, "type de demande inconnu refusé")
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language) values ('Sans texte','d','x','youtube',%s,%s,'published','ready','free',10,'ar') returning id", ("n" + tag, admin_id)); T0 = str(cur.fetchone()[0]); talks.append(T0)
ok(api("POST", f"/studio/dubbing/talks/{T0}/jobs", json={"kind": "preview"})[1].get("code") == "no_french", "sans texte français : refusé")
code, j1 = api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "preview"})
ok(code == 201 and j1["status"] == "queued" and j1["params"]["target"]["name"] == f"Voix {tag}" and "sampleKey" not in j1["params"]["target"], "écoute rapide demandée (clé de l'échantillon jamais renvoyée)")
ok(api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "preview"})[1].get("code") == "already_queued", "une seule écoute en attente à la fois")
code, jf = api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "full"}); ok(code == 201, "doublage complet demandé")

# --- service
work = tempfile.mkdtemp()
envs = dict(os.environ, DATABASE_URL="postgres://majlis:pw@127.0.0.1:5544/majlis", S3_ENDPOINT=S3, S3_ACCESS_KEY="test", S3_SECRET_KEY="test",
            S3_REGION="garage", DUB_ENGINE=ENGINE, POLL_SECONDS="1", WORK_DIR=work, PORT="3071", SETTINGS_KEY="a" * 64)
logf = open(os.path.join(work, "service.log"), "w")
def start():
    return subprocess.Popen([PY, os.path.join(HERE, "..", "src", "main.py")], env=envs, stdout=logf, stderr=subprocess.STDOUT)
svc = start()
def wait(fn, timeout=90):
    t = time.time()
    while time.time() - t < timeout:
        v = fn()
        if v: return v
        time.sleep(1)
    return None
def job(jid):
    cur.execute("select status, progress, result, error from dub_jobs where id=%s", (jid,)); return cur.fetchone()
try:
    ok(wait(lambda: api("GET", "/studio/dubbing/state")[1]["engine"]["ready"], 30), "signe de vie : moteur « prêt » dans le Studio")
    ok(requests.get("http://127.0.0.1:3071/").json()["status"] == "ok", "page de santé du service")
    ok(wait(lambda: job(j1["id"])[0] == "done", 120), f"écoute rapide terminée ({job(j1['id'])[0]} {job(j1['id'])[3]})")
    r = job(j1["id"])[2]
    ok(r and r["window"] == [4.0, 34.0] and r["originalMixed"] and r["blocks"] >= 1, f"écoute : fenêtre de 30 s réglée, mélange avec l'original, conversion par blocs ({r and r['window']})")
    seg = {x["idx"]: x for x in r["segments"]}
    ok(seg[0]["state"] == "kept" if 0 in seg else True, "phrase « # » gardée en voix d'origine")
    ok(r["rtf"] is not None and r["speechS"] > 0, f"vitesse mesurée enregistrée (RTF {r['rtf']})")
    for which in ("mix", "voice"):
        u = api("GET", f"/studio/dubbing/jobs/{j1['id']}/audio?which={which}")[1]["url"]
        data = requests.get(u).content
        ok(len(data) > 1000 and data[4:8] == b"ftyp", f"fichier « {which} » lisible (AAC/MP4, {len(data)} octets)")
    ok(job(jf["id"])[0] == "queued", "doublage complet : attend la plage de nuit")
    mod_settings(queue_mode="always")
    ok(wait(lambda: job(jf["id"])[0] == "done", 120), f"doublage complet lancé dès que « always » ({job(jf['id'])[0]} {job(jf['id'])[3]})")
    rf = job(jf["id"])[2]
    ok(abs(rf["durationS"] - 40.5) < 1.5 and rf["window"] is None, f"piste complète : toute la durée ({rf['durationS']} s)")
    cur.execute("select job_id, mix_key, voice_key from dub_tracks where talk_id=%s", (T1,)); tr = cur.fetchone()
    ok(tr and str(tr[0]) == jf["id"] and tr[1] and tr[2], "piste française en service (dub_tracks)")
    d = api("GET", f"/studio/dubbing/talks/{T1}")[1]
    ok(d["track"] and d["report"]["kind"] == "full" and len(d["report"]["segments"]) == 8, "fiche : piste et état de chaque phrase")
    ok(not d["estimate"]["measured"] or ENGINE != "fake", "moteurs factices : leur vitesse n'est jamais reprise par l'estimation")
    cur.execute("""insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s, 'full', 'done', %s, %s, now())""",
                (T2, '{"targetVoice": "%s", "vcSteps": 3}' % VT, '{"rtf": 1.7, "speechS": 30, "engine": "real"}'))
    e = api("GET", f"/studio/dubbing/talks/{T1}")[1]["estimate"]
    ok(e["measured"] and e["rtf"] == 1.7, f"estimation : vitesse réellement mesurée reprise (médiane, ≥ 20 s de parole) ({e['rtf']})")
    # second doublage complet : l'ancienne piste est effacée du stockage
    code, jf2 = api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "full"})
    ok(wait(lambda: job(jf2["id"])[0] == "done", 120), "second doublage complet")
    gone = [k for k in (tr[1], tr[2]) if s3.list_objects_v2(Bucket="majlis-videos", Prefix=k).get("KeyCount", 0)]
    ok(not gone, "ancienne piste effacée du stockage")
    # vidéo YouTube : voix seule
    code, jy = api("POST", f"/studio/dubbing/talks/{T2}/jobs", json={"kind": "preview"})
    ok(wait(lambda: job(jy["id"])[0] == "done", 90), "YouTube : écoute rapide terminée")
    ry = job(jy["id"])[2]; ok(ry["voiceKey"] and "mixKey" not in ry and not ry["originalMixed"], "YouTube : voix française seule (vidéo non hébergée)")
    ok(api("GET", f"/studio/dubbing/jobs/{jy['id']}/audio?which=mix")[0] == 200, "YouTube : « écouter » renvoie la voix seule")
    # annulation
    mod_settings(queue_mode="night")
    code, jc = api("POST", f"/studio/dubbing/talks/{T2}/jobs", json={"kind": "full"})
    ok(api("POST", f"/studio/dubbing/jobs/{jc['id']}/cancel")[1]["status"] == "cancelled", "annulation d'une demande en attente")
    ok(api("POST", f"/studio/dubbing/jobs/{jc['id']}/cancel")[1].get("code") == "finished", "annuler deux fois : refusé")
    q = api("GET", "/studio/dubbing/jobs")[1]; ok(isinstance(q["jobs"], list) and q["engine"]["ready"], "file d'attente consultable")
    # reprise après arrêt brutal
    svc.kill(); svc.wait()
    code, jk = api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "preview"})
    cur.execute("update dub_jobs set status='running', attempts=1 where id=%s", (jk["id"],))
    svc = start()
    ok(wait(lambda: job(jk["id"])[0] == "done", 90), "après un arrêt brutal, la demande « en cours » repart et se termine")
    # écoutes rapides : les plus anciennes sont effacées (3 gardées)
    for _ in range(2):
        code, jx = api("POST", f"/studio/dubbing/talks/{T1}/jobs", json={"kind": "preview"}); wait(lambda: job(jx["id"])[0] == "done", 90)
    cur.execute("select count(*) from dub_jobs where talk_id=%s and kind='preview' and status='done' and result ? 'voiceKey'", (T1,))
    ok(cur.fetchone()[0] == 3, "3 écoutes rapides gardées, les fichiers des plus anciennes effacés")
finally:
    svc.terminate(); svc.wait(timeout=20)
    logf.close()
    print("--- journal du service (fin) ---"); print("".join(open(os.path.join(work, "service.log")).readlines()[-8:]))
    mod_settings(queue_mode="night", night_start=1, night_end=7, preview_seconds=60)
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for v in voices: cur.execute("delete from dub_voices where id=%s", (v,))
print(f"\n{len(fails)} échec(s)")
sys.exit(1 if fails else 0)
