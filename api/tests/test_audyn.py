"""Audyn (étape 1) : contenus audio (livres audio adultes, histoires du soir enfants) — création, couverture, envoi multipart des chapitres,
attestation de droits (journal), ordre/titres/suppression, publication, accès (formule « Apprentissage », aperçu coupé par le serveur), RGPD/droits.
Prérequis : API (3055), PG de test (5544), compte admin admin@test.local, ffmpeg. Avec le stockage de test (S3_ENDPOINT, moto sur 5599) les envois sont
vraiment faits ; sans stockage (cas de GitHub Actions) seules les parties qui n'en ont pas besoin sont jouées (message SKIP)."""
import io, os, subprocess, sys, tempfile, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw="Passw0rd-test"):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(tier=None):
    email = f"ay-{uuid.uuid4().hex[:8]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Ay Test"})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    return login(email), uid


A = login("admin@test.local", "AdminPassw0rd-test")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_audyn_preview_seconds": "120"}})  # remet le réglage par défaut (un essai précédent interrompu)
USR, _ = member(); LRN, _ = member("learning"); STD, _ = member("standard")
ORG, uorg = member(); cur.execute("update users set role='organizer' where id=%s", (uorg,)); ORG = login([r for r in [cur.execute("select email from users where id=%s", (uorg,)) or cur.fetchone()][0]][0])

# --- Droits : administrateur seulement
ok(requests.get(B + "/studio/audyn").status_code == 401, "gestion : connexion obligatoire")
ok(requests.get(B + "/studio/audyn", headers=USR).status_code == 403, "gestion : un membre est refusé")
ok(requests.get(B + "/studio/audyn", headers=ORG).status_code == 403, "gestion : un organisateur est refusé")
ok(requests.post(B + "/studio/audyn", headers=USR, json={"title": "x"}).status_code == 403, "création : un membre est refusé")

# --- Création / modification
title = "Livre audio " + uuid.uuid4().hex[:6]
r = requests.post(B + "/studio/audyn", headers=A, json={"title": "  " + title + "  ", "narrator": "Narrateur", "audience": "adults", "category": "Spiritualité"})
ok(r.status_code == 201 and r.json()["title"] == title and r.json()["status"] == "draft", "création : brouillon, titre nettoyé")
ID = r.json()["id"]
ok(requests.post(B + "/studio/audyn", headers=A, json={"title": ""}).status_code == 400, "titre vide refusé")
ok(requests.post(B + "/studio/audyn", headers=A, json={"title": "x", "audience": "tous"}).status_code == 400, "public inconnu refusé")
ok(requests.post(B + "/studio/audyn", headers=A, json={"title": "x", "inconnu": 1}).status_code == 400, "champ inconnu refusé")
ok(requests.patch(f"{B}/studio/audyn/{ID}", headers=A, json={"narrator": "Autre", "access": "learning"}).json()["narrator"] == "Autre", "modification")
ok(requests.patch(f"{B}/studio/audyn/{ID}", headers=A, json={"status": "published"}).status_code == 400, "publication refusée sans chapitre")
ok(requests.get(f"{B}/audyn/{ID}").status_code == 404, "brouillon : invisible du public")
ok(requests.get(f"{B}/studio/audyn/{uuid.uuid4()}", headers=A).status_code == 404, "contenu inconnu : 404")
cur.execute("select count(*) from audit_log where summary like %s", (f"Audyn : « {title} » créé",)); ok(cur.fetchone()[0] == 1, "journal d'audit : création")

L = requests.get(B + "/studio/audyn", headers=A).json()
storage = L["storage"]
ok(any(i["id"] == ID for i in L["items"]) and L["limits"]["previewSeconds"] == 120 and L["limits"]["maxMb"] == 500, "liste admin + limites par défaut")

if not storage:
    print("SKIP stockage non configuré : envois, aperçu et écoute non testés ici (voir test avec S3 de test, moto 5599)")
    requests.delete(f"{B}/studio/audyn/{ID}", headers=A)
    print("OK   test_audyn (sans stockage)"); sys.exit(0)

# --- Fichiers audio de test (vrais MP3 de 20 s générés par ffmpeg)
tmp = tempfile.mkdtemp()


def mp3(name, freq):
    p = os.path.join(tmp, name)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration=20", "-b:a", "64k", p], check=True)
    return open(p, "rb").read()


DATA = [mp3("c1.mp3", 440), mp3("c2.mp3", 550), mp3("c3.mp3", 660)]


