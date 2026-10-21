"""Étape Import — de bout en bout, sans réseau externe : serveur vidéo local -> transcripteur (téléchargement, envoi S3) -> worker (HLS, bascule).
Prérequis : Postgres :5544, S3 simulé :5599, API déjà lancée (migrations), ffmpeg, worker/node_modules (npm ci). Lancer : python3 api/tests/test_media_import_e2e.py"""
import json, os, subprocess, sys, tempfile, threading, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import boto3, psycopg2
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BUCKET = "majlis-videos"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
keys = lambda p: [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=p).get("Contents", [])]

d = tempfile.mkdtemp(); V = os.path.join(d, "v.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=6", "-f", "lavfi", "-i", "sine=duration=6", "-shortest", "-pix_fmt", "yuv420p", V], check=True)
DATA = open(V, "rb").read()
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/ok.mp4": self.send_response(200); self.send_header("Content-Type", "video/mp4"); self.send_header("Content-Length", str(len(DATA))); self.end_headers(); self.wfile.write(DATA)
        elif self.path == "/fake.mp4": self.send_response(200); self.send_header("Content-Type", "video/mp4"); self.end_headers(); self.wfile.write(b"x" * 5000)
        else: self.send_response(404); self.end_headers()
srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start(); BASE = f"http://127.0.0.1:{srv.server_address[1]}"
env = dict(os.environ, DATABASE_URL="postgres://majlis:pw@127.0.0.1:5544/majlis", S3_ENDPOINT="http://127.0.0.1:5599", S3_BUCKET=BUCKET, S3_REGION="us-east-1", S3_ACCESS_KEY="test",
           S3_SECRET_KEY="test", SETTINGS_KEY="test-settings-key-0123456789", WORK_DIR=tempfile.mkdtemp(), YTDLP_AUTO_UPDATE="0")
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=ROOT, timeout=240)
    line = [l for l in r.stdout.strip().splitlines() if l.startswith("{")]
    if not line: print(r.stdout, r.stderr[-1500:]); sys.exit(1)
    return json.loads(line[-1])
transcriber = lambda: run(["python3", "transcriber/tests/run_import_once.py"])
worker = lambda: run(["node", "worker/tests/run_import_once.mjs"])

cur.execute("select id from users where role='admin' limit 1"); admin = cur.fetchone()[0]; tag = uuid.uuid4().hex[:6]
def talk(source, status, ref):
    cur.execute("""insert into talks(title, speaker, language, access, source, video_ref, video_status, organizer_id, rights_confirmed)
                   values (%s,'Test','fr','free',%s,%s,%s,%s,true) returning id""", (f"E2E import {tag}", source, ref, status, admin)); return str(cur.fetchone()[0])
def imp(tid, url, new, prev=None):
    key = f"talks/{uuid.uuid4()}"
    cur.execute("""insert into media_imports(talk_id, requested_by, requested_by_name, source_url, origin, new_talk, prev_source, object_key, rights_confirmed_at, rights_text)
                   values (%s,%s,'admin',%s,'web',%s,%s,%s,now(),'v1 : test') returning id""", (tid, admin, url, new, prev, key)); return str(cur.fetchone()[0]), key
def st(iid): cur.execute("select status, stage, error, progress from media_imports where id=%s", (iid,)); return cur.fetchone()
# On vide d'abord la file (les demandes des autres tests ne doivent pas être prises avant les nôtres).
cur.execute("update media_imports set status='canceled' where status in ('pending','downloading','converting')")

