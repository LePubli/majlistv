"""34 : lettre hebdomadaire personnalisée — la lettre personnelle (à reprendre, nouveautés des intervenants suivis, notions à réviser),
la sélection simple pour qui n'a rien de personnel, l'interrupteur « lettre personnalisée », un seul envoi par semaine.
Lance runWeekly() directement (le passage réel dépend du jour et de l'heure). Prérequis : API de test (3055), PG de test (5544)."""
import sys, uuid, json, subprocess, os, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]
API_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ENV = {**os.environ, "DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "JWT_SECRET": os.environ.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"),
       "SETTINGS_KEY": os.environ.get("SETTINGS_KEY", "test-settings-key-0123456789"), "PRACTICE_KEY": os.environ.get("PRACTICE_KEY", "practice-key-for-tests-0123456789")}


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def setting(A, **kv):
    r = requests.put(B + "/admin/settings", headers=A, json={"values": kv})
    ok(r.status_code == 200, f"réglage {list(kv)} : {r.status_code}")


def run_weekly():
    out = subprocess.run(["node", "-e", "import('./src/notifyMailer.js').then(async (m) => { console.log('N=' + await m.runWeekly()); process.exit(0); })"],
                         cwd=API_DIR, env=ENV, capture_output=True, text=True, timeout=60)
    ok(out.returncode == 0 and "N=" in out.stdout, "passage hebdomadaire exécuté" + ("" if out.returncode == 0 else " : " + out.stderr[:200]))
    return int(out.stdout.split("N=")[1].split()[0])


def user(name):
    em = f"wl-{name}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": em, "password": "UserPassw0rd-test", "name": name})
    cur.execute("update users set notify_weekly = true, weekly_last_week = null where email = %s returning id", (em,))
    return em, cur.fetchone()[0]


def mails(em):
    cur.execute("select kind, vars from email_outbox where to_email = %s and kind in ('weekly_letter','weekly_selection') order by id", (em,))
    return cur.fetchall()


def talk(title, speaker, access="free"):
    cur.execute("select id from users where email = 'admin@test.local'"); aid = cur.fetchone()[0]
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d',%s,'youtube',%s,%s,'published','ready',%s,1800) returning id",
                (title, speaker, "v" + uuid.uuid4().hex[:9], aid, access))
    return cur.fetchone()[0]


A = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select extract(isodow from now() at time zone 'Europe/Paris')::int"); dow = cur.fetchone()[0]
setting(A, smtp_host="127.0.0.1", smtp_port="2525", smtp_security="none", mail_from="Test <noreply@test.local>",
        weekly_enabled="true", weekly_weekday=str(dow), weekly_hour="0", weekly_personal="true", weekly_collection="")
spk = f"Cheikh Suivi {tag}"
t_new, t_old = talk(f"Nouveauté suivie {tag}", spk), talk(f"Reprise lettre {tag}", "Autre Intervenant")
slug = spk.lower().replace(" ", "-")

em_p, u_p = user("perso")
cur.execute("insert into speaker_follows(user_id, speaker_slug, speaker_name) values (%s,%s,%s)", (u_p, slug, spk))
cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms, completed, updated_at) values (%s,%s,600000,1800000,false, now() - interval '2 days')", (u_p, t_old))
cur.execute("insert into revision_items(user_id, talk_id, stage, anchor_on, due_on) values (%s,%s,0,current_date - 3,current_date - 1)", (u_p, t_old))
em_q, u_q = user("rien")
cur.execute("delete from email_outbox where kind in ('weekly_letter','weekly_selection')")

# 1) Lettre personnelle + sélection simple
n = run_weekly(); ok(n >= 2, f"{n} lettres mises en file")
mp, mq = mails(em_p), mails(em_q)
ok(len(mp) == 1 and mp[0][0] == "weekly_letter", "la personne qui a du personnel reçoit la lettre personnalisée")
v = mp[0][1]
ok([c["title"] for c in v["cardsFollow"]] == [f"Nouveauté suivie {tag}"], "nouveautés : la conférence de l'intervenant suivi")
ok([c["title"] for c in v["cardsResume"]] == [f"Reprise lettre {tag}"], "à reprendre : la conférence commencée")
ok(v["due"] == "1", "notions à réviser : 1")
ok(len(v["cardsSelection"]) >= 1 and all("id" in c and "path" in c for c in v["cardsSelection"]), "sélection de la semaine incluse, avec identifiants pour les couvertures")
ok(len(mq) == 1 and mq[0][0] == "weekly_selection", "sans rien de personnel : sélection simple")

# 2) Un seul envoi par semaine
ok(run_weekly() == 0 and len(mails(em_p)) == 1, "second passage la même semaine : rien de plus")

# 3) Interrupteur « lettre personnalisée »
setting(A, weekly_personal="false")
cur.execute("update users set weekly_last_week = null where id = %s", (u_p,)); cur.execute("delete from email_outbox where to_email = %s", (em_p,))
run_weekly()
mp = mails(em_p); ok(len(mp) == 1 and mp[0][0] == "weekly_selection", "lettre personnalisée coupée : tout le monde reçoit la sélection")

# 4) Désabonné : rien
setting(A, weekly_personal="true")
cur.execute("update users set weekly_last_week = null, notify_weekly = false where id = %s", (u_p,)); cur.execute("delete from email_outbox where to_email = %s", (em_p,))
run_weekly(); ok(mails(em_p) == [], "membre qui n'a pas demandé la lettre : rien")

# 5) Remise à zéro
setting(A, weekly_enabled="false")
cur.execute("delete from email_outbox where kind in ('weekly_letter','weekly_selection')")
print("\nTous les contrôles de l'étape 34 sont passés")
