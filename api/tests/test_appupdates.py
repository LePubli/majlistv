"""22b-5 : mises à jour de l'application. Publication APK (multipart) + mises à jour du contenu (protocole expo-updates) + /app/latest.
Prérequis : API (3055), PG de test (5544), S3 de test (moto 5599), admin admin@test.local."""
import sys, hashlib, os, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


tok = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]
A = {"authorization": "Bearer " + tok}
cur.execute("delete from app_releases"); cur.execute("delete from app_updates")
PT = uuid.uuid4().hex + uuid.uuid4().hex
P = {"authorization": "Bearer " + PT}

# Sans jeton configuré : publication refusée
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_appupdates_publish_token": None}})
ok(requests.post(B + "/app/publish/apk/init", headers=P, json={}).status_code == 503, "jeton non configuré : 503")
r = requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_appupdates_publish_token": PT, "mod_appupdates_min_version_code": "0"}})
ok(r.status_code == 200, "jeton enregistré dans les réglages")
ok(requests.post(B + "/app/publish/apk/init", json={}).status_code == 401, "sans jeton : 401")
ok(requests.post(B + "/app/publish/apk/init", headers={"authorization": "Bearer " + "x" * 64}, json={}).status_code == 401, "mauvais jeton : 401")
ok(requests.post(B + "/app/publish/apk/init", headers=A, json={}).status_code == 401, "un compte admin du site n'est pas un jeton de publication")

# /app/latest sans version
r = requests.get(B + "/app/latest?versionCode=1").json()
ok(r["latest"] is None and r["updateAvailable"] is False and r["required"] is False, "aucune version publiée")


def publish_apk(code, version, data, notes=None):
    sha = hashlib.sha256(data).hexdigest()
    r = requests.post(B + "/app/publish/apk/init", headers=P, json={"version": version, "versionCode": code, "size": len(data), "sha256": sha, "notes": notes or {"fr": "Nouveautés"}})
    if r.status_code != 200:
        return r, None
    j = r.json(); ps = j["partSize"]; parts = []
    for p in j["parts"]:
        chunk = data[(p["partNumber"] - 1) * ps: p["partNumber"] * ps]
        u = requests.put(p["url"], data=chunk); assert u.status_code == 200, u.text
        parts.append({"PartNumber": p["partNumber"], "ETag": u.headers["ETag"]})
    return requests.post(B + "/app/publish/apk/commit", headers=P, json={"versionCode": code, "uploadId": j["uploadId"], "parts": parts}), sha


apk1 = os.urandom(300_000)
r, sha1 = publish_apk(10, "0.5.0", apk1)
ok(r.status_code == 200 and r.json()["ok"], "APK 10 publié")
ok(publish_apk(10, "0.5.0", apk1)[0].status_code == 409, "même numéro de build refusé")
ok(publish_apk(9, "0.4.9", apk1)[0].status_code == 409, "numéro inférieur refusé")
ok(requests.post(B + "/app/publish/apk/init", headers=P, json={"version": "0.5.0", "versionCode": 11, "size": 10, "sha256": "zz"}).status_code == 400, "empreinte invalide : 400")

# Empreinte annoncée fausse : envoi annulé
bad = os.urandom(1000)
j = requests.post(B + "/app/publish/apk/init", headers=P, json={"version": "0.6.0", "versionCode": 11, "size": len(bad), "sha256": "0" * 64}).json()
u = requests.put(j["parts"][0]["url"], data=bad)
r = requests.post(B + "/app/publish/apk/commit", headers=P, json={"versionCode": 11, "uploadId": j["uploadId"], "parts": [{"PartNumber": 1, "ETag": u.headers["ETag"]}]})
ok(r.status_code == 422, "empreinte incorrecte : 422")
cur.execute("select count(*) from app_releases where version_code=11"); ok(cur.fetchone()[0] == 0, "envoi invalide supprimé")

