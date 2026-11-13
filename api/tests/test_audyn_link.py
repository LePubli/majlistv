"""Audyn — import du son depuis un lien : API (droits, validation, file, annulation) et de bout en bout sans réseau externe
(serveur local -> transcripteur : son seul en MP3, chapitre, journal des droits, couverture carrée ; playlists et archive.org découpés).
Prérequis : Postgres :5544, S3 simulé :5599 (bucket majlis-videos), API :3055 avec ce stockage, ffmpeg.
Lancer : python3 api/tests/test_audyn_link.py"""
import json, os, subprocess, sys, tempfile, threading, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import boto3, psycopg2, requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = "http://127.0.0.1:3055"
BUCKET = "majlis-videos"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
keys = lambda p: [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=p).get("Contents", [])]
def login(e, p): return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test"); tag = uuid.uuid4().hex[:6]
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_audyn": "true"}})
probe = requests.get(B + "/studio/audyn", headers=A)
if probe.status_code == 404: print("IGNORÉ  module Audyn absent"); sys.exit(0)
if not probe.json().get("storage"): print("IGNORÉ  stockage non configuré sur cette API"); sys.exit(0)

# --- médias de test servis en local ---
d = tempfile.mkdtemp()
def ff(*a): subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)
ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-shortest", "-pix_fmt", "yuv420p", os.path.join(d, "v.mp4"))
ff("-f", "lavfi", "-i", "sine=frequency=550:duration=3", "-c:a", "libmp3lame", "-b:a", "64k", os.path.join(d, "a.mp3"))
ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=12", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-shortest", "-pix_fmt", "yuv420p", os.path.join(d, "v12.mp4"))
ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=2", "-pix_fmt", "yuv420p", os.path.join(d, "m.mp4"))
ff("-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", os.path.join(d, "thumb.jpg"))
ff("-f", "lavfi", "-i", "color=c=red:size=640x360", "-frames:v", "1", os.path.join(d, "thumb2.jpg"))
FILES = {"/v.mp4": ("video/mp4", "v.mp4"), "/v12.mp4": ("video/mp4", "v12.mp4"), "/a.mp3": ("audio/mpeg", "a.mp3"), "/m.mp4": ("video/mp4", "m.mp4"), "/thumb.jpg": ("image/jpeg", "thumb.jpg"), "/thumb2.jpg": ("image/jpeg", "thumb2.jpg")}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        f = FILES.get(self.path)
        if not f: self.send_response(404); self.end_headers(); return
        data = open(os.path.join(d, f[1]), "rb").read()
        self.send_response(200); self.send_header("Content-Type", f[0]); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start(); BASE = f"http://127.0.0.1:{srv.server_address[1]}"
env = dict(os.environ, DATABASE_URL="postgres://majlis:pw@127.0.0.1:5544/majlis", S3_ENDPOINT="http://127.0.0.1:5599", S3_BUCKET=BUCKET, S3_REGION="us-east-1",
           S3_ACCESS_KEY="test", S3_SECRET_KEY="test", SETTINGS_KEY="test-settings-key-0123456789", WORK_DIR=tempfile.mkdtemp(), YTDLP_AUTO_UPDATE="0")
def once(**extra):
    r = subprocess.run(["python3", "transcriber/tests/run_audyn_once.py"], capture_output=True, text=True, env=dict(env, **extra), cwd=ROOT, timeout=240)
    line = [l for l in r.stdout.strip().splitlines() if l.startswith("{")]
    if not line: print(r.stdout, r.stderr[-2000:]); sys.exit(1)
    d = json.loads(line[-1])
    if d.get("result") is None: d.pop("result", None)  # « blocked » seulement si YouTube bloque
    return d
cur.execute("update audyn_imports set status='canceled' where status in ('pending','downloading')")  # file vide pour nos essais
cur.execute("select id from users where email='admin@test.local'"); admin = str(cur.fetchone()[0])