# --- A) nouvelle conférence depuis un lien direct ---
tA = talk("upload", "importing", "talks/pending"); iA, kA = imp(tA, BASE + "/ok.mp4", True)
ok(transcriber() == {"claimed": True, "id": iA}, "transcripteur : demande prise")
s = st(iA); ok(s[0] == "converting" and s[1] is None, f"après le téléchargement : en attente du worker ({s})")
ok(kA in keys(kA), "fichier copié présent dans le stockage"); ok(s3.head_object(Bucket=BUCKET, Key=kA)["ContentLength"] == len(DATA), "fichier complet (même taille)")
cur.execute("select video_status, source from talks where id=%s", (tA,)); ok(cur.fetchone() == ("importing", "upload"), "conférence toujours 'importing' avant conversion")
r = worker(); ok(r.get("claimed") and r.get("ok"), f"worker : converti ({r})")
ok(st(iA)[0] == "done" and st(iA)[3] == 100, "demande 'done'")
cur.execute("select video_status, source, video_ref, duration_seconds, imported_from, imported_origin, audio_status, poster_key from talks where id=%s", (tA,)); t = cur.fetchone()
ok(t[0] == "ready" and t[1] == "upload" and t[2] == kA and t[3] in (5, 6) and t[4] == BASE + "/ok.mp4" and t[5] == "web", f"conférence prête et hébergée ({t})")
ok(t[6] == "ready", "piste audio seule créée")
ks = keys(f"hls/{tA}/"); ok(any(k.endswith("master.m3u8") for k in ks) and any(k.endswith(".ts") or k.endswith(".m4s") for k in ks), f"HLS dans Garage ({len(ks)} fichiers)")
ok(worker() == {"claimed": False}, "file vide ensuite")

# --- B) conférence YouTube du catalogue : reste YouTube jusqu'à la bascule ---
tB = talk("youtube", "ready", "abcdefghijk"); iB, kB = imp(tB, BASE + "/ok.mp4", False, "youtube")
transcriber(); cur.execute("select source, video_status from talks where id=%s", (tB,)); ok(cur.fetchone() == ("youtube", "ready"), "pendant la conversion : toujours lisible depuis YouTube")
r = worker(); ok(r.get("ok"), "worker : converti")
cur.execute("select source, video_ref, video_status, imported_from from talks where id=%s", (tB,)); t = cur.fetchone()
ok(t[0] == "upload" and t[1] == kB and t[2] == "ready" and t[3] == BASE + "/ok.mp4", f"bascule YouTube -> hébergée ({t[:3]})")

# --- C) échec : 404 -> échec définitif lisible, conférence en échec ---
tC = talk("upload", "importing", "talks/pending"); iC, kC = imp(tC, BASE + "/absent.mp4", True)
transcriber(); s = st(iC); ok(s[0] == "failed" and "404" in s[2], f"404 : échec lisible ({s[2]})")
cur.execute("select video_status, video_error from talks where id=%s", (tC,)); t = cur.fetchone(); ok(t[0] == "failed" and "404" in t[1], "conférence en échec avec le message")
ok(not keys(kC), "aucun fichier laissé dans le stockage")

# --- D) échec : fichier qui n'est pas une vidéo ---
tD = talk("upload", "importing", "talks/pending"); iD, kD = imp(tD, BASE + "/fake.mp4", True)
transcriber(); s = st(iD); ok(s[0] == "failed" and "pas une vidéo" in s[2], f"faux fichier refusé ({s[2]})"); ok(not keys(kD), "rien envoyé au stockage")

# --- E) adresse privée refusée par le vrai contrôle (sans l'outil permissif : appel direct) ---
sys.path.insert(0, os.path.join(ROOT, "transcriber", "src")); import importer, external  # noqa: E402
try: importer.fetch({"origin": "web", "source_url": "http://127.0.0.1:1/a.mp4", "archive_file": None}, tempfile.mkdtemp(), {}, 10 ** 6, 720, lambda a, b: None); ok(False, "adresse locale")
except external.Blocked: ok(True, "vrai contrôle : adresse locale refusée avant tout téléchargement")

# --- F) conférence supprimée pendant la conversion : tout est nettoyé ---
tF = talk("upload", "importing", "talks/pending"); iF, kF = imp(tF, BASE + "/ok.mp4", True); transcriber()
cur.execute("delete from talks where id=%s", (tF,))  # cascade : la demande disparaît avec elle
r = worker(); ok(r == {"claimed": False}, "demande supprimée avec la conférence : rien à convertir")

# --- G) annulation avant conversion ---
tG = talk("upload", "importing", "talks/pending"); iG, kG = imp(tG, BASE + "/ok.mp4", True); transcriber()
cur.execute("update media_imports set status='canceled', stage=NULL where id=%s", (iG,)); ok(worker() == {"claimed": False}, "annulée avant conversion : le worker l'ignore")
print("TOUT EST OK")
