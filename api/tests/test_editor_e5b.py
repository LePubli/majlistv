"""Étape E5b — extraits courts 9:16 : routes (liste, création, réglages, révision, suppression), sous-titres courts d'après les mots,
rendu par le worker (même code que le service) en 9:16, pas de remplacement de la vidéo publiée, Studio → Activité, droits.

Prérequis (tout en local) : API (3055, module editor), PG (5544), S3 de test moto (5599, bucket majlis-videos), FFmpeg, dépendances du worker.
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e5b.py"""
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
        "S3_SECRET_KEY": "test", "S3_REGION": "garage", "S3_BUCKET": BUCKET, "WORK_DIR": tempfile.mkdtemp(prefix="e5w-"), "FFMPEG_THREADS": "2"}
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
def probe_url(url):
    d = tempfile.mkdtemp(prefix="e5p-"); f = os.path.join(d, "v.mp4")
    open(f, "wb").write(requests.get(url, timeout=120).content)
    return f, json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", f], capture_output=True, text=True).stdout)
def pixel(f, t, x, y):
    b = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-ss", str(t), "-i", f, "-frames:v", "1", "-vf", f"format=rgb24,crop=1:1:{x}:{y}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return list(b[:3])
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None

A = login("admin@test.local", "AdminPassw0rd-test")
rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": True})
def organizer(label):
    em = f"e5b{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
oid, O = organizer("a"); oid2, O2 = organizer("b")

