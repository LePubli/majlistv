"""Étape S3 — les services respectent Studio → Activité au moment de prendre une tâche :
pause d'une tâche, priorité, pause générale et plage horaire des tâches lourdes, et file simple si la migration 055 manque.
Services testés avec leur VRAI code de réservation : worker (conversion vidéo, Node), transcripteur, traducteur, doublage (Python).
Prérequis : PG de test (5544) avec la migration 055 appliquée (API démarrée une fois), Node, python3 (requests, psycopg2, boto3),
Python 3.11 du doublage (DUB_PY, numpy). Lancement depuis la racine du dépôt : DUB_PY=/chemin/python3.11 python3 api/tests/test_activity_claims.py"""
import json, os, subprocess, sys, uuid
from datetime import datetime
from zoneinfo import ZoneInfo
import psycopg2

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DB = "postgres://majlis:pw@127.0.0.1:5544/majlis"
DUB_PY = os.environ.get("DUB_PY", sys.executable)
db = psycopg2.connect(DB); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; fails = []; talks = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
ENV = dict(os.environ, DATABASE_URL=DB, S3_ENDPOINT="http://127.0.0.1:5599", S3_ACCESS_KEY="test", S3_SECRET_KEY="test", S3_REGION="garage",
           SETTINGS_KEY="a" * 64, WORK_DIR="/tmp/claude-0/work-s3")

def py_claim(service, py="python3"):
    code = "import main, json; s = getattr(main, 'settings', None); s and hasattr(s, 'refresh') and s.refresh(); r = main.claim(); print(json.dumps(None if not r else {k: str(v) for k, v in dict(r).items()}))"
    out = subprocess.run([py, "-c", code], cwd=os.path.join(ROOT, service, "src"), env=ENV, capture_output=True, text=True, timeout=120)
    line = [l for l in out.stdout.strip().split("\n") if l.startswith("{") or l == "null"]
    if not line: raise RuntimeError(out.stderr[-800:])
    return json.loads(line[-1])
def node_claim():
    code = ("import pg from 'pg'; import { makeClaim } from './src/claim.js'; const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });"
            "const r = await makeClaim(pool)(); console.log(JSON.stringify(r || null)); await pool.end();")
    out = subprocess.run(["node", "--input-type=module", "-e", code], cwd=os.path.join(ROOT, "worker"), env=ENV, capture_output=True, text=True, timeout=60)
    if out.returncode: raise RuntimeError(out.stderr[-800:])
    return json.loads(out.stdout.strip().split("\n")[-1])
def setting(k, v):
    if v is None: cur.execute("delete from app_settings where key=%s", (k,))
    else: cur.execute("insert into app_settings(key,value,is_secret) values (%s,%s,false) on conflict (key) do update set value=excluded.value", (k, v))
def control(q, ref, paused=None, priority=None):
    cur.execute("""insert into activity_controls(queue, ref, paused, priority) values (%s,%s,coalesce(%s,false),coalesce(%s,0))
                   on conflict (queue, ref) do update set paused=coalesce(%s, activity_controls.paused), priority=coalesce(%s, activity_controls.priority)""",
                (q, ref, paused, priority, paused, priority))
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
def talk(n, **kw):
    cur.execute(f"""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,
                     transcript_status, created_at)
                   values (%s,'d','Cheikh','upload',%s,%s,'published',%s,'free',60,'ar','ar',%s, now() - make_interval(mins => %s)) returning id""",
                (f"S3 {tag} {n}", f"v-{tag}-{n}", aid, kw.get("video", "ready"), kw.get("transcript", "unavailable"), kw.get("age", 0)))
    t = str(cur.fetchone()[0]); talks.append(t); return t

# Les tâches en attente d'autres tests ne doivent pas gêner : on les met en pause le temps du test.
held = []
for q, sql in [("video", "select id::text from talks where source='upload' and video_status='pending'"),
               ("transcript", "select id::text from talks where transcript_status='pending'"),
               ("translation", "select talk_id::text || ':' || lang from transcript_translations where status='pending'"),
               ("dubbing", "select id::text from dub_jobs where status='queued'")]:
    cur.execute(sql)
    for (ref,) in cur.fetchall():
        cur.execute("select 1 from activity_controls where queue=%s and ref=%s", (q, ref))
        if not cur.fetchone(): control(q, ref, paused=True); held.append((q, ref))
for k in ["activity_pause_all", "activity_window_enabled", "activity_window_start", "activity_window_end"]: setting(k, None)
hour = datetime.now(ZoneInfo("Europe/Paris")).hour