L = requests.get(B + "/app/latest?versionCode=5").json()
ok(L["latest"]["versionCode"] == 10 and L["latest"]["sha256"] == sha1 and L["updateAvailable"] and not L["required"], "latest : version 10, mise à jour disponible")
ok(L["latest"]["downloadUrl"].endswith("/app/download/10") and L["latest"]["notes"]["fr"] == "Nouveautés", "lien de téléchargement et notes")
ok(requests.get(B + "/app/latest?versionCode=10").json()["updateAvailable"] is False, "déjà à jour")
d = requests.get(B + "/app/download/10", allow_redirects=False)
ok(d.status_code == 302 and "mejliss-tv-0.5.0.apk" in d.headers["location"], "téléchargement : redirection signée avec nom de fichier")
ok(hashlib.sha256(requests.get(d.headers["location"]).content).hexdigest() == sha1, "le fichier téléchargé correspond à l'empreinte")
ok(requests.get(B + "/app/download/latest", allow_redirects=False).status_code == 302, "download/latest")
ok(requests.get(B + "/app/download/99").status_code == 404, "version inconnue : 404")
ok(requests.get(B + "/app/download/abc").status_code == 400, "paramètre invalide : 400")

# Version minimale : obligatoire seulement si l'appli est plus ancienne (et jamais au-delà de la dernière publiée)
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_appupdates_min_version_code": "10"}})
ok(requests.get(B + "/app/latest?versionCode=5").json()["required"] is True, "version minimale : mise à jour obligatoire")
ok(requests.get(B + "/app/latest?versionCode=10").json()["required"] is False, "à jour : jamais obligatoire")
ok(requests.get(B + "/app/latest").json()["required"] is False, "version inconnue : jamais bloquant")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_appupdates_min_version_code": "999"}})
ok(requests.get(B + "/app/latest?versionCode=5").json()["required"] is True and requests.get(B + "/app/latest?versionCode=10").json()["required"] is False, "minimum au-delà de la dernière : plafonné")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_appupdates_min_version_code": None}})

# Ménage : on garde 5 versions
for c in range(11, 17):
    r, _ = publish_apk(c, f"0.5.{c}", os.urandom(2000)); assert r.status_code == 200, r.text
cur.execute("select count(*) from app_releases where published_at is not null"); ok(cur.fetchone()[0] == 5, "ménage : 5 versions conservées")
ok(requests.get(B + "/app/download/10").status_code == 404, "ancienne version supprimée")

# ------------------------- Mises à jour du contenu
RT = "0.5.0"
bundle = b"console.log('bundle')" * 100 + os.urandom(16)
img = os.urandom(5000)
sb, si = hashlib.sha256(bundle).hexdigest(), hashlib.sha256(img).hexdigest()
H = {"expo-protocol-version": "1", "expo-platform": "android", "expo-runtime-version": RT, "accept": "multipart/mixed"}
r = requests.get(B + "/app/updates/manifest", headers=H)
ok(r.status_code == 204 and r.headers.get("expo-protocol-version") == "1", "aucune mise à jour : 204")
ok(requests.get(B + "/app/updates/manifest", headers={**H, "expo-platform": "ios"}).status_code == 404, "iOS non pris en charge : 404")
ok(requests.get(B + "/app/updates/manifest", headers={**H, "expo-runtime-version": ""}).status_code == 400, "version d'exécution manquante : 400")

assets = [{"sha256": sb, "contentType": "application/javascript", "size": len(bundle)}, {"sha256": si, "contentType": "image/png", "size": len(img)}]
ok(requests.post(B + "/app/publish/update/init", headers=P, json={"runtimeVersion": RT, "assets": []}).status_code == 400, "liste vide : 400")
j = requests.post(B + "/app/publish/update/init", headers=P, json={"runtimeVersion": RT, "assets": assets}).json()
ok(len(j["uploads"]) == 2, "2 fichiers à envoyer")
for up in j["uploads"]:
    data = bundle if up["sha256"] == sb else img
    ok(requests.put(up["url"], data=data, headers={"content-type": up["contentType"]}).status_code == 200, f"envoi {up['sha256'][:8]}")