# ============ API ============
item = requests.post(B + "/studio/audyn", headers=A, json={"title": f"Podcast lien {tag}"}).json(); iid = item["id"]
U = f"{B}/studio/audyn/{iid}/link-imports"
em = f"org-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Org"})
cur.execute("update users set role='organizer' where email=%s", (em,)); O = login(em, "Passw0rd-test")
yt = "https://www.youtube.com/watch?v=abcdefghij" + tag[0]
ok(requests.post(U, headers=O, json={"url": yt, "rights": True}).status_code == 403, "organisateur : refusé (Audyn est réservé à l'administration)")
ok(requests.post(U, headers=A, json={"url": yt}).status_code == 400, "attestation des droits obligatoire")
ok(requests.post(U, headers=A, json={"url": "pas une adresse", "rights": True}).status_code == 400, "adresse invalide refusée")
r = requests.post(U, headers=A, json={"url": "http://127.0.0.1/x.mp4", "rights": True}); ok(r.status_code == 400 and r.json()["code"] == "private_url", "adresse privée refusée (anti-SSRF)")
ok(requests.post(f"{B}/studio/audyn/{uuid.uuid4()}/link-imports", headers=A, json={"url": yt, "rights": True}).status_code == 404, "contenu inconnu : 404")
r = requests.post(U, headers=A, json={"url": yt, "rights": True}); ok(r.status_code == 202 and r.json()["status"] == "pending" and r.json()["audioLang"] == "fr", f"demande acceptée, voix française d'origine ({r.text[:120]})")
j1 = r.json()["id"]
ok(requests.post(U, headers=A, json={"url": yt, "rights": True}).status_code == 409, "même lien déjà en cours : refusé")
r = requests.post(U, headers=A, json={"url": yt + "x", "rights": True, "audioLang": "original", "cover": "none"}); ok(r.status_code == 202 and r.json()["audioLang"] is None, "voix d'origine : aucune langue demandée")
j2 = r.json()["id"]
g = requests.get(U, headers=A).json(); ok(g["active"] and {x["id"] for x in g["imports"]} >= {j1, j2}, "liste des demandes du contenu")
c = requests.post(f"{B}/studio/audyn/link-imports/{j1}/cancel", headers=A).json(); ok(c["canceled"] is True and c["import"]["status"] == "canceled", "annulation d'une demande en attente")
requests.post(f"{B}/studio/audyn/link-imports/{j2}/cancel", headers=A)
ok(requests.post(f"{B}/studio/audyn/link-imports/{j1}/cancel", headers=A).status_code == 404, "déjà annulée : 404")
r = requests.post(f"{B}/studio/audyn/{iid}/cover-from-link", headers=A, json={}); ok(r.status_code == 400 and r.json()["code"] == "no_source", "image de la vidéo : aucun chapitre importé, refus expliqué")
ok(requests.get(f"{B}/studio/audyn/{iid}", headers=A).json()["canCoverFromLink"] is False, "bouton « image de la vidéo » masqué sans chapitre importé")

# ============ De bout en bout ============
def job(url, origin="web", cover="auto", lang="fr", title="", archive_file=None, split=True, replace=None):
    cur.execute("""insert into audyn_imports(item_id, kind, source_url, origin, archive_file, title, audio_lang, cover, requested_by, requested_by_name, split, replace_chapter)
                   values (%s,'audio',%s,%s,%s,%s,%s,%s,%s,'Admin <admin@test.local>',%s,%s) returning id""", (iid, url, origin, archive_file, title, lang, cover, admin, split, replace)); return str(cur.fetchone()[0])
def jst(j): cur.execute("select status, error, note, chapter_id, progress, added, audio_used from audyn_imports where id=%s", (j,)); return cur.fetchone()
def chapters(): cur.execute("select id, position, title, content_type, size, duration_seconds, source_url, audio_key from audyn_chapters where item_id=%s order by position", (iid,)); return cur.fetchall()
def cover_key(): cur.execute("select cover_key from audyn_items where id=%s", (iid,)); return cur.fetchone()[0]
def dims(key):
    p = os.path.join(d, "dl.jpg"); s3.download_file(BUCKET, key, p)
    return subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height,codec_name", "-of", "csv=p=0", p], capture_output=True, text=True).stdout.strip()

# A) vidéo (lien direct) : son seul en MP3, chapitre 1, couverture posée (le contenu n'en avait pas)
jA = job(BASE + "/v.mp4")
ok(once(TEST_THUMB=BASE + "/thumb.jpg") == {"claimed": True, "id": jA}, "transcripteur : demande prise")
s = jst(jA); ch = chapters()
ok(s[0] == "done" and s[4] == 100 and s[3] and len(ch) == 1, f"demande finie, un chapitre ({s})")
c1 = ch[0]; ok(c1[1] == 1 and c1[3] == "audio/mpeg" and c1[5] in (5, 6) and c1[6] == BASE + "/v.mp4" and c1[7].startswith(f"audyn/{iid}/") and c1[7].endswith(".mp3"), f"chapitre MP3, durée, lien d'origine ({c1[1:]})")
p = os.path.join(d, "c1.mp3"); s3.download_file(BUCKET, c1[7], p)
st = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", p], capture_output=True, text=True).stdout.split()
ok(st == ["mp3,audio"] and os.path.getsize(p) == c1[4], f"le fichier ne contient que le son, en MP3 ({st})")
cur.execute("select filename, source_url, user_label, chapter_id from audyn_rights_log where chapter_id=%s", (c1[0],)); lg = cur.fetchone()
ok(lg and lg[1] == BASE + "/v.mp4" and "admin@test.local" in lg[2], "attestation notée dans le journal des droits, avec le lien")
k1 = cover_key(); ok(k1 and k1.startswith(f"audyn/{iid}/cover-") and k1.endswith(".jpg") and dims(k1) == "mjpeg,1000,1000", f"couverture carrée posée ({k1})")
rights = requests.get(B + "/studio/audyn-rights", headers=A).json(); ok(any(r["sourceUrl"] == BASE + "/v.mp4" for r in rights), "journal des droits (API) : lien d'origine visible")