try:
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',40,'fr','fr') returning id""", (f"E5b extraits {tag}", f"talks/{tag}-orig", oid))
    T = str(cur.fetchone()[0]); talks.append(T)
    d = tempfile.mkdtemp(prefix="e5-")
    # Source 1280 × 720 : moitié gauche rouge, moitié droite bleue (on vérifie la place du cadre vertical).
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=640x720:r=25:d=40", "-f", "lavfi", "-i", "color=c=blue:s=640x720:r=25:d=40", "-f", "lavfi", "-i", "sine=frequency=440:duration=40",
                    "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", os.path.join(d, "orig.mp4")], check=True)
    s3.upload_file(os.path.join(d, "orig.mp4"), BUCKET, f"talks/{tag}-orig"); keys.append(f"talks/{tag}-orig")
    make_hls(s3, T, 40)
    # Texte : une phrase par 5 s (10 mots d'une demi-seconde), mots précis, en français ; traduction anglaise (phrases seulement).
    for i in range(8):
        words = [f"mot{i}x{k}" for k in range(10)]
        cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',%s,%s,%s,%s)", (T, i, i * 5000, i * 5000 + 4900, " ".join(words)))
        for k, w in enumerate(words): cur.execute("insert into transcript_words(talk_id, lang, seg_idx, idx, start_ms, end_ms, word) values (%s,'fr',%s,%s,%s,%s,%s)", (T, i, k, i * 5000 + k * 500, i * 5000 + k * 500 + 450, w))
        cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'en',%s,%s,%s,%s)", (T, i, i * 5000, i * 5000 + 4900, f"Sentence {i} in English with some words."))

    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    # --- liste vide, création
    r = rq("GET", f"/studio/editor/projects/{pid}/shorts", headers=O).json()
    ok(r["shorts"] == [] and r["editable"] and r["limits"]["max"] == 180 and r["limits"]["min"] == 1 and r["talk"]["duration"] == 40, "liste des extraits : vide, limites 1 s à 3 min")
    ok(rq("GET", f"/studio/editor/projects/{pid}/shorts", headers=O2).status_code == 404, "autre organisateur : 404")
    for bad, why in (({"from": 5, "to": 5.5}, "trop court"), ({"from": -2, "to": 10}, "avant le début"), ({"from": 0, "to": 200}, "trop long"), ({"from": 30, "to": 45}, "après la fin")):
        r = rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json=bad)
        ok(r.status_code == 400 and r.json().get("code") == "passage", f"création refusée : {why} ({r.json().get('error')})")
    ok(rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json={"from": 1}).status_code == 400, "création sans fin : 400")
    ok(rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O2, json={"from": 5, "to": 20}).status_code == 404, "création sur la conférence d’un autre : 404")
    r = rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json={"from": 10, "to": 20.5})
    S = r.json()["short"]; sid = S["id"]
    ok(r.status_code == 201 and S["title"] == "Extrait 1" and S["from"] == 10 and S["to"] == 20.5 and S["length"] == 10.5 and S["cropX"] == 50 and S["captions"] and not S["dub"] and S["showTitle"] and S["rev"] == 1, f"extrait créé : {S['title']}, 10 → 20,5 s, cadre au centre")
    ch = S["chunks"]
    ok(ch and all(10 <= c["s"] and c["e"] <= 20.5 and len(c["text"].split()) <= 5 for c in ch) and ch[0]["text"].startswith("mot2x0"), f"sous-titres courts d’après les mots ({len(ch)} groupes, premier : « {ch[0]['text']} »)")
    ok(cur.execute("select count(*) from editor_projects where talk_id=%s and kind='short'", (T,)) or cur.fetchone()[0] == 1, "enregistré comme projet de type « short »")
    lst = rq("GET", "/studio/editor/projects", headers=O).json()
    ok(all(p["kind"] == "main" for p in lst["projects"]) and sid not in [p["id"] for p in lst["projects"]], "liste des montages : les extraits n’y figurent pas")
    ok(rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json={"from": 0, "to": 8, "title": "Ma citation", "cropX": 20}).json()["short"]["title"] == "Ma citation", "titre choisi à la création")

    # --- ouvrir, régler
    r = rq("GET", f"/studio/editor/shorts/{sid}", headers=O).json()
    ok(r["media"]["preview"]["hls"].startswith(f"/hls/{T}/v0/index.m3u8?t=") and r["media"]["hasDub"] is False and r["editable"], "ouverture : aperçu 360p de la conférence, pas de voix française")
    ok(rq("GET", f"/studio/editor/shorts/{sid}", headers=O2).status_code == 404 and rq("GET", f"/studio/editor/shorts/{pid}", headers=O).status_code == 404, "extrait d’un autre : 404 ; un montage n’est pas un extrait : 404")
    r = rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 1, "cropX": 100, "from": 12, "to": 24})
    S = r.json()["short"]
    ok(r.ok and S["cropX"] == 100 and S["from"] == 12 and S["to"] == 24 and S["rev"] == 2 and S["chunks"][0]["s"] >= 12, f"réglé : cadre à droite, 12 → 24 s, révision 2 ({r.status_code})")
    r = rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 1, "cropX": 10})
    ok(r.status_code == 409 and r.json()["code"] == "conflict" and r.json()["short"]["cropX"] == 100, "révision dépassée : 409 avec l’extrait à jour")
    ok(rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 2, "from": 10, "to": 300}).status_code == 400, "passage invalide : 400")
    ok(rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 2, "cropX": 140}).status_code == 400, "cadre hors limites : 400")
    ok(rq("PUT", f"/studio/editor/shorts/{sid}", headers=O2, json={"rev": 2, "cropX": 10}).status_code == 404, "régler l’extrait d’un autre : 404")
    S = rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 2, "lang": "en", "title": "Titre réglé"}).json()["short"]
    ok(S["lang"] == "en" and S["title"] == "Titre réglé" and S["cropX"] == 100 and all(len(c["text"].split()) <= 5 for c in S["chunks"]) and "English" in " ".join(c["text"] for c in S["chunks"]), f"sous-titres en anglais (traduction estimée) : « {S['chunks'][0]['text']} »")
    S = rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 3, "captions": False}).json()["short"]
    ok(S["chunks"] == [] and not S["captions"], "sans sous-titres : aucun groupe")
    S = rq("PUT", f"/studio/editor/shorts/{sid}", headers=O, json={"rev": 4, "captions": True, "lang": None}).json()["short"]
    ok(S["lang"] is None and S["chunks"] and S["chunks"][0]["text"].startswith("mot"), "langue parlée rétablie")
    rev = S["rev"]

    # --- rendu : aperçu rapide 360 × 640 puis rendu final
    r = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "preview", "rev": rev - 1})
    ok(r.status_code == 409 and r.json()["code"] == "not_saved", "rendu : révision dépassée (409)")
    r = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "preview", "rev": rev})
    R1 = r.json()["render"]["id"]
    ok(r.status_code == 201 and r.json()["render"]["duration"] == 12 and r.json()["render"]["summary"]["vertical"] and r.json()["render"]["summary"]["subs"], f"aperçu demandé : 12 s, vertical, sous-titres ({r.status_code})")
    cur.execute("select plan from editor_renders where id=%s", (R1,)); plan = cur.fetchone()[0]
    ok(plan["vertical"] and "x='(iw-ow)*1'" in plan["script"]["video"] and "Titre réglé" in plan["ass"] and plan["outDur"] == 12, "plan : cadre à droite, titre dans le fichier de textes")
    acts = rq("GET", "/studio/activity", headers=O).json()["tasks"]
    t = next((x for x in acts if x["queue"] == "render" and x["ref"] == R1), None)
    ok(t and t["link"] == f"/studio/editor/{pid}/shorts?s={sid}", f"Studio → Activité : lien vers la page des extraits ({t and t['link']})")
    w = worker_once(); ok(w.get("claimed") and w.get("ok"), f"le worker calcule l’aperçu ({w})")
    r1 = next(x for x in rq("GET", f"/studio/editor/projects/{sid}/renders", headers=O).json()["renders"] if x["id"] == R1)
    f, pj = probe_url(r1["url"]); vs = next(s for s in pj["streams"] if s["codec_type"] == "video")
    ok(r1["status"] == "ready" and vs["width"] == 360 and vs["height"] == 640 and abs(float(pj["format"]["duration"]) - 12) < 0.3, f"aperçu : {vs['width']}x{vs['height']}, {float(pj['format']['duration']):.1f} s")
    px = pixel(f, 6, 180, 320); ok(px[2] > 200 and px[0] < 60, f"cadre à droite : image bleue ({px})")
    r = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "final", "rev": rev})
    R2 = r.json()["render"]["id"]; w = worker_once(); ok(w.get("ok"), "le worker calcule le rendu final")
    r2 = next(x for x in rq("GET", f"/studio/editor/projects/{sid}/renders", headers=O).json()["renders"] if x["id"] == R2)
    f, pj = probe_url(r2["url"]); vs = next(s for s in pj["streams"] if s["codec_type"] == "video")
    ok(r2["status"] == "ready" and vs["width"] == 720 and vs["height"] == 1280 and r2["report"]["srcHeight"] == 720 and "attachment" in requests.get(r2["downloadUrl"], stream=True).headers.get("content-disposition", ""), f"rendu final : {vs['width']}x{vs['height']} (source 720p), téléchargeable")
    cur.execute("select output_key from editor_renders where id=%s", (R2,)); okey = cur.fetchone()[0]
    ok(okey == f"editor/renders/{sid}/{R2}-final.mp4", "fichier rangé sous editor/renders/<extrait>/")

    # --- pas de remplacement de la vidéo publiée avec un extrait vertical
    r = rq("GET", f"/studio/editor/renders/{R2}/replace-preview", headers=O).json()
    ok(r["blocked"]["code"] == "vertical", f"écran de remplacement : refusé pour un extrait 9:16 ({r['blocked']['code']})")
    ok(rq("POST", f"/studio/editor/renders/{R2}/replace", headers=O, json={}).status_code == 409, "remplacer la vidéo avec un extrait : 409")

    # --- suppression
    R3 = rq("POST", f"/studio/editor/projects/{sid}/render", headers=O, json={"kind": "preview", "rev": rev}).json()["render"]["id"]
    r = rq("DELETE", f"/studio/editor/shorts/{sid}", headers=O); ok(r.status_code == 409 and r.json()["code"] == "running", "supprimer pendant un rendu : 409")
    rq("POST", f"/studio/editor/renders/{R3}/cancel", headers=O)
    ok(rq("DELETE", f"/studio/editor/shorts/{sid}", headers=O2).status_code == 404, "supprimer l’extrait d’un autre : 404")
    ok(rq("DELETE", f"/studio/editor/shorts/{sid}", headers=O).json().get("deleted"), "extrait supprimé")
    ok(one("select count(*) from editor_renders where project_id=%s", sid) == 0, "ses rendus sont supprimés de la base")
    left = [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=f"editor/renders/{sid}/").get("Contents", [])]
    ok(not left, "ses fichiers de rendu sont effacés du stockage")

    # --- supprimer le montage de la conférence emporte ses extraits ; la limite par conférence.
    r = rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json={"from": 1, "to": 9}).json()["short"]
    n0 = one("select count(*) from editor_projects where talk_id=%s and kind='short'", T)
    cur.execute("insert into editor_projects(talk_id, kind, title, timeline, short) select %s, 'short', 'x' || g, %s, '{}' from generate_series(1, 30) g", (T, json.dumps({"v": 1, "duration": 40, "clips": [{"id": "c1", "in": 0, "out": 5}]})))
    r2_ = rq("POST", f"/studio/editor/projects/{pid}/shorts", headers=O, json={"from": 1, "to": 9})
    ok(r2_.status_code == 409 and r2_.json()["code"] == "too_many", "30 extraits au plus par conférence (409)")
    ok(rq("DELETE", f"/studio/editor/projects/{pid}", headers=O).json().get("deleted") and one("select count(*) from editor_projects where talk_id=%s", T) == 0, f"supprimer le montage emporte ses extraits ({n0 + 30} supprimés)")

    mods = rq("GET", "/admin/modules", headers=A).json(); mods = mods.get("modules", mods)
    ed = next((m for m in mods if m["id"] == "editor"), {}) if isinstance(mods, list) else mods.get("editor", {})
    ok(ed.get("version") == "0.8.0" and "E5b" in ed.get("description", "") and len(ed.get("description", "")) <= 600, f"module editor 0.8.0 ({ed.get('version')})")
finally:
    for t in talks:
        cur.execute("delete from activity_controls where queue='render' and ref in (select id::text from editor_renders where talk_id=%s)", (t,))
        cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    for k in keys:
        try: s3.delete_object(Bucket=BUCKET, Key=k)
        except Exception: pass

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
