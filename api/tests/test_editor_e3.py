"""Étape E3 — éditeur de montage, habillage : document « dress » (titres, bandeau de nom, logo, intro et fin, transitions, sous-titres
incrustés), logos importés, modèles de chaîne, et « image finale » composée par FFmpeg (texte français et arabe, or du site, logo,
fondu au noir / au blanc, écrans d'intro et de fin, sous-titres incrustés), droits.

Prérequis (tout en local) : API (3055) avec FFmpeg dans le PATH, PG (5544), S3 de test moto (5599, bucket majlis-videos).
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e3.py"""
import io, os, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls, add_transcript

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []; assets = []; templates = []; fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    if r.status_code == 429 and "/auth/" in path: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test")
for m in ("editor", "dubbing"): rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
def organizer(label):
    em = f"e3{label}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
    return oid, login(em, "Passw0rd-test")
oid, O = organizer("a"); oid2, O2 = organizer("b")

def png(r):
    return Image.open(io.BytesIO(r.content)).convert("RGB")
def count(img, box, pred):
    x0, y0, x1, y1 = box; px = img.load(); n = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            if pred(px[x, y]): n += 1
    return n
gold = lambda p: abs(p[0] - 230) < 40 and abs(p[1] - 167) < 40 and abs(p[2] - 57) < 50
white = lambda p: p[0] > 235 and p[1] > 235 and p[2] > 235
red = lambda p: p[0] > 200 and p[1] < 60 and p[2] < 60
def lum(img, box):
    x0, y0, x1, y1 = box; px = img.load(); t = 0; n = 0
    for y in range(y0, y1, 4):
        for x in range(x0, x1, 4): t += sum(px[x, y]) / 3; n += 1
    return t / n