# B) fichier MP3 direct : chapitre 2 ; « auto » ne touche pas une couverture existante
jB = job(BASE + "/a.mp3", title="Mon épisode")
once(TEST_THUMB=BASE + "/thumb2.jpg"); ch = chapters()
ok(jst(jB)[0] == "done" and len(ch) == 2 and ch[1][1] == 2 and ch[1][2] == "Mon épisode" and ch[1][5] == 3, f"chapitre 2, titre gardé, 3 s ({ch[1][1:6]})")
ok(cover_key() == k1, "couverture existante : inchangée (mode « auto »)")

# C) API : chapitres avec leur lien ; « Utiliser l'image de la vidéo » remplace la couverture
it = requests.get(f"{B}/studio/audyn/{iid}", headers=A).json()
ok(it["canCoverFromLink"] is True and it["chapters"][0]["sourceUrl"] == BASE + "/v.mp4", "fiche : lien d'origine des chapitres, bouton disponible")
cur.execute("update audyn_chapters set source_url = %s where id = %s", ("https://www.youtube.com/watch?v=zzzzzzzzzzz", c1[0]))  # adresse publique pour l'API
r = requests.post(f"{B}/studio/audyn/{iid}/cover-from-link", headers=A, json={}); ok(r.status_code == 202 and r.json()["kind"] == "cover", f"image demandée ({r.text[:100]})")
jC = r.json()["id"]
ok(once(TEST_THUMB=BASE + "/thumb2.jpg") == {"claimed": True, "id": jC} and jst(jC)[0] == "done", "transcripteur : couverture traitée")
k2 = cover_key(); ok(k2 != k1 and dims(k2) == "mjpeg,1000,1000" and not keys(k1), "couverture remplacée, l'ancienne effacée du stockage")

# D) playlist YouTube : une demande par vidéo, dans l'ordre ; la couverture seulement pour la première
listing = {"title": "Ma playlist", "entries": [{"source": "youtube", "id": f"vid{n}xxxxxxx"[:11], "title": f"Épisode {n}"} for n in (1, 2, 3)]}
jD = job("https://www.youtube.com/playlist?list=PL" + tag, origin="youtube", cover="auto")
once(TEST_LIST_JSON=json.dumps(listing))
s = jst(jD); ok(s[0] == "done" and s[5] == 3, f"playlist : demande close, 3 demandes ajoutées ({s})")
cur.execute("select seq, source_url, title, cover, audio_lang, status, origin from audyn_imports where parent_id=%s order by seq", (jD,)); kids = cur.fetchall()
ok([k[0] for k in kids] == [1, 2, 3] and kids[0][1] == "https://www.youtube.com/watch?v=vid1xxxxxxx" and kids[2][2] == "Épisode 3", "une demande par vidéo, dans l'ordre, avec son titre")
ok([k[3] for k in kids] == ["auto", "none", "none"] and all(k[4] == "fr" and k[5] == "pending" and k[6] == "youtube" for k in kids), "couverture pour la première seulement ; voix française transmise")
g = requests.get(U, headers=A).json(); ok(any(x["id"] == jD and x["added"] == 3 for x in g["imports"]) and g["active"], "API : playlist visible avec le nombre de vidéos")
for k in kids: cur.execute("update audyn_imports set status='canceled' where parent_id=%s", (jD,))

# E) archive.org à plusieurs fichiers audio : une demande par piste
meta = {"metadata": {"title": "Livre test"}, "files": [{"name": "livre_02.mp3", "source": "original", "format": "64Kbps MP3"}, {"name": "livre_01.mp3", "source": "original", "format": "64Kbps MP3"},
        {"name": "livre_01.ogg", "source": "derivative", "format": "Ogg Vorbis"}, {"name": "cover.jpg", "source": "original"}]}
jE = job("https://archive.org/details/livre-test", origin="archive")
once(TEST_ARCHIVE_JSON=json.dumps(meta))
cur.execute("select archive_file, source_url from audyn_imports where parent_id=%s order by seq", (jE,)); af = cur.fetchall()
ok(jst(jE)[0] == "done" and [a[0] for a in af] == ["livre_01.mp3", "livre_02.mp3"], f"archive.org : une demande par piste, dans l'ordre ({af})")
cur.execute("update audyn_imports set status='canceled' where parent_id=%s", (jE,))

# F) vidéo muette : échec lisible, aucun chapitre, aucun fichier laissé
before = set(keys(f"audyn/{iid}/"))
jF = job(BASE + "/m.mp4"); once()
s = jst(jF); ok(s[0] == "failed" and "pas de son" in (s[1] or "") and len(chapters()) == 2 and set(keys(f"audyn/{iid}/")) == before, f"vidéo muette : échec lisible, rien d'ajouté ({s[1]})")
# G) fichier introuvable : échec après les essais, sans fichier
jG = job(BASE + "/absent.mp4")
for _ in range(3):
    cur.execute("update audyn_imports set updated_at = now() - interval '5 minutes' where id=%s", (jG,)); once()