def start(item, data, name, rights=True, ctype="audio/mpeg", dur=20, **kw):
    body = {"filename": name, "size": len(data), "contentType": ctype, "durationSeconds": dur, "title": kw.get("title", ""), "rights": rights}
    return requests.post(f"{B}/studio/audyn/{item}/uploads", headers=A, json=body)


def send(item, data, name, **kw):
    s = start(item, data, name, **kw)
    if s.status_code != 201:
        return s, None
    j = s.json(); size = j["partSize"]; parts = []
    for i, url in enumerate(j["urls"]):
        pr = requests.put(url, data=data[i * size:(i + 1) * size]); parts.append({"PartNumber": i + 1, "ETag": pr.headers["ETag"]})
    return requests.post(f"{B}/studio/audyn/uploads/{j['id']}/complete", headers=A, json={"parts": parts}), j["id"]


# --- Attestation de droits obligatoire, formats et taille
ok(start(ID, DATA[0], "c1.mp3", rights=False).status_code == 400, "envoi refusé sans attestation de droits")
ok(start(ID, DATA[0], "c1.wav", ctype="audio/wav").status_code == 400, "WAV refusé")
ok(start(ID, DATA[0], "c1.mp4", ctype="video/mp4").status_code == 400, "vidéo refusée")
big = requests.post(f"{B}/studio/audyn/{ID}/uploads", headers=A, json={"filename": "g.mp3", "size": 501 * 1048576, "contentType": "audio/mpeg", "rights": True})
ok(big.status_code == 413, "501 Mo refusé (limite 500 Mo)")
ok(requests.post(f"{B}/studio/audyn/{ID}/uploads", headers=USR, json={"filename": "a.mp3", "size": 10, "contentType": "audio/mpeg", "rights": True}).status_code == 403, "envoi : un membre est refusé")

# --- Envois réels
ids = []
for n, (d, nm) in enumerate(zip(DATA, ["01 Introduction.mp3", "02 Chapitre.mp3", "03 Fin.mp3"])):
    r, uid = send(ID, d, nm, title="Chapitre " + str(n + 1))
    ok(r.status_code == 201 and r.json()["position"] == n + 1 and r.json()["title"] == f"Chapitre {n + 1}" and r.json()["durationSeconds"] == 20, f"chapitre {n + 1} envoyé et classé")
    ids.append(r.json()["id"])
r, _ = send(ID, DATA[0], "Sans titre.mp3")
ok(r.json()["title"] == "Sans titre", "titre par défaut = nom du fichier sans extension"); extra = r.json()["id"]
cur.execute("select count(*) from audyn_rights_log where item_id=%s", (ID,)); ok(cur.fetchone()[0] == 4, "journal des droits : une ligne par fichier")
J = requests.get(B + "/studio/audyn-rights", headers=A).json()
ok(J[0]["itemTitle"] == title and "admin@test.local" in J[0]["by"], "journal : titre et auteur de l'envoi")
ok(requests.get(B + "/studio/audyn-rights", headers=USR).status_code == 403, "journal : réservé à l'administrateur")
ok(requests.post(f"{B}/studio/audyn/uploads/{uuid.uuid4()}/complete", headers=A, json={"parts": [{"PartNumber": 1, "ETag": "x"}]}).status_code == 404, "assemblage d'un envoi inconnu : 404")

# --- Envoi abandonné
s = start(ID, DATA[0], "abandon.mp3").json()
ok(requests.delete(f"{B}/studio/audyn/uploads/{s['id']}", headers=A).status_code == 204, "envoi annulé")
ok(requests.post(f"{B}/studio/audyn/uploads/{s['id']}/complete", headers=A, json={"parts": [{"PartNumber": 1, "ETag": "x"}]}).status_code == 404, "envoi annulé : plus assemblable")

