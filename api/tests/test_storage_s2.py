"""Étape S2 — module « Stockage et archivage » : réglages, test de connexion, fichier d'essai archivé puis restauré,
chiffrement, fournisseurs SFTP (PlanetHoster), S3 et WebDAV, archivage automatique des fichiers de travail du doublage.

Prérequis (tout en local, sans Internet) :
  - API (3055) avec le module « storage », PG (5544), S3 de test moto (5599, bucket majlis-videos), rclone dans le PATH ;
  - serveur SFTP de test :   rclone serve sftp /tmp/sftproot --addr 127.0.0.1:2222 --user arch --pass s3cret --authorized-keys /tmp/sshk/k.pub
    (clé ed25519 /tmp/sshk/k + /tmp/sshk/k.pub ; le test la crée si elle manque, mais le serveur doit être lancé avec) ;
  - serveur WebDAV de test : rclone serve webdav /tmp/davroot --addr 127.0.0.1:2223 --user dav --pass davpass
Lancement depuis la racine du dépôt : python3 api/tests/test_storage_s2.py"""
import json, os, sys, time, uuid
import boto3, psycopg2, requests

B = "http://127.0.0.1:3055"; S3 = "http://127.0.0.1:5599"
SFTP_ROOT = os.environ.get("SFTP_ROOT", "/tmp/sftproot"); KEY = os.environ.get("SFTP_KEY", "/tmp/sshk/k")
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url=S3, aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks = []; fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    return r
A = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def put(**kv): return rq("PUT", "/studio/storage/settings", headers=A, json={k: (None if v is None else str(v)) for k, v in kv.items()})
def wait_item(iid, want, timeout=60):
    t = time.time(); st = None
    while time.time() - t < timeout:
        st = rq("GET", f"/studio/storage/archives/{iid}", headers=A).json()["item"]
        if st["status"] in want: return st
        time.sleep(0.5)
    return st
def in_garage(key):
    try: s3.head_object(Bucket="majlis-videos", Key=key); return True
    except Exception: return False
BASE = dict(provider="planethoster", sftp_host="127.0.0.1", sftp_port=2222, sftp_user="arch", folder=f"studio-{tag}", encrypt_pass=None,
            s3_endpoint=None, s3_bucket=None, s3_access_key=None, s3_secret_key=None, webdav_url=None, webdav_user=None, webdav_pass=None)

# --- module désactivé, droits
rq("PUT", "/admin/modules/storage", headers=A, json={"enabled": False})
ok(rq("GET", "/studio/storage", headers=A).json().get("code") == "module_off", "module désactivé : routes fermées (module_off)")
ok(rq("PUT", "/admin/modules/storage", headers=A, json={"enabled": True}).status_code == 200, "module activé (Admin → Modules)")
em = f"s2-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (em,))
O = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
ok(rq("GET", "/studio/storage", headers=O).status_code == 403, "organisateur : écran refusé")