ok(jst(jG)[0] == "failed" and set(keys(f"audyn/{iid}/")) == before, "fichier introuvable : échec, rien d'ajouté")

# I) chapitres de la vidéo : un fichier par chapitre, à la suite, avec le titre de l'auteur
marks = json.dumps([{"start_time": 0, "end_time": 4, "title": "Intro"}, {"start_time": 4, "end_time": 8, "title": "Partie A"}, {"start_time": 8, "end_time": None, "title": "Fin"}])
jI = job(BASE + "/v12.mp4", cover="none"); once(TEST_CHAPTERS_JSON=marks)
ch = chapters(); s = jst(jI)
ok(s[0] == "done" and len(ch) == 5 and [c[2] for c in ch[2:]] == ["Intro", "Partie A", "Fin"] and [c[1] for c in ch[2:]] == [3, 4, 5], f"3 chapitres YouTube -> 3 chapitres Audyn, à la suite ({[c[1:3] for c in ch]})")
ok([c[5] for c in ch[2:]] == [4, 4, 4] and all(c[3] == "audio/mpeg" and c[6] == BASE + "/v12.mp4" for c in ch[2:]), f"durées 4 s chacune, MP3, lien d'origine ({[c[5] for c in ch[2:]]})")
cur.execute("select parts from audyn_imports where id=%s", (jI,)); ok(cur.fetchone()[0] == 3, "demande : 3 chapitres créés")
cur.execute("select count(*) from audyn_rights_log where chapter_id = any(%s::uuid[])", ([str(c[0]) for c in ch[2:]],)); ok(cur.fetchone()[0] == 3, "une attestation par chapitre")
ok(len(set(c[7] for c in ch)) == 5 and all(c[7] in keys(c[7]) for c in ch), "un fichier distinct par chapitre dans le stockage")
g = requests.get(U, headers=A).json(); ok(any(x["id"] == jI and x["parts"] == 3 for x in g["imports"]), "API : nombre de chapitres créés visible")

# J) case « découper » décochée : un seul fichier même si la vidéo a des chapitres
jJ = job(BASE + "/v12.mp4", cover="none", split=False); once(TEST_CHAPTERS_JSON=marks)
ch = chapters(); ok(jst(jJ)[0] == "done" and len(ch) == 6 and ch[5][5] in (11, 12), "découpage refusé : un seul chapitre de 12 s")
# J bis) vidéo sans chapitres (plateforme) : un seul fichier, et la demande le dit
jJ2 = job(BASE + "/v.mp4", cover="none"); once(TEST_CHAPTERS_JSON="[]")
ch = chapters(); s = jst(jJ2); ok(s[0] == "done" and len(ch) == 7 and "Pas de chapitres" in (s[2] or ""), f"pas de chapitres : un seul fichier, remarque ({s[2]})")
cur.execute("delete from audyn_chapters where id=%s", (ch[6][0],)); s3.delete_object(Bucket=BUCKET, Key=ch[6][7])

# K) « Redécouper » le chapitre 1 (un long fichier) : remplacé à sa place, les suivants décalés, l'ancien fichier effacé
ch = chapters(); c1 = ch[0]; cur.execute("update audyn_chapters set source_url=%s where id=%s", (BASE + "/v.mp4", c1[0]))
order_before = [c[0] for c in ch[1:]]
two = json.dumps([{"start_time": 0, "end_time": 3, "title": "Un"}, {"start_time": 3, "end_time": 6, "title": "Deux"}])
jK = job(BASE + "/v.mp4", cover="none", replace=str(c1[0]), title=c1[2]); once(TEST_CHAPTERS_JSON=two)
ch = chapters(); s = jst(jK)
ok(s[0] == "done" and [c[2] for c in ch[:2]] == ["Un", "Deux"] and [c[1] for c in ch] == list(range(1, len(ch) + 1)), f"chapitre remplacé à sa place par 2 morceaux ({[c[1:3] for c in ch]})")
ok([c[0] for c in ch[2:]] == order_before and len(ch) == 7, "les autres chapitres gardent leur ordre, décalés d'un rang")
ok(not keys(c1[7]) and str(c1[0]) not in [str(c[0]) for c in ch], "ancien long fichier effacé du stockage")
# L) « Redécouper » une vidéo sans chapitres : refus avant téléchargement, rien ne change
before_ch, before_keys = chapters(), set(keys(f"audyn/{iid}/"))
jL = job(BASE + "/v.mp4", cover="none", replace=str(ch[2][0]), title=ch[2][2]); once(TEST_CHAPTERS_JSON="[]")
s = jst(jL); ok(s[0] == "failed" and "pas de chapitres" in (s[1] or "") and chapters() == before_ch and set(keys(f"audyn/{iid}/")) == before_keys, f"pas de chapitres : rien n'a changé ({s[1]})")
# M) chapitre supprimé entre-temps : échec expliqué, aucun fichier laissé, rien ajouté à la fin
jM = job(BASE + "/v.mp4", cover="none", replace=str(uuid.uuid4()), title="Disparu"); once(TEST_CHAPTERS_JSON=two)
s = jst(jM); ok(s[0] == "failed" and "supprimé entre-temps" in (s[1] or "") and chapters() == before_ch and set(keys(f"audyn/{iid}/")) == before_keys, f"chapitre disparu : rien ajouté ({s[1]})")
# N) API « Redécouper »
R = lambda cid, body: requests.post(f"{B}/studio/audyn/{iid}/chapters/{cid}/resplit", headers=A, json=body)
cur.execute("insert into audyn_chapters(item_id, position, title, audio_key, content_type, size) values (%s, 99, 'Envoyé', 'audyn/x/y.mp3', 'audio/mpeg', 1) returning id", (iid,)); manual = str(cur.fetchone()[0])
ok(R(manual, {"rights": True}).status_code == 400, "chapitre envoyé par fichier : rien à redécouper")
ok(R(uuid.uuid4(), {"rights": True}).status_code == 404, "chapitre inconnu : 404")
cur.execute("update audyn_chapters set source_url = %s where id = %s", ("https://www.youtube.com/watch?v=yyyyyyyyyyy", manual))
ok(R(manual, {}).status_code == 400, "attestation des droits obligatoire")
r = R(manual, {"rights": True}); ok(r.status_code == 202 and r.json()["replaceChapter"] == manual and r.json()["split"] and r.json()["title"] == "Envoyé", f"redécoupage demandé ({r.text[:120]})")
ok(R(manual, {"rights": True}).status_code == 409, "déjà demandé : refusé")
requests.post(f"{B}/studio/audyn/link-imports/{r.json()['id']}/cancel", headers=A)
cur.execute("delete from audyn_chapters where id=%s", (manual,))