# --- Titres, ordre, suppression
ok(requests.patch(f"{B}/studio/audyn/{ID}/chapters/{ids[0]}", headers=A, json={"title": "Prologue"}).json()["title"] == "Prologue", "chapitre renommé")
ok(requests.patch(f"{B}/studio/audyn/{ID}/chapters/{ids[0]}", headers=A, json={"title": " "}).status_code == 400, "titre de chapitre vide refusé")
ok(requests.put(f"{B}/studio/audyn/{ID}/chapters-order", headers=A, json={"ids": [ids[2], ids[1], ids[0]]}).status_code == 400, "ordre incomplet refusé (4 chapitres)")
ok(requests.put(f"{B}/studio/audyn/{ID}/chapters-order", headers=A, json={"ids": [ids[2], ids[1], ids[0], extra]}).status_code == 200, "ordre changé")
D = requests.get(f"{B}/studio/audyn/{ID}", headers=A).json()
ok([c["id"] for c in D["chapters"]] == [ids[2], ids[1], ids[0], extra] and [c["position"] for c in D["chapters"]] == [1, 2, 3, 4], "ordre enregistré, positions 1..4")
ok(D["durationSeconds"] == 80, "durée totale = somme des chapitres")
ok(requests.delete(f"{B}/studio/audyn/{ID}/chapters/{extra}", headers=A).status_code == 204, "chapitre supprimé")
D = requests.get(f"{B}/studio/audyn/{ID}", headers=A).json()
ok([c["position"] for c in D["chapters"]] == [1, 2, 3], "positions resserrées après suppression")

# --- Couverture
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
ok(requests.post(f"{B}/studio/audyn/{ID}/cover-url", headers=A, json={"contentType": "image/svg+xml", "size": 10}).status_code == 400, "couverture SVG refusée")
ok(requests.post(f"{B}/studio/audyn/{ID}/cover-url", headers=A, json={"contentType": "image/png", "size": 6 * 1048576}).status_code == 400, "couverture de 6 Mo refusée")
cu = requests.post(f"{B}/studio/audyn/{ID}/cover-url", headers=A, json={"contentType": "image/png", "size": len(PNG)}).json()
requests.put(cu["url"], data=PNG, headers={"Content-Type": "image/png"})
ok(requests.post(f"{B}/studio/audyn/{ID}/cover", headers=A, json={"key": cu["key"]}).status_code == 200, "couverture enregistrée")
ok(requests.post(f"{B}/studio/audyn/{ID}/cover", headers=A, json={"key": "audyn/autre/cover-x.png"}).status_code == 400, "couverture d'un autre contenu refusée")
ok(requests.get(f"{B}/studio/audyn/{ID}", headers=A).json()["coverUrl"].startswith("http"), "couverture : lien d'affichage")

# --- Publication et accès
ok(requests.patch(f"{B}/studio/audyn/{ID}", headers=A, json={"status": "published"}).json()["status"] == "published", "publication")
cur.execute("update audyn_items set status='published' where id=%s", (ID,))
PUB = requests.get(B + "/audyn").json()
mine = [i for i in PUB["items"] if i["id"] == ID]
ok(len(mine) == 1 and mine[0]["chapters"] == 3 and mine[0]["full"] is False and "Spiritualité" in PUB["categories"], "liste publique : visible, accès partiel pour un visiteur")
ok(requests.get(B + "/audyn", headers=LRN).json()["items"][[i["id"] for i in requests.get(B + "/audyn", headers=LRN).json()["items"]].index(ID)]["full"] is True, "liste publique : accès complet pour « Apprentissage »")
ok(any(i["id"] == ID for i in requests.get(B + "/audyn", params={"q": title[:8].lower()}).json()["items"]), "recherche par titre")
ok(not any(i["id"] == ID for i in requests.get(B + "/audyn", params={"category": "Autre"}).json()["items"]), "filtre par catégorie")
for k in ("audio_key", "audioKey", "key"):
    ok(k not in requests.get(f"{B}/audyn/{ID}").text, f"fiche publique : pas de clé de stockage ({k})")
V = requests.get(f"{B}/audyn/{ID}").json()
ok(V["access"] == {"full": False, "previewSeconds": 120, "learningRequired": True} and [c["playable"] for c in V["chapters"]] == [True, False, False], "visiteur : seul le premier chapitre est jouable")
ok(all(c["playable"] for c in requests.get(f"{B}/audyn/{ID}", headers=LRN).json()["chapters"]), "« Apprentissage » : tous les chapitres jouables")
ok(requests.get(f"{B}/audyn/{ID}", headers=STD).json()["access"]["full"] is False, "formule standard : pas d'accès complet")
FIRST, SECOND = V["chapters"][0]["id"], V["chapters"][1]["id"]

