"""Étape E4b — remplacer la vidéo publiée par un rendu final, puis « Restaurer l'original ».
Vérifie : écran avant/après (quiz à revoir, notes, reprises, original), refus (aperçu rapide, opération déjà en cours, autre organisateur),
préparation par le worker (même code que le service) dans un nouveau dossier, bascule par l'API (vidéo, sous-titres de toutes les langues,
chapitres, quiz / actions / rappels, notes, reprises de lecture, doublage retiré, montage remis à zéro), anciens liens encore servis (v=0)
puis effacés, suite (nouvelle transcription → quiz rattachés au texte → résumés relancés), original annoncé à l'archivage,
restauration complète (tout revient, ce qui a été créé entre-temps est recalé), restauration depuis les archives (attente),
annulation avant la bascule, Studio → Activité, journal d'audit, registre point 3 (effacement d'une copie d'archive).

Prérequis (tout en local) : API (3055), PG (5544), S3 de test moto (5599), FFmpeg, dépendances du worker (npm ci dans worker/).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e4b.py"""
import json, os, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls, add_transcript

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
BUCKET = "majlis-videos"
tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []; fails = []
WENV = {**os.environ, "DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:5599", "S3_ACCESS_KEY": "test",
        "S3_SECRET_KEY": "test", "S3_REGION": "garage", "S3_BUCKET": BUCKET, "WORK_DIR": tempfile.mkdtemp(prefix="e4b-"), "FFMPEG_THREADS": "2"}
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    if r.status_code == 429 and "/auth/" in path: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
def worker(script):
    p = subprocess.run(["node", os.path.join(ROOT, "worker", "tests", script)], env=WENV, capture_output=True, text=True, timeout=600)
    try: return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: print(p.stdout, p.stderr); return {}
def until(fn, t=40, step=0.5):
    end = time.time() + t
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(step)
    return None
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r and len(r) == 1 else r
def keys_of(prefix): return [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix).get("Contents", [])]

A = login("admin@test.local", "AdminPassw0rd-test")
for m in ("editor", "dubbing", "storage"): rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
def organizer(label):
    em = f"e4b{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
oid, O = organizer("a"); oid2, O2 = organizer("b")
em = f"e4bm-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Membre {tag}"})
mid = one("select id from users where email=%s", em); users.append(str(mid)); M = login(em, "Passw0rd-test")