try:
    # --- worker : conversion vidéo
    A, B, C = talk("A", video="pending", age=30), talk("B", video="pending", age=20), talk("C", video="pending", age=10)
    control("video", A, paused=True); control("video", C, priority=10)
    ok((node_claim() or {}).get("id") == C, "worker : la vidéo prioritaire passe en premier")
    ok((node_claim() or {}).get("id") == B, "worker : puis la suivante ; la vidéo en pause est sautée")
    ok(node_claim() is None, "worker : rien d'autre (A en pause)")
    setting("activity_pause_all", "true"); control("video", A, paused=False)
    ok(node_claim() is None, "worker : « tâches lourdes en pause » : rien ne démarre")
    setting("activity_pause_all", None); setting("activity_window_enabled", "true")
    setting("activity_window_start", str((hour + 2) % 24)); setting("activity_window_end", str((hour + 4) % 24))
    ok(node_claim() is None, "worker : hors de la plage horaire : rien ne démarre")
    setting("activity_window_start", str(hour)); setting("activity_window_end", str((hour + 1) % 24))
    ok((node_claim() or {}).get("id") == A, "worker : dans la plage horaire (et reprise de A) : A démarre")
    setting("activity_window_enabled", None)

    # --- transcripteur
    D, E = talk("D", transcript="pending", age=30), talk("E", transcript="pending", age=20)
    control("transcript", E, priority=5)
    ok((py_claim("transcriber") or {}).get("id") == E, "transcripteur : la conférence prioritaire passe en premier")
    control("transcript", D, paused=True)
    ok(py_claim("transcriber") is None, "transcripteur : conférence en pause sautée")
    control("transcript", D, paused=False); setting("activity_pause_all", "true")
    ok(py_claim("transcriber") is None, "transcripteur : pause générale respectée")
    setting("activity_pause_all", None)
    ok((py_claim("transcriber") or {}).get("id") == D, "transcripteur : reprise")

    # --- traducteur (tâche légère : la pause générale ne la retient pas)
    F = talk("F", transcript="ready")
    cur.execute("insert into transcript_translations(talk_id, lang, status, created_at) values (%s,'en','pending', now() - interval '1 hour'), (%s,'fr','pending', now())", (F, F))
    control("translation", f"{F}:fr", priority=10); setting("activity_pause_all", "true")
    r = py_claim("translator"); ok(r and r["lang"] == "fr", "traducteur : priorité respectée, pause générale sans effet (tâche légère)")
    setting("activity_pause_all", None); control("translation", f"{F}:en", paused=True)
    ok(py_claim("translator") is None, "traducteur : traduction en pause sautée")

    # --- doublage : priorité, pause, écoute de 60 s jamais retenue par la plage horaire
    def job(kind, age):
        g = talk(f"G{age}")  # une seule demande active par conférence et par type
        cur.execute("insert into dub_jobs(talk_id, kind, status, params, created_at) values (%s,%s,'queued','{}', now() - make_interval(mins => %s)) returning id", (g, kind, age))
        return str(cur.fetchone()[0])
    cur.execute("insert into app_settings(key,value,is_secret) values ('mod_dubbing_queue_mode','always',false) on conflict (key) do update set value='always'")
    j1, j2 = job("full", 30), job("full", 20)
    control("dubbing", j2, priority=10)
    ok((py_claim("dubbing", DUB_PY) or {}).get("id") == j2, "doublage : la demande prioritaire passe en premier")
    control("dubbing", j1, paused=True)
    ok(py_claim("dubbing", DUB_PY) is None, "doublage : demande en pause sautée")
    control("dubbing", j1, paused=False); setting("activity_pause_all", "true")
    jp = job("preview", 5)
    ok((py_claim("dubbing", DUB_PY) or {}).get("id") == jp, "doublage : pause générale : l'écoute de 60 s part quand même")
    ok(py_claim("dubbing", DUB_PY) is None, "doublage : pause générale : le doublage complet attend")
    setting("activity_pause_all", None)
    ok((py_claim("dubbing", DUB_PY) or {}).get("id") == j1, "doublage : reprise")

    # --- file simple si la migration 055 manque (fonctions supprimées puis recréées)
    cur.execute("drop function activity_allows(text)")
    try:
        H = talk("H", video="pending", age=500); I = talk("I", transcript="pending", age=500)
        ok((node_claim() or {}).get("id") == H, "worker : sans la migration 055, file d'origine (pas d'erreur)")
        ok((py_claim("transcriber") or {}).get("id") == I, "transcripteur : sans la migration 055, file d'origine")
    finally:
        cur.execute(open(os.path.join(ROOT, "api", "migrations", "055_activity.sql")).read())
finally:
    for k in ["activity_pause_all", "activity_window_enabled", "activity_window_start", "activity_window_end"]: setting(k, None)
    cur.execute("delete from app_settings where key='mod_dubbing_queue_mode'")
    for q, ref in held: cur.execute("delete from activity_controls where queue=%s and ref=%s", (q, ref))
    cur.execute("delete from activity_controls where ref like any(%s)", ([f"{t}%" for t in talks],))
    cur.execute("delete from activity_controls where queue='dubbing' and ref in (select id::text from dub_jobs where talk_id = any(%s::uuid[]))", (talks,))
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
print(f"\n{len(fails)} échec(s)" if fails else "\nTout est OK")
sys.exit(1 if fails else 0)