# O) chaîne / playlist entière : un contenu par vidéo
L = f"{B}/studio/audyn/listings"
ok(requests.post(L, headers=O, json={"url": "https://www.youtube.com/@chaine"}).status_code == 403, "liste : réservée à l'administration")
ok(requests.post(L, headers=A, json={"url": "https://exemple.fr/chaine"}).status_code == 400, "liste : site non pris en charge refusé")
r = requests.post(L, headers=A, json={"url": f"https://www.youtube.com/@podcast{tag}"}); ok(r.status_code == 202 and r.json()["status"] == "listing", f"liste demandée ({r.text[:80]})")
lid = r.json()["id"]
cur.execute("select purpose from import_jobs where id=%s", (lid,)); ok(cur.fetchone()[0] == "audyn", "liste marquée « audyn »")
ok(all(x["id"] != lid for x in requests.get(B + "/imports", headers=A).json()) and requests.get(f"{B}/imports/{lid}", headers=A).status_code == 404, "la liste Audyn n'apparaît pas dans l'import de vidéos")
ok(requests.post(f"{B}/imports/{lid}/confirm", headers=A, json={"ids": ["x"]}).status_code == 404, "et ne peut pas y être importée en vidéos")
ok(requests.get(f"{L}/{lid}", headers=A).json()["status"] == "listing", "lecture en cours visible")
C = lambda body: requests.post(f"{L}/{lid}/confirm", headers=A, json=body)
r = C({"ids": ["aaaaaaaaaaa"], "rights": True}); ok(r.status_code == 409 and r.json()["code"] == "not_ready", "pas encore lue : refus")
already = "https://www.youtube.com/watch?v=dejadansaud"
cur.execute("insert into audyn_chapters(item_id, position, title, audio_key, content_type, size, source_url) values (%s, 50, 'x', 'audyn/x/z.mp3', 'audio/mpeg', 1, %s) returning id", (iid, already)); dup_ch = cur.fetchone()[0]
entries = [{"id": f"ep{n}xxxxxxxx"[:11], "source": "youtube", "title": f"Épisode {n}", "duration": 3600 * n, "thumb": None} for n in (1, 2, 3)] + [{"id": "dejadansaud", "source": "youtube", "title": "Déjà là"}]
cur.execute("update import_jobs set status='listed', title='Podcast test', entries=%s where id=%s", (json.dumps(entries), lid))
g = requests.get(f"{L}/{lid}", headers=A).json()
ok(g["status"] == "listed" and len(g["entries"]) == 4 and g["entries"][3]["inAudyn"] is True and g["entries"][0]["url"] == "https://www.youtube.com/watch?v=ep1xxxxxxxx", "liste lue : vidéos, adresse, « déjà dans Audyn »")
# Détail des vidéos avant l'import (lu par le transcripteur à la demande)
D = lambda body, h=A: requests.post(f"{L}/{lid}/details", headers=h, json=body)
ok(D({"ids": ["ep1xxxxxxxx"]}, O).status_code == 403, "détails : réservés à l'administration")
r = D({"ids": ["ep1xxxxxxxx", "ep2xxxxxxxx", "inconnue"]}); ok(r.status_code == 202 and r.json()["wanted"] == 2, f"détails demandés pour 2 vidéos de la liste ({r.text})")
ok(D({"ids": ["ep1xxxxxxxx"]}).json()["wanted"] == 0, "déjà demandé : pas redemandé")
g = requests.get(f"{L}/{lid}", headers=A).json()
ok(g["entries"][0]["detail"] == {"status": "wanted"} and g["entries"][2]["detail"] is None, "détail « en cours » visible dans la liste")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "transcriber", "src"))
import listing_details  # noqa: E402
import psycopg2.extras  # noqa: E402
def lq(sql, params=None, fetch=False):
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c2:
        c2.execute(sql, params)
        return c2.fetchall() if fetch else c2.rowcount