j2 = requests.post(B + "/app/publish/update/init", headers=P, json={"runtimeVersion": RT, "assets": assets}).json()
ok(j2["uploads"] == [], "fichiers déjà présents : rien à renvoyer")
commit = {"runtimeVersion": RT, "launchAsset": {"sha256": sb}, "assets": [{"sha256": si, "key": hashlib.md5(img).hexdigest(), "contentType": "image/png", "fileExtension": ".png"}], "expoClient": {"name": "Mejliss TV"}}
ok(requests.post(B + "/app/publish/update/commit", headers=P, json={**commit, "launchAsset": {"sha256": "a" * 64}}).status_code == 422, "fichier manquant : 422")
ok(requests.post(B + "/app/publish/update/commit", headers=P, json={**commit, "assets": [{**commit["assets"][0], "key": "xyz"}]}).status_code == 400, "clé md5 invalide : 400")
r = requests.post(B + "/app/publish/update/commit", headers=P, json=commit)
ok(r.status_code == 200, "mise à jour publiée")
uid = r.json()["id"]

r = requests.get(B + "/app/updates/manifest", headers=H)
ok(r.status_code == 200 and r.headers["content-type"].startswith("multipart/mixed; boundary="), "manifeste en multipart/mixed")
ok(r.headers["expo-protocol-version"] == "1" and r.headers["expo-sfv-version"] == "0" and "max-age=0" in r.headers["cache-control"], "en-têtes du protocole")
body = r.text
ok('name="manifest"' in body and 'name="extensions"' in body and uid in body and "/app/updates/assets/" + sb in body and "Mejliss TV" in body, "manifeste : id, lancement, fichiers, expoClient")
ok(body.rstrip().endswith("--") , "multipart correctement fermé")
ok(requests.get(B + "/app/updates/manifest", headers={**H, "expo-runtime-version": "9.9.9"}).status_code == 204, "autre version d'exécution : 204")
r = requests.get(B + "/app/updates/manifest", headers={**H, "accept": "application/expo+json"})
ok(r.status_code == 200 and r.json()["id"] == uid and r.json()["launchAsset"]["key"] == sb, "format JSON simple")
ok(r.json()["assets"][0]["hash"] and "=" not in r.json()["assets"][0]["hash"], "empreinte en base64url sans « = »")
ok(requests.get(B + "/app/updates/manifest", headers={**H, "accept": "text/html"}).status_code == 406, "format non accepté : 406")
a = requests.get(B + f"/app/updates/assets/{sb}")
ok(a.status_code == 200 and a.content == bundle and "immutable" in a.headers["cache-control"], "fichier servi avec cache illimité")
ok(requests.get(B + f"/app/updates/assets/{'b' * 64}").status_code == 404, "fichier inconnu : 404")
ok(requests.get(B + "/app/updates/assets/..%2Fx").status_code == 400, "nom invalide : 400")

# Retour au contenu intégré
ok(requests.post(B + "/app/publish/update/rollback", headers=P, json={"runtimeVersion": RT}).status_code == 200, "retour arrière publié")
r = requests.get(B + "/app/updates/manifest", headers=H)
ok(r.status_code == 200 and "rollBackToEmbedded" in r.text and 'name="directive"' in r.text, "directive rollBackToEmbedded")
ok(requests.get(B + "/app/publish/releases", headers=P).json()["releases"][0]["version_code"] == 16, "liste de contrôle")

# Fonction désactivable
ok(requests.put(B + "/admin/features", headers=A, json={"values": {"appupdates": False}}).status_code == 200, "fonction coupée")
ok(requests.get(B + "/app/latest").status_code == 404 and requests.get(B + "/app/updates/manifest", headers=H).status_code == 404, "fonction désactivée : routes fermées")
requests.put(B + "/admin/features", headers=A, json={"values": {"appupdates": True}})
ok(requests.get(B + "/app/latest").status_code == 200, "fonction réactivée")
print("TOUT OK")
