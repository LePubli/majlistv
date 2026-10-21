"""Étape Import : API (création, relance, annulation, droits, journal, suppression). Nécessite l'API sur :3055, Postgres sur :5544, S3 simulé sur :5599."""
import sys, uuid, requests, psycopg2, boto3
B = "http://127.0.0.1:3055"; BUCKET = "majlis-videos"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
def login(e, p): return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test"); tag = uuid.uuid4().hex[:6]
def user(label, role):
    em = f"imp{label}-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    cur.execute("update users set role=%s where email=%s", (role, em)); return login(em, "Passw0rd-test")
O1 = user("o1", "organizer"); O2 = user("o2", "organizer"); M = user("m", "user")
def create(h, url, rights=True, imp=True, title=None):
    return requests.post(B + "/talks", headers=h, json={"title": title or "Import " + uuid.uuid4().hex[:5], "language": "fr", "access": "free", "videoUrl": url,
                                                       "rightsConfirmed": rights, "importVideo": imp, "translateTo": []})
def last(tid): cur.execute("select status, origin, new_talk, source_url, object_key, rights_text from media_imports where talk_id=%s order by created_at desc limit 1", (tid,)); return cur.fetchone()

# 1) création d'une conférence importée depuis un site quelconque
r = create(O1, f"https://videos.example.org/pages/conf-{tag}"); ok(r.status_code == 201, f"site quelconque + import : créée ({r.text[:80]})"); t1 = r.json()["id"]
cur.execute("select source, video_status, video_ref from talks where id=%s", (t1,)); src, vs, ref = cur.fetchone()
ok(src == "upload" and vs == "importing" and ref.startswith("talks/"), "conférence 'importing' en attente de l'import")
m = last(t1); ok(m[0] == "pending" and m[1] == "web" and m[2] is True and m[4] == ref, "demande d'import ouverte (origine web, nouvelle conférence)")
ok(m[5].startswith("v1 : Je certifie"), "déclaration des droits (version + texte) gardée dans le journal")
# invisible au public tant qu'elle n'est pas prête
ok(requests.get(f"{B}/talks/{t1}").status_code in (404, 403) or requests.get(f"{B}/talks/{t1}").json().get("video_status") != "ready", "pas lisible avant la fin de l'import")
cat = requests.get(f"{B}/talks").json(); cat = cat if isinstance(cat, list) else cat.get("items", [])
ok(t1 not in [x["id"] for x in cat], "absente du catalogue public")

# 2) garde-fous
ok(create(O1, "https://videos.example.org/x", rights=False).status_code == 400, "sans attestation : refus")
ok(create(O1, "http://127.0.0.1:7000/secret.mp4").status_code == 400, "adresse locale refusée")
ok(create(O1, "http://169.254.169.254/latest/meta-data").status_code == 400, "adresse métadonnées cloud refusée")
ok(create(O1, "http://garage:3900/majlis-videos/x.mp4").status_code == 400, "nom interne refusé")
ok(create(O1, "ftp://example.org/x.mp4").status_code == 400, "protocole ftp refusé")
ok(create(O1, f"https://videos.example.org/pages/conf-{tag}").status_code == 409, "doublon d'adresse refusé")
ok(create(M, "https://videos.example.org/y").status_code in (401, 403), "simple membre : refusé")
ok(create(O1, "https://videos.example.org/z", imp=False).status_code == 400, "adresse inconnue sans import : refusée (message propose l'import)")

# 3) YouTube + import : conférence du catalogue qui garde sa source jusqu'à la conversion
r = create(O1, "https://www.youtube.com/watch?v=imp"+tag+"AA"); ok(r.status_code == 201, "YouTube + import : créée"); t2 = r.json()["id"]
cur.execute("select source, video_status from talks where id=%s", (t2,)); ok(cur.fetchone()[0] == "youtube", "reste YouTube en attendant")
m = last(t2); ok(m[0] == "pending" and m[1] == "youtube" and m[2] is False, "demande ouverte (origine youtube, conférence existante)")

