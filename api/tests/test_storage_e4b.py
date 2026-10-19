"""Étape E4b — module « Stockage et archivage » avec un vrai fournisseur (serveur SFTP de test) :
  1. registre, point 3 : une copie d'archive dont le fichier a été effacé par son module (doublage) est effacée chez le fournisseur ;
  2. original d'une vidéo remplacée : gardé N jours, puis archivé (archivage automatique), l'éditeur le sait (original_state = archived) ;
  3. « Restaurer l'original » depuis les archives : l'original revient dans Garage, la préparation de la version d'avant démarre.
Prérequis : comme test_storage_s2.py (API 3055 avec les modules storage et editor, PG 5544, moto 5599, rclone, serveur SFTP de test :
  rclone serve sftp /tmp/sftproot --addr 127.0.0.1:2222 --user arch --pass s3cret --authorized-keys /tmp/sshk/k.pub).
Lancement depuis la racine du dépôt : python3 api/tests/test_storage_e4b.py"""
import os, sys, time, uuid
import boto3, psycopg2, requests

B = "http://127.0.0.1:3055"
SFTP_ROOT = os.environ.get("SFTP_ROOT", "/tmp/sftproot")
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; fails = []; talks = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    if r.status_code == 429 and "/auth/" in path: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=120, **kw)
    return r
A = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
for m in ("storage", "editor"): rq("PUT", f"/admin/modules/{m}", headers=A, json={"enabled": True})
def put(**kv): return rq("PUT", "/studio/storage/settings", headers=A, json={k: (None if v is None else str(v)) for k, v in kv.items()})
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None
def until(fn, t=60):
    end = time.time() + t
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.5)
    return None
def in_garage(key):
    try: s3.head_object(Bucket="majlis-videos", Key=key); return True
    except Exception: return False
folder = f"studio-{tag}"
before = {r: one("select value from app_settings where key=%s", f"mod_storage_{r}") for r in ("provider", "sftp_host", "sftp_port", "sftp_user", "folder", "keep_original_days")}

try:
    put(provider="planethoster", sftp_host="127.0.0.1", sftp_port=2222, sftp_user="arch", sftp_secret="s3cret", folder=folder, keep_original_days=7, encrypt_pass=None)
    ok(rq("POST", "/studio/storage/test", headers=A).json().get("ok"), "fournisseur SFTP de test joignable")

    # 1. Registre point 3.
    it = rq("POST", "/studio/storage/test-file", headers=A).json()["item"]
    ok(until(lambda: one("select status from archive_items where id=%s", it["id"]) == "archived"), "fichier archivé chez le fournisseur")
    remote = os.path.join(SFTP_ROOT, folder, it["key"])
    ok(os.path.isfile(remote), "copie présente chez le fournisseur")
    # Ce que fait le service de doublage quand il efface un fichier de travail (dubbing/src/main.py, forget_archives) :
    cur.execute("UPDATE archive_items SET status = 'delete_queued', updated_at = now() WHERE source_key = ANY(%s) AND status = 'archived'", ([it["key"]],))
    rq("POST", "/studio/storage/auto-run", headers=A)  # relance la file
    ok(until(lambda: one("select status from archive_items where id=%s", it["id"]) == "deleted"), "copie d’archive effacée (statut « effacée »)")
    ok(not os.path.exists(remote), "le fichier n’est plus chez le fournisseur")
    v = rq("GET", "/studio/storage", headers=A).json()
    ok(any(x["id"] == it["id"] and x["status"] == "deleted" for x in v["history"]) and not any(x["id"] == it["id"] for x in v["items"]), "historique : « copie d’archive effacée »")

    # 2. Original d'une vidéo remplacée il y a 8 jours (garde : 7) → archivé automatiquement.
    oid = one("select id from users where email='admin@test.local'")
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds)
                   values (%s,'d','X','upload',%s,%s,'published','ready','free',30) returning id""", (f"E4b stockage {tag}", f"talks/{tag}-new.mp4", oid))
    T = str(cur.fetchone()[0]); talks.append(T)
    okey = f"talks/{tag}-orig"; s3.put_object(Bucket="majlis-videos", Key=okey, Body=b"original " * 1000)
    cur.execute("""insert into editor_replacements(talk_id, kind, status, source_key, new_prefix, old_video_ref, new_video_ref, map, original_state, original_bytes,
                                                   switched_at, keep_until, follow, prev, cleaned)
                   values (%s,'replace','switched',%s,%s,%s,%s,'{"parts":[],"total":30,"body":30,"intro":0,"outro":0,"srcDuration":40}','kept',9000,
                           now() - interval '8 days', now() - interval '1 day','done','{}', true) returning id""",
                (T, f"talks/{tag}-new.mp4", f"hls/{T}/r/x/", okey, f"talks/{tag}-new.mp4"))
    X = str(cur.fetchone()[0])
    v = rq("GET", "/studio/storage", headers=A).json()
    ok(v["pendingOriginals"]["count"] >= 1 and v["pendingOriginals"]["available"], f"originaux en attente : {v['pendingOriginals']}")
    r = rq("POST", "/studio/storage/auto-run", headers=A).json()
    ok(r.get("queued", 0) >= 1, f"archivage automatique : original mis en file ({r})")
    ok(until(lambda: one("select original_state from editor_replacements where id=%s", X) == "archived"), "l’éditeur sait que l’original est archivé")
    ok(not in_garage(okey) and os.path.isfile(os.path.join(SFTP_ROOT, folder, okey)), "original parti de Garage, présent chez le fournisseur")

    # 3. Restaurer l'original depuis les archives.
    r = rq("POST", f"/studio/editor/replacements/{X}/restore", headers=A)
    ok(r.status_code == 201 and r.json()["fromArchive"], f"restauration demandée depuis les archives ({r.status_code})")
    Y = r.json()["replacement"]["id"]
    ok(until(lambda: one("select status from editor_replacements where id=%s", Y) == "converting"), "l’original revient : la préparation de la version d’avant démarre toute seule")
    ok(in_garage(okey) and one("select original_state from editor_replacements where id=%s", X) == "kept", "original de retour dans Garage")
    rq("POST", f"/studio/editor/replacements/{Y}/cancel", headers=A)
finally:
    for t in talks:
        cur.execute("delete from archive_items where talk_id=%s or source_key like %s", (t, f"talks/{tag}%"))
        cur.execute("delete from talks where id=%s", (t,))
    for k in (f"talks/{tag}-orig",):
        try: s3.delete_object(Bucket="majlis-videos", Key=k)
        except Exception: pass
    for k, v in before.items():
        if v is None: cur.execute("delete from app_settings where key=%s", (f"mod_storage_{k}",))
        else: cur.execute("update app_settings set value=%s where key=%s", (v, f"mod_storage_{k}"))
    cur.execute("delete from app_settings where key='mod_storage_sftp_secret'")

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
