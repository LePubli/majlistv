"""archive.org : ajout par lien, lecture directe (lecteur Mejliss TV), aperçu premium, transcription, import de collection.
Prérequis : API (3055) et transcripteur factice lancés avec ARCHIVE_BASE_URL=http://127.0.0.1:5600, faux archive.org (fake_archive.py)."""
import sys, time, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


adm = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()
A = {"authorization": "Bearer " + adm["token"]}


def create(url, rights=False, access="free", title="Conf archive"):
    return requests.post(B + "/talks", headers=A, json={"title": title, "language": "fr", "access": access, "videoUrl": url,
                                                        "rightsConfirmed": rights, "translateTo": []})


# 1) Liens refusés avec un message clair
for url, word in [("https://archive.org/details/restricted-item", "restreint"), ("https://archive.org/details/no-video", "Aucun fichier"),
                  ("https://archive.org/details/my-collection", "collection")]:
    r = create(url)
    ok(r.status_code == 400 and word in r.json().get("error", "") and r.json().get("code") == "archive", f"{url.rsplit('/', 1)[1]} : {r.json().get('error')}")

# 2) Ajout par lien : meilleur fichier MP4 choisi, métadonnées reprises
r = create("https://archive.org/details/conf-patience-1938", rights=True)
ok(r.status_code == 201, "élément archive.org ajouté")
t1 = r.json()["id"]
cur.execute("select source, video_ref, external_file, duration_seconds, external_thumb, description from talks where id=%s", (t1,))
src, ref, f, dur, thumb, desc = cur.fetchone()
ok((src, ref, f, dur) == ("archive", "conf-patience-1938", "conf.mp4", 6), f"fichier H.264 préféré à MPEG2 / Ogg / 512Kb ({f}, {dur} s)")
ok(thumb.endswith("/services/img/conf-patience-1938") and "<" not in desc, "miniature et description (HTML retiré)")
ok(create("https://archive.org/details/conf-patience-1938").status_code == 409, "doublon refusé")

# 3) Page : lecture directe du fichier avec le lecteur Mejliss TV
pub = requests.get(f"{B}/talks/{t1}").json()
ok(pub["fileUrl"].endswith("/download/conf-patience-1938/conf.mp4") and "external_file" not in pub, "page : fichier vidéo direct (pas de lecteur archive.org)")
h = requests.head(pub["fileUrl"], allow_redirects=True)
ok(h.status_code == 200 and h.headers.get("accept-ranges") == "bytes", "fichier lisible par plages (redirection suivie)")

# 4) Transcription : ffmpeg lit l'audio depuis l'adresse du fichier, puis Whisper
for _ in range(80):
    cur.execute("select transcript_status, transcript_method, transcript_error from talks where id=%s", (t1,)); st = cur.fetchone()
    if st[0] in ("ready", "failed", "unavailable"):
        break
    time.sleep(0.5)
ok(st[0] == "ready" and st[1] == "whisper", f"transcription Whisper : {st}")
cur.execute("select lang from talk_insights where talk_id=%s order by lang", (t1,))

# 5) Lien de téléchargement direct d'un fichier précis + premium : aperçu limité
r = create("https://archive.org/download/conf-b/b_512kb.mp4", access="premium", title="Premium archive")
ok(r.status_code == 201, "lien /download/<élément>/<fichier> accepté")
t2 = r.json()["id"]
anon = requests.get(f"{B}/talks/{t2}").json()
ok(anon.get("locked") and anon.get("preview") and anon.get("fileUrl", "").endswith("/conf-b/b_512kb.mp4") and anon.get("previewSeconds"),
   f"premium sans abonnement : aperçu de {anon.get('previewSeconds')} s")
cur.execute("select duration_seconds from talks where id=%s", (t2,))
ok(cur.fetchone()[0] == 6, "durée « 00:00:06 » comprise")

# 6) Import d'une collection et d'une recherche archive.org
requests.delete(f"{B}/talks/{t2}", headers=A)
for url in ["https://archive.org/details/my-collection", "https://archive.org/search?query=patience"]:
    j = requests.post(B + "/imports", headers=A, json={"url": url}).json()
    for _ in range(40):
        j = requests.get(f"{B}/imports/{j['id']}", headers=A).json()
        if j["status"] != "listing":
            break
        time.sleep(0.5)
    ent = {e["id"]: e for e in j.get("entries", [])}
    ok(j["status"] == "listed" and set(ent) == {"conf-patience-1938", "conf-b"} and ent["conf-patience-1938"]["already"] and not ent["conf-b"]["already"],
       f"import {url.split('archive.org')[1]} : {j.get('title')} ({len(ent)} vidéos, déjà importée repérée)")
r = requests.post(f"{B}/imports/{j['id']}/confirm", headers=A, json={"ids": ["conf-b"], "rightsConfirmed": False, "language": "fr"}).json()
ok(r["created"] == 1, "conf-b importée")
cur.execute("select id, external_file from talks where source='archive' and video_ref='conf-b'")
t3, f3 = cur.fetchone()
ok(f3 is None, "fichier pas encore choisi (import rapide)")
pub = requests.get(f"{B}/talks/{t3}").json()
cur.execute("select external_file from talks where id=%s", (t3,))
ok(pub.get("fileUrl", "").endswith("/conf-b/b_512kb.mp4") and cur.fetchone()[0] == "b_512kb.mp4", "fichier choisi au premier affichage")
cat = requests.get(B + "/talks").json()
ok(any(x["id"] == t1 and x["source"] == "archive" and x["posterUrl"] for x in cat), "catalogue : carte archive.org avec miniature")

print("\nTous les tests archive.org sont passés.")
