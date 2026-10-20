#!/usr/bin/env python3
"""Doublage, étape D3c — le service lit les intervenants et fabrique UNE voix par intervenant avec sa propre hauteur.
Vraie base, vrai stockage S3 de test, faux moteurs (un son différent par voix de base : on retrouve qui a lu quoi).
Cas : intervenant sans choix = voix de la conférence ; intervenant avec sa voix de base + voix cible + hauteur +4 ; intervenant avec sa voix de base,
sans conversion, hauteur -4 ; phrase gardée en voix d'origine ; écoute de 60 s ; demande sans intervenants = comportement d'avant ;
intervenant inconnu de la demande (détection refaite entre-temps) = voix de la conférence.
Prérequis : API (3055, module doublage 0.10.0), PG (5544), S3 de test (5599), FFmpeg.
Lancement depuis la racine du dépôt : python3 dubbing/tests/test_speakers_service.py"""
import datetime, os, subprocess, sys, tempfile, time, uuid, wave
import numpy as np
import boto3, psycopg2, requests
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, "..", "src"))
from engines import FakeBase  # noqa: E402
import pipeline as pl  # noqa: E402

API = "http://127.0.0.1:3055"; S3 = "http://127.0.0.1:5599"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url=S3, aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks, voices = [], []
fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
A = {"authorization": "Bearer " + requests.post(API + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def api(method, path, **kw):
    r = requests.request(method, API + path, headers=A, **kw); return r.status_code, (r.json() if r.content else None)
def mod_settings(**kv): return api("PUT", "/admin/modules/dubbing", json={"enabled": True, "settings": {f"mod_dubbing_{k}": str(v) for k, v in kv.items()}})
cur.execute("delete from dub_engine"); cur.execute("update dub_jobs set status='cancelled' where status in ('queued','running')")
mod_settings(queue_mode="always", require_review="false", preview_seconds=40)
cur.execute("select id from users where email='admin@test.local'"); admin_id = cur.fetchone()[0]

with tempfile.TemporaryDirectory() as d:
    src = os.path.join(d, "v.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=1000:duration=40", "-c:a", "aac", src], check=True)
    key = f"videos/spk-{tag}.mp4"; s3.upload_file(src, "majlis-videos", key)
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
               values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',40,'ar','ar') returning id""", (f"Intervenants service {tag}", key, admin_id)); T = str(cur.fetchone()[0]); talks.append(T)
TEXT = ["Que la paix soit sur vous.", "Je vous remercie de cette invitation.", "Voici ma question pour le cheikh.", "# Bismillah", "Réponse courte et claire ici.", "Merci beaucoup pour tout."]
WHO = [1, 2, 1, 3, 2, 1]                                      # intervenant de chaque phrase (la 4e est gardée en voix d'origine)
for i, txt in enumerate(TEXT):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (T, i, 1000 + i * 6000, 1000 + i * 6000 + 4000, txt))
def base_voice(model):
    r = api("POST", "/studio/dubbing/voices", json={"kind": "base", "name": f"{model} {tag}", "model": model}); voices.append(r[1]["id"]); return r[1]["id"]
def target_voice():
    up = api("POST", "/studio/dubbing/voices/upload-url", json={"contentType": "audio/wav", "size": 2048})[1]
    requests.put(up["url"], data=b"RIFF" + b"\0" * 2044, headers={"content-type": "audio/wav"})
    r = api("POST", "/studio/dubbing/voices", json={"kind": "target", "name": f"Cible {tag}", "sampleKey": up["key"], "synthetic": True, "gender": "female"}); voices.append(r[1]["id"]); return r[1]["id"]
M2, M3 = "fr_FR-bbb-medium", "fr_FR-ccc-low"
B2, B3, VT = base_voice(M2), base_voice(M3), target_voice()
for n in (1, 2, 3): cur.execute("insert into dub_speakers(talk_id,n,label) values (%s,%s,%s)", (T, n, f"Intervenant {n}"))
for i, n in enumerate(WHO): cur.execute("insert into dub_phrase_speakers(talk_id,idx,speaker) values (%s,%s,%s)", (T, i, n))
api("PUT", f"/studio/dubbing/talks/{T}/speakers/2", json={"baseVoice": B2, "targetVoice": VT, "pitch": 4})
api("PUT", f"/studio/dubbing/talks/{T}/speakers/3", json={"baseVoice": B3, "pitch": -4})

