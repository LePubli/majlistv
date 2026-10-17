"""Étape D2 — version française côté spectateurs : état et liens des pistes selon le droit de lecture, demandes des abonnés,
e-mail « version française disponible ». Prérequis : API (3055) avec le module « dubbing » 0.3.0, PG (5544), S3 de test (5599)."""
import os, subprocess, sys, time, uuid
import boto3, psycopg2, requests

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; users, talks = [], []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: cleanup(); sys.exit(1)
def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, **kw)
    return r
def mk(role, label, premium=False):
    email = f"d2-{label}-{tag}@test.local"
    rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": label})
    cur.execute("update users set role=%s, premium_until=%s where email=%s returning id", (role, "2099-01-01" if premium else None, email)); uid = cur.fetchone()[0]; users.append(uid)
    return uid, {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}
a_id, A = mk("admin", "admin"); s_id, S = mk("user", "abonne", premium=True); u_id, U = mk("user", "gratuit")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True})
def talk(access, lang="ar"):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language)
                   values (%s,'d','Cheikh','youtube',%s,%s,'published','ready',%s,600,%s) returning id""", (f"D2 {tag} {access}", "y" + uuid.uuid4().hex[:9], a_id, access, lang))
    t = str(cur.fetchone()[0]); talks.append(t); return t
T1 = talk("free"); T2 = talk("premium"); T3 = talk("free")
# piste française de T1 et T2 (fichiers posés directement dans le stockage de test)
for t in (T1, T2):
    for k in ("mix", "voice"):
        s3.put_object(Bucket="majlis-videos", Key=f"dubbing/tracks/{t}/x-{k}.m4a", Body=b"\0\0\0\x18ftypM4A " + b"\0" * 64)
    cur.execute("insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s,'full','done','{\"duck\": 20}','{}',now()) returning id", (t,)); j = cur.fetchone()[0]
    cur.execute("insert into dub_tracks(talk_id, job_id, mix_key, voice_key, duration_s) values (%s,%s,%s,%s,600)", (t, j, f"dubbing/tracks/{t}/x-mix.m4a", f"dubbing/tracks/{t}/x-voice.m4a"))

tok = rq("GET", f"/talks/{T1}").json()["playbackToken"]
d = rq("GET", f"/talks/{T1}/dub").json()
ok(d["available"] and d["urls"] is None and d["level"] == "none", "sans jeton de lecture : version annoncée, aucun lien")
d = rq("GET", f"/talks/{T1}/dub?t={tok}").json()
ok(d["available"] and d["urls"]["mix"] and d["urls"]["voice"] and d["duck"] == 20 and d["hasMix"], "lecture complète : liens des deux pistes, niveau de la voix d'origine")
ok(requests.get(d["urls"]["mix"]).content[4:8] == b"ftyp", "lien de la piste lisible")
ok(rq("GET", f"/talks/{T1}/dub?t=faux").json()["urls"] is None, "jeton faux : aucun lien")
ptok = rq("GET", f"/talks/{T2}", headers=U).json()["playbackToken"]
ok(ptok.startswith("p") and rq("GET", f"/talks/{T2}/dub?t={ptok}", headers=U).json()["urls"] is None, "conférence premium en aperçu : pas de piste entière")
ftok = rq("GET", f"/talks/{T2}", headers=S).json()["playbackToken"]
ok(rq("GET", f"/talks/{T2}/dub?t={ftok}", headers=S).json()["urls"]["voice"], "abonné : piste de la conférence premium")
ok(rq("GET", f"/talks/{uuid.uuid4()}/dub").status_code == 404, "conférence inconnue : 404")

# demandes
d = rq("GET", f"/talks/{T3}/dub", headers=S).json()
ok(not d["available"] and d["requests"] == 0 and d["canRequest"] and not d["requested"], "pas de version française : l'abonné peut la demander")
ok(rq("GET", f"/talks/{T3}/dub", headers=U).json()["canRequest"] is False, "membre gratuit : ne peut pas la demander")
ok(rq("POST", f"/talks/{T3}/dub/request", headers=U).json().get("code") == "subscribers_only", "membre gratuit : demande refusée")
ok(rq("POST", f"/talks/{T3}/dub/request").status_code == 401, "visiteur : demande refusée")
r = rq("POST", f"/talks/{T3}/dub/request", headers=S).json(); ok(r == {"requests": 1, "requested": True}, "abonné : demande enregistrée")
ok(rq("POST", f"/talks/{T3}/dub/request", headers=S).json()["requests"] == 1, "deux fois : comptée une seule fois")
ok(rq("POST", f"/talks/{T3}/dub/request", headers=A).json()["requests"] == 2, "administrateur : peut demander (essai)")
ok(rq("GET", f"/talks/{T3}/dub").json()["requests"] == 2, "nombre de demandes visible de tous")
ok(rq("DELETE", f"/talks/{T3}/dub/request", headers=A).json() == {"requests": 1, "requested": False}, "retirer sa demande")
ok(rq("POST", f"/talks/{T1}/dub/request", headers=S).json().get("code") == "available", "déjà disponible : rien à demander")
lst = {x["id"]: x for x in rq("GET", f"/studio/dubbing/talks?q={tag}", headers=A).json()["talks"]}
ok(lst[T3]["requests"] == 1 and rq("GET", f"/studio/dubbing/talks/{T3}", headers=A).json()["requests"] == 1, "Studio : nombre de demandes")

# e-mail quand la version française est prête
for k in ("mix", "voice"):
    s3.put_object(Bucket="majlis-videos", Key=f"dubbing/tracks/{T3}/x-{k}.m4a", Body=b"x")
cur.execute("insert into dub_tracks(talk_id, mix_key, voice_key) values (%s,%s,%s)", (T3, f"dubbing/tracks/{T3}/x-mix.m4a", f"dubbing/tracks/{T3}/x-voice.m4a"))
env = {**os.environ, "DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "JWT_SECRET": "testsecret-testsecret-testsecret", "SETTINGS_KEY": "a" * 64, "PRACTICE_KEY": "b" * 64}
code = """import('./src/modules/dubbing/public.js').then(async (m) => { const { enqueueForUser } = await import('./src/mailer.js'); console.log(await m.notifyReady(enqueueForUser)); process.exit(0); });"""
out = subprocess.run(["node", "-e", code], cwd=os.path.join(os.path.dirname(__file__), ".."), env=env, capture_output=True, text=True, timeout=60)
ok(out.returncode == 0 and out.stdout.strip().splitlines()[-1] == "1", f"tâche de fond : 1 membre à prévenir ({out.stdout.strip()[-40:]} {out.stderr.strip()[-200:]})")
cur.execute("select kind, vars->>'title', vars->>'path' from email_outbox where user_id=%s order by id desc limit 1", (s_id,)); m = cur.fetchone()
ok(m and m[0] == "dub_ready" and tag in m[1] and m[2] == f"/talks/{T3}", "e-mail « la version française est disponible » mis en file")
cur.execute("select notified_at from dub_requests where talk_id=%s and user_id=%s", (T3, s_id)); ok(cur.fetchone()[0] is not None, "membre marqué « prévenu » (pas de second e-mail)")
out = subprocess.run(["node", "-e", code], cwd=os.path.join(os.path.dirname(__file__), ".."), env=env, capture_output=True, text=True, timeout=60)
ok(out.stdout.strip().splitlines()[-1] == "0", "second passage : personne à prévenir")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": False})
ok(rq("GET", f"/talks/{T1}/dub").json().get("code") == "module_off", "module désactivé : aucune version française proposée")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True})
cur.execute("delete from email_outbox where user_id::text = any(%s)", ([str(u) for u in users],))
cleanup(); print("Tout est OK")
