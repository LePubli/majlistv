"""Étape E5d : le service de transcription traite une vraie demande « le cadre suit le visage » (base PG et stockage de test, vraie détection).
Une vidéo d'essai (visage qui traverse l'image) est envoyée dans le stockage de test ; la demande est lue en base, la vidéo lue par adresse signée,
les visages détectés, la trajectoire écrite. Cas d'échec : vidéo externe, aucun visage, passage invalide ; reprise après interruption.
Prérequis : PG de test (5544, migration 059), S3 de test moto (5599), FFmpeg, OpenCV, scikit-image.
Lancement (depuis transcriber/) : python3 tests/test_track_job.py"""
import json, os, sys, tempfile, types, uuid
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src")); sys.path.insert(0, HERE)
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:5599", "S3_REGION": "garage", "S3_ACCESS_KEY": "test",
                   "S3_SECRET_KEY": "test", "S3_BUCKET": "majlis-videos", "WORK_DIR": tempfile.mkdtemp(prefix="trk-"), "SETTINGS_KEY": "a" * 64,
                   "MODELS_DIR": "/tmp/claude-0/models", "YTDLP_AUTO_UPDATE": "0"})
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=object)
sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=None))
sys.modules.setdefault("yt_dlp.version", types.SimpleNamespace(__version__="fake"))
import main
from face_fixture import make_video, W, FACE

bad = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: bad.append(m)
q = main.query
tag = uuid.uuid4().hex[:6]; talks = []; keys = []
def talk(source, key):
    org = q("select id from users limit 1", fetch=True)[0]["id"]
    r = q("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language)
             values (%s,'d','X',%s,%s,%s,'draft','ready','free',12,'fr') returning id""", (f"Suivi {tag} {source}", source, key, org), fetch=True)[0]["id"]
    talks.append(str(r)); return str(r)
def job(tid, a, b):
    pid = str(uuid.uuid4())
    q("insert into face_track_jobs(project_id, talk_id, from_s, to_s) values (%s,%s,%s,%s)", (pid, tid, a, b))
    return pid
def row(pid): return q("select * from face_track_jobs where project_id=%s", (pid,), fetch=True)[0]
d = tempfile.mkdtemp(prefix="trkv-")
try:
    q("select 1 from face_track_jobs limit 1", fetch=True)
    ok(True, "table face_track_jobs présente (migration 059)")
    # Visage qui traverse l'image de gauche à droite en 12 s ; passage analysé : 2 → 10 s
    v = make_video(f"{d}/v.mp4", 12, lambda t: 50 + 820 * t / 12)
    main.s3.upload_file(v, "majlis-videos", f"talks/{tag}-v"); keys.append(f"talks/{tag}-v")
    T = talk("upload", f"talks/{tag}-v"); P = job(T, 2, 10)
    j = main.claim_track()
    ok(j and str(j["project_id"]) == P and row(P)["status"] == "processing" and row(P)["attempts"] == 1, "demande prise en charge : en cours, tentative 1")
    main.process_track(j); r = row(P)
    ok(r["status"] == "done" and r["progress"] == 100 and r["error"] is None, f"analyse terminée ({r['status']}, {r['error']})")
    ks = r["keys"]
    ok(isinstance(ks, list) and len(ks) >= 2 and ks[0]["t"] >= 1.99 and ks[-1]["t"] <= 10.01, f"points clés dans le temps de la vidéo d'origine : {ks[0]['t']} → {ks[-1]['t']} s ({len(ks)} points)")
    at = lambda t: next((k["x"] for k in ks if k["t"] >= t), ks[-1]["x"])
    ok(ks[-1]["x"] > ks[0]["x"] + 30, f"le cadre avance : {ks[0]['x']} % → {ks[-1]['x']} %")
    ok(float(r["coverage"]) > 0.9 and r["faces"] == 1 and r["samples"] >= 20, f"couverture {float(r['coverage']) * 100:.0f} %, {r['faces']} personne, {r['samples']} images")
    ok(not os.path.exists(os.path.join(os.environ["WORK_DIR"], "track-" + P)), "dossier de travail nettoyé")
    # Aucun visage
    v0 = make_video(f"{d}/vide.mp4", 8, lambda t: None)
    main.s3.upload_file(v0, "majlis-videos", f"talks/{tag}-0"); keys.append(f"talks/{tag}-0")
    P0 = job(talk("upload", f"talks/{tag}-0"), 0, 8); main.process_track(main.claim_track()); r = row(P0)
    ok(r["status"] == "failed" and "Aucun visage" in r["error"] and r["keys"] is None, f"vidéo sans visage : échec clair ({r['error']})")
    # Vidéo externe
    Px = job(talk("youtube", "abc"), 0, 5); main.process_track(main.claim_track()); r = row(Px)
    ok(r["status"] == "failed" and "envoyées sur le site" in r["error"], f"vidéo YouTube : refus clair ({r['error']})")
    # Passage invalide (au-delà de la vidéo)
    Pz = job(T, 40, 50); main.process_track(main.claim_track()); r = row(Pz)
    ok(r["status"] == "failed" and r["error"], f"passage hors de la vidéo : échec ({r['error']})")
    # Reprise après interruption (le service redémarre) : processing → pending
    Pr = job(T, 0, 6); q("update face_track_jobs set status='processing' where project_id=%s", (Pr,))
    q("UPDATE face_track_jobs SET status = 'pending' WHERE status = 'processing'")
    ok(row(Pr)["status"] == "pending", "reprise après redémarrage : la demande interrompue repart")
    ok(main.claim_track() is not None and main.claim_track() is None, "file : une demande à la fois, puis vide")
    # Registre n°31 : annulation, pause et priorité (Studio → Activité, file « face »)
    Pc = job(T, 2, 10); jc = main.claim_track(); ok(str(jc["project_id"]) == Pc, "demande à annuler prise en charge")
    q("update face_track_jobs set cancel_requested = true where project_id=%s", (Pc,))
    main.process_track(jc); r = row(Pc)
    ok(r["status"] == "canceled" and r["keys"] is None and r["cancel_requested"] is False, f"annulée pendant le calcul : arrêt propre ({r['status']})")
    Pp = job(T, 0, 4); q("insert into activity_controls(queue, ref, paused, priority) values ('face', %s, true, 0)", (Pp,))
    ok(main.claim_track() is None, "demande en pause : pas prise")
    q("delete from activity_controls where queue='face' and ref=%s", (Pp,))
    Pq = job(T, 0, 4); q("insert into activity_controls(queue, ref, paused, priority) values ('face', %s, false, 10)", (Pq,))
    ok(str(main.claim_track()["project_id"]) == Pq, "demande prioritaire : prise avant la plus ancienne")
    q("delete from activity_controls where queue='face' and ref=%s", (Pq,))
    ok(str(main.claim_track()["project_id"]) == Pp, "puis la suivante")
    q("update face_track_jobs set status='processing', cancel_requested=true where project_id=%s", (Pp,))
    q("UPDATE face_track_jobs SET status = CASE WHEN cancel_requested THEN 'canceled' ELSE 'pending' END, cancel_requested = false WHERE status = 'processing'")
    ok(row(Pp)["status"] == "canceled" and row(Pq)["status"] == "pending", "redémarrage : l'annulée ne repart pas, l'autre si")
finally:
    for t in talks: q("delete from talks where id=%s", (t,))
    for k in keys:
        try: main.s3.delete_object(Bucket="majlis-videos", Key=k)
        except Exception: pass
print("\n" + ("Tout est bon" if not bad else f"{len(bad)} échec(s)"))
sys.exit(1 if bad else 0)
