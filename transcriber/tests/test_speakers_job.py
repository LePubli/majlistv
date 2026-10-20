"""Étape D3c : le service de transcription traite une vraie demande « Détecter les intervenants » (base PG et stockage de test, VRAI modèle de voix).
Une « conférence » de trois voix de synthèse (voix d'homme et de femme d'espeak-ng, voix d'homme anglaise de flite) dont on connaît le déroulé est envoyée dans
le stockage de test ; la demande est faite par l'API, lue en base, l'audio lu dans le stockage, les voix regroupées, le résultat écrit.
Cas : résultat juste, hauteur et catégorie suggérée, nouvelle détection qui remplace les corrections manuelles, annulation (rien n'est changé),
pause depuis Activité, vidéo externe, vidéo sans audio, reprise après interruption.
Prérequis : API (3055, module doublage 0.10.0), PG (5544), S3 de test moto (5599), FFmpeg, espeak-ng, flite, modèle de voix (téléchargé ou MODELS_DIR).
Lancement (depuis la racine du dépôt) : python3 transcriber/tests/test_speakers_job.py"""
import os, shutil, subprocess, sys, tempfile, types, uuid, wave
import numpy as np, requests
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src"))
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:5599", "S3_REGION": "garage", "S3_ACCESS_KEY": "test",
                   "S3_SECRET_KEY": "test", "S3_BUCKET": "majlis-videos", "WORK_DIR": tempfile.mkdtemp(prefix="spkjob-"), "SETTINGS_KEY": "a" * 64,
                   "MODELS_DIR": os.environ.get("MODELS_DIR", "/tmp/claude-0/models"), "YTDLP_AUTO_UPDATE": "0"})
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=object)
sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=None))
sys.modules.setdefault("yt_dlp.version", types.SimpleNamespace(__version__="fake"))
import main  # noqa: E402

API = "http://127.0.0.1:3055"
bad = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: bad.append(m)
if not (shutil.which("espeak-ng") and shutil.which("flite")):
    print("SKIP : espeak-ng / flite absents"); sys.exit(0)