def fake_info(url, opts):
    if "ep2" in url: raise RuntimeError("Video unavailable")
    return {"title": "Épisode 1", "description": "Résumé de l'épisode", "uploader": "Podcast", "upload_date": "20240131", "duration": 3600,
            "chapters": [{"title": "Intro", "start_time": 0}, {"title": "Suite", "start_time": 600}],
            "formats": [{"language": "en", "acodec": "mp4a"}, {"language": "fr-FR", "acodec": "opus"}], "thumbnails": [{"url": "https://i.ytimg.com/vi/x/hq.jpg", "width": 480, "height": 360}]}
done_n = 0
for _ in range(5): done_n += listing_details.run_once(lq, {}, lambda *a: None, fetch=fake_info)
ok(done_n == 2, f"le transcripteur lit les 2 détails demandés ({done_n})")
g = requests.get(f"{L}/{lid}", headers=A).json()
d1 = g["entries"][0]["detail"]
ok(d1["status"] == "done" and d1["description"] == "Résumé de l'épisode" and d1["uploader"] == "Podcast" and d1["date"] == "2024-01-31", f"détail : description, chaîne, date ({d1})")
ok([c["title"] for c in d1["chapters"]] == ["Intro", "Suite"] and d1["chapters"][1]["start"] == 600 and d1["audioLangs"] == ["en", "fr"], "détail : chapitres et langues audio (voix française repérée)")
ok(g["entries"][1]["detail"]["status"] == "failed", "vidéo illisible : échec affiché")
ok(D({"ids": ["ep2xxxxxxxx"]}).json()["wanted"] == 0 and D({"ids": ["ep2xxxxxxxx"], "again": True}).json()["wanted"] == 1, "échec : redemandé seulement avec « Réessayer »")
ok(D({"ids": ["ep1xxxxxxxx"], "again": True}).json()["wanted"] == 0, "détail lu : jamais relu")
cur.execute("update import_jobs set details = details - 'ep2xxxxxxxx' where id=%s", (lid,))
ok(C({"ids": ["ep1xxxxxxxx"]}).status_code == 400, "attestation des droits obligatoire")
ok(C({"ids": [], "rights": True}).status_code == 400, "aucune vidéo cochée : refus")
r = C({"ids": ["ep3xxxxxxxx", "ep1xxxxxxxx", "dejadansaud"], "rights": True, "category": "Ma série", "access": "free", "audience": "both", "language": "ar", "audioLang": "original", "split": False, "publish": True})
ok(r.status_code == 202 and r.json() == {"created": 2, "skipped": 1}, f"2 contenus créés, 1 déjà présent ignoré ({r.text})")
cur.execute("""select i.id, i.title, i.category, i.access, i.audience, i.language, i.status, j.source_url, j.audio_lang, j.split, j.fill_meta, j.publish, j.cover, j.seq
               from audyn_items i join audyn_imports j on j.item_id = i.id where i.title like 'Épisode %%' and i.created_at > now() - interval '5 minutes' order by j.seq""")
