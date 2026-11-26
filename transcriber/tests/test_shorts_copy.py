"""Shorts autonomes — copie chez nous (étape A) : file d'attente, copie réussie (vidéo + affiche dans le stockage, durée, état « done »),
short trop long refusé sans nouvel essai, panne réseau réessayée puis abandonnée après 3 essais, short supprimé pendant la copie nettoyé,
reprise des copies interrompues. Téléchargement simulé (yt-dlp remplacé par une vidéo de test) ; vrais ffmpeg, PostgreSQL (5544) et S3 moto (5599).
Lancer : python3 transcriber/tests/test_shorts_copy.py"""
import os
import shutil
import subprocess
import sys
import tempfile
import types
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
import boto3  # noqa: E402
import psycopg2  # noqa: E402
import importer  # noqa: E402
import shorts_copy as sc  # noqa: E402

n = 0
tag = uuid.uuid4().hex[:6]
tmp = tempfile.mkdtemp(prefix="shc-")


def video(path, secs):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s=360x640:r=25:d={secs}", "-f", "lavfi", "-i", f"sine=frequency=440:duration={secs}",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path], check=True)


SHORT, LONG = os.path.join(tmp, "s.mp4"), os.path.join(tmp, "l.mp4")
video(SHORT, 3)
video(LONG, 200)
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw")
db.autocommit = True
cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
BUCKET = "majlis-videos"
ctx = types.SimpleNamespace(conn=db, s3=s3, bucket=BUCKET, work_dir=tmp, log=lambda m: None, stopping=lambda: False, options=lambda w: {})
made = []


def ok(cond, msg):
    global n
    if not cond:
        print("FAIL", msg)
        cleanup()
        sys.exit(1)
    n += 1
    print("OK  ", msg)


def cleanup():
    for sid in made:
        cur.execute("delete from public_shorts where id=%s", (sid,))
        for k in (f"shorts/{sid}.mp4", f"shorts/{sid}.jpg"):
            try:
                s3.delete_object(Bucket=BUCKET, Key=k)
            except Exception:  # noqa: BLE001
                pass
    shutil.rmtree(tmp, ignore_errors=True)


def new(ref):
    sid = str(uuid.uuid4())
    made.append(sid)
    cur.execute("""INSERT INTO public_shorts(id, talk_id, title, video_key, play, video_ref, source_url, copy_status, status, rights_confirmed_at)
                   VALUES (%s, NULL, 'Test', %s, 'file', %s, 'https://www.youtube.com/shorts/x', 'pending', 'published', now())""", (sid, f"shorts/{sid}.mp4", f"t{tag}{ref}"))
    return sid


def state(sid):
    cur.execute("select copy_status, copy_error, duration_s, bytes, poster_key, copy_attempts from public_shorts where id=%s", (sid,))
    return cur.fetchone()


def exists(key):
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except Exception:  # noqa: BLE001
        return False


def only(sid):
    """Seul ce short est « à copier » pour ce test (les autres lignes de la base de test sont laissées de côté)."""
    cur.execute("update public_shorts set copy_status = NULL where copy_status in ('pending','downloading') and id <> %s and talk_id is null", (sid,))


# 1. copie réussie
sid = new("a")
only(sid)
importer.download_ytdlp = lambda url, work, opts, mx, h, cb: shutil.copy(SHORT, os.path.join(work, "v.mp4")) and os.path.join(work, "v.mp4")
job = sc.claim(db)
ok(job and str(job["id"]) == sid and job["copy_attempts"] == 1, "la file donne le short à copier (essai 1)")
ok(state(sid)[0] == "downloading", "état « downloading » pendant la copie")
ok(sc.run(job, ctx) == "ok", "copie réussie")
st = state(sid)
ok(st[0] == "done" and 2.5 < float(st[2]) < 3.5 and st[3] > 1000, "état « done », durée et taille notées")
ok(exists(f"shorts/{sid}.mp4") and exists(f"shorts/{sid}.jpg") and st[4] == f"shorts/{sid}.jpg", "vidéo et affiche dans le stockage")
ok(sc.claim(db) is None, "plus rien à copier")

# 2. short trop long : refusé tout de suite
sid2 = new("b")
only(sid2)
importer.download_ytdlp = lambda url, work, opts, mx, h, cb: shutil.copy(LONG, os.path.join(work, "v.mp4")) and os.path.join(work, "v.mp4")
job = sc.claim(db)
sc.run(job, ctx)
st = state(sid2)
ok(st[0] == "failed" and "short" in st[1] and not exists(f"shorts/{sid2}.mp4"), "vidéo de plus de 3 min : échec définitif, rien dans le stockage")

# 3. panne réseau : réessayée puis abandonnée après 3 essais
sid3 = new("c")
only(sid3)


def boom(*a, **k):
    raise RuntimeError("réseau coupé")


importer.download_ytdlp = boom
for essai in (1, 2, 3):
    cur.execute("update public_shorts set updated_at = now() - interval '10 minutes' where id=%s", (sid3,))
    job = sc.claim(db)
    ok(job and job["copy_attempts"] == essai, f"essai {essai} lancé")
    sc.run(job, ctx)
    st = state(sid3)
    ok(st[0] == ("pending" if essai < 3 else "failed") and "réseau" in st[1], f"après l'essai {essai} : {st[0]}")
ok(sc.claim(db) is None, "après 3 échecs : plus réessayé")

# 4. supprimé pendant la copie : fichiers nettoyés
sid4 = new("d")
only(sid4)


def slow(url, work, opts, mx, h, cb):
    cur.execute("delete from public_shorts where id=%s", (sid4,))
    shutil.copy(SHORT, os.path.join(work, "v.mp4"))
    return os.path.join(work, "v.mp4")


importer.download_ytdlp = slow
job = sc.claim(db)
sc.run(job, ctx)
ok(not exists(f"shorts/{sid4}.mp4") and not exists(f"shorts/{sid4}.jpg"), "short supprimé pendant la copie : stockage nettoyé")

# 5. reprise des copies interrompues
sid5 = new("e")
only(sid5)
cur.execute("update public_shorts set copy_status='downloading' where id=%s", (sid5,))
sc.requeue_interrupted(db)
ok(state(sid5)[0] == "pending", "copie interrompue remise en file")

cleanup()
print(f"TOUT OK ({n})")
