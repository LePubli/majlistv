"""25 : ouvrages — fiche, PDF (envoi direct, droits confirmés), liens boutique, rattachements, téléchargement filigrané (Apprentissage).
Prérequis : API (3055), PG de test (5544), stockage S3 de test (moto, bucket majlis-videos)."""
import io, subprocess, sys, uuid, requests, psycopg2
from pypdf import PdfReader

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(name="Amina Test", role=None):
    email = f"bk-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": name})
    if role:
        cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,))
    return login(email, "Passw0rd-test"), cur.fetchone()[0], email


def subscribe(uid, tier):
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:8], uid, tier))


def make_pdf(pages=3):
    js = f"import {{PDFDocument,StandardFonts}} from 'pdf-lib';const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);for(let i=1;i<={pages};i++){{const p=d.addPage([420,595]);p.drawText('Page '+i+' du livre de test',{{x:40,y:500,size:16,font:f}})}};process.stdout.write(Buffer.from(await d.save()));"
    return subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, cwd="/home/claude/majlis-tv/api", check=True).stdout


ADM = login("admin@test.local", "AdminPassw0rd-test")
O1, uo1, _ = member("Orga Un", "organizer"); O2, uo2, _ = member("Orga Deux", "organizer")
FREE, ufree, _ = member(); STD, ustd, _ = member(); subscribe(ustd, "standard")
LRN, ulrn, lrn_email = member("Yacine Apprenant"); subscribe(ulrn, "learning")
tag = uuid.uuid4().hex[:6]
pdf = make_pdf(3)
ok(pdf[:5] == b"%PDF-", "PDF de test fabriqué")


def upload(h, bid, lang, data=pdf, rights=True, ctype="application/pdf"):
    r = requests.post(f"{B}/studio/books/{bid}/pdf/{lang}/upload-url", headers=h, json={"size": len(data)})
    if r.status_code != 200:
        return r
    u = r.json()
    requests.put(u["url"], data=data, headers={"Content-Type": ctype}).raise_for_status()
    return requests.post(f"{B}/studio/books/{bid}/pdf/{lang}/confirm", headers=h, json={"key": u["key"], "fileName": "livre.pdf", "rightsConfirmed": rights})


# --- accès Studio
ok(requests.get(f"{B}/studio/books").status_code in (401, 403) and requests.get(f"{B}/studio/books", headers=STD).status_code == 403, "Studio ouvrages : réservé aux organisateurs")
r = requests.post(f"{B}/studio/books", headers=O1, json={"title": ""}); ok(r.status_code == 400, "titre obligatoire")
r = requests.post(f"{B}/studio/books", headers=O1, json={"title": f"Le livre de la patience {tag}", "author": "Cheikh Test", "description": "Un ouvrage pour apprendre la patience."})
ok(r.status_code == 201 and r.json()["published"] is False, "ouvrage créé, non publié")
bid = r.json()["id"]
ok(requests.get(f"{B}/studio/books/{bid}", headers=O2).status_code == 404, "pas l'ouvrage d'un autre organisateur")
ok(requests.get(f"{B}/studio/books/{bid}", headers=ADM).status_code == 200, "l'admin voit tous les ouvrages")
ok(requests.patch(f"{B}/studio/books/{bid}", headers=O1, json={"published": True}).json().get("code") == "no_edition", "publication refusée sans PDF ni lien boutique")
ok(requests.get(f"{B}/books/{bid}").status_code == 404 and all(x["id"] != bid for x in requests.get(f"{B}/books").json()), "non publié : invisible du public")