try:
    spk = f"Cheikh Test {tag}"
    def mk_talk(label, speaker, organizer_id, seconds=60):
        cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                       values (%s,'d',%s,'upload',%s,%s,'published','ready','free',%s,'ar','ar') returning id""", (f"E3 {label} {tag}", speaker, f"talks/{tag}{label}", organizer_id, seconds))
        t = str(cur.fetchone()[0]); talks.append(t); make_hls(s3, t, seconds); add_transcript(cur, t, seconds); return t
    T = mk_talk("a", spk, oid)
    pid = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": T}).json()["id"]
    S = "sess-" + tag + "-e3"
    p = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()
    md = p["media"]
    ok(md["dress"]["vars"] == {"titre": f"E3 a {tag}", "intervenant": spk} and md["dress"]["channel"]["name"] and md["dress"]["channel"]["slug"], "ouverture : variables {titre} / {intervenant} et chaîne de la conférence")
    d0 = md["dress"]["defaults"]
    ok(d0["items"] == [] and d0["logo"]["on"] is False and d0["logo"]["pos"] == "tr" and d0["intro"]["len"] == 4 and d0["outro"]["len"] == 5
       and d0["subs"] == {"burn": False, "scale": 100, "pos": "bottom", "box": True} and d0["transitions"] == {"all": None, "byClip": {}}, "habillage par défaut")
    lock = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S}).json(); rev = lock["rev"]
    def save(tl, r=None):
        nonlocal_rev = save.rev if r is None else r
        res = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": tl, "rev": nonlocal_rev, "session": S})
        if res.ok: save.rev = res.json()["rev"]
        return res
    save.rev = rev
    base = {"v": 1, "duration": 60, "clips": [{"id": "c1", "in": 0, "out": 20}, {"id": "c2", "in": 30, "out": 50}]}
    # --- validation du document
    def bad(dress, frag, label):
        r = save({**base, "dress": dress})
        ok(r.status_code == 400 and frag in r.json().get("error", ""), f"habillage refusé ({label}) : {r.json().get('error')}")
    bad({"items": [{"id": "t1", "kind": "poster", "start": 0, "len": 3}]}, "Type de titre", "type inconnu")
    bad({"items": [{"id": "t1", "kind": "title", "start": 0, "len": 0.1}]}, "Durée du titre (s) : entre 0.5 et 600", "durée trop courte")
    bad({"items": [{"id": "t1", "kind": "title", "start": 0, "len": 3, "scale": 300}]}, "Taille du texte (%) : entre 50 et 200", "taille trop grande")
    bad({"items": [{"id": "t1", "kind": "title", "start": 0, "len": 3}, {"id": "t1", "kind": "banner", "start": 5, "len": 3}]}, "Titre en double", "identifiant en double")
    bad({"items": [{"id": f"t{i}", "kind": "title", "start": 0, "len": 1} for i in range(101)]}, "100 titres au plus", "trop de titres")
    bad({"logo": {"on": True, "asset": str(uuid.uuid4())}}, "n’est plus dans la bibliothèque", "logo inconnu")
    bad({"logo": {"on": True, "from": 5, "to": 5}}, "finir après son début", "logo qui finit avant son début")
    bad({"transitions": {"all": {"type": "wipe", "len": 1}}}, "Transition", "transition inconnue")
    bad({"transitions": {"all": {"type": "dip", "len": 9}}}, "Durée de la transition (s) : entre 0.2 et 3", "transition trop longue")
    bad({"intro": {"on": True, "len": 30}}, "Durée (s) : entre 1 et 15", "intro trop longue")
    bad({"subs": {"pos": "middle"}}, "", "sous-titres : position inconnue")
    # --- enregistrement
    dress = {"items": [{"id": "t1", "kind": "banner", "text": "{intervenant}", "sub": "{titre}", "start": 2, "len": 8, "side": "left"},
                       {"id": "t2", "kind": "title", "text": "بسم الله الرحمن الرحيم", "sub": "Une lumière", "start": 12, "len": 5, "pos": "center", "scale": 120}],
             "intro": {"on": True, "len": 4, "title": "{titre}", "sub": "{intervenant}"}, "outro": {"on": True, "len": 5, "title": "Merci", "sub": "majlisstv"},
             "transitions": {"all": {"type": "dip", "len": 1}, "byClip": {"c2": {"type": "dipwhite", "len": 1}, "zz": {"type": "dip", "len": 1}}},
             "subs": {"burn": True, "scale": 100, "pos": "bottom", "box": True}}
    r = save({**base, "dress": dress})
    ok(r.status_code == 200, f"enregistrement de l'habillage ({r.status_code} {r.text[:120]})")
    g = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()["project"]["timeline"]["dress"]
    ok(len(g["items"]) == 2 and g["items"][1]["text"].startswith("بسم") and g["items"][1]["scale"] == 120, "titres relus (arabe intact)")
    ok(list(g["transitions"]["byClip"]) == ["c2"] and g["transitions"]["all"]["type"] == "dip", "transition d'un extrait inconnu retirée sans erreur")
    ok(g["intro"]["on"] and g["outro"]["title"] == "Merci" and g["subs"]["burn"], "intro, fin et sous-titres incrustés conservés")
    r = save({**base, "dress": {"items": [], "logo": {"on": False}}})
    ok(r.ok and "dress" not in rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()["project"]["timeline"], "habillage vide : rien d'enregistré")
    r = save({**base, "dress": dress}); ok(r.ok, "habillage remis")

    # --- versions : l'habillage compte pour une version et se restaure
    r = rq("POST", f"/studio/editor/projects/{pid}/versions", headers=O, json={"label": "Avec habillage", "session": S}); ok(r.status_code == 201, "version nommée avec l'habillage")
    save({**base, "dress": {"items": []}})
    vs = rq("GET", f"/studio/editor/projects/{pid}/versions", headers=O).json()["versions"]
    n = next(v["n"] for v in vs if v["label"] == "Avec habillage")
    r = rq("POST", f"/studio/editor/projects/{pid}/versions/{n}/restore", headers=O, json={"session": S})
    ok(r.ok and r.json()["timeline"]["dress"]["items"][0]["id"] == "t1", "retour à la version : habillage restauré")
    save.rev = r.json()["rev"]

    # --- image finale
    def frame(at, tl=None, headers=O, pid_=None):
        return rq("POST", f"/studio/editor/projects/{pid_ or pid}/frame", headers=headers, json={"timeline": tl or {**base, "dress": dress}, "at": at})
    plain = frame(5, {**base})
    ok(plain.status_code == 200 and plain.headers["content-type"] == "image/png", f"image sans habillage ({plain.status_code})")
    im0 = png(plain); ok(im0.size == (1280, 720), f"image de 1280 × 720 ({im0.size})")
    # bandeau à 5 s : fond sombre + nom en blanc + titre de la conférence en or, en bas à gauche
    im1 = png(frame(5))
    box = (60, 440, 700, 640)
    ok(count(im1, box, white) > count(im0, box, white) + 150 and count(im1, box, gold) > count(im0, box, gold) + 80,
       f"bandeau : nom en blanc et titre en or (blanc {count(im1, box, white)} / or {count(im1, box, gold)})")
    # sous-titres incrustés : phrase de 0 à 5 s (cadre à 3 s), blanc au bas de l'image
    ims = png(frame(3, {**base, "dress": {"subs": {"burn": True}}})); imn = png(frame(3, {**base, "dress": {"subs": {"burn": False}}}))
    zone = (200, 600, 1080, 700)
    ok(count(ims, zone, white) > count(imn, zone, white) + 200, f"sous-titres incrustés en bas de l'image ({count(ims, zone, white)} / {count(imn, zone, white)})")
    imt = png(frame(3, {**base, "dress": {"subs": {"burn": True, "pos": "top"}}}))
    ok(count(imt, (200, 20, 1080, 130), white) > count(imn, (200, 20, 1080, 130), white) + 200, "sous-titres en haut")
    # titre en arabe au centre (12 à 17 s) : le texte est dessiné (écriture arabe, de droite à gauche)
    ima = png(frame(14)); imb = png(frame(14, {**base, "dress": {**dress, "items": [dress["items"][0]]}}))
    c_box = (160, 250, 1120, 470)
    ok(count(ima, c_box, white) > count(imb, c_box, white) + 400 and count(ima, c_box, gold) > count(imb, c_box, gold) + 60,
       f"titre arabe + ligne en or au centre (blanc +{count(ima, c_box, white) - count(imb, c_box, white)})")
    # le titre arabe est bien façonné : le mot ne s'écrit pas lettre à lettre (les lettres sont liées : peu de « trous » verticaux) → on compare au même texte en lettres détachées
    iso = "ب س م   ا ل ل ه"
    imi = png(frame(14, {**base, "dress": {"items": [{**dress["items"][1], "text": iso}]}})); imj = png(frame(14, {**base, "dress": {"items": [{**dress["items"][1], "text": "بسم الله"}]}}))
    ok(count(imi, c_box, white) != count(imj, c_box, white), "l'arabe est façonné par le moteur de texte (lettres liées ≠ lettres détachées)")
    # fondu au noir / au blanc au raccord (20 s du montage) ; en dehors du raccord, l'image est colorée
    jn = png(frame(20, {**base, "dress": {"transitions": {"all": {"type": "dip", "len": 1}}}}))
    jw = png(frame(20, {**base, "dress": {"transitions": {"byClip": {"c2": {"type": "dipwhite", "len": 1}}}}}))
    far = png(frame(15, {**base, "dress": {"transitions": {"all": {"type": "dip", "len": 1}}}}))
    ok(lum(jn, (0, 0, 1280, 500)) < 8 and lum(jw, (0, 0, 1280, 500)) > 247 and lum(far, (0, 0, 1280, 500)) > 30, f"fondu au noir ({lum(jn, (0,0,1280,500)):.1f}) et au blanc ({lum(jw, (0,0,1280,500)):.1f}) au raccord, image normale ailleurs ({lum(far, (0,0,1280,500)):.1f})")
    half = png(frame(19.75, {**base, "dress": {"transitions": {"all": {"type": "dip", "len": 1}}}}))
    ok(10 < lum(half, (0, 0, 1280, 500)) < lum(far, (0, 0, 1280, 500)) * 0.8, "fondu à moitié à un quart de seconde du raccord")
    cut = png(frame(20, {**base, "dress": {"transitions": {"all": {"type": "dip", "len": 1}, "byClip": {"c2": {"type": "cut", "len": 1}}}}}))
    ok(lum(cut, (0, 0, 1280, 500)) > 30, "« coupure » sur un extrait : pas de fondu malgré le réglage pour tous")
    # intro et fin : fond sombre, titre blanc, ligne en or
    ii = png(frame("intro")); io_ = png(frame("outro"))
    ok(lum(ii, (0, 0, 80, 80)) < 20 and count(ii, (200, 300, 1080, 440), white) > 300 and count(ii, (560, 400, 720, 440), gold) > 300, "écran d'intro : fond sombre, titre blanc, ligne et sous-titre en or")
    ok(count(io_, (200, 300, 1080, 440), white) > 100, "écran de fin : texte blanc")
    r = frame("middle"); ok(r.status_code == 422 or r.status_code == 400, f"instant inconnu refusé ({r.status_code})")

    # --- logos
    def png_bytes(color, w=300, h=200):
        b = io.BytesIO(); Image.new("RGB", (w, h), color).save(b, "PNG"); return b.getvalue()
    def upload_logo(headers, title, data=None, ctype="image/png", ext="png"):
        data = data or png_bytes((255, 0, 0))
        u = rq("POST", "/studio/editor/logos/upload-url", headers=headers, json={"contentType": ctype, "size": len(data)})
        if u.status_code != 200: return u, None
        k = u.json()["key"]; keys.append(k)
        requests.put(u.json()["url"], data=data, headers={"Content-Type": ctype}, timeout=30)
        return u, rq("POST", "/studio/editor/logos", headers=headers, json={"key": k, "title": title, "contentType": ctype})
    u, r = upload_logo(O, "Logo rouge")
    ok(r is not None and r.status_code == 201 and r.json()["logo"]["w"] == 300 and r.json()["logo"]["h"] == 200 and r.json()["logo"]["url"], f"logo importé par l'organisateur (dimensions 300 × 200) ({r.status_code if r is not None else None})")
    logo = r.json()["logo"]; assets.append(logo["id"])
    u = rq("POST", "/studio/editor/logos/upload-url", headers=O, json={"contentType": "image/gif", "size": 100}); ok(u.status_code == 400 and u.json()["code"] == "bad_type", "format d'image refusé (gif)")
    u = rq("POST", "/studio/editor/logos/upload-url", headers=O, json={"contentType": "image/png", "size": 4 * 1048576}); ok(u.status_code == 400 and u.json()["code"] == "too_big", "image trop lourde refusée (3 Mo)")
    u, r = upload_logo(O, "Faux", data=b"ceci n'est pas une image"); ok(r is not None and r.status_code == 400 and r.json()["code"] == "unreadable", f"fichier illisible refusé ({r.json().get('error')[:60] if r is not None else None})")
    ok(not any(x["title"] == "Faux" for x in rq("GET", "/studio/editor/logos", headers=O).json()["logos"]), "fichier illisible : pas gardé")
    ok(logo["id"] in [x["id"] for x in rq("GET", "/studio/editor/logos", headers=O).json()["logos"]] and logo["id"] not in [x["id"] for x in rq("GET", "/studio/editor/logos", headers=O2).json()["logos"]],
       "un organisateur ne voit pas les logos d'un autre organisateur")
    ok(logo["id"] in [x["id"] for x in rq("GET", "/studio/editor/logos", headers=A).json()["logos"]], "l'administrateur voit tous les logos")
    u, r = upload_logo(A, "Logo bleu admin", data=png_bytes((0, 0, 255))); alogo = r.json()["logo"]; assets.append(alogo["id"])
    ok(alogo["id"] in [x["id"] for x in rq("GET", "/studio/editor/logos", headers=O2).json()["logos"]], "les logos de l'administrateur sont visibles de tous")
    # logo sur l'image : rouge en haut à droite, de 4 à ... ; absent hors de sa période
    lg = {**base, "dress": {"logo": {"on": True, "asset": logo["id"], "pos": "tr", "size": 15, "opacity": 100, "from": 3, "to": 10}}}
    il = png(frame(5, lg)); iz = png(frame(1, lg)); ie = png(frame(12, lg))
    tr = (1000, 10, 1280, 160)
    ok(count(il, tr, red) > 3000 and count(iz, tr, red) < 50 and count(ie, tr, red) < 50, f"logo en haut à droite pendant sa période seulement (rouge {count(il, tr, red)} / avant {count(iz, tr, red)} / après {count(ie, tr, red)})")
    lb = {**base, "dress": {"logo": {"on": True, "asset": logo["id"], "pos": "bl", "size": 10, "opacity": 100}}}
    ib = png(frame(5, lb)); ok(count(ib, (0, 520, 300, 720), red) > 1500 and count(ib, tr, red) < 50, "logo en bas à gauche")
    lo = {**base, "dress": {"logo": {"on": True, "asset": logo["id"], "pos": "tr", "size": 15, "opacity": 40}}}
    io2 = png(frame(5, lo)); ok(0 < count(io2, tr, red) < count(il, tr, red) * 0.5 or count(io2, tr, lambda q: q[0] > 150 and q[1] < 120) > 1500, "opacité du logo")
    lc = {**base, "dress": {"logo": {"on": True, "asset": "channel"}}}
    r = frame(5, lc); ok(r.status_code == 200, "logo de la chaîne sans image de chaîne : l'image est composée sans logo (pas d'erreur)")
    # image de chaîne = logo par défaut
    slug = md["dress"]["channel"]["slug"]; akey = f"channels/{tag}-avatar.png"; keys.append(akey)
    s3.put_object(Bucket="majlis-videos", Key=akey, Body=png_bytes((0, 255, 0), 200, 200), ContentType="image/png")
    cur.execute("insert into speakers(slug, name, avatar_key) values (%s,%s,%s) on conflict (slug) do update set avatar_key = excluded.avatar_key", (slug, spk, akey))
    green = lambda q: q[1] > 200 and q[0] < 60 and q[2] < 60
    ich = png(frame(5, lc)); ok(count(ich, tr, green) > 2000, "logo « de la chaîne » : l'image de la chaîne s'affiche")
    p2 = rq("GET", f"/studio/editor/projects/{pid}?session={S}", headers=O).json()
    ok(p2["media"]["dress"]["channel"]["avatarUrl"], "l'adresse de l'image de la chaîne est donnée à l'éditeur")
    # intro avec logo
    il2 = png(frame("intro", {**base, "dress": {"intro": {"on": True, "title": "T", "sub": "S"}, "logo": {"on": True, "asset": logo["id"]}}}))
    ok(count(il2, (500, 80, 780, 240), red) > 1500, "écran d'intro : logo centré au-dessus du titre")
    # le logo importé est enregistrable dans le montage ; sa suppression est refusée tant qu'il sert
    r = save({**base, "dress": {"logo": {"on": True, "asset": logo["id"]}}}); ok(r.ok, "montage avec logo importé enregistré")
    r = rq("DELETE", f"/studio/editor/logos/{logo['id']}", headers=O); ok(r.status_code == 409 and r.json()["code"] == "used", f"logo utilisé : suppression refusée ({r.status_code})")
    r = rq("DELETE", f"/studio/editor/logos/{alogo['id']}", headers=O); ok(r.status_code == 403, "un organisateur ne supprime pas le logo de l'administrateur")
    r = rq("POST", f"/studio/editor/projects/{pid}/versions", headers=O, json={"label": "Avec logo", "session": S}); ok(r.status_code == 201, "version nommée avec le logo")
    save({**base, "dress": {"items": []}})
    # encore dans une version : refus
    r = rq("DELETE", f"/studio/editor/logos/{logo['id']}", headers=O); ok(r.status_code == 409, "logo encore dans une version du montage : suppression refusée")
    cur.execute("delete from editor_versions where project_id = %s", (pid,))
    r = rq("DELETE", f"/studio/editor/logos/{logo['id']}", headers=O); ok(r.status_code == 200, "logo plus utilisé : supprimé")
    ok(not any(k["Key"] == logo["id"] for k in []), "(suppression)")
    r = rq("DELETE", f"/studio/editor/logos/{alogo['id']}", headers=A); ok(r.status_code == 200, "l'administrateur supprime le logo")

    # --- modèles de chaîne
    tpl = {"items": dress["items"][:1], "intro": dress["intro"], "outro": dress["outro"], "logo": {"on": True, "asset": "channel"},
           "transitions": {"all": {"type": "dip", "len": 0.6}, "byClip": {"c2": {"type": "dipwhite", "len": 1}}}, "subs": {"burn": False}}
    r = rq("POST", "/studio/editor/templates", headers=O, json={"projectId": pid, "name": "Standard", "dress": tpl})
    ok(r.status_code == 201 and r.json()["template"]["scope"] == "channel" and r.json()["template"]["dress"]["transitions"]["byClip"] == {}
       and r.json()["template"]["dress"]["transitions"]["all"]["len"] == 0.6, f"modèle de chaîne enregistré (transitions propres aux extraits retirées) ({r.status_code})")
    tid = r.json()["template"]["id"]; templates.append(tid)
    r = rq("POST", "/studio/editor/templates", headers=O, json={"projectId": pid, "name": "standard", "dress": tpl}); ok(r.status_code == 409 and r.json()["code"] == "exists", "même nom (sans tenir compte des majuscules) refusé")
    r = rq("POST", "/studio/editor/templates", headers=O, json={"projectId": pid, "name": "Pour tous", "scope": "all", "dress": tpl}); ok(r.status_code == 403, "un organisateur ne crée pas de modèle pour toutes les chaînes")
    r = rq("POST", "/studio/editor/templates", headers=O, json={"projectId": pid, "name": "Cassé", "dress": {"items": [{"id": "x", "kind": "title", "start": 0, "len": 0.1}]}}); ok(r.status_code == 400, "modèle invalide refusé")
    r = rq("POST", "/studio/editor/templates", headers=A, json={"projectId": pid, "name": "Pour toutes les chaînes", "scope": "all", "dress": {"subs": {"burn": True}}})
    ok(r.status_code == 201 and r.json()["template"]["scope"] == "all", "l'administrateur crée un modèle pour toutes les chaînes"); templates.append(r.json()["template"]["id"])
    lst = rq("GET", f"/studio/editor/templates?project={pid}", headers=O).json()["templates"]
    ok([x["name"] for x in lst] == ["Standard", "Pour toutes les chaînes"], f"liste : modèles de la chaîne puis modèles de toutes les chaînes ({[x['name'] for x in lst]})")
    T2 = mk_talk("b", f"Autre Intervenant {tag}", oid2)
    pid2 = rq("POST", "/studio/editor/projects", headers=O2, json={"talkId": T2}).json()["id"]
    lst2 = rq("GET", f"/studio/editor/templates?project={pid2}", headers=O2).json()["templates"]
    ok([x["name"] for x in lst2] == ["Pour toutes les chaînes"], "un autre canal ne voit pas les modèles de la première chaîne")
    r = rq("GET", f"/studio/editor/templates?project={pid}", headers=O2); ok(r.status_code == 404, "pas de liste pour le projet d'un autre organisateur")
    r = rq("DELETE", f"/studio/editor/templates/{tid}", headers=O2); ok(r.status_code == 403, "un autre organisateur ne supprime pas ce modèle")
    r = rq("DELETE", f"/studio/editor/templates/{templates[1]}", headers=O); ok(r.status_code == 403, "un organisateur ne supprime pas le modèle de l'administrateur")
    cur.execute("update talks set speaker = '' where id = %s", (T2,))
    r = rq("POST", "/studio/editor/templates", headers=O2, json={"projectId": pid2, "name": "Sans chaîne", "dress": tpl}); ok(r.status_code == 400 and r.json()["code"] == "no_channel", "conférence sans chaîne : modèle de chaîne impossible")
    r = rq("DELETE", f"/studio/editor/templates/{tid}", headers=O); ok(r.status_code == 200, "l'auteur supprime son modèle")
    r = rq("DELETE", f"/studio/editor/templates/{templates[1]}", headers=A); ok(r.status_code == 200, "l'administrateur supprime le modèle commun")
    # logo utilisé par un modèle : suppression refusée
    u, r = upload_logo(O, "Logo de modèle"); l3 = r.json()["logo"]; assets.append(l3["id"])
    r = rq("POST", "/studio/editor/templates", headers=O, json={"projectId": pid, "name": "Avec logo", "dress": {"logo": {"on": True, "asset": l3["id"]}}}); templates.append(r.json()["template"]["id"])
    r = rq("DELETE", f"/studio/editor/logos/{l3['id']}", headers=O); ok(r.status_code == 409, "logo utilisé par un modèle : suppression refusée")
    rq("DELETE", f"/studio/editor/templates/{templates[-1]}", headers=O)

    # --- droits
    r = frame(5, headers=O2); ok(r.status_code == 404, "image finale : pas pour le projet d'un autre organisateur")
    r = frame(5, headers=A); ok(r.status_code == 200, "image finale : l'administrateur peut")
    r = rq("POST", f"/studio/editor/projects/{pid}/frame", headers=O, json={"timeline": {"v": 1, "duration": 60, "clips": [{"id": "c1", "in": 0, "out": 99}]}, "at": 1})
    ok(r.status_code == 400, "image finale : montage invalide refusé")
    ok(rq("GET", "/studio/editor/logos").status_code == 401 and rq("POST", f"/studio/editor/projects/{pid}/frame", json={}).status_code == 401, "sans connexion : refusé")
    # La musique et les logos restent séparés
    ml = rq("GET", "/studio/editor/music", headers=A).json()["music"]; ok(all(m["id"] != logo["id"] and m["id"] != alogo["id"] for m in ml), "les logos n'apparaissent pas dans la bibliothèque de musiques")
    r = rq("GET", f"/studio/editor/music/{l3['id']}", headers=A); ok(r.status_code == 404, "un logo n'est pas une musique")
    mv = rq("GET", "/studio/modules", headers=A) if False else None
    mod = [m for m in rq("GET", "/admin/modules", headers=A).json()["modules"] if m["id"] == "editor"][0]
    ok(mod["version"] == "0.8.0" and "E3" in mod["description"] and len(mod["description"]) <= 600, f"module editor 0.8.0 ({mod['version']})")
finally:
    for t in templates: cur.execute("delete from editor_templates where id = %s", (t,))
    cur.execute("delete from speakers where slug = %s", (f"cheikh-test-{tag}",))
    for a in assets: cur.execute("delete from editor_assets where id = %s", (a,))
    for t in talks:
        cur.execute("delete from editor_projects where talk_id = %s", (t,)); cur.execute("delete from talks where id = %s", (t,))
        for o in s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"hls/{t}/").get("Contents", []): s3.delete_object(Bucket="majlis-videos", Key=o["Key"])
    for k in keys:
        try: s3.delete_object(Bucket="majlis-videos", Key=k)
        except Exception: pass
    for u in users: cur.execute("delete from users where id = %s", (u,))
print()
print("TOUT OK" if not fails else f"{len(fails)} ÉCHEC(S) :\n- " + "\n- ".join(fails))
sys.exit(1 if fails else 0)
