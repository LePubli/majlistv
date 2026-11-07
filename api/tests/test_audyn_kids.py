"""Audyn (étape 4) : histoires du soir dans l'espace Kids — liste/fiche/lecture pour l'enfant, accès selon la formule du parent, temps d'écoute
compté à part (hors limite quotidienne), réglages par enfant (minuteur autorisé, arrêt automatique), ligne du rapport hebdomadaire.
Prérequis : API (3055), PG de test (5544), admin admin@test.local. Avec le stockage de test (moto 5599) la lecture et l'aperçu sont aussi testés."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(e, p="Passw0rd-test"):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}


def parent(tier):
    e = f"ak-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": e, "password": "Passw0rd-test", "name": "Parent"})
    cur.execute("select id from users where email=%s", (e,)); uid = cur.fetchone()[0]
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    h = login(e)
    ok(requests.put(B + "/me/kids/pin", headers=h, json={"code": "1234"}).status_code == 200, f"parent {tier} : code parental défini")
    p = requests.post(B + "/me/kids/profiles", headers=h, json={"name": "Yacine", "avatar": "lion", "band": "7-10"}).json()
    k = requests.post(f"{B}/me/kids/profiles/{p['id']}/enter", headers=h).json()["token"]
    return h, uid, p["id"], {"authorization": "Bearer " + k}


A = login("admin@test.local", "AdminPassw0rd-test")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_audyn_preview_seconds": "10", "kids_enabled": None}})
H1, U1, P1, K1 = parent("learning")
H2, U2, P2, K2 = parent("standard")

# --- Contenus : une histoire « enfants » (réservée Apprentissage), une « ouverte à tous », un livre adulte, un brouillon
def item(title, audience, access, status="published", chapters=2):
    cur.execute("insert into audyn_items(title,narrator,audience,access,status) values (%s,'Conteur',%s,%s,%s) returning id", (title, audience, access, status)); i = cur.fetchone()[0]
    for n in range(chapters):
        cur.execute("insert into audyn_chapters(item_id,position,title,audio_key,content_type,size,duration_seconds) values (%s,%s,%s,%s,'audio/mpeg',100000,60)", (i, n, f"Partie {n + 1}", f"audyn/test/{i}/{n}.mp3"))
    return str(i)

SL = item("Histoire du soir A", "kids", "learning"); SF = item("Histoire ouverte", "both", "free"); AD = item("Livre adulte", "adults", "learning"); DR = item("Brouillon enfants", "kids", "learning", "draft")

ok(requests.get(B + "/kids/stories").status_code == 401, "liste : connexion enfant obligatoire")
ok(requests.get(B + "/kids/stories", headers=H1).status_code == 401, "liste : le jeton du parent est refusé (réservé à l'enfant)")
L1 = requests.get(B + "/kids/stories", headers=K1).json()
ids = {i["id"]: i for i in L1["items"]}
ok(SL in ids and SF in ids and AD not in ids and DR not in ids, "liste : histoires enfants + « les deux » ; ni livre adulte ni brouillon")
ok(ids[SL]["full"] is True, "parent Apprentissage : accès complet")
L2 = requests.get(B + "/kids/stories", headers=K2).json()
ok({i["id"]: i for i in L2["items"]}[SL]["full"] is False and {i["id"]: i for i in L2["items"]}[SF]["full"] is True, "parent standard : aperçu seulement sur l'histoire « Apprentissage », accès complet sur l'histoire ouverte")
ok(L1["timerAllowed"] is False and L1["autoStopMin"] is None, "réglages par défaut : minuteur non autorisé, pas d'arrêt automatique")

pub = requests.get(B + "/audyn").json()["items"]
ok(all(i["id"] != SL for i in pub), "la liste publique des livres n'expose pas les histoires enfants")

D = requests.get(f"{B}/kids/stories/{SL}", headers=K2).json()
ok(D["access"]["full"] is False and [c["playable"] for c in D["chapters"]] == [True, False], "fiche (parent standard) : seul le 1er chapitre est jouable")
ok(requests.get(f"{B}/kids/stories/{AD}", headers=K1).status_code == 404 and requests.get(f"{B}/kids/stories/{DR}", headers=K1).status_code == 404, "fiche : livre adulte et brouillon introuvables")
ok(requests.get(f"{B}/kids/stories/{SL}", headers=H1).status_code == 401, "fiche : jeton du parent refusé")

# --- Temps d'écoute compté à part (hors limite quotidienne)
requests.put(f"{B}/me/kids/profiles/{P1}/controls", headers=H1, json={"dailyLimitMin": 5})
cur.execute("insert into kid_usage(profile_id, day, seconds, last_ping) values (%s, (now() at time zone 'Europe/Paris')::date, 600, now()) on conflict (profile_id, day) do update set seconds = 600", (P1,))
ok(requests.get(B + "/kids/stories", headers=K1).status_code == 200, "limite quotidienne dépassée : les histoires restent disponibles (illimitées)")
s1 = requests.post(B + "/kids/stories/ping", headers=K1).json()["seconds"]; ok(s1 == 10, "ping : première séance = 10 s")
cur.execute("update kid_story_usage set last_ping = now() - interval '30 seconds' where profile_id=%s", (P1,))
s2 = requests.post(B + "/kids/stories/ping", headers=K1).json()["seconds"]; ok(40 <= s2 <= 41, f"ping : +30 s écoulées ({s2})")
cur.execute("select seconds from kid_usage where profile_id=%s and day=(now() at time zone 'Europe/Paris')::date", (P1,)); ok(cur.fetchone()[0] == 600, "le temps des vidéos n'a pas bougé")
ok(requests.post(B + "/kids/stories/ping", headers=H1).status_code == 401, "ping : jeton du parent refusé")

# --- Réglages par enfant (parent)
ok(requests.get(f"{B}/me/kids/profiles/{P1}/stories").status_code == 401, "réglages : connexion obligatoire")
ok(requests.get(f"{B}/me/kids/profiles/{P1}/stories", headers=K1).status_code == 403, "réglages : l'enfant ne peut pas les lire/modifier")
ok(requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=K1, json={"timerAllowed": True}).status_code == 403, "réglages : l'enfant ne peut pas s'accorder le minuteur")
ok(requests.get(f"{B}/me/kids/profiles/{P1}/stories", headers=H2).status_code == 404, "réglages : profil d'un autre parent introuvable")
r = requests.get(f"{B}/me/kids/profiles/{P1}/stories", headers=H1).json(); ok(r["minutesWeek"] == 1 and r["timerAllowed"] is False, f"réglages : lecture (semaine = {r['minutesWeek']} min)")
ok(requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=H1, json={"autoStopMin": 2}).status_code == 400, "arrêt automatique : minimum 5 min")
ok(requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=H1, json={}).status_code == 400, "corps vide refusé")
ok(requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=H1, json={"timerAllowed": True, "autoStopMin": 20}).json() == {"timerAllowed": True, "autoStopMin": 20}, "minuteur autorisé + arrêt automatique 20 min")
ok(requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=H1, json={"timerAllowed": False}).json() == {"timerAllowed": False, "autoStopMin": 20}, "modification partielle : l'arrêt automatique est conservé")
ok(requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=H1, json={"autoStopMin": None}).json()["autoStopMin"] is None, "arrêt automatique désactivé")
requests.put(f"{B}/me/kids/profiles/{P1}/stories", headers=H1, json={"timerAllowed": True, "autoStopMin": 20})
ok(requests.get(f"{B}/kids/stories/{SL}", headers=K1).json()["autoStopMin"] == 20 and requests.get(f"{B}/kids/stories/{SL}", headers=K1).json()["timerAllowed"] is True, "l'enfant reçoit ses réglages avec la fiche")

# --- Rapport hebdomadaire : ligne « histoires du soir »
import subprocess, os, json
js = """import { kidReport } from '/home/claude/majlistv/api/src/kidsControl.js'; import { childLine } from '/home/claude/majlistv/api/src/kidsReportMailer.js';
const r = await kidReport(process.argv[1], 7, true); console.log(JSON.stringify({ m: r.profiles[0].storyMinutes, a: r.profiles[0].active, fr: childLine(r.profiles[0], 'fr'), en: childLine(r.profiles[0], 'en'), ar: childLine(r.profiles[0], 'ar') })); process.exit(0);"""
env = dict(os.environ, DATABASE_URL="postgres://majlis:pw@127.0.0.1:5544/majlis", JWT_SECRET="0123456789abcdef0123456789abcdef-test", SETTINGS_KEY="test-settings-key-0123456789", PRACTICE_KEY="practice-key-for-tests-0123456789")
out = subprocess.run(["node", "--input-type=module", "-e", js, str(U1)], capture_output=True, text=True, env=env, cwd="/home/claude/majlistv/api")
ok(out.returncode == 0, "rapport : calcul sans erreur" + ("" if out.returncode == 0 else " → " + out.stderr[-300:]))
rep = json.loads(out.stdout.strip().splitlines()[-1])
ok(rep["m"] == 1 and rep["a"] is True, "rapport : minutes d'histoires comptées et enfant actif")
ok("histoires du soir" in rep["fr"] and "bedtime stories" in rep["en"] and "قصص النوم" in rep["ar"], "rapport : ligne en français, anglais et arabe — " + rep["fr"])

# --- Lecture et aperçu (avec le stockage de test)
storage = requests.get(B + "/studio/audyn", headers=A).json()["storage"]
if not storage:
    print("SKIP stockage non configuré : liens d'écoute et aperçu non testés ici")
else:
    ok(requests.get(f"{B}/kids/stories/{SL}/chapters/{D['chapters'][0]['id']}/play", headers=K1).json()["preview"] is False, "parent Apprentissage : lien d'écoute complet")
    c = D["chapters"]
    p0 = requests.get(f"{B}/kids/stories/{SL}/chapters/{c[0]['id']}/play", headers=K2).json()
    ok(p0["preview"] is True and p0["limitSeconds"] == 10 and p0["url"].endswith("/preview"), "parent standard : aperçu du 1er chapitre")
    ok(requests.get(f"{B}/kids/stories/{SL}/chapters/{c[1]['id']}/play", headers=K2).status_code == 403, "parent standard : chapitre 2 refusé")
    ok(requests.get(f"{B}/kids/stories/{SF}/chapters/{requests.get(f'{B}/kids/stories/{SF}', headers=K2).json()['chapters'][1]['id']}/play", headers=K2).json()["preview"] is False, "histoire ouverte : tous les chapitres (parent standard)")

# --- Nettoyage et désactivation de la fonction
for i in (SL, SF, AD, DR): cur.execute("delete from audyn_items where id=%s", (i,))
requests.put(f"{B}/admin/settings", headers=A, json={"values": {"mod_audyn_preview_seconds": "120"}})
print("OK   test_audyn_kids")