# --- PDF et droits
r = upload(O1, bid, "fr", rights=False); ok(r.status_code == 400 and r.json()["code"] == "rights_required", "PDF refusé sans « droits confirmés »")
r = upload(O1, bid, "fr", data=b"ceci n'est pas un pdf"); ok(r.status_code == 400 and r.json()["code"] == "bad_pdf", "fichier qui n'est pas un PDF refusé")
r = requests.post(f"{B}/studio/books/{bid}/pdf/fr/upload-url", headers=O1, json={"size": 999 * 1024 * 1024}); ok(r.status_code == 400 and r.json()["code"] == "too_big", "PDF trop lourd refusé")
ok(requests.post(f"{B}/studio/books/{bid}/pdf/fr/upload-url", headers=O2, json={}).status_code == 404, "envoi par un autre organisateur refusé")
ok(requests.post(f"{B}/studio/books/{bid}/pdf/FRA!/upload-url", headers=O1, json={}).status_code == 400, "code de langue invalide refusé")
r = upload(O1, bid, "fr"); ok(r.status_code == 201, "PDF français envoyé et vérifié")
f = r.json()["files"][0]; ok(f["lang"] == "fr" and f["pages"] == 3 and f["rightsConfirmed"] and f["sizeBytes"] == len(pdf), "3 pages, droits confirmés, taille")
r = requests.post(f"{B}/studio/books/{bid}/pdf/ar/confirm", headers=O1, json={"key": f"books/{bid}/fr-1.pdf", "rightsConfirmed": True}); ok(r.status_code == 400, "confirmation d'un fichier d'une autre langue refusée")

# --- liens boutique
ok(requests.post(f"{B}/studio/books/{bid}/links", headers=O1, json={"lang": "ar", "label": "Boutique", "url": "javascript:alert(1)"}).status_code == 400, "lien javascript: refusé")
ok(requests.post(f"{B}/studio/books/{bid}/links", headers=O1, json={"lang": "ar", "label": "Boutique", "url": "ftp://x.test/y"}).status_code == 400, "lien non http(s) refusé")
r = requests.post(f"{B}/studio/books/{bid}/links", headers=O1, json={"lang": "ar", "label": "Librairie Exemple (France)", "url": "https://shop.test/livre?aff=mejliss"}); ok(r.status_code == 201, "lien boutique arabe ajouté")
lid = r.json()["id"]
requests.post(f"{B}/studio/books/{bid}/links", headers=O1, json={"lang": "ar", "label": "Autre revendeur", "url": "https://autre.test/livre"})
ok(requests.delete(f"{B}/studio/books/{bid}/links/{lid}", headers=O2).status_code == 404, "suppression d'un lien par un autre organisateur refusée")

# --- rattachements + publication
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','S','youtube',%s,%s,'published','ready','free',600) returning id", (f"Conf livre {tag}", "v" + uuid.uuid4().hex[:9], uo1)); tid = cur.fetchone()[0]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','S','youtube',%s,%s,'published','ready','free',600) returning id", (f"Conf d'autrui {tag}", "v" + uuid.uuid4().hex[:9], uo2)); tid2 = cur.fetchone()[0]
cur.execute("insert into series(owner_id,title,published) values (%s,%s,true) returning id", (uo1, f"Série livre {tag}")); sid = cur.fetchone()[0]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','S','youtube',%s,%s,'published','ready','free',600) returning id", (f"Épisode livre {tag}", "v" + uuid.uuid4().hex[:9], uo1)); ep = cur.fetchone()[0]
cur.execute("insert into series_episodes(talk_id,series_id,position) values (%s,%s,1)", (ep, sid))
r = requests.patch(f"{B}/studio/books/{bid}", headers=O1, json={"published": True, "talkIds": [str(tid), str(tid2)], "seriesIds": [str(sid)]})
ok(r.status_code == 200 and r.json()["published"], "ouvrage publié")
ok([t["id"] for t in r.json()["talks"]] == [str(tid)], "rattachement : seules les conférences de l'organisateur sont retenues")
ok([s["id"] for s in r.json()["series"]] == [str(sid)], "rattachement à une série")

