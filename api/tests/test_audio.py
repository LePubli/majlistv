"""17a : rendition audio — audioPath, playlist protégée, aperçu tronqué. Prérequis : API (3055), PG (5544), S3 moto (5599, ou TEST_S3) ;
produire d'abord les fichiers : node worker/tests/test_audio.mjs /tmp/claude-0/audio_out"""
import os, sys, boto3, requests, psycopg2, glob

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
SRC = os.environ.get("AUDIO_DIR", "/tmp/claude-0/audio_out")


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


s3 = boto3.client("s3", endpoint_url=os.environ.get("TEST_S3", "http://127.0.0.1:5599"), region_name="us-east-1", aws_access_key_id=os.environ.get("S3_ACCESS_KEY", "x"), aws_secret_access_key=os.environ.get("S3_SECRET_KEY", "x"))
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(access, audio):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,access,publication,video_status,audio_status,duration_seconds) values('Audio','X','upload','k',%s,%s,'published','ready',%s,20) returning id", (aid, access, audio))
    return cur.fetchone()[0]


def push(tid):
    for f in glob.glob(SRC + "/*"):
        s3.put_object(Bucket="majlis-videos", Key=f"hls/{tid}/audio/{os.path.basename(f)}", Body=open(f, "rb").read())
    s3.put_object(Bucket="majlis-videos", Key=f"hls/{tid}/master.m3u8", Body=b"#EXTM3U\n")


free, prem, noaud = mk("free", "ready"), mk("premium", "ready"), mk("free", "none")
push(free); push(prem)

t = requests.get(f"{B}/talks/{free}", headers=A).json()
ok(t.get("audioPath", "").startswith(f"/hls/{free}/audio/index.m3u8?t="), "audioPath présent (audio prêt)")
ok("audio_status" not in t, "colonne interne non exposée")
r = requests.get(B + t["audioPath"])
ok(r.status_code == 200 and "#EXT-X-MAP" in r.text and "http" in r.text and r.text.count("#EXTINF") == 4, "playlist audio réécrite avec liens signés (4 segments)")
seg = [l for l in r.text.split("\n") if l.startswith("http") and ".m4s" in l][0]
ok(requests.get(seg).status_code == 200, "segment audio téléchargeable via lien signé")
ok(requests.get(f"{B}/hls/{free}/audio/index.m3u8").status_code == 403, "sans jeton : refusé")
ok(requests.get(f"{B}/hls/{free}/audio/index.m3u8?t=faux").status_code == 403, "jeton invalide : refusé")
ok(requests.get(f"{B}/hls/{free}/audio/autre.m3u8?t=x").status_code == 404, "autre chemin : 404")
ok("audioPath" not in requests.get(f"{B}/talks/{noaud}", headers=A).json(), "pas d'audioPath si audio indisponible")

# Contenu premium vu par un visiteur : aperçu seulement, playlist audio tronquée
v = requests.get(f"{B}/talks/{prem}").json()
ok(v.get("locked") and v.get("preview") and "audioPath" in v, "visiteur : aperçu avec audioPath")
requests.put(B + "/admin/settings", headers=A, json={"values": {"preview_seconds": "6"}})
v = requests.get(f"{B}/talks/{prem}").json()
rp = requests.get(B + v["audioPath"])
ok(rp.status_code == 200 and rp.text.count("#EXTINF") < 4 and "#EXT-X-ENDLIST" in rp.text, "aperçu audio tronqué (%d segments)" % rp.text.count("#EXTINF"))
requests.put(B + "/admin/settings", headers=A, json={"values": {"preview_seconds": None}})
print("ALL OK")