try:
    # --- réglages et test de connexion SFTP (mot de passe)
    v = put(**{**BASE, "sftp_secret": None}).json()
    ok(v["settings"]["provider"] == "planethoster" and v["settings"]["sftp_port"] == 2222 and v["secret"]["sftp_secret"]["isSet"] is False, "réglages enregistrés, secret absent")
    t = rq("POST", "/studio/storage/test", headers=A).json()
    ok(t["ok"] is False and t["code"] == "incomplete", f"test sans mot de passe : refusé clairement ({t.get('message')})")
    ok(put(sftp_port="abc").status_code == 400, "port invalide refusé")
    v = put(sftp_secret="s3cret").json()
    ok(v["secret"]["sftp_secret"] == {"isSet": True, "kind": "password"} and "s3cret" not in json.dumps(v), "mot de passe chiffré : jamais renvoyé, seulement « défini »")
    cur.execute("select value from app_settings where key='mod_storage_sftp_secret'"); ok("s3cret" not in cur.fetchone()[0], "mot de passe chiffré dans la base")
    t = rq("POST", "/studio/storage/test", headers=A).json()
    ok(t["ok"] is True and os.path.isdir(os.path.join(SFTP_ROOT, f"studio-{tag}")), f"« Tester la connexion » réussit (SFTP, {t.get('ms')} ms)")
    ok(not [f for f in os.listdir(os.path.join(SFTP_ROOT, f"studio-{tag}")) if f.startswith(".mejliss-test")], "le petit fichier du test est effacé")
    v = rq("GET", "/studio/storage", headers=A).json(); ok(v["lastTest"]["ok"] and v["lastTest"]["at"], "dernier test mémorisé (date)")
    put(sftp_secret="mauvais")
    t = rq("POST", "/studio/storage/test", headers=A).json()
    ok(t["ok"] is False and "mauvais" not in json.dumps(t), f"mauvais mot de passe : échec lisible, secret jamais affiché ({t['message'][:80]})")
    # --- clé privée
    v = put(sftp_secret=open(KEY).read()).json()
    ok(v["secret"]["sftp_secret"]["kind"] == "key", "clé privée reconnue")
    t = rq("POST", "/studio/storage/test", headers=A).json(); ok(t["ok"] is True, "test réussi avec la clé privée")

    # --- recette : fichier d'essai archivé puis restauré
    r = rq("POST", "/studio/storage/test-file", headers=A); ok(r.status_code == 201, "fichier d'essai créé et mis en file")
    it = r.json()["item"]; key = it["key"]
    body = s3.get_object(Bucket="majlis-videos", Key=key)["Body"].read() if in_garage(key) else None
    st = wait_item(it["id"], {"archived", "failed"})
    ok(st["status"] == "archived" and st["bytes"] > 0, f"fichier d'essai archivé ({st['status']} {st.get('error') or ''})")
    remote = os.path.join(SFTP_ROOT, f"studio-{tag}", key)
    ok(os.path.isfile(remote) and os.path.getsize(remote) == st["bytes"], "présent chez le fournisseur, même taille")
    ok(not in_garage(key), "effacé de Garage après vérification")
    v = rq("GET", "/studio/storage", headers=A).json()
    ok(v["archives"]["count"] >= 1 and any(x["id"] == it["id"] for x in v["items"]), "« Dans les archives » : le fichier apparaît")
    ok(rq("POST", f"/studio/storage/archives/{it['id']}/retry", headers=A).status_code == 409, "relancer un archivage réussi : refusé")
    r = rq("POST", f"/studio/storage/archives/{it['id']}/restore", headers=A); ok(r.status_code == 200, "restauration demandée")
    st = wait_item(it["id"], {"restored", "failed"})
    ok(st["status"] == "restored" and in_garage(key), f"fichier d'essai restauré dans Garage ({st['status']} {st.get('error') or ''})")
    back = s3.get_object(Bucket="majlis-videos", Key=key)["Body"].read()
    ok(body is None or back == body, "contenu restauré identique")
    ok(not os.path.exists(remote), "copie d'archive effacée après restauration")
    ok(rq("POST", f"/studio/storage/archives/{it['id']}/restore", headers=A).status_code == 409, "restaurer deux fois : refusé")
    v = rq("GET", "/studio/storage", headers=A).json(); ok(any(x["id"] == it["id"] for x in v["history"]), "historique : fichier restauré")
    s3.delete_object(Bucket="majlis-videos", Key=key)

    # --- chiffrement
    put(encrypt_pass="phrase secrète de test")
    it = rq("POST", "/studio/storage/test-file", headers=A).json()["item"]; key = it["key"]
    st = wait_item(it["id"], {"archived", "failed"}); ok(st["status"] == "archived" and st["encrypted"], "archive chiffrée")
    enc = os.path.join(SFTP_ROOT, f"studio-{tag}", key + ".bin")
    ok(os.path.isfile(enc) and b"Mejliss" not in open(enc, "rb").read(), "contenu illisible chez le fournisseur (.bin chiffré)")
    put(encrypt_pass=None)
    rq("POST", f"/studio/storage/archives/{it['id']}/restore", headers=A)
    st = wait_item(it["id"], {"restored", "failed"}); ok(st["status"] == "failed" and "chiffr" in (st["error"] or ""), "sans la phrase de chiffrement : restauration refusée avec explication")
    put(encrypt_pass="phrase secrète de test")
    ok(rq("POST", f"/studio/storage/archives/{it['id']}/restore", headers=A).status_code == 200, "restauration relancée après échec")
    st = wait_item(it["id"], {"restored", "failed"}); ok(st["status"] == "restored" and in_garage(key), "archive chiffrée restaurée")
    s3.delete_object(Bucket="majlis-videos", Key=key); put(encrypt_pass=None)

    # --- archivage impossible : rien n'est effacé de Garage
    s3.put_object(Bucket="majlis-videos", Key=f"storage-test/garde-{tag}.txt", Body=b"x" * 100)
    cur.execute("insert into archive_items(source_key, kind, label) values (%s,'other','garde') returning id", (f"storage-test/garde-{tag}.txt",)); gid = str(cur.fetchone()[0])
    put(sftp_port=2299)
    rq("POST", "/studio/storage/auto-run", headers=A)  # relance aussi la file
    st = wait_item(gid, {"archived", "failed"}, 90)
    ok(st["status"] == "failed" and st["failedOp"] == "archive" and in_garage(f"storage-test/garde-{tag}.txt"), "fournisseur injoignable : échec, fichier conservé dans Garage")
    put(sftp_port=2222)
    ok(rq("POST", f"/studio/storage/archives/{gid}/retry", headers=A).status_code == 200, "« Réessayer » un archivage en échec")
    st = wait_item(gid, {"archived", "failed"}); ok(st["status"] == "archived", "archivage relancé : réussi")

    # --- fournisseur S3 (moto)
    try: s3.create_bucket(Bucket=f"arch-{tag}", CreateBucketConfiguration={"LocationConstraint": "garage"})
    except Exception: pass
    put(provider="s3", s3_endpoint=S3, s3_region="garage", s3_bucket=f"arch-{tag}", s3_access_key="test", s3_secret_key="test")
    t = rq("POST", "/studio/storage/test", headers=A).json(); ok(t["ok"], f"S3 : test réussi ({t.get('message')})")
    it = rq("POST", "/studio/storage/test-file", headers=A).json()["item"]
    st = wait_item(it["id"], {"archived", "failed"}); ok(st["status"] == "archived" and st["provider"] == "s3", "S3 : fichier d'essai archivé")
    ok(s3.list_objects_v2(Bucket=f"arch-{tag}", Prefix=f"studio-{tag}/").get("KeyCount", 0) == 1, "S3 : présent dans le bucket d'archives")
    rq("POST", f"/studio/storage/archives/{it['id']}/restore", headers=A)
    st = wait_item(it["id"], {"restored", "failed"}); ok(st["status"] == "restored" and in_garage(it["key"]), "S3 : restauré")
    s3.delete_object(Bucket="majlis-videos", Key=it["key"])

    # --- fournisseur WebDAV
    put(provider="webdav", webdav_url="http://127.0.0.1:2223", webdav_user="dav", webdav_pass="davpass")
    t = rq("POST", "/studio/storage/test", headers=A).json(); ok(t["ok"], f"WebDAV : test réussi ({t.get('message')})")
    put(provider="none")
    ok(rq("POST", "/studio/storage/test-file", headers=A).json().get("code") == "no_provider", "« Aucun » : rien n'est archivé")

    # --- archivage automatique des fichiers de travail du doublage
    put(**BASE, sftp_secret="s3cret", work_audio_days=30)
    rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True})
    cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',60,'ar','ar') returning id""", (f"S2 {tag}", "v" + tag, aid)); T = str(cur.fetchone()[0]); talks.append(T)
    pk = f"dubbing/previews/{T}/p-{tag}-mix.m4a"; s3.put_object(Bucket="majlis-videos", Key=pk, Body=b"m" * 2000)
    cur.execute("""insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s,'preview','done','{}',%s, now() - interval '40 days') returning id""",
                (T, json.dumps({"mixKey": pk, "rtf": 1})))
    J = str(cur.fetchone()[0])
    cur.execute("""insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s,'preview','done','{}',%s, now() - interval '2 days')""",
                (T, json.dumps({"mixKey": f"dubbing/previews/{T}/recent-mix.m4a"})))
    r = rq("POST", "/studio/storage/auto-run", headers=A).json()
    ok(r["queued"] == 1, f"règle « pistes audio de travail après 30 jours » : 1 fichier ancien mis en file, le récent gardé ({r})")
    cur.execute("select id from archive_items where source_key=%s", (pk,)); aid2 = str(cur.fetchone()[0])
    st = wait_item(aid2, {"archived", "failed"}); ok(st["status"] == "archived" and st["kind"] == "dub_preview" and st["talkTitle"] == f"S2 {tag}", "écoute de 60 s ancienne archivée (titre de la conférence)")
    r = rq("GET", f"/studio/dubbing/jobs/{J}/audio", headers=A)
    ok(r.status_code == 409 and r.json()["code"] == "archived" and r.json()["archiveId"] == aid2, "Studio doublage : « fichier dans les archives » avec l'archive à restaurer")
    ok(rq("POST", "/studio/storage/auto-run", headers=A).json()["queued"] == 0, "règle relancée : rien en double")
    rq("POST", f"/studio/storage/archives/{aid2}/restore", headers=A); wait_item(aid2, {"restored", "failed"})
    ok(rq("GET", f"/studio/dubbing/jobs/{J}/audio", headers=A).status_code == 200, "après restauration : écoute de nouveau disponible")
    ok(rq("POST", "/studio/storage/auto-run", headers=A).json()["queued"] == 0, "fichier restauré récemment : pas renvoyé tout de suite aux archives")

    # --- espace Garage
    u = rq("POST", "/studio/storage/usage", headers=A).json()
    ok(u["usedBytes"] > 0 and u["capacityBytes"] == 30 * 1024 ** 3 and u["freePct"] is not None, f"espace Garage mesuré ({u['usedBytes']} octets, {u['usedPct']} %)")
    ok(put(alert_free_pct=95).status_code == 400 and put(alert_free_pct=20).status_code == 200, "seuil d'alerte réglable (0 à 90 %)")
    put(garage_capacity_gb=1)
    v = rq("GET", "/studio/storage", headers=A).json(); ok(v["space"]["capacityBytes"] == 1024 ** 3, "capacité réglable")
    cur.execute("select count(*) from audit_log where route like '/studio/storage%%' and summary like 'Stockage et archivage%%'"); ok(cur.fetchone()[0] >= 5, "actions inscrites au journal d'audit")
finally:
    put(provider="planethoster", sftp_host=None, sftp_port=None, sftp_user=None, sftp_secret=None, folder=None, encrypt_pass=None, s3_endpoint=None, s3_region=None,
        s3_bucket=None, s3_access_key=None, s3_secret_key=None, webdav_url=None, webdav_user=None, webdav_pass=None, work_audio_days=None, garage_capacity_gb=None, alert_free_pct=None)
    rq("PUT", "/admin/modules/storage", headers=A, json={"enabled": False})
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from archive_items where source_key like %s or source_key like %s", (f"%{tag}%", "storage-test/%"))
    cur.execute("delete from users where email=%s", (em,))
print(f"\n{len(fails)} échec(s)" if fails else "\nTout est OK")
sys.exit(1 if fails else 0)
