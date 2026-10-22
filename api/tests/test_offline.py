"""22b-6 : hors connexion. Vrai FFmpeg (HLS fMP4 2 qualités + audio, comme le worker) déposé dans le S3 de test, préparation MP4 / M4A,
droits (abonné, libre, visiteur, externe), renouvellement, suppression. Prérequis : API (3055), PG (5544), S3 (moto 5599), ffmpeg, ffprobe."""
import sys, os, uuid, time, hashlib, subprocess, tempfile, requests, psycopg2, boto3

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
BUCKET = "majlis-videos"


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def user(premium=False):
    em = f"of-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Amina"})
    if premium:
        cur.execute("update users set premium_until = now() + interval '30 days' where email=%s", (em,))
    tok = requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]
    return {"authorization": "Bearer " + tok}


admin = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); admin_id = cur.fetchone()[0]


def make_talk(access="premium", source="upload", status="ready", audio="ready"):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,audio_status,access,duration_seconds,language)
                   values('Hors connexion test','d','Intervenant',%s,'x',%s,'published',%s,%s,%s,20,'fr') returning id""", (source, admin_id, status, audio, access))
    return cur.fetchone()[0]


def make_hls(talk_id):
    d = tempfile.mkdtemp(prefix="offl-")
    for v in ("v0", "v1", "audio"):
        os.makedirs(os.path.join(d, v))
    src = ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=20", "-f", "lavfi", "-i", "sine=frequency=660:duration=20"]
    split = "[0:v]split=2[s0][s1];[s0]scale=-2:360[v0];[s1]scale=-2:720[v1]"
    args = ["ffmpeg", "-v", "error", "-y", *src, "-filter_complex", split,
            "-map", "[v0]", "-c:v:0", "libx264", "-preset", "ultrafast", "-b:v:0", "400k", "-map", "[v1]", "-c:v:1", "libx264", "-preset", "ultrafast", "-b:v:1", "1200k",
            "-map", "1:a", "-c:a:0", "aac", "-b:a:0", "64k", "-map", "1:a", "-c:a:1", "aac", "-b:a:1", "64k",
            "-force_key_frames", "expr:gte(t,n_forced*6)", "-sc_threshold", "0",
            "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4", "-hls_flags", "independent_segments", "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", os.path.join(d, "v%v/seg_%05d.m4s"), "-master_pl_name", "master.m3u8", "-var_stream_map", "v:0,a:0 v:1,a:1", os.path.join(d, "v%v/index.m3u8")]
    subprocess.run(args, check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(d, "v0/index.m3u8"), "-vn", "-map", "0:a:0", "-c:a", "copy", "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
                    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", os.path.join(d, "audio/seg_%05d.m4s"), os.path.join(d, "audio/index.m3u8")], check=True)
    for root, _, files in os.walk(d):
        for fn in files:
            p = os.path.join(root, fn)
            s3.upload_file(p, BUCKET, f"hls/{talk_id}/" + os.path.relpath(p, d))
    return d


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,height:format=duration", "-of", "default=nw=1", path], capture_output=True, text=True)
    return r.stdout


def prepare(h, talk, body, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = requests.post(f"{B}/me/offline/{talk}", headers=h, json=body)
        if r.status_code == 200:
            return r
        if r.status_code != 202:
            return r
        time.sleep(1)
    raise SystemExit("délai dépassé")


# Réglage de validité
requests.put(B + "/admin/settings", headers=admin, json={"values": {"mod_offline_valid_days": "30"}})
sub = user(True); free_user = user(False); guest = {}
T = make_talk(); make_hls(T)

# Droits
ok(requests.get(f"{B}/me/offline/{T}/options").status_code == 401, "visiteur : 401")
r = requests.get(f"{B}/me/offline/{T}/options", headers=free_user)
ok(r.status_code == 403 and r.json()["reason"] == "subscription", "compte sans abonnement : 403 (premium)")
ok(requests.post(f"{B}/me/offline/{T}", headers=free_user, json={"kind": "audio"}).status_code == 403, "sans abonnement : préparation refusée")
ok(requests.post(f"{B}/me/offline/{uuid.uuid4()}", headers=sub, json={"kind": "audio"}).status_code == 404, "conférence inconnue : 404")
ok(requests.post(f"{B}/me/offline/not-a-uuid", headers=sub, json={"kind": "audio"}).status_code == 400, "identifiant invalide : 400")
ok(requests.post(f"{B}/me/offline/{T}", headers=sub, json={"kind": "video", "height": 1080}).status_code == 400, "qualité inconnue : 400")
ok(requests.post(f"{B}/me/offline/{T}", headers=sub, json={"kind": "video"}).status_code == 400, "vidéo sans qualité : 400")
ok(requests.post(f"{B}/me/offline/{T}", headers=sub, json={"kind": "audio", "x": 1}).status_code == 400, "champ inconnu : 400")
ext = make_talk(source="youtube"); ok(requests.post(f"{B}/me/offline/{ext}", headers=sub, json={"kind": "audio"}).status_code == 409, "vidéo externe : 409")
nr = make_talk(status="processing"); ok(requests.post(f"{B}/me/offline/{nr}", headers=sub, json={"kind": "audio"}).status_code == 409, "vidéo pas prête : 409")
na = make_talk(audio="none"); make_hls(na)
ok(requests.post(f"{B}/me/offline/{na}", headers=sub, json={"kind": "audio"}).json()["reason"] == "no_audio", "audio indisponible : message clair")

# Options
o = requests.get(f"{B}/me/offline/{T}/options", headers=sub).json()
ok(o["validDays"] == 30 and o["audio"]["estimatedBytes"] > 0 and [v["height"] for v in o["video"]] == [360, 720], "options : audio + 360p + 720p, validité 30 j")

# Audio
r = prepare(sub, T, {"kind": "audio"}); j = r.json()
ok(r.status_code == 200 and j["status"] == "ready" and j["kind"] == "audio", "audio préparé")
data = requests.get(j["url"]).content
ok(len(data) == j["size"] and hashlib.sha256(data).hexdigest() == j["sha256"], "audio : taille et SHA-256 corrects")
p = tempfile.mktemp(suffix=".m4a"); open(p, "wb").write(data); pr = probe(p)
ok("codec_type=audio" in pr and "codec_type=video" not in pr and abs(float(pr.split("duration=")[1]) - 20) < 1.5, "audio : fichier M4A lisible (FFprobe), sans image, ~20 s")
exp = j["expiresAt"]; ok(25 * 86400 < (time.mktime(time.strptime(exp[:19], "%Y-%m-%dT%H:%M:%S")) - time.time() - time.timezone) < 31 * 86400, "validité d'environ 30 jours")

# Vidéo 720 et 360
for h in (720, 360):
    r = prepare(sub, T, {"kind": "video", "height": h}); j = r.json()
    ok(r.status_code == 200 and j["height"] == h, f"vidéo {h}p préparée")
    data = requests.get(j["url"]).content; p = tempfile.mktemp(suffix=".mp4"); open(p, "wb").write(data); pr = probe(p)
    ok(hashlib.sha256(data).hexdigest() == j["sha256"] and f"height={h}" in pr and "codec_type=audio" in pr and abs(float(pr.split("duration=")[1]) - 20) < 1.5, f"vidéo {h}p : empreinte, hauteur, son et durée corrects")
cur.execute("select count(*), count(*) filter (where status='ready') from offline_files where talk_id=%s", (T,)); ok(cur.fetchone() == (3, 3), "3 fichiers préparés en base")
t0 = time.time(); r = requests.post(f"{B}/me/offline/{T}", headers=sub, json={"kind": "video", "height": 720}); ok(r.status_code == 200 and time.time() - t0 < 3, "deuxième téléchargement : fichier déjà prêt, immédiat")
ok(requests.get(r.json()["url"], headers={"Range": "bytes=0-99"}).status_code == 206, "lien signé : lecture partielle (Range) acceptée")

# Libre : tout compte connecté ; premium : jamais un visiteur
fr = make_talk(access="free"); make_hls(fr)
ok(prepare(free_user, fr, {"kind": "audio"}).json()["status"] == "ready", "conférence en accès libre : téléchargeable par un compte connecté")

# Renouvellement
rn = requests.post(B + "/me/offline/renew", headers=sub, json={"talkIds": [str(T), str(uuid.uuid4())]}).json()["items"]
ok(rn[0]["ok"] and rn[0]["expiresAt"] and rn[1]["ok"] is False, "renouvellement : accordé pour l'une, refusé pour l'inconnue")
rn = requests.post(B + "/me/offline/renew", headers=free_user, json={"talkIds": [str(T), str(fr)]}).json()["items"]
ok(rn[0]["ok"] is False and rn[0]["reason"] == "subscription" and rn[1]["ok"], "renouvellement : abonnement terminé → refusé (premium), libre → accordé")
ok(requests.post(B + "/me/offline/renew", headers=sub, json={"talkIds": []}).status_code == 400, "liste vide : 400")

# Échec FFmpeg : le message remonte, puis nouvel essai possible
cur.execute("update talks set audio_status='ready' where id=%s", (na,))
s3.delete_object(Bucket=BUCKET, Key=f"hls/{na}/audio/index.m3u8")
r = prepare(sub, na, {"kind": "audio"}, 30)
ok(r.status_code == 502 and r.json()["status"] == "failed" and r.json()["error"], "playlist manquante : échec signalé avec un message (502)")
st = requests.get(f"{B}/me/offline/{na}/status", headers=sub, params={"kind": "audio"}).json()
ok(st["status"] == "failed" and st["error"], "état « failed » consultable")
ok(requests.post(f"{B}/me/offline/{na}", headers=sub, json={"kind": "audio"}).status_code == 502, "sans retry : l'échec reste affiché (pas de boucle)")
r = requests.post(f"{B}/me/offline/{na}", headers=sub, json={"kind": "audio", "retry": True})
ok(r.status_code == 202, "retry : nouvelle préparation lancée")

# Fonction coupée
ok(requests.put(B + "/admin/features", headers=admin, json={"values": {"offline": False}}).status_code == 200, "fonction coupée")
ok(requests.get(f"{B}/me/offline/{T}/options", headers=sub).status_code == 404, "fonction coupée : routes fermées")
requests.put(B + "/admin/features", headers=admin, json={"values": {"offline": True}})

# Suppression de la conférence : fichiers préparés effacés
keys = [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=f"offline/{T}/").get("Contents", [])]
ok(len(keys) == 3, "3 fichiers dans le stockage")
ok(requests.delete(f"{B}/talks/{T}", headers=admin).status_code == 204, "conférence supprimée")
ok(not s3.list_objects_v2(Bucket=BUCKET, Prefix=f"offline/{T}/").get("Contents"), "fichiers hors connexion effacés avec la conférence")
print("TOUT OK")
