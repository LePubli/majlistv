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
ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=2", "-pix_fmt", "yuv420p", os.path.join(d, "m.mp4"))
ff("-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", os.path.join(d, "thumb.jpg"))
ff("-f", "lavfi", "-i", "color=c=red:size=640x360", "-frames:v", "1", os.path.join(d, "thumb2.jpg"))
FILES = {"/v.mp4": ("video/mp4", "v.mp4"), "/a.mp3": ("audio/mpeg", "a.mp3"), "/m.mp4": ("video/mp4", "m.mp4"), "/thumb.jpg": ("image/jpeg", "thumb.jpg"), "/thumb2.jpg": ("image/jpeg", "thumb2.jpg")}
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
    return json.loads(line[-1])
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
def job(url, origin="web", cover="auto", lang="fr", title="", archive_file=None):
    cur.execute("""insert into audyn_imports(item_id, kind, source_url, origin, archive_file, title, audio_lang, cover, requested_by, requested_by_name)
                   values (%s,'audio',%s,%s,%s,%s,%s,%s,%s,'Admin <admin@test.local>') returning id""", (iid, url, origin, archive_file, title, lang, cover, admin)); return str(cur.fetchone()[0])
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

# H) suppression du contenu : chapitres, couverture et demandes effacés
ok(requests.delete(f"{B}/studio/audyn/{iid}", headers=A).status_code == 204, "contenu supprimé")
cur.execute("select count(*) from audyn_imports where item_id=%s", (iid,)); ok(cur.fetchone()[0] == 0 and not keys(f"audyn/{iid}/"), "demandes et fichiers effacés avec le contenu")
cur.execute("delete from users where email=%s", (em,))
print("TOUT EST OK")
