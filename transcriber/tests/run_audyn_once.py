"""Audyn, import depuis un lien — outil de test : le transcripteur prend UNE demande et la traite (même code que le service).
Le contrôle anti-SSRF est neutralisé ici uniquement pour télécharger depuis un serveur local de test (cf. test_importer.py pour l'anti-SSRF).
Simulations facultatives (aucun accès aux plateformes pendant les tests) :
  TEST_THUMB          adresse de l'image de la vidéo (remplace la recherche de l'image)
  TEST_LIST_JSON      résultat de external.list_videos : {"title": "...", "entries": [{"source": "youtube", "id": "...", "title": "..."}]}
  TEST_ARCHIVE_JSON   métadonnées archive.org renvoyées par external._archive_get
  TEST_CHAPTERS_JSON  chapitres de la vidéo [{start_time, end_time, title}] (téléchargement et vérification de « Redécouper »)
  TEST_META_JSON      informations de la vidéo lues par yt-dlp : {"title", "uploader", "description"}
Variables : DATABASE_URL, S3_ENDPOINT, S3_BUCKET, SETTINGS_KEY. Sortie : une ligne JSON { claimed, id }."""
import json, os, sys, types
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.setdefault("S3_REGION", "us-east-1"); os.environ.setdefault("S3_ACCESS_KEY", "test"); os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("WORK_DIR", "/tmp/claude-0/work"); os.environ.setdefault("YTDLP_AUTO_UPDATE", "0"); os.environ.setdefault("MODELS_DIR", "/tmp/claude-0/models")
os.makedirs(os.environ["WORK_DIR"], exist_ok=True)
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=object)
import psycopg2, psycopg2.extras  # noqa: E402
import audyn_import, external, main  # noqa: E402

if os.environ.get("TEST_THUMB"):
    audyn_import.find_thumbnail = lambda job, report, opts: os.environ["TEST_THUMB"]
if os.environ.get("TEST_LIST_JSON"):
    data = json.loads(os.environ["TEST_LIST_JSON"])
    external.list_videos = lambda url, opts, limit: (data["title"], data["entries"][:limit])
if os.environ.get("TEST_CHAPTERS_JSON"):  # chapitres de la vidéo (comme yt-dlp les lit sur YouTube)
    marks = json.loads(os.environ["TEST_CHAPTERS_JSON"])
    _fetch = audyn_import.fetch_audio
    def fetch_with_chapters(job, work, opts, max_bytes, on_progress, check, report):
        path = _fetch(job, work, opts, max_bytes, on_progress, check, report)
        report["chapters"] = marks
        return path
    audyn_import.fetch_audio = fetch_with_chapters
    audyn_import.video_chapters = lambda job, opts: (marks, 0)
if os.environ.get("TEST_META_JSON"):  # titre / chaîne / description lus par yt-dlp (import d'une chaîne)
    meta_v = json.loads(os.environ["TEST_META_JSON"])
    _fetch_m = audyn_import.fetch_audio
    def fetch_with_meta(job, work, opts, max_bytes, on_progress, check, report):
        path = _fetch_m(job, work, opts, max_bytes, on_progress, check, report)
        report.update(meta_v)
        return path
    audyn_import.fetch_audio = fetch_with_meta
if os.environ.get("TEST_BOT"):  # YouTube qui bloque le serveur (message en français, comme sur le VPS le 13/11)
    def bot(*a, **k):
        raise Exception("ERROR: [youtube] WMryLoMEfxE: Connectez-vous pour confirmer que vous n'êtes pas un robot. Cela nous permet de protéger notre communauté")
    audyn_import.fetch_audio = bot
if os.environ.get("TEST_ARCHIVE_JSON"):
    meta = json.loads(os.environ["TEST_ARCHIVE_JSON"])
    external._archive_get = lambda path, params=None: meta

conn = psycopg2.connect(**main.conn_params(main.DATABASE_URL)); conn.autocommit = True
def local_query(sql, params=None, fetch=False):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall() if fetch else cur.rowcount
conf = main.Settings(local_query, lambda *a: print(*a, file=sys.stderr)); conf.refresh()
job = audyn_import.claim(conn)
if not job:
    print(json.dumps({"claimed": False})); sys.exit(0)
ctx = audyn_import.Ctx(conn, main.s3, main.BUCKET, lambda work: main.external_options(work, conf), conf, lambda *a: print(*a, file=sys.stderr),
                       lambda: False, main.WORK_DIR, check=lambda u: u)
res = audyn_import.run(job, ctx)
print(json.dumps({"claimed": True, "id": str(job["id"]), "result": res}))
