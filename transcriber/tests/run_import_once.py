"""Étape Import — outil de test : le transcripteur prend UNE demande d'import et la traite (même code que le service).
Le contrôle anti-SSRF est neutralisé ici uniquement pour pouvoir télécharger depuis un serveur local de test (cf. test_importer.py pour l'anti-SSRF).
Variables : DATABASE_URL, S3_ENDPOINT, S3_BUCKET, SETTINGS_KEY. Sortie : une ligne JSON { claimed, id }."""
import json, os, sys, types
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.setdefault("S3_REGION", "us-east-1"); os.environ.setdefault("S3_ACCESS_KEY", "test"); os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("WORK_DIR", "/tmp/claude-0/work"); os.environ.setdefault("YTDLP_AUTO_UPDATE", "0"); os.environ.setdefault("MODELS_DIR", "/tmp/claude-0/models")
os.makedirs(os.environ["WORK_DIR"], exist_ok=True)
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=object)
import psycopg2, psycopg2.extras  # noqa: E402
import importer, main  # noqa: E402

_fetch = importer.fetch
importer.fetch = lambda job, work, opts, mb, mh, cb, check=None: _fetch(job, work, opts, mb, mh, cb, check=lambda u: u)
conn = psycopg2.connect(**main.conn_params(main.DATABASE_URL)); conn.autocommit = True
def local_query(sql, params=None, fetch=False):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall() if fetch else cur.rowcount
conf = main.Settings(local_query, lambda *a: print(*a, file=sys.stderr)); conf.refresh()
job = main.claim_media_import(conn, True)
if not job:
    print(json.dumps({"claimed": False})); sys.exit(0)
main.run_media_import(job, conn, conf)
print(json.dumps({"claimed": True, "id": str(job["id"])}))