made = cur.fetchall()
ok([m[1] for m in made] == ["Épisode 1", "Épisode 3"], f"un contenu par vidéo, dans l'ordre de la chaîne ({[m[1] for m in made]})")
ok(all(m[2:7] == ("Ma série", "free", "both", "ar", "draft") for m in made), "réglages appliqués ; brouillon tant que le son n'est pas prêt")
ok(all(m[8] is None and m[9] is False and m[10] and m[11] and m[12] == "auto" for m in made) and made[0][7] == "https://www.youtube.com/watch?v=ep1xxxxxxxx", "demandes : voix d'origine, sans découpage, informations et publication à la fin")
cur.execute("select status, imported from import_jobs where id=%s", (lid,)); ok(cur.fetchone() == ("imported", 2), "liste marquée importée")
ok(C({"ids": ["ep1xxxxxxxx"], "rights": True}).json() == {"created": 0, "skipped": 1}, "deuxième fois : déjà dans Audyn, rien de créé")
cur.execute("delete from audyn_chapters where id=%s", (dup_ch,))
# Traitement d'un épisode (son local) : auteur et description de la vidéo, publié à la fin
ep = str(made[0][0])
cur.execute("update audyn_imports set status='canceled' where status='pending' and item_id <> %s", (ep,))
cur.execute("update audyn_imports set source_url=%s, origin='web' where item_id=%s", (BASE + "/v12.mp4", ep))
res = once(TEST_META_JSON=json.dumps({"title": "Épisode 1 (titre vidéo)", "uploader": "La chaîne du podcast", "description": "Dans cet épisode, nous parlons de…"}), TEST_THUMB=BASE + "/thumb.jpg")
ok(res.get("claimed"), "épisode traité")
cur.execute("select title, author, description, status, cover_key is not null, (select count(*) from audyn_chapters c where c.item_id = i.id) from audyn_items i where id=%s", (ep,)); it = cur.fetchone()
ok(it[0] == "Épisode 1" and it[1] == "La chaîne du podcast" and it[2].startswith("Dans cet épisode") and it[3] == "published" and it[4] and it[5] == 1, f"auteur, description, couverture repris de la vidéo ; publié ({it})")
for m in made: requests.delete(f"{B}/studio/audyn/{m[0]}", headers=A)
# Catégorie propre à une vidéo (sinon celle de la liste)
r = C({"ids": ["ep2xxxxxxxx"], "rights": True, "category": "Ma série", "categories": {"ep2xxxxxxxx": f"  Épisodes spéciaux {tag} "}})
ok(r.status_code == 202 and r.json()["created"] == 1, f"vidéo importée avec sa propre catégorie ({r.text[:120]})")
cur.execute("select id, category from audyn_items where title = 'Épisode 2' and created_at > now() - interval '5 minutes'")
e2 = cur.fetchone(); ok(e2[1] == f"Épisodes spéciaux {tag}", f"sa catégorie, pas celle de la liste ({e2[1]})")
ok(any(c["name"] == f"Épisodes spéciaux {tag}" for c in requests.get(B + "/studio/audyn/categories", headers=A).json()["categories"]), "nouvelle catégorie ajoutée à la liste")
ok(C({"ids": ["ep2xxxxxxxx"], "rights": True, "categories": {"../x": "a"}}).status_code == 400, "identifiant de vidéo invalide : refus")
cur.execute("delete from audyn_imports where item_id=%s", (e2[0],)); requests.delete(f"{B}/studio/audyn/{e2[0]}", headers=A)
cid_e2 = [c["id"] for c in requests.get(B + "/studio/audyn/categories", headers=A).json()["categories"] if c["name"] == f"Épisodes spéciaux {tag}"]
for c in cid_e2: requests.delete(f"{B}/studio/audyn/categories/{c}", headers=A)

# G2) son ajouté depuis UN lien (création depuis un lien) : auteur et description repris s'ils sont vides, jamais écrasés
one = requests.post(B + "/studio/audyn", headers=A, json={"title": f"Un lien {tag}"}).json()["id"]
cur.execute("update audyn_imports set status='canceled' where status='pending'")
def job_on(item):  # même demande que POST /link-imports (l'API refuse les adresses locales du serveur de test)
    cur.execute("""insert into audyn_imports(item_id, kind, source_url, origin, audio_lang, cover, requested_by, requested_by_name, split)
                   values (%s,'audio',%s,'web','fr','none',%s,'Admin <admin@test.local>',false)""", (item, BASE + "/v12.mp4", admin))
job_on(one)
ok(once(TEST_META_JSON=json.dumps({"uploader": "Chaîne X", "description": "Description de la vidéo"})).get("claimed"), "son traité")
cur.execute("select author, description from audyn_items where id=%s", (one,)); ok(cur.fetchone() == ("Chaîne X", "Description de la vidéo"), "auteur et description de la vidéo repris")
requests.patch(f"{B}/studio/audyn/{one}", headers=A, json={"description": "Ma description"})
job_on(one)
once(TEST_META_JSON=json.dumps({"uploader": "Autre", "description": "Autre texte"}))
cur.execute("select author, description from audyn_items where id=%s", (one,)); ok(cur.fetchone() == ("Chaîne X", "Ma description"), "ce qui est déjà rempli n'est pas écrasé")