try:
    # --- Conférence de 40 s : original, version convertie (HLS 360p), phrases fr (toutes les 6 s) et en, résumé, quiz, actions, rappels,
    #     notes, reprise de lecture, doublage.
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status,transcript_text)
                   values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',40,'fr','fr','ready','texte') returning id""", (f"E4b {tag}", f"talks/{tag}-orig", oid))
    T = str(cur.fetchone()[0]); talks.append(T)
    d = tempfile.mkdtemp(prefix="e4b-")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=40", "-f", "lavfi", "-i", "sine=frequency=440:duration=40",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", os.path.join(d, "orig.mp4")], check=True)
    s3.upload_file(os.path.join(d, "orig.mp4"), BUCKET, f"talks/{tag}-orig"); keys.append(f"talks/{tag}-orig")
    make_hls(s3, T, 40); n_fr = add_transcript(cur, T, 40)
    cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) select talk_id, 'en', idx, start_ms, end_ms, 'EN ' || text from transcript_segments where talk_id=%s and lang='fr'", (T,))
    cur.execute("insert into transcript_translations(talk_id, lang, status, progress) values (%s,'en','ready',100)", (T,))
    cur.execute("""insert into talk_insights(talk_id, lang, status, summary, key_points, chapters) values (%s,'fr','ready','Résumé','[]',%s)""",
                (T, json.dumps([{"ms": 0, "title": "Début"}, {"ms": 15000, "title": "Passage coupé"}, {"ms": 30000, "title": "Suite"}])))
    def quiz(ms, status, quote):
        cur.execute("""insert into quiz_questions(talk_id, lang, question, options, correct_index, evidence_ms, evidence_quote, chapter_ms, status)
                       values (%s,'fr','Q ?','["a","b","c"]',0,%s,%s,%s,%s) returning id""", (T, ms, quote, ms, status)); return str(cur.fetchone()[0])
    q1 = quiz(3000, "approved", "Phrase 1 de la conférence"); q2 = quiz(15000, "approved", "Phrase 3 de la conférence"); q3 = quiz(15000, "rejected", "")
    cur.execute("insert into practice_suggestions(talk_id, lang, text, evidence_ms, status) values (%s,'fr','Agir',16000,'approved') returning id", (T,)); pr = str(cur.fetchone()[0])
    cur.execute("insert into reminders(talk_id, lang, text, start_ms, origin, status) values (%s,'fr','Un rappel du passage',16000,'transcript','approved') returning id", (T,)); rm = str(cur.fetchone()[0])
    cur.execute("insert into talk_notes(user_id, talk_id, position_ms, body) values (%s,%s,3000,'avant'),(%s,%s,15000,'coupé') returning id", (mid, T, mid, T)); n1, n2 = [str(r[0]) for r in cur.fetchall()]
    cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms) values (%s,%s,25000,40000)", (mid, T))
    vkey = f"dubbing/tracks/{T}/test-voice.m4a"; s3.put_object(Bucket=BUCKET, Key=vkey, Body=b"x"); keys.append(vkey)
    cur.execute("insert into dub_jobs(talk_id, kind, status, params, finished_at) values (%s,'full','done','{}', now()) returning id", (T,)); jd = cur.fetchone()[0]
    cur.execute("insert into dub_tracks(talk_id, job_id, voice_key, duration_s) values (%s,%s,%s,40)", (T, jd, vkey))
    cur.execute("insert into dub_segments(talk_id, idx, keep_original) values (%s, 1, true)", (T,))
    cur.execute("insert into dub_reviews(talk_id, text_hash) values (%s,'abc')", (T,))

    # --- Montage : [0,10] + [20,40] (10 s coupées), intro de 2 s ; rendu final, puis aperçu.
    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    S = "sess-" + tag + "-e4b"
    rev = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S}).json()["rev"]
    tl = {"v": 1, "duration": 40, "clips": [{"id": "c1", "in": 0, "out": 10}, {"id": "c2", "in": 20, "out": 40}], "audio": {"dub": {"use": False}},
          "dress": {"intro": {"on": True, "len": 2, "title": "{titre}"}}}
    rev = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": tl, "rev": rev, "session": S}).json()["rev"]
    R = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "final", "rev": rev}).json()["render"]["id"]
    ok(worker("run_render_once.mjs").get("ok"), "rendu final calculé par le worker")
    RP = None

    # --- Écran avant / après
    pv = rq("GET", f"/studio/editor/renders/{R}/replace-preview", headers=O).json()
    im = pv["impact"]
    ok(pv["blocked"] is None and abs(pv["render"]["duration"] - 32) < 0.3 and pv["talk"]["duration"] == 40, f"avant 40 s / après {pv['render']['duration']} s")
    ok(im["quiz"] == {"total": 2, "review": 1, "approvedReview": 1} and im["practiceReview"] == 1 and im["notes"] == 2 and im["progress"] == 1, f"conséquences : {im}")
    ok(im["dubTrack"] is True and sorted(im["langs"]) == ["en", "fr"] and pv["original"]["bytes"] > 10000 and pv["original"]["keepDays"] == 7, "doublage à refaire, langues, original à garder 7 jours")
    ok("cards" in pv["render"]["dress"] and pv["render"]["dub"] is False and pv["render"]["upToDate"], f"habillage : {pv['render']['dress']}, sans voix française")
    ok(rq("GET", f"/studio/editor/renders/{R}/replace-preview", headers=O2).status_code == 404, "autre organisateur : 404")

    # --- Refus
    rev2 = one("select rev from editor_projects where id=%s", pid)
    RP = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "preview", "rev": rev2}).json()["render"]["id"]
    worker("run_render_once.mjs")
    r = rq("POST", f"/studio/editor/renders/{RP}/replace", headers=O, json={})
    ok(r.status_code == 409 and r.json()["code"] == "preview", "un aperçu rapide ne remplace pas la vidéo")

    # --- Lancer
    r = rq("POST", f"/studio/editor/renders/{R}/replace", headers=A, json={"keepCorrections": False})
    ok(r.status_code == 201 and r.json()["replacement"]["status"] == "converting", f"remplacement lancé ({r.status_code})")
    X = r.json()["replacement"]["id"]
    newkey = f"talks/{T}-r{X}.mp4"; keys.append(newkey)
    ok(s3.head_object(Bucket=BUCKET, Key=newkey)["ContentLength"] > 10000, "rendu copié en nouvelle vidéo de la conférence")
    ok(rq("POST", f"/studio/editor/renders/{R}/replace", headers=O, json={}).json().get("code") == "busy", "une seule opération à la fois")
    ok(until(lambda: one("select summary from audit_log where summary like %s", f"%remplacement de la vidéo publiée lancé (« E4b {tag}%"), 5), "journal d’audit (administrateur)")
    acts = rq("GET", "/studio/activity", headers=O).json()["tasks"]
    ok(any(t["queue"] == "replace" and t["ref"] == X and t["status"] == "waiting" and t["heavy"] for t in acts), "Studio → Activité : nouvelle version en attente (tâche lourde)")

    # --- Préparation (worker) puis bascule (API, toutes les 10 s)
    w = worker("run_replace_once.mjs")
    ok(w.get("ok") and one("select status from editor_replacements where id=%s", X) in ("converted", "switched"), f"nouvelle version préparée ({w})")
    ok(len(keys_of(f"hls/{T}/r/{X}/")) > 5, "fichiers HLS dans hls/<id>/r/<remplacement>/")
    ok(until(lambda: one("select status from editor_replacements where id=%s", X) == "switched", 30), "bascule faite par l’API")
    t = one("select row_to_json(t) from talks t where id=%s", T)
    ok(t["media_prefix"] == f"hls/{T}/r/{X}/" and t["video_ref"] == newkey and t["duration_seconds"] == 32 and t["poster_key"].startswith(f"hls/{T}/r/{X}/"), "conférence : nouvelle vidéo, nouveau dossier, 32 s, miniature")
    ok(t["transcript_status"] == "pending" and one("select status from transcript_translations where talk_id=%s and lang='en'", T) == "pending", "nouvelle transcription et traductions relancées")
    fr = [r for r in (cur.execute("select idx, start_ms, end_ms, text from transcript_segments where talk_id=%s and lang='fr' order by idx", (T,)) or cur.fetchall())]
    en = one("select count(*) from transcript_segments where talk_id=%s and lang='en'", T)
    ok(fr[0][1] == 2000 and all("de 12 à" not in x[3] for x in fr) and len(fr) == en and len(fr) < n_fr, f"sous-titres recalés (+2 s d’intro, phrase coupée retirée) : {len(fr)} / {n_fr}, en alignées")
    chs = one("select chapters from talk_insights where talk_id=%s and lang='fr'", T)
    ok([c["ms"] for c in chs] == [2000, 12000, 22000], f"chapitres recalés : {[c['ms'] for c in chs]}")
    ok(one("select status from quiz_questions where id=%s", q1) == "approved" and one("select evidence_ms from quiz_questions where id=%s", q1) == 5000, "quiz gardé : réponse déplacée (3 s → 5 s)")
    ok(one("select status from quiz_questions where id=%s", q2) == "draft" and one("select status from quiz_questions where id=%s", q3) == "rejected", "quiz dont le passage est coupé : « à revoir » (dépublié) ; refusé : inchangé")
    ok(one("select status from practice_suggestions where id=%s", pr) == "draft" and one("select status from reminders where id=%s", rm) == "draft", "action et rappel coupés : à revoir")
    ok(one("select position_ms from talk_notes where id=%s", n1) == 5000 and one("select position_ms from talk_notes where id=%s", n2) == 12000, "notes déplacées (coupée → début du passage suivant)")
    ok(one("select row(position_ms, duration_ms)::text from watch_progress where user_id=%s and talk_id=%s", mid, T) == "(17000,32000)", "reprise de lecture recalée (25 s → 17 s, durée 32 s)")
    ok(one("select count(*) from dub_tracks where talk_id=%s", T) == 0 and one("select count(*) from dub_segments where talk_id=%s", T) == 0, "piste française retirée (doublage à refaire)")
    rep = one("select row_to_json(r) from editor_replacements r where id=%s", X)
    ok(rep["prev"]["dub"]["track"]["voice_key"] == vkey and rep["report"]["quizReview"] == 1 and rep["report"]["notes"] == 2 and rep["original_state"] == "kept" and rep["follow"] == "transcript",
       f"de quoi revenir en arrière ; compte rendu {rep['report']}")
    ptl = one("select timeline from editor_projects where id=%s", pid)
    ok(len(ptl["clips"]) == 1 and abs(ptl["clips"][0]["out"] - 32) < 0.1 and one("select count(*) from editor_versions where project_id=%s and label like 'Montage publié le %%'", pid) == 1,
       "montage remis à zéro sur la nouvelle vidéo, l’ancien rangé en version nommée")
    ok(one("select count(*) from talk_events where talk_id=%s and kind='video' and status='replaced'", T) == 1, "fiche de suivi : « vidéo remplacée »")
    # Lecture : nouveau master (v=<remplacement>) ; un spectateur déjà en lecture garde l'ancienne version (v=0) pendant 6 h.
    tok = rq("GET", f"/talks/{T}", headers=M).json()
    hp = tok.get("hlsPath") or ""
    master = rq("GET", hp).text if hp else ""
    ok(f"&v={X}" in master, "nouveau master : liens vers la nouvelle version")
    t0 = hp.split("t=")[1]
    ok(rq("GET", f"/hls/{T}/v0/index.m3u8?t={t0}&v=0").status_code == 200, "ancienne version encore servie aux spectateurs en cours (v=0)")
    ok(f"/r/{X}/" in rq("GET", f"/hls/{T}/v0/index.m3u8?t={t0}").text, "sans v : la version publiée (nouvelle)")
    prod = rq("GET", f"/studio/production?ids={T}", headers=O)
    ok(prod.ok, f"Studio → Contenus ({prod.status_code})")

    # --- Suite : la nouvelle transcription arrive (simulée) → quiz rattachés au texte, résumés relancés ; puis traductions.
    cur.execute("delete from transcript_segments where talk_id=%s and lang='fr'", (T,))
    cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',0,2000,6000,'Intro'),(%s,'fr',1,6500,9000,'Phrase 1 de la conférence, reprise.')", (T, T))
    cur.execute("update talks set transcript_status='ready' where id=%s", (T,))
    ok(until(lambda: one("select follow from editor_replacements where id=%s", X) == "translations", 30), "transcription prête : étape suivante")
    ok(one("select evidence_ms from quiz_questions where id=%s", q1) == 6500, "quiz rattaché au texte de son passage dans la nouvelle transcription")
    ok(one("select status from talk_insights where talk_id=%s and lang='fr'", T) == "pending", "résumé et chapitres relancés")
    cur.execute("update transcript_translations set status='ready' where talk_id=%s", (T,)); cur.execute("update talk_insights set status='ready' where talk_id=%s", (T,))
    ok(until(lambda: one("select follow from editor_replacements where id=%s", X) == "done", 30), "tout est à jour")

    # --- Original annoncé à l'archivage ; ancienne version effacée après le délai.
    st = rq("GET", "/studio/storage", headers=A).json()
    ok(st["pendingOriginals"]["count"] >= 1 and st["pendingOriginals"]["bytes"] > 0 and st["pendingOriginals"]["available"], f"Stockage : original en attente {st['pendingOriginals']}")
    cur.execute("update editor_replacements set cleanup_after = now() - interval '1 minute' where id=%s", (X,))
    ok(until(lambda: one("select cleaned from editor_replacements where id=%s", X), 30), "ancienne version effacée après le délai")
    left = keys_of(f"hls/{T}/")
    ok(left and all(k.startswith(f"hls/{T}/r/") for k in left), "le dossier d’origine est vidé, la nouvelle version reste")
    ok(rq("GET", f"/hls/{T}/v0/index.m3u8?t={t0}&v=0").status_code == 404, "lien de l’ancienne version : introuvable")

    # --- Restaurer l'original : une note ajoutée après la bascule doit être recalée.
    cur.execute("insert into talk_notes(user_id, talk_id, position_ms, body) values (%s,%s,17000,'après') returning id", (mid, T)); n3 = str(cur.fetchone()[0])
    ok(rq("POST", f"/studio/editor/replacements/{X}/restore", headers=O2).status_code == 404, "restaurer l’original d’un autre : 404")
    r = rq("POST", f"/studio/editor/replacements/{X}/restore", headers=O)
    ok(r.status_code == 201 and r.json()["fromArchive"] is False, f"restauration demandée ({r.status_code})")
    Y = r.json()["replacement"]["id"]
    w = worker("run_replace_once.mjs"); ok(w.get("ok"), "l’original est reconverti")
    ok(until(lambda: one("select status from editor_replacements where id=%s", Y) == "switched", 30) and one("select status from editor_replacements where id=%s", X) == "restored", "bascule de retour faite")
    t = one("select row_to_json(t) from talks t where id=%s", T)
    ok(t["video_ref"] == f"talks/{tag}-orig" and t["duration_seconds"] == 40 and t["media_prefix"] == f"hls/{T}/r/{Y}/" and t["transcript_status"] == "ready", "conférence : original de 40 s, transcription d’avant")
    ok(one("select count(*) from transcript_segments where talk_id=%s and lang='fr'", T) == n_fr and one("select start_ms from transcript_segments where talk_id=%s and lang='fr' and idx=0", T) == 0
       and one("select status from transcript_translations where talk_id=%s and lang='en'", T) == "ready", "phrases et traductions d’avant")
    ok([c["ms"] for c in one("select chapters from talk_insights where talk_id=%s and lang='fr'", T)] == [0, 15000, 30000] and one("select status from talk_insights where talk_id=%s and lang='fr'", T) == "ready", "résumé et chapitres d’avant")
    ok(one("select row(status, evidence_ms)::text from quiz_questions where id=%s", q2) == "(approved,15000)" and one("select evidence_ms from quiz_questions where id=%s", q1) == 3000, "quiz d’avant (validé de nouveau)")
    ok(one("select position_ms from talk_notes where id=%s", n1) == 3000 and one("select position_ms from talk_notes where id=%s", n2) == 15000 and one("select position_ms from talk_notes where id=%s", n3) == 25000,
       "notes d’avant ; note ajoutée entre-temps recalée (17 s → 25 s)")
    ok(one("select voice_key from dub_tracks where talk_id=%s", T) == vkey and one("select count(*) from dub_segments where talk_id=%s and keep_original", T) == 1 and one("select count(*) from dub_reviews where talk_id=%s", T) == 1,
       "piste française, cases et relecture d’avant")
    ptl = one("select timeline from editor_projects where id=%s", pid)
    ok([c["out"] for c in ptl["clips"]] == [10, 40], "montage d’avant le remplacement de retour")
    reps = rq("GET", f"/studio/editor/talks/{T}/replacements", headers=O).json()
    ok(reps["restorable"] is None and reps["active"] is None and len(reps["history"]) == 2, "plus rien à restaurer ; historique : 2 opérations")
    ok(rq("POST", f"/studio/editor/replacements/{X}/restore", headers=O).json().get("code") == "not_last", "restaurer deux fois : refusé")

    # --- Deuxième remplacement ; original parti aux archives → restauration en attente de l'archive ; annulation.
    R2 = rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"kind": "final", "rev": one("select rev from editor_projects where id=%s", pid)}).json()["render"]["id"]
    worker("run_render_once.mjs")
    Z = rq("POST", f"/studio/editor/renders/{R2}/replace", headers=O, json={"keepCorrections": True}).json()["replacement"]["id"]
    keys.append(f"talks/{T}-r{Z}.mp4")
    ok(rq("POST", f"/studio/editor/replacements/{Z}/cancel", headers=O).json().get("canceled") and one("select status from editor_replacements where id=%s", Z) == "canceled", "annulé avant la préparation")
    ok(until(lambda: one("select cleaned from editor_replacements where id=%s", Z), 30), "fichiers de l’opération annulée effacés")
    try: s3.head_object(Bucket=BUCKET, Key=f"talks/{T}-r{Z}.mp4"); ok(False, "copie du rendu effacée")
    except Exception: ok(True, "copie du rendu effacée")
    Z2 = rq("POST", f"/studio/editor/renders/{R2}/replace", headers=O, json={"keepCorrections": True}).json()["replacement"]["id"]; keys.append(f"talks/{T}-r{Z2}.mp4")
    worker("run_replace_once.mjs")
    ok(until(lambda: one("select status from editor_replacements where id=%s", Z2) == "switched", 30), "deuxième remplacement (corrections conservées)")
    ok(one("select follow from editor_replacements where id=%s", Z2) == "done" and one("select transcript_status from talks where id=%s", T) == "ready", "corrections conservées : rien n’est relancé")
    ok(one("select count(*) from dub_segments where talk_id=%s", T) <= 1, "cases « voix d’origine » recalées avec leurs phrases")
    s3.delete_object(Bucket=BUCKET, Key=f"talks/{tag}-orig")
    cur.execute("insert into archive_items(source_key, kind, status, bytes, provider, remote_path, talk_id) values (%s,'original','archived',100,'s3',%s,%s) returning id", (f"talks/{tag}-orig", f"talks/{tag}-orig", T)); AI = cur.fetchone()[0]
    r = rq("POST", f"/studio/editor/replacements/{Z2}/restore", headers=O)
    ok(r.status_code == 201 and r.json()["fromArchive"] and one("select status from editor_replacements where id=%s", r.json()["replacement"]["id"]) == "waiting_original", "original aux archives : restauration en attente de l’archive")
    W = r.json()["replacement"]["id"]
    ok(one("select status from archive_items where id=%s", AI) == "restore_queued", "le module Stockage fait revenir l’original")
    acts = rq("GET", "/studio/activity", headers=O).json()["tasks"]
    ok(any(t["queue"] == "replace" and t["ref"] == W and t["status"] == "blocked" for t in acts), "Studio → Activité : en attente de l’archive")
    ok(rq("POST", f"/studio/editor/replacements/{W}/cancel", headers=O).json().get("canceled"), "restauration annulée")
    cur.execute("delete from archive_items where id=%s", (AI,))

    # --- Registre point 3 : copie d'archive d'un fichier effacé → effacement chez le fournisseur (ici : pas de fournisseur → échec « delete », relançable).
    cur.execute("insert into archive_items(source_key, kind, status, provider, remote_path, failed_op, error) values (%s,'dub_preview','failed','s3',%s,'delete','x') returning id", (f"dubbing/previews/{tag}.m4a", f"dubbing/previews/{tag}.m4a")); AD = cur.fetchone()[0]
    r = rq("POST", f"/studio/storage/archives/{AD}/retry", headers=A)
    ok(r.ok and until(lambda: one("select failed_op from archive_items where id=%s and status='failed' and updated_at > now() - interval '1 minute'", AD) == "delete", 20), f"registre 3 : effacement d’une copie d’archive relancé ({r.status_code})")
    cur.execute("delete from archive_items where id=%s", (AD,))

    mods = rq("GET", "/admin/modules", headers=A).json(); mods = mods.get("modules", mods)
    v = {m["id"]: m["version"] for m in mods}
    ok(v.get("editor") == "0.5.0" and v.get("dubbing") == "0.8.0" and v.get("storage") == "0.3.0", f"versions : {v.get('editor')}, {v.get('dubbing')}, {v.get('storage')}")
finally:
    for t in talks:
        for k in keys_of(f"hls/{t}/"): keys.append(k)
        cur.execute("select output_key from editor_renders where talk_id=%s and output_key is not null", (t,)); keys += [r[0] for r in cur.fetchall()]
        cur.execute("delete from activity_controls where ref in (select id::text from editor_replacements where talk_id=%s)", (t,))
        cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    for k in set(keys):
        try: s3.delete_object(Bucket=BUCKET, Key=k)
        except Exception: pass

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