A = {"authorization": "Bearer " + requests.post(API + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def api(method, path, **kw):
    r = requests.request(method, API + path, headers=A, **kw); return r.status_code, (r.json() if r.content else None)
q = main.query
tag = uuid.uuid4().hex[:6]; talks = []; keys = []; d = tempfile.mkdtemp(prefix="spkv-")
admin = q("select id from users where email='admin@test.local'", fetch=True)[0]["id"]
def talk(source, key):
    r = q("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
             values (%s,'d','X',%s,%s,%s,'draft','ready','free',60,'ar','ar') returning id""", (f"Intervenants {tag} {source}", source, key, admin), fetch=True)[0]["id"]
    talks.append(str(r)); return str(r)
def row(t): return q("select * from dub_speaker_jobs where talk_id=%s", (t,), fetch=True)[0]

try:
    q("select 1 from dub_speaker_jobs limit 1", fetch=True); ok(True, "table dub_speaker_jobs présente (migration 006 du module doublage)")
    texts = ["Bonjour mes amis, aujourd'hui nous allons parler de la patience dans l'épreuve.", "La patience est une lumière pour le croyant sincère.",
             "Il faut rester constant même quand le chemin devient difficile.", "Chacun de nous traverse des moments de doute et de fatigue.",
             "Le savoir s'acquiert avec le temps, l'humilité et beaucoup de travail.", "Rappelons-nous toujours que la miséricorde précède la colère."]
    plan = ["m3", "m3", "f2", "m3", "f2", "fl", "m3", "f2", "m3", "fl", "m3", "f2", "m3", "fl"]
    def say(v, text, path):
        if v == "fl": subprocess.run(["flite", "-voice", "awb", "-t", text, "-o", path], check=True)
        else: subprocess.run(["espeak-ng", "-v", "fr+" + v, "-s", "150", text, "-w", path], check=True)
    def load(path):
        with wave.open(path) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768; sr = w.getframerate()
        if sr != 16000:
            import scipy.signal as ss; a = ss.resample_poly(a, 16000, sr).astype(np.float32)
        return a
    pieces, segs, t = [], [], 0.0
    for k, v in enumerate(plan):
        p = os.path.join(d, f"{k}.wav"); say(v, texts[k % len(texts)], p); a = load(p)
        segs.append((k, int(t * 1000), int((t + len(a) / 16000) * 1000))); pieces += [a, np.zeros(8000, dtype=np.float32)]; t += len(a) / 16000 + 0.5
    full = np.concatenate(pieces); wav = os.path.join(d, "conv.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes((np.clip(full, -1, 1) * 32767).astype("<i2").tobytes())
    mp4 = os.path.join(d, "conv.mp4"); subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "aac", mp4], check=True)
    main.s3.upload_file(mp4, "majlis-videos", f"talks/{tag}-conv"); keys.append(f"talks/{tag}-conv")
    T = talk("upload", f"talks/{tag}-conv")
    for k, s, e in segs: q("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (T, k, s, e, f"Phrase {k}"))
    # le service ne prend rien tant qu'il n'y a pas de demande
    ok(main.claim_speakers() is None, "aucune demande : rien à prendre")
    code, r = api("POST", f"/studio/dubbing/talks/{T}/speakers/detect", json={"maxSpeakers": 5}); ok(code == 201, f"demande faite par l'API ({code})")
    # pause depuis Activité : la demande n'est pas prise
    api("POST", f"/studio/activity/speakers/{T}/pause", json={"paused": True}); ok(main.claim_speakers() is None, "demande mise en pause dans Activité : non prise")
    api("POST", f"/studio/activity/speakers/{T}/pause", json={"paused": False})
    # annulation avant le calcul : la demande en cours est annulée, rien n'est écrit
    j = main.claim_speakers(); ok(j and str(j["talk_id"]) == T and j["max_speakers"] == 5 and row(T)["status"] == "processing" and row(T)["attempts"] == 1, "demande prise en charge : en cours, tentative 1, 5 voix au plus")
    q("update dub_speaker_jobs set cancel_requested=true where talk_id=%s", (T,))
    main.process_speakers(j); r = row(T)
    ok(r["status"] == "canceled" and not r["cancel_requested"], "annulation pendant le calcul : « annulée »")
    ok(q("select count(*) n from dub_speakers where talk_id=%s", (T,), fetch=True)[0]["n"] == 0, "…et rien n'est écrit")
    # détection complète
    api("POST", f"/studio/dubbing/talks/{T}/speakers/detect", json={"maxSpeakers": 5})
    j = main.claim_speakers(); main.process_speakers(j); r = row(T)
    ok(r["status"] == "done" and r["progress"] == 100 and r["found"] == 3 and r["error"] is None, f"détection terminée : {r['status']}, {r['found']} voix ({r['error']})")
    sp = q("select * from dub_speakers where talk_id=%s order by n", (T,), fetch=True)
    mp = {x["idx"]: x["speaker"] for x in q("select idx, speaker from dub_phrase_speakers where talk_id=%s", (T,), fetch=True)}
    ok(len(sp) == 3 and len(mp) == len(plan), f"3 intervenants, {len(mp)} phrases attribuées")
    pairs = sum(1 for a in range(len(plan)) for b in range(a) if (mp[a] == mp[b]) == (plan[a] == plan[b])); total = len(plan) * (len(plan) - 1) // 2
    ok(pairs == total, f"mêmes voix rapprochées, voix différentes séparées : {pairs}/{total} paires de phrases")
    ok(sp[0]["seconds"] >= sp[1]["seconds"] >= sp[2]["seconds"] and sp[0]["label"] == "Intervenant 1", "intervenant 1 = celui qui parle le plus ; noms par défaut")
    ok(abs(sum(float(x["seconds"]) for x in sp) - sum((e - s) / 1000 for _, s, e in segs)) < 1.0 and sum(x["phrases"] for x in sp) == len(plan), "temps de parole et nombres de phrases cohérents")
    by_plan = {}
    for k, v in enumerate(plan): by_plan.setdefault(v, set()).add(mp[k])
    guess = {v: next(x for x in sp if x["n"] == list(n)[0]) for v, n in by_plan.items()}
    print(f"     hauteurs : homme d'essai {guess['m3']['f0']} Hz ({guess['m3']['guess']}), femme d'essai {guess['f2']['f0']} Hz ({guess['f2']['guess']}), flite {guess['fl']['f0']} Hz ({guess['fl']['guess']})")
    ok(guess["m3"]["guess"] == "male" and guess["f2"]["guess"] == "female" and float(guess["m3"]["f0"]) < float(guess["f2"]["f0"]), "catégorie suggérée : homme et femme d'essai bien reconnus")
    # le Studio voit le résultat
    det = api("GET", f"/studio/dubbing/talks/{T}")[1]
    ok(len(det["speakers"]["list"]) == 3 and det["speakers"]["job"]["status"] == "done" and all(s["speaker"] for s in det["segments"]), "le Studio affiche les intervenants et l'intervenant de chaque phrase")
    # correction manuelle puis NOUVELLE détection : tout est remplacé
    api("PATCH", f"/studio/dubbing/talks/{T}/segments/0", json={"speaker": 3}); api("PUT", f"/studio/dubbing/talks/{T}/speakers/1", json={"label": "Le cheikh"})
    api("POST", f"/studio/dubbing/talks/{T}/speakers/detect", json={}); j = main.claim_speakers(); main.process_speakers(j)
    ok(q("select count(*) n from dub_phrase_speakers where talk_id=%s and manual", (T,), fetch=True)[0]["n"] == 0 and q("select label from dub_speakers where talk_id=%s and n=1", (T,), fetch=True)[0]["label"] == "Intervenant 1",
       "nouvelle détection : corrections manuelles et noms remplacés (prévenu dans le Studio)")
    ok(row(T)["status"] == "done" and row(T)["max_speakers"] == 6, "…avec les réglages de la nouvelle demande (6 voix au plus par défaut)")
    # nombre maximal : 2 voix au plus → regroupées
    api("POST", f"/studio/dubbing/talks/{T}/speakers/detect", json={"maxSpeakers": 2}); j = main.claim_speakers(); main.process_speakers(j)
    ok(row(T)["found"] == 2 and q("select count(*) n from dub_speakers where talk_id=%s", (T,), fetch=True)[0]["n"] == 2, "2 voix au plus : deux intervenants")
    # vidéo externe (l'API refuse : on insère la demande à la main) et vidéo sans audio
    Y = talk("youtube", "y" + tag); q("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',0,0,3000,'x')", (Y,))
    q("insert into dub_speaker_jobs(talk_id) values (%s)", (Y,)); j = main.claim_speakers(); main.process_speakers(j)
    ok(row(Y)["status"] == "failed" and "vidéos envoyées" in row(Y)["error"], f"vidéo externe : échec expliqué ({row(Y)['error'][:60]})")
    vsrc = os.path.join(d, "mute.mp4"); subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=3", "-an", vsrc], check=True)
    main.s3.upload_file(vsrc, "majlis-videos", f"talks/{tag}-mute"); keys.append(f"talks/{tag}-mute")
    M = talk("upload", f"talks/{tag}-mute"); q("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',0,0,3000,'x')", (M,))
    q("insert into dub_speaker_jobs(talk_id) values (%s)", (M,)); j = main.claim_speakers(); main.process_speakers(j)
    ok(row(M)["status"] == "failed" and "audio" in row(M)["error"], f"vidéo sans son : échec expliqué ({row(M)['error']})")
    # sans texte français
    N = talk("upload", f"talks/{tag}-conv"); q("insert into dub_speaker_jobs(talk_id) values (%s)", (N,)); j = main.claim_speakers(); main.process_speakers(j)
    ok(row(N)["status"] == "failed" and "texte français" in row(N)["error"], "sans texte français : échec expliqué")
    # reprise après interruption : « processing » repart (« canceled » si l'annulation était demandée)
    q("update dub_speaker_jobs set status='processing' where talk_id=%s", (T,)); q("update dub_speaker_jobs set status='processing', cancel_requested=true where talk_id=%s", (Y,))
    q("UPDATE dub_speaker_jobs SET status = CASE WHEN cancel_requested THEN 'canceled' ELSE 'pending' END, cancel_requested = false WHERE status = 'processing'")
    ok(row(T)["status"] == "pending" and row(Y)["status"] == "canceled", "reprise : la demande interrompue repart, celle annulée reste annulée")
finally:
    for t in talks: q("delete from talks where id=%s", (t,))
    for k in keys:
        try: main.s3.delete_object(Bucket="majlis-videos", Key=k)
        except Exception: pass
print("\n" + ("TOUT EST BON" if not bad else f"{len(bad)} ÉCHEC(S) : " + " | ".join(bad)))
sys.exit(1 if bad else 0)
