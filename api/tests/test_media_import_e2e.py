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
# === Piste audio française (migration 113) ===
def imp2(tid, url, origin="youtube", status="pending", audio_lang="fr", audio_used=None, reimport=False, prev=None, key=None):
    key = key or f"talks/{uuid.uuid4()}"
    cur.execute("""insert into media_imports(talk_id, requested_by, requested_by_name, source_url, origin, new_talk, prev_source, object_key, rights_confirmed_at, rights_text,
                                             status, audio_lang, audio_used, reimport)
                   values (%s,%s,'admin',%s,%s,false,%s,%s,now(),'v1 : test',%s,%s,%s,%s) returning id""", (tid, admin, url, origin, prev, key, status, audio_lang, audio_used, reimport)); return str(cur.fetchone()[0]), key
def row(tid): cur.execute("select source, video_ref, video_status, audio_track, language, transcript_status, poster_key, title from talks where id=%s", (tid,)); return cur.fetchone()
has_dub = True
try: cur.execute("select 1 from dub_tracks limit 1")
except Exception: has_dub = False
def dub(tid):
    mk, vk = f"dub/{tid}/mix.m4a", f"dub/{tid}/voice.m4a"; s3.put_object(Bucket=BUCKET, Key=mk, Body=b"m"); s3.put_object(Bucket=BUCKET, Key=vk, Body=b"v")
    cur.execute("insert into dub_tracks(talk_id, mix_key, voice_key, duration_s) values (%s,%s,%s,6)", (tid, mk, vk)); return mk, vk

# --- H) premier import : le transcripteur a pris la piste française -> conférence marquée, doublage maison retiré ---
tH = talk("youtube", "ready", "hhhhhhhhhhh"); cur.execute("update talks set language='en' where id=%s", (tH,))
iH, kH = imp2(tH, "https://www.youtube.com/watch?v=hhhhhhhhhhh", status="converting", audio_used="fr", prev="youtube"); s3.put_object(Bucket=BUCKET, Key=kH, Body=DATA)
if has_dub: mkH, vkH = dub(tH)
r = worker(); ok(r.get("ok"), f"worker : converti ({r})")
t = row(tH); ok(t[0] == "upload" and t[1] == kH and t[2] == "ready" and t[3] == "fr" and t[4] == "fr", f"hébergée, piste française notée, langue « fr » ({t[:5]})")
if has_dub:
    cur.execute("select count(*) from dub_tracks where talk_id=%s", (tH,)); ok(cur.fetchone()[0] == 0 and not keys(mkH) and not keys(vkH), "doublage maison retiré (piste et fichiers)")

# --- I) premier import SANS piste française : rien de marqué, langue gardée ---
tI = talk("youtube", "ready", "iiiiiiiiiii"); cur.execute("update talks set language='en' where id=%s", (tI,))
iI, kI = imp2(tI, "https://www.youtube.com/watch?v=iiiiiiiiiii", status="converting", audio_used=None, prev="youtube"); s3.put_object(Bucket=BUCKET, Key=kI, Body=DATA)
if has_dub: mkI, vkI = dub(tI)
ok(worker().get("ok"), "worker : converti"); t = row(tI); ok(t[2] == "ready" and t[3] is None and t[4] == "en", f"voix d'origine : pas de marque, langue inchangée ({t[2:5]})")
if has_dub: cur.execute("select count(*) from dub_tracks where talk_id=%s", (tI,)); ok(cur.fetchone()[0] == 1 and keys(mkI), "doublage maison gardé")

# --- J) « Récupérer la voix française » d'une vidéo déjà hébergée (tI) : remplacement complet ---
cur.execute("update talks set title='Titre gardé', transcript_status='ready', poster_key=%s where id=%s", (f"hls/{tI}/c2.jpg", tI)); before = keys(f"hls/{tI}/")
iJ, kJ = imp2(tI, "https://www.youtube.com/watch?v=iiiiiiiiiii", status="converting", audio_used="fr", reimport=True, prev="upload"); s3.put_object(Bucket=BUCKET, Key=kJ, Body=DATA)
r = worker(); ok(r.get("ok"), f"worker : voix française appliquée ({r})")
t = row(tI); ok(t[0] == "upload" and t[1] == kJ and t[2] == "ready" and t[3] == "fr" and t[4] == "fr", f"nouvelle vidéo en place, piste française notée ({t[:5]})")
ok(t[5] == "ready" and t[6] == f"hls/{tI}/c2.jpg" and t[7] == "Titre gardé", "titre, sous-titres et miniature choisie inchangés")
ok(not keys(kI) and kJ in keys(kJ), "ancien fichier source effacé, nouveau présent")
after = keys(f"hls/{tI}/"); ok(any(k.endswith("master.m3u8") for k in after) and f"hls/{tI}/c2.jpg" in after and len(after) == len(before), f"HLS reconstruit au même endroit ({len(after)} fichiers)")
ok(st(iJ)[0] == "done", "demande 'done'")
if has_dub: cur.execute("select count(*) from dub_tracks where talk_id=%s", (tI,)); ok(cur.fetchone()[0] == 0 and not keys(mkI), "doublage maison retiré après la voix française")