work = tempfile.mkdtemp()
envs = dict(os.environ, DATABASE_URL="postgres://majlis:pw@127.0.0.1:5544/majlis", S3_ENDPOINT=S3, S3_ACCESS_KEY="test", S3_SECRET_KEY="test", S3_REGION="garage",
            DUB_ENGINE="fake", POLL_SECONDS="1", WORK_DIR=work, PORT="3072", SETTINGS_KEY="a" * 64)
logf = open(os.path.join(work, "service.log"), "w")
svc = subprocess.Popen([sys.executable, os.path.join(HERE, "..", "src", "main.py")], env=envs, stdout=logf, stderr=subprocess.STDOUT)
def wait(fn, timeout=120):
    t = time.time()
    while time.time() - t < timeout:
        v = fn()
        if v: return v
        time.sleep(1)
    return None
def job(j): cur.execute("select status, result, error from dub_jobs where id=%s", (j,)); return cur.fetchone()
def voice_wav(j):
    r = job(j)[1]; data = requests.get(api("GET", f"/studio/dubbing/jobs/{j}/audio?which=voice")[1]["url"]).content
    p = os.path.join(work, f"{j}.m4a"); open(p, "wb").write(data); w = os.path.join(work, f"{j}.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", p, "-ac", "1", "-ar", str(pl.SR), w], check=True)
    with wave.open(w) as f: return np.frombuffer(f.readframes(f.getnframes()), "<i2").astype(np.float32) / 32768
def hz(a, i, offset=0.0):
    s = int((1.0 + i * 6.0 - offset + 0.3) * pl.SR); x = a[s: s + int(0.8 * pl.SR)]
    if len(x) < pl.SR // 2 or np.max(np.abs(x)) < 0.01: return None
    sp = np.abs(np.fft.rfft(x * np.hanning(len(x)), 1 << 17)); return int(np.argmax(sp)) * pl.SR / (1 << 17)