# G2b) YouTube bloque le serveur : la demande attend (essai non compté), la file se met en pause ; relance des échecs
cur.execute("update audyn_imports set status='canceled' where status='pending'")
job_on(one)
r = once(TEST_BOT="1"); ok(r.get("result") == "blocked", f"blocage anti-robot (message en français) reconnu ({r})")
cur.execute("select status, attempts, error from audyn_imports where item_id=%s order by created_at desc limit 1", (one,)); st = cur.fetchone()
ok(st[0] == "pending" and st[1] == 0 and st[2].startswith("YouTube bloque"), f"demande remise en attente, essai non compté ({st})")
f = requests.get(B + "/studio/audyn/link-imports/failed", headers=A).json(); ok(f["waiting"] >= 1, f"Studio : imports en attente du déblocage ({f})")
ok(requests.get(B + "/studio/audyn/link-imports/failed", headers=O).status_code == 403, "réservé à l'administration")
cur.execute("update audyn_imports set status='failed', attempts=3, error='ERROR: Connectez-vous pour confirmer que vous n''êtes pas un robot' where item_id=%s", (one,))
f = requests.get(B + "/studio/audyn/link-imports/failed", headers=A).json(); ok(f["count"] >= 1 and f["blocked"] >= 1, f"échecs comptés, dont blocage ({f})")
cur.execute("select id from audyn_imports where item_id=%s order by created_at desc limit 1", (one,)); fj = str(cur.fetchone()[0])
r = requests.post(f"{B}/studio/audyn/link-imports/{fj}/retry", headers=A); ok(r.status_code == 200 and r.json()["import"]["status"] == "pending", "un import relancé")
ok(requests.post(f"{B}/studio/audyn/link-imports/{fj}/retry", headers=A).status_code == 404, "déjà relancé : 404")
cur.execute("update audyn_imports set status='failed', attempts=3 where id=%s", (fj,))
r = requests.post(B + "/studio/audyn/link-imports/retry-failed", headers=A); ok(r.status_code == 200 and r.json()["retried"] >= 1, "tous les échecs relancés")
cur.execute("select status, attempts, error from audyn_imports where id=%s", (fj,)); ok(cur.fetchone() == ("pending", 0, None), "relance : essais remis à zéro, erreur effacée")
cur.execute("update audyn_imports set status='canceled' where status='pending'")

# G3) catégories gérées
CU = B + "/studio/audyn/categories"
ok(requests.get(CU, headers=O).status_code == 403, "catégories : réservées à l'administration")
cats = requests.get(CU, headers=A).json()["categories"]
ok(any(c["name"] == "Ma série" for c in cats), "la catégorie choisie à l'import de la chaîne a rejoint la liste")
r = requests.post(CU, headers=A, json={"name": f"  Contes {tag} "}); ok(r.status_code == 201 and r.json()["name"] == f"Contes {tag}", "catégorie créée (espaces retirés)")
cid = r.json()["id"]
ok(requests.post(CU, headers=A, json={"name": f"CONTES {tag}"}).status_code == 409, "doublon (majuscules comprises) refusé")
ok(requests.post(CU, headers=A, json={"name": "  "}).status_code == 400, "nom vide refusé")
requests.patch(f"{B}/studio/audyn/{one}", headers=A, json={"category": f"contes {tag}"})
cur.execute("select category from audyn_items where id=%s", (one,)); ok(cur.fetchone()[0] == f"Contes {tag}", "contenu : écriture de la liste reprise (« contes » → « Contes »)")
two = requests.post(B + "/studio/audyn", headers=A, json={"title": f"Deux {tag}", "category": f"Nouvelle {tag}"}).json()["id"]
ok(any(c["name"] == f"Nouvelle {tag}" for c in requests.get(CU, headers=A).json()["categories"]), "catégorie tapée à la création : ajoutée à la liste")
c = [c for c in requests.get(CU, headers=A).json()["categories"] if c["id"] == cid][0]; ok(c["count"] == 1, "nombre de contenus par catégorie")
nid = [c for c in requests.get(CU, headers=A).json()["categories"] if c["name"] == f"Nouvelle {tag}"][0]["id"]
ok(requests.patch(f"{CU}/{cid}", headers=A, json={"name": f"nouvelle {tag}"}).status_code == 409, "renommer vers une catégorie existante : refusé")
r = requests.patch(f"{CU}/{cid}", headers=A, json={"name": f"Histoires {tag}"}); ok(r.status_code == 200 and r.json()["count"] == 1, "catégorie renommée")
cur.execute("select category from audyn_items where id=%s", (one,)); ok(cur.fetchone()[0] == f"Histoires {tag}", "ses contenus suivent le nouveau nom")
r = requests.delete(f"{CU}/{nid}", headers=A); ok(r.status_code == 200 and r.json()["uncategorized"] == 1, "catégorie supprimée")
cur.execute("select category from audyn_items where id=%s", (two,)); ok(cur.fetchone()[0] == "", "ses contenus restent, sans catégorie")
ok(requests.delete(f"{CU}/{nid}", headers=A).status_code == 404 and requests.patch(f"{CU}/999999", headers=A, json={"name": "x"}).status_code == 404, "catégorie inconnue : 404")
import time; time.sleep(0.5)
cur.execute("select summary from audit_log where summary like %s", (f"%Histoires {tag}%",)); ok(cur.fetchone() is not None, "renommage noté au journal d'audit")
requests.delete(f"{CU}/{cid}", headers=A)
for x in (one, two): requests.delete(f"{B}/studio/audyn/{x}", headers=A)

# H) suppression du contenu : chapitres, couverture et demandes effacés
ok(requests.delete(f"{B}/studio/audyn/{iid}", headers=A).status_code == 204, "contenu supprimé")
cur.execute("select count(*) from audyn_imports where item_id=%s", (iid,)); ok(cur.fetchone()[0] == 0 and not keys(f"audyn/{iid}/"), "demandes et fichiers effacés avec le contenu")
cur.execute("delete from users where email=%s", (em,))
print("TOUT EST OK")