# --- K) remplacement refusé si la conférence a changé (montage publié entre-temps) : rien n'est touché ---
cur.execute("update talks set media_prefix=%s where id=%s", (f"hls/{tI}/r/x/", tI)); filesK = keys(f"hls/{tI}/")
iK, kK = imp2(tI, "https://www.youtube.com/watch?v=iiiiiiiiiii", status="converting", audio_used="fr", reimport=True, prev="upload"); s3.put_object(Bucket=BUCKET, Key=kK, Body=DATA)
r = worker(); ok(r.get("claimed") and not r.get("ok"), f"worker : remplacement abandonné ({r})")
ok(st(iK)[0] == "canceled" and "changé" in st(iK)[2] and row(tI)[1] == kJ and keys(f"hls/{tI}/") == filesK and not keys(kK), "vidéo en place intacte, fichier téléchargé effacé, demande close avec l'explication")
cur.execute("update talks set media_prefix=NULL where id=%s", (tI,))

# --- L) remplacement dont la conversion échoue (fichier illisible) : la vidéo en place n'est jamais touchée ---
for n in (1, 2):
    if n == 1: iL, kL = imp2(tI, "https://www.youtube.com/watch?v=iiiiiiiiiii", status="converting", audio_used="fr", reimport=True, prev="upload"); s3.put_object(Bucket=BUCKET, Key=kL, Body=b"pas une video")
    r = worker(); ok(r.get("claimed") and not r.get("ok"), f"worker : échec de conversion, essai {n}")
ok(st(iL)[0] == "failed" and row(tI)[1:3] == (kJ, "ready") and keys(f"hls/{tI}/") == filesK, "échec définitif : vidéo d'avant toujours en ligne, fichiers intacts")

# --- M) vidéo d'avant en cours de reconversion : le remplacement attend au lieu d'écraser ---
cur.execute("update talks set video_status='processing' where id=%s", (tI,))
iM, kM = imp2(tI, "https://www.youtube.com/watch?v=iiiiiiiiiii", status="converting", audio_used="fr", reimport=True, prev="upload"); s3.put_object(Bucket=BUCKET, Key=kM, Body=DATA)
r = worker(); ok(r.get("claimed") and not r.get("ok"), "worker : attend que la vidéo d'avant soit prête")
s = st(iM); ok(s[0] == "converting" and s[1] is None and keys(f"hls/{tI}/") == filesK, "demande remise en attente, rien d'écrasé"); ok(worker() == {"claimed": False}, "pas reprise avant une minute")
cur.execute("update talks set video_status='ready' where id=%s", (tI,)); cur.execute("update media_imports set status='canceled' where id=%s", (iM,)); s3.delete_object(Bucket=BUCKET, Key=kM)

# --- P) panne de stockage PENDANT le remplacement des fichiers : la vidéo d'avant est reconvertie depuis son fichier, jamais perdue ---
iP, kP = imp2(tI, "https://www.youtube.com/watch?v=iiiiiiiiiii", status="converting", audio_used="fr", reimport=True, prev="upload"); s3.put_object(Bucket=BUCKET, Key=kP, Body=DATA)
env["TEST_FAIL_UPLOAD"] = "1"; r = worker(); del env["TEST_FAIL_UPLOAD"]
ok(r.get("claimed") and not r.get("ok") and "panne" in r.get("error", ""), f"worker : panne pendant le remplacement ({r.get('error')})")
t = row(tI); ok(t[1] == kJ and t[2] == "pending" and kJ in keys(kJ), f"vidéo d'avant remise en file de conversion, son fichier source toujours là ({t[1:3]})")
s = st(iP); ok(s[0] == "converting" and s[1] is None, "la demande sera retentée")
cur.execute("update media_imports set status='canceled' where id=%s", (iP,)); s3.delete_object(Bucket=BUCKET, Key=kP); cur.execute("update talks set video_status='ready' where id=%s", (tI,))

# --- N) transcripteur : vidéo déjà importée venue d'un fichier direct -> refus sans rien toucher ---
iN, kN = imp2(tI, BASE + "/ok.mp4", origin="web", reimport=True, prev="upload")
transcriber(); s = st(iN); ok(s[0] == "failed" and "fichier direct" in s[2] and row(tI)[1:3] == (kJ, "ready") and not keys(kN), f"fichier direct : refus lisible, vidéo intacte ({s[2]})")
# --- O) transcripteur : la piste retenue est notée sur la demande (ici aucune : lien direct, premier import) ---
tO = talk("upload", "importing", "talks/pending"); cur.execute("""insert into media_imports(talk_id, requested_by, requested_by_name, source_url, origin, new_talk, object_key, rights_confirmed_at, rights_text, audio_lang)
                   values (%s,%s,'admin',%s,'web',true,%s,now(),'v1 : test','fr') returning id""", (tO, admin, BASE + "/ok.mp4", "talks/" + str(uuid.uuid4()))); iO = str(cur.fetchone()[0])
transcriber(); cur.execute("select status, audio_used from media_imports where id=%s", (iO,)); ok(cur.fetchone() == ("converting", None), "lien direct : voix d'origine, import poursuivi")
ok(worker().get("ok") and row(tO)[2:4] == ("ready", None), "conférence prête, sans marque de piste")
print("TOUT EST OK")