# --- public
lst = requests.get(f"{B}/books").json(); mine = next((x for x in lst if x["id"] == bid), None)
ok(mine and mine["langs"] == ["ar", "fr"] and mine["author"] == "Cheikh Test", "liste publique : langues ar + fr")
d = requests.get(f"{B}/books/{bid}").json()
ok(d["canDownload"] is False and d["loggedIn"] is False and [e["lang"] for e in d["editions"]] == ["ar", "fr"], "fiche publique : deux éditions")
ed = {e["lang"]: e for e in d["editions"]}
ok(ed["fr"]["pdf"]["pages"] == 3 and ed["fr"]["links"] == [] and len(ed["ar"]["links"]) == 2 and ed["ar"]["pdf"] is None, "français : PDF ; arabe : lien boutique")
ok("file_key" not in str(d) and "books/" not in str(d.get("editions")), "aucune clé de stockage exposée")
ok([t["id"] for t in d["talks"]] == [str(tid)] and [s["id"] for s in d["series"]] == [str(sid)], "conférence et série liées")
ok(requests.get(f"{B}/books/{bid}", headers=LRN).json()["canDownload"] is True and requests.get(f"{B}/books/{bid}", headers=STD).json()["canDownload"] is False, "canDownload : Apprentissage seulement")
ok([b["id"] for b in requests.get(f"{B}/talks/{tid}/books").json()] == [bid], "ouvrages d'une conférence (liée directement)")
ok([b["id"] for b in requests.get(f"{B}/talks/{ep}/books").json()] == [bid], "ouvrages d'une conférence (via sa série)")
ok([b["id"] for b in requests.get(f"{B}/series/{sid}/books").json()] == [bid], "ouvrages d'une série")
ok(requests.get(f"{B}/talks/{tid2}/books").json() == [], "conférence sans ouvrage : liste vide")
seo = requests.get(f"{B}/seo/books/{bid}").json(); ok(seo["title"].startswith("Le livre") and seo["langs"] == ["ar", "fr"], "données SEO de l'ouvrage")
ok(any(x["id"] == bid for x in requests.get(f"{B}/seo/sitemap").json()["books"]), "ouvrage dans le sitemap")

# --- couverture
png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
r = requests.post(f"{B}/studio/books/{bid}/cover", headers=O1, json={"image": png}); ok(r.status_code == 201 and r.json()["coverUrl"], "couverture envoyée")
ok(requests.post(f"{B}/studio/books/{bid}/cover", headers=O1, json={"image": "data:image/png;base64,AAAA"}).status_code == 400, "fausse image refusée")
ok(requests.get(f"{B}/seo/poster/books/{bid}", allow_redirects=False).status_code == 302, "couverture à adresse stable")
ok(requests.get(f"{B}/books/{bid}").json()["coverUrl"], "couverture dans la fiche")

# --- téléchargement
DL = f"{B}/books/{bid}/download-link"
ok(requests.post(DL, json={"lang": "fr"}).status_code == 401, "téléchargement : connexion obligatoire")
for who, h in (("sans abonnement", FREE), ("abonné standard", STD)):
    r = requests.post(DL, headers=h, json={"lang": "fr"}); ok(r.status_code == 403 and r.json()["code"] == "learning_required", f"{who} : téléchargement refusé (Apprentissage)")