def fake_hz(model, speaker=None): return 150 + (sum(map(ord, model)) * 7 + int(speaker or 0) * 53) % 300
try:
    code, jf = api("POST", f"/studio/dubbing/talks/{T}/jobs", json={"kind": "full"}); ok(code == 201 and len(jf["params"]["speakers"]) == 3, f"doublage complet demandé avec 3 intervenants ({code})")
    ok(wait(lambda: job(jf["id"])[0] in ("done", "failed")) and job(jf["id"])[0] == "done", f"doublage terminé ({job(jf['id'])[0]} {job(jf['id'])[2]})")
    res = job(jf["id"])[1]; a = voice_wav(jf["id"])
    ok({x["n"] for x in res["speakers"]} == {1, 2, 3} and {x["n"]: x["pitch"] for x in res["speakers"]} == {1: 0, 2: 4, 3: -4}, "résultat : un compte rendu par intervenant (voix et hauteur)")
    ok({x["n"]: x["target"] for x in res["speakers"]} == {1: None, 2: f"Cible {tag}", 3: None}, "résultat : conversion seulement pour l'intervenant qui a une voix cible")
    ok(res["pitchEngine"] in ("rubberband", "atempo"), f"moteur de hauteur noté dans le résultat ({res['pitchEngine']})")
    want = {1: 220, 2: fake_hz(M2) * 2 ** (4 / 12), 3: fake_hz(M3) * 2 ** (-4 / 12)}
    got = {i: hz(a, i) for i in range(6)}
    for i, n in enumerate(WHO):
        if i == 3: ok(got[i] is None, "phrase gardée en voix d'origine : aucune voix française"); continue
        ok(got[i] and abs(got[i] - want[n]) / want[n] < 0.03, f"phrase {i} (intervenant {n}) : {got[i] and round(got[i])} Hz (attendu {round(want[n])} Hz)")
    ok(len({round(want[1]), round(want[2]), round(want[3])}) == 3, "les trois voix de l'essai sont bien différentes")
    seg = {x["idx"]: x for x in res["segments"]}; ok(sorted(seg) == [0, 1, 2, 3, 4, 5] and seg[3]["state"] == "kept" and all(seg[i]["state"] in ("fit", "sped") for i in (0, 1, 2, 4, 5)), "état de chaque phrase : toutes présentes une seule fois, la gardée signalée")
    ok(res["blocks"] >= 1, f"conversion par blocs pour l'intervenant 2 seulement ({res['blocks']} bloc(s))")
    # Écoute de 60 s (réglée à 40 s) : fenêtre commence à la 1re phrase à doubler (1 s - 0,5 s)
    code, jp = api("POST", f"/studio/dubbing/talks/{T}/jobs", json={"kind": "preview"}); ok(wait(lambda: job(jp["id"])[0] in ("done", "failed")) and job(jp["id"])[0] == "done", "écoute rapide avec intervenants")
    ap = voice_wav(jp["id"]); w0 = job(jp["id"])[1]["window"][0]
    ok(all(abs((hz(ap, i, w0) or 0) - want[n]) / want[n] < 0.03 for i, n in enumerate(WHO) if i != 3), "écoute rapide : mêmes voix, aux mêmes phrases")
    # intervenant inconnu de la demande (détection refaite après la demande) : voix de la conférence
    api("POST", f"/studio/dubbing/talks/{T}/jobs", json={"kind": "full"})  # déjà fait : refusé ou file ; on construit à la main
    cur.execute("update dub_jobs set status='cancelled' where talk_id=%s and status in ('queued','running')", (T,))
    cur.execute("insert into dub_speakers(talk_id,n,label) values (%s,4,'Nouveau')", (T,)); cur.execute("update dub_phrase_speakers set speaker=4 where talk_id=%s and idx=0", (T,))
    code, jp2 = api("POST", f"/studio/dubbing/talks/{T}/jobs", json={"kind": "preview"})
    cur.execute("delete from dub_speakers where talk_id=%s and n=4", (T,))      # le speaker 4 n'existait pas encore dans la liste figée
    cur.execute("""update dub_jobs set params = jsonb_set(params, '{speakers}', (select jsonb_agg(x) from jsonb_array_elements(params->'speakers') x where (x->>'n')::int <> 4)) where id=%s""", (jp2["id"],))
    ok(wait(lambda: job(jp2["id"])[0] in ("done", "failed")) and job(jp2["id"])[0] == "done", "phrase d'un intervenant inconnu de la demande : le doublage va au bout")
    a2 = voice_wav(jp2["id"]); w2 = job(jp2["id"])[1]["window"][0]
    ok(abs((hz(a2, 0, w2) or 0) - 220) < 8, f"…avec la voix de la conférence ({round(hz(a2, 0, w2) or 0)} Hz)")
    # sans intervenants : comportement d'avant
    cur.execute("delete from dub_phrase_speakers where talk_id=%s", (T,)); cur.execute("delete from dub_speakers where talk_id=%s", (T,))
    code, j0 = api("POST", f"/studio/dubbing/talks/{T}/jobs", json={"kind": "preview"}); ok(code == 201 and "speakers" not in j0["params"], "sans intervenants : demande sans « speakers »")
    ok(wait(lambda: job(j0["id"])[0] in ("done", "failed")) and job(j0["id"])[0] == "done", "…et doublage comme avant")
    a0 = voice_wav(j0["id"]); w00 = job(j0["id"])[1]["window"][0]
    ok(all(abs((hz(a0, i, w00) or 0) - 220) < 8 for i in (0, 1, 2, 4, 5)), "…une seule voix pour toutes les phrases (220 Hz)")
    ok(job(j0["id"])[1]["speakers"][0]["pitch"] == 0 and job(j0["id"])[1]["pitchEngine"] is None, "…hauteur 0 : moteur de hauteur non sollicité")
    # hauteur de la conférence appliquée sans intervenants
    api("PUT", f"/studio/dubbing/talks/{T}", json={"params": {"pitch": -2}})
    code, j1 = api("POST", f"/studio/dubbing/talks/{T}/jobs", json={"kind": "preview"}); wait(lambda: job(j1["id"])[0] in ("done", "failed"))
    a1 = voice_wav(j1["id"]); w1 = job(j1["id"])[1]["window"][0]
    ok(abs((hz(a1, 0, w1) or 0) - 220 * 2 ** (-2 / 12)) / 196 < 0.03, f"hauteur -2 de la conférence : {round(hz(a1, 0, w1) or 0)} Hz (attendu {round(220 * 2 ** (-2 / 12))})")
finally:
    svc.terminate(); svc.wait(timeout=20); logf.close()
    print("--- journal du service (fin) ---"); print("".join(open(os.path.join(work, "service.log")).readlines()[-6:]))
    mod_settings(queue_mode="night", night_start=1, night_end=7, preview_seconds=60, require_review="true")
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for v in voices: cur.execute("delete from dub_voices where id=%s", (v,))
print(f"\n{len(fails)} échec(s)")
sys.exit(1 if fails else 0)