pl = requests.get(f"{B}/audyn/{ID}/chapters/{FIRST}/play").json()
ok(pl["preview"] is True and pl["url"].endswith(f"/chapters/{FIRST}/preview") and pl["limitSeconds"] == 120, "visiteur : lien d'aperçu")
ok(requests.get(f"{B}/audyn/{ID}/chapters/{SECOND}/play").status_code == 403, "visiteur : 2e chapitre refusé")
ok(requests.get(f"{B}/audyn/{ID}/chapters/{SECOND}/preview").status_code == 403, "aperçu direct du 2e chapitre refusé")
ok(requests.get(f"{B}/audyn/{ID}/chapters/{uuid.uuid4()}/play").status_code == 404, "chapitre inconnu : 404")
full = requests.get(f"{B}/audyn/{ID}/chapters/{SECOND}/play", headers=LRN).json()
ok(full["preview"] is False and full["url"].startswith("http"), "« Apprentissage » : lien signé")
ok(requests.get(full["url"]).content == DATA[1], "le lien signé renvoie le fichier complet")
# Aperçu coupé par le SERVEUR : réglage au minimum (10 s) sur un fichier de 20 s → un peu plus de la moitié du fichier
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_audyn_preview_seconds": "10"}})
V2 = requests.get(f"{B}/audyn/{ID}").json()
ok(V2["access"]["previewSeconds"] == 10, "l'aperçu suit le réglage (10 s)")
rp = requests.get(B + pl["url"]); got = rp.content
ok(rp.status_code == 200 and rp.headers["Content-Type"] == "audio/mpeg" and int(rp.headers["Content-Length"]) == len(got), "aperçu : audio/mpeg, longueur annoncée exacte")
ok(0.4 * len(DATA[2]) < len(got) < 0.75 * len(DATA[2]) and got == DATA[2][:len(got)], f"aperçu de 10 s : {len(got)} octets sur {len(DATA[2])} (début du fichier, coupé par le serveur)")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_audyn_preview_seconds": "120"}})
# Contenu ouvert à tous
requests.patch(f"{B}/studio/audyn/{ID}", headers=A, json={"access": "free"})
ok(all(c["playable"] for c in requests.get(f"{B}/audyn/{ID}").json()["chapters"]), "contenu « ouvert à tous » : tout jouable par un visiteur")
requests.patch(f"{B}/studio/audyn/{ID}", headers=A, json={"access": "learning"})

# --- Histoires du soir : pas dans la liste adulte (elles passent par l'espace Kids, étape 4)
rk = requests.post(B + "/studio/audyn", headers=A, json={"title": "Histoire du soir " + uuid.uuid4().hex[:5], "audience": "kids"}).json()
r, _ = send(rk["id"], DATA[0], "h.mp3"); requests.patch(f"{B}/studio/audyn/{rk['id']}", headers=A, json={"status": "published"})
ok(not any(i["id"] == rk["id"] for i in requests.get(B + "/audyn").json()["items"]), "histoire enfant : absente de la liste adulte")
ok(requests.get(f"{B}/audyn/{rk['id']}").status_code == 404, "histoire enfant : fiche adulte introuvable")
rb = requests.post(B + "/studio/audyn", headers=A, json={"title": "Les deux " + uuid.uuid4().hex[:5], "audience": "both"}).json()
send(rb["id"], DATA[0], "b.mp3"); requests.patch(f"{B}/studio/audyn/{rb['id']}", headers=A, json={"status": "published"})
ok(any(i["id"] == rb["id"] for i in requests.get(B + "/audyn").json()["items"]), "contenu « adultes et enfants » : visible côté adulte")

# --- Repasser en brouillon / fonction coupée
requests.patch(f"{B}/studio/audyn/{ID}", headers=A, json={"status": "draft"})
ok(requests.get(f"{B}/audyn/{ID}").status_code == 404, "retour en brouillon : invisible")

# --- Suppression : fichiers du stockage effacés
import boto3
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
before = [o["Key"] for o in s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"audyn/{ID}/").get("Contents", [])]
ok(len(before) >= 4, f"{len(before)} fichiers dans le stockage (3 chapitres + couverture)")
ok(requests.delete(f"{B}/studio/audyn/{ID}", headers=A).status_code == 204, "contenu supprimé")
after = s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"audyn/{ID}/").get("Contents", [])
ok(len(after) == 0, "fichiers du stockage supprimés")
cur.execute("select count(*) from audyn_chapters where item_id=%s", (ID,)); ok(cur.fetchone()[0] == 0, "chapitres supprimés en cascade")
cur.execute("select count(*) from audyn_rights_log where item_id=%s", (ID,)); ok(cur.fetchone()[0] == 4, "le journal des droits est conservé après suppression")
for x in (rk["id"], rb["id"]):
    requests.delete(f"{B}/studio/audyn/{x}", headers=A)
print("OK   test_audyn")
