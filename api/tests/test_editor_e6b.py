"""Étape E6b — éditeur de montage : positions libres des titres, bandeaux, logo et sous-titres incrustés (placés à la main sur la vidéo).
Vérifie : validation (0 à 100 %), enregistrement et relecture, valeurs par défaut (null = position prédéfinie, anciens montages inchangés),
et l'image finale composée par le vrai FFmpeg (libass) : chaque élément apparaît à l'endroit demandé (différence de pixels avec une
image sans habillage : centre du titre, bord gauche du bandeau, coin du logo, hauteur des sous-titres).

Prérequis (tout en local) : API (3055) avec FFmpeg dans le PATH, PG (5544), S3 de test moto (5599, bucket majlis-videos).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e6b.py"""
import io, os, sys, time, uuid
import boto3, psycopg2, requests
from PIL import Image, ImageChops
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
em = f"e6b-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {tag}"})
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
                   values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',60,'ar','ar') returning id""", (f"E6b {tag}", f"talks/{tag}", oid))
    T = str(cur.fetchone()[0]); talks.append(T); make_hls(s3, T, 60); add_transcript(cur, T, 60)
    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    S = "sess-" + tag
    rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O)
    rev = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S}).json()["rev"]
    def save(tl):
        global rev
        r = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": tl, "rev": rev, "session": S})
        if r.ok: rev = r.json()["rev"]
        return r
    base = {"v": 1, "duration": 60, "clips": [{"id": "c1", "in": 0, "out": 40}]}

    # --- validation et enregistrement
    r = save({**base, "dress": {"items": [{"id": "t1", "kind": "title", "text": "A", "start": 0, "len": 3, "x": 120, "y": 50}]}})
    ok(r.status_code == 400 and "entre 0 et 100" in r.json().get("error", ""), f"position hors de l'image refusée ({r.status_code})")
    r = save({**base, "dress": {"logo": {"on": False, "x": -1, "y": 3}}})
    ok(r.status_code == 400, "logo : position négative refusée")
    d = {"items": [{"id": "t1", "kind": "title", "text": "TITRE", "sub": "", "start": 2, "len": 8, "x": 25, "y": 30},
                   {"id": "t2", "kind": "banner", "text": "Nom", "sub": "Rôle", "start": 2, "len": 8, "x": 60, "y": 82}],
         "subs": {"burn": True, "y": 20}}
    r = save({**base, "dress": d})
    ok(r.status_code == 200, f"positions libres enregistrées ({r.status_code} {r.text[:120]})")
    g = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()["project"]["timeline"]["dress"]
    ok(g["items"][0]["x"] == 25 and g["items"][0]["y"] == 30 and g["items"][1]["x"] == 60 and g["subs"]["y"] == 20 and g["logo"]["x"] is None,
       "relues telles quelles ; logo non placé = null (position prédéfinie)")
    r = save({**base, "dress": {"items": [{"id": "t1", "kind": "title", "text": "A", "start": 0, "len": 3}]}})
    g = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()["project"]["timeline"]["dress"]
    ok(r.ok and g["items"][0]["x"] is None and g["items"][0]["pos"] == "center", "ancien montage sans position : inchangé (position prédéfinie)")

    # --- image finale (vrai FFmpeg) : chaque élément à l'endroit demandé
    def frame(at, dress):
        return rq("POST", f"/studio/editor/projects/{pid}/frame", headers=O, json={"timeline": {**base, "dress": dress}, "at": at})
    plain = png(frame(5, {})); W, H = plain.size
    ok((W, H) == (1280, 720), f"image de {W} × {H}")
    title = lambda x, y: {"items": [{"id": "t1", "kind": "title", "text": "TITRE", "sub": "", "start": 2, "len": 8, "x": x, "y": y}]}
    for (x, y) in ((25, 30), (70, 75)):
        bb, c = diff_box(plain, png(frame(5, title(x, y))))
        ok(c and near(c[0], W * x / 100, W * 0.04) and near(c[1], H * y / 100, H * 0.05),
           f"titre placé à {x} % / {y} % : centre trouvé à {c[0] / W * 100:.1f} % / {c[1] / H * 100:.1f} %" if c else f"titre à {x} / {y} : rien trouvé")
    bb, c = diff_box(plain, png(frame(5, {"items": [{"id": "t2", "kind": "banner", "text": "Nom", "sub": "Rôle", "start": 2, "len": 8, "x": 60, "y": 40}]})))
    ok(bb and near(bb[0], W * 0.60, W * 0.03) and near((bb[1] + bb[3]) / 2, H * 0.40, H * 0.06),
       f"bandeau : bord gauche à {bb[0] / W * 100:.1f} % (attendu 60), milieu à {(bb[1] + bb[3]) / 2 / H * 100:.1f} % (attendu 40)" if bb else "bandeau : rien trouvé")
    # même titre en position prédéfinie « centre » ↔ position libre 50 / 50 : même endroit
    _, c1 = diff_box(plain, png(frame(5, {"items": [{"id": "t1", "kind": "title", "text": "TITRE", "sub": "", "start": 2, "len": 8, "pos": "center"}]})))
    _, c2 = diff_box(plain, png(frame(5, title(50, 50))))
    ok(c1 and c2 and near(c1[0], c2[0], 6) and near(c1[1], c2[1], 6), "position libre 50 % / 50 % = position prédéfinie « centre »")
    # sous-titres incrustés à 20 % de la hauteur (phrase de 0 à 5 s, image à 3 s)
    bb, c = diff_box(png(frame(3, {"subs": {"burn": False}})), png(frame(3, {"subs": {"burn": True, "y": 20}})))
    ok(c and near(c[1], H * 0.20, H * 0.05) and near(c[0], W / 2, W * 0.08), f"sous-titres placés à 20 % de la hauteur : trouvés à {c[1] / H * 100:.1f} %" if c else "sous-titres : rien trouvé")
    # logo : carré rouge importé, coin haut-gauche à 40 % / 55 %, 10 % de la largeur
    def png_bytes(color, w=300, h=300):
        b = io.BytesIO(); Image.new("RGB", (w, h), color).save(b, "PNG"); return b.getvalue()
    data = png_bytes((255, 0, 0))
    u = rq("POST", "/studio/editor/logos/upload-url", headers=O, json={"contentType": "image/png", "size": len(data)}).json(); keys.append(u["key"])
    requests.put(u["url"], data=data, headers={"Content-Type": "image/png"}, timeout=30)
    lg = rq("POST", "/studio/editor/logos", headers=O, json={"key": u["key"], "title": "Rouge", "contentType": "image/png"}).json()["logo"]; assets.append(lg["id"])
    isred = lambda p: p[0] > 200 and p[1] < 60 and p[2] < 60
    reds = lambda im: [(x, y) for y in range(0, H, 2) for x in range(0, W, 2) if isred(im.getpixel((x, y))) and not isred(plain.getpixel((x, y)))]
    im = png(frame(5, {"logo": {"on": True, "asset": lg["id"], "size": 10, "opacity": 100, "x": 40, "y": 55}}))
    red = reds(im)
    x0 = min(p[0] for p in red) if red else -1; y0 = min(p[1] for p in red) if red else -1
    ok(red and near(x0, W * 0.40, 4) and near(y0, H * 0.55, 4), f"logo : coin haut-gauche à {x0 / W * 100:.1f} % / {y0 / H * 100:.1f} % (attendu 40 / 55)")
    # logo poussé hors de l'image (x = 98 %) : FFmpeg le garde entier dans l'image
    im = png(frame(5, {"logo": {"on": True, "asset": lg["id"], "size": 10, "opacity": 100, "x": 98, "y": 98}}))
    red = reds(im)
    ok(red and max(p[0] for p in red) >= W - 4 and max(p[1] for p in red) >= H - 4 and len(red) > 0.6 * (0.1 * W / 2) ** 2,
       "logo poussé au bord : gardé entier dans l'image (collé au coin)")
finally:
    for a in assets: cur.execute("delete from editor_assets where id = %s", (a,))
    for t in talks:
        cur.execute("delete from editor_projects where talk_id = %s", (t,)); cur.execute("delete from talks where id = %s", (t,))
        for o in s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"hls/{t}/").get("Contents", []): s3.delete_object(Bucket="majlis-videos", Key=o["Key"])
    for k in keys:
        try: s3.delete_object(Bucket="majlis-videos", Key=k)
        except Exception: pass
    for u_ in users: cur.execute("delete from users where id = %s", (u_,))
print()
print("TOUT OK" if not fails else f"{len(fails)} ÉCHEC(S) :\n- " + "\n- ".join(fails))
sys.exit(1 if fails else 0)
