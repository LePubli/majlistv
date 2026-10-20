"""Étape E6c — rendu : format (16:9, 9:16, 1:1), remplissage (fond flouté / recadrer) et qualité (360, 720, 1080) demandés à l'API.
Vérifie : valeurs refusées, plan enregistré avec le format et la qualité, meilleure qualité de la vidéo d'origine (lue dans master.m3u8),
avertissement quand la qualité demandée dépasse la source, valeurs par défaut (comme avant), résumé du journal d'audit.
Prérequis (tout en local) : API (3055), PG (5544), S3 de test moto (5599). Lancement depuis la racine : python3 api/tests/test_editor_e6c.py"""
import io, os, sys, time, uuid
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
    r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test")
for m in ("editor", "dubbing"): rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
em = f"e6c-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {tag}"})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
O = login(em, "Passw0rd-test")

def png(r): return Image.open(io.BytesIO(r.content)).convert("RGB")
def diff_box(a, b, thr=60):
    """Rectangle (x0, y0, x1, y1) et centre de gravité des pixels qui changent entre deux images."""
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > thr else 0)
    bb = d.getbbox()
    if not bb: return None, None
    px = d.load(); sx = sy = n = 0
    for y in range(bb[1], bb[3], 2):
        for x in range(bb[0], bb[2], 2):
            if px[x, y]: sx += x; sy += y; n += 1
    return bb, (sx / max(1, n), sy / max(1, n))
near = lambda v, target, tol: abs(v - target) <= tol

try:
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',30,'ar','ar') returning id""", (f"E6c {tag}", f"talks/{tag}", oid))
    T = str(cur.fetchone()[0]); talks.append(T); make_hls(s3, T, 30); add_transcript(cur, T, 30)
    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    S = "sess-" + tag
    rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O)
    rev = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S}).json()["rev"]
    r = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": {"v": 1, "duration": 30, "clips": [{"id": "c1", "in": 0, "out": 20}]}, "rev": rev, "session": S}); rev = r.json()["rev"]
    def render(**kw): return rq("POST", f"/studio/editor/projects/{pid}/render", headers=O, json={"rev": rev, **kw})
    def clear(): cur.execute("delete from editor_renders where project_id=%s", (pid,))
    ok(render(kind="final", format="4:3").status_code == 400, "format inconnu refusé")
    ok(render(kind="final", quality=480).status_code == 400, "qualité inconnue refusée (360, 720 ou 1080)")
    ok(render(kind="final", fit="stretch").status_code == 400, "remplissage inconnu refusé")
    lst = rq("GET", f"/studio/editor/projects/{pid}/renders", headers=O).json()
    ok(lst.get("maxQuality") == 360, f"qualité de la vidéo d'origine lue dans master.m3u8 : {lst.get('maxQuality')}p")
    r = render(kind="final", format="9:16", fit="blur", quality=1080)
    ok(r.status_code == 201, f"rendu final 9:16 demandé ({r.status_code} {r.text[:120]})")
    v = r.json()["render"]
    ok(v["format"] == "9:16" and v["fit"] == "blur" and v["quality"] == 1080, f"rendu affiché : {v['format']} · {v['fit']} · {v['quality']}p")
    ok(any("ne dépasse pas 360p" in w for w in v["warnings"]), "qualité au-dessus de la source : avertissement clair")
    cur.execute("select plan->>'format', plan->>'fit', plan->'quality', plan->'ass' from editor_renders where id=%s", (v["id"],)); f = cur.fetchone()
    ok(f[0] == "9:16" and f[1] == "blur" and int(f[2]) == 1080 and "PlayResX: 1080" in f[3], "plan enregistré : format, remplissage, qualité, textes en 1080 × 1920")
    clear()
    r = render(kind="preview", format="1:1", fit="crop", quality=1080)
    v = r.json()["render"]
    ok(r.status_code == 201 and v["format"] == "1:1" and v["fit"] == "crop" and v["quality"] == 360 and not any("dépasse" in w for w in v["warnings"]), "aperçu rapide 1:1 : toujours 360p, sans avertissement")
    clear()
    r = render(kind="final")
    v = r.json()["render"]
    ok(r.status_code == 201 and v["format"] == "16:9" and v["fit"] is None and v["quality"] is None, "sans choix : 16:9, meilleure qualité possible (comme avant)")
    clear()
finally:
    for t in talks:
        cur.execute("delete from editor_renders where talk_id = %s", (t,))
        cur.execute("delete from editor_projects where talk_id = %s", (t,)); cur.execute("delete from talks where id = %s", (t,))
        for o in s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"hls/{t}/").get("Contents", []): s3.delete_object(Bucket="majlis-videos", Key=o["Key"])
    for u_ in users: cur.execute("delete from users where id = %s", (u_,))
print()
print("TOUT OK" if not fails else f"{len(fails)} ÉCHEC(S) :\n- " + "\n- ".join(fails))
sys.exit(1 if fails else 0)