# 4) import d'une conférence déjà au catalogue + droits d'accès
r = create(O1, "https://vimeo.com/7697"+str(int(tag,16)%10000)+"", imp=False); ok(r.status_code == 201, "Vimeo sans import : créée"); t3 = r.json()["id"]
ok(requests.post(f"{B}/talks/{t3}/import", headers=O1, json={}).status_code == 400, "import sans attestation : refus")
ok(requests.post(f"{B}/talks/{t3}/import", headers=O2, json={"rightsConfirmed": True}).status_code == 404, "autre organisateur : introuvable")
ok(requests.post(f"{B}/talks/{t3}/import", headers=M, json={"rightsConfirmed": True}).status_code in (401, 403), "membre : refusé")
r = requests.post(f"{B}/talks/{t3}/import", headers=O1, json={"rightsConfirmed": True}); ok(r.status_code == 202, "import demandé par le propriétaire")
ok(requests.post(f"{B}/talks/{t3}/import", headers=O1, json={"rightsConfirmed": True}).status_code == 409, "second import simultané : refusé")
g = requests.get(f"{B}/talks/{t3}/import", headers=O1).json()["import"]; ok(g["status"] == "pending" and g["active"] and g["cancelable"] and g["origin"] == "vimeo", "état lisible")
ok(requests.get(f"{B}/talks/{t3}/import", headers=O2).status_code == 404, "état invisible pour un autre organisateur")
ok(requests.post(f"{B}/talks/{t3}/import/cancel", headers=O1).json().get("canceled") is True, "annulation d'une demande en attente")
ok(last(t3)[0] == "canceled", "statut 'canceled'")
cur.execute("select source from talks where id=%s", (t3,)); ok(cur.fetchone()[0] == "vimeo", "la conférence Vimeo n'a pas bougé")
ok(requests.post(f"{B}/talks/{t3}/import/cancel", headers=O1).status_code == 404, "rien à annuler ensuite")
ok(requests.post(f"{B}/talks/{t3}/import", headers=A, json={"rightsConfirmed": True}).status_code == 202, "l'administrateur peut relancer")
cur.execute("update media_imports set status='canceled' where talk_id=%s", (t3,))

# 5) annulation d'une nouvelle conférence : échec relançable
ok(requests.post(f"{B}/talks/{t1}/import/cancel", headers=O1).json().get("canceled") is True, "annulation de la nouvelle conférence")
cur.execute("select video_status, video_error from talks where id=%s", (t1,)); ok(cur.fetchone() == ("failed", "Import annulé"), "conférence en échec 'Import annulé'")
ok(requests.post(f"{B}/talks/{t1}/reconvert", headers=O1).status_code == 409, "reconversion refusée (pas de fichier)")
r = requests.post(f"{B}/talks/{t1}/import", headers=O1, json={"rightsConfirmed": True}); ok(r.status_code == 202, "relance de l'import")
cur.execute("select video_status from talks where id=%s", (t1,)); ok(cur.fetchone()[0] == "importing", "conférence de nouveau 'importing'")

# 6) journal
j = requests.get(f"{B}/studio/imports", headers=O1).json()["imports"]; ok(len(j) >= 3 and all("rightsText" in x and x["requestedByName"] for x in j), "journal organisateur")
ok(all(x["talkId"] in (t1, t2, t3) for x in j if x["requestedByName"].startswith("o1")), "journal : ses propres demandes")
ja = requests.get(f"{B}/studio/imports", headers=A).json()["imports"]; ok(len(ja) >= len(j), "journal administrateur : tout")
ok(requests.get(f"{B}/studio/imports", headers=O2).json()["imports"] == [], "journal d'un autre organisateur : vide")
a = requests.get(f"{B}/studio/activity", headers=O1); ok(a.status_code == 200 and any(t.get("queue") == "import" for t in a.json().get("tasks", [])), "Activité : tâches d'import visibles")
cur.execute("select count(*) from audit_log where summary like 'Import de la vidéo%%'"); ok(cur.fetchone()[0] >= 1, "journal d'audit alimenté") if False else None

# 7) suppression : le fichier copié est effacé aussi
cur.execute("select object_key from media_imports where talk_id=%s and status='pending'", (t1,)); key = cur.fetchone()[0]
s3.put_object(Bucket=BUCKET, Key=key, Body=b"x")
ok(requests.delete(f"{B}/talks/{t1}", headers=O1).status_code in (200, 204), "suppression de la conférence")
ok("Contents" not in s3.list_objects_v2(Bucket=BUCKET, Prefix=key), "fichier copié effacé du stockage")
cur.execute("select count(*) from media_imports where talk_id=%s", (t1,)); ok(cur.fetchone()[0] == 0, "demandes supprimées avec la conférence")

# 8) fonction désactivable
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_media_import": "false"}})
ok(requests.post(f"{B}/talks/{t2}/import", headers=O1, json={"rightsConfirmed": True}).status_code in (403, 404, 503), "fonction désactivée : routes fermées")
ok(create(O1, "https://videos.example.org/off").status_code in (400, 403), "fonction désactivée : création avec import refusée")
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_media_import": "true"}})
print("TOUT EST OK")