ok(requests.post(DL, headers=LRN, json={"lang": "ar"}).status_code == 404, "langue sans PDF (lien boutique seulement) : pas de téléchargement")
r = requests.post(DL, headers=LRN, json={"lang": "fr"}); ok(r.status_code == 200 and r.json()["url"].startswith("/books/download?t="), "Apprentissage : lien personnel délivré")
url = B + r.json()["url"]
rr = requests.get(url); ok(rr.status_code == 200 and rr.headers["content-type"] == "application/pdf" and "attachment" in rr.headers["content-disposition"], "PDF téléchargé")
reader = PdfReader(io.BytesIO(rr.content)); text = "\n".join(p.extract_text() for p in reader.pages)
ok(len(reader.pages) == 3 and "Page 1 du livre de test" in text, "contenu d'origine conservé (3 pages)")
ok(lrn_email in text and text.count(lrn_email) >= 6, "filigrane : e-mail de l'abonné sur chaque page (pied de page + diagonale)")
import datetime; ok(datetime.date.today().isoformat() in text, "filigrane : date du jour")
ok(lrn_email in (reader.metadata.subject or ""), "e-mail aussi dans les métadonnées du PDF")
cur.execute("select count(*) from book_downloads where user_id=%s and book_id=%s", (ulrn, bid)); ok(cur.fetchone()[0] == 1, "téléchargement journalisé")
ok(requests.get(url[:-3] + "xxx").status_code == 410, "jeton falsifié refusé")
ok(requests.get(f"{B}/books/download?t=abc.def").status_code == 410, "jeton invalide refusé")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"book_link_minutes": "1"}})
# expiration : on fabrique un jeton échu avec la même clé (jeton du service) en modifiant l'échéance → signature invalide
import base64, json as _json
p, m = r.json()["url"].split("?t=")[1].split(".")
d2 = _json.loads(base64.urlsafe_b64decode(p + "==")); d2["e"] = 1
p2 = base64.urlsafe_b64encode(_json.dumps(d2).encode()).rstrip(b"=").decode()
ok(requests.get(f"{B}/books/download?t={p2}.{m}").status_code == 410, "échéance modifiée : signature invalide")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"book_link_minutes": None}})
# limite quotidienne
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"book_download_daily_max": "1"}})
r = requests.post(DL, headers=LRN, json={"lang": "fr"}); ok(r.status_code == 429 and r.json()["code"] == "daily_limit", "limite quotidienne de téléchargements")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"book_download_daily_max": None}})
# retrait des droits : plus de téléchargement, plus d'édition publique
r = requests.post(DL, headers=LRN, json={"lang": "fr"}); url2 = B + r.json()["url"]
r = requests.patch(f"{B}/studio/books/{bid}/pdf/fr", headers=O1, json={"rightsConfirmed": False}); ok(r.status_code == 200 and r.json()["files"][0]["rightsConfirmed"] is False, "droits retirés")
ok(requests.get(url2).status_code == 404, "droits retirés : le lien déjà délivré ne sert plus")
ok(requests.post(DL, headers=LRN, json={"lang": "fr"}).status_code == 404, "droits retirés : plus de nouveau lien")
ok([e["lang"] for e in requests.get(f"{B}/books/{bid}").json()["editions"]] == ["ar"], "droits retirés : l'édition PDF disparaît de la fiche publique")
# remplacement du PDF
r = upload(O1, bid, "fr", data=make_pdf(5)); ok(r.status_code == 201 and r.json()["files"][0]["pages"] == 5 and r.json()["files"][0]["rightsConfirmed"], "PDF remplacé (5 pages), droits reconfirmés")
# suppression de tous les contenus → dépublication
ok(requests.delete(f"{B}/studio/books/{bid}/pdf/fr", headers=O1).status_code == 204, "PDF supprimé")
for l in requests.get(f"{B}/studio/books/{bid}", headers=O1).json()["links"]:
    requests.delete(f"{B}/studio/books/{bid}/links/{l['id']}", headers=O1)
ok(requests.get(f"{B}/studio/books/{bid}", headers=O1).json()["published"] is False and requests.get(f"{B}/books/{bid}").status_code == 404, "plus aucune édition : ouvrage dépublié")
ok(requests.delete(f"{B}/studio/books/{bid}", headers=O2).status_code == 404 and requests.delete(f"{B}/studio/books/{bid}", headers=O1).status_code == 204, "suppression (propriétaire seulement)")
cur.execute("delete from talks where id in (%s,%s,%s)", (tid, tid2, ep)); cur.execute("delete from series where id=%s", (sid,))
print("TOUT OK")
