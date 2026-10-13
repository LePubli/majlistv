"""26.3 : contrôle parental — durée quotidienne, catalogue autorisé, rapport. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
_hits = []


def rq(method, path, headers=None, **kw):
    now = time.time()
    _hits[:] = [h for h in _hits if now - h < 60]
    if len(_hits) >= 70:
        time.sleep(61 - (now - _hits[0])); _hits.clear()
    _hits.append(time.time())
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429:
        time.sleep(62); _hits.clear(); _hits.append(time.time())
        r = requests.request(method, B + path, headers=headers, **kw)
    return r


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def parent(tier):
    email = f"kc-{uuid.uuid4().hex[:6]}@test.local"
    rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Parent"})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    H = login(email, "Passw0rd-test")
    rq("PUT", "/me/kids/pin", headers=H, json={"code": "2468"})
    return H, uid, email


def kid(H, name, band="3-6"):
    pid = rq("POST", "/me/kids/profiles", headers=H, json={"name": name, "band": band}).json()["id"]
    return {"authorization": "Bearer " + rq("POST", f"/me/kids/profiles/{pid}/enter", headers=H).json()["token"]}, pid


tag = uuid.uuid4().hex[:6]
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


UP = {"3-6": ["3-6", "7-10", "11-14"], "7-10": ["7-10", "11-14"], "11-14": ["11-14"], None: []}  # ancienne règle : une conférence « 7-10 » convient aux 7-10 et aux plus grands


def talk(title, band="3-6", nq=0):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) "
                "values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',600,%s) returning id", (f"{title} {tag}", "v" + uuid.uuid4().hex[:9], aid, UP[band]))
    tid = str(cur.fetchone()[0])
    for i in range(nq):
        cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,origin,status) values (%s,'fr',%s,'[\"A\",\"B\",\"C\"]',1,'Parce que B.',%s,'manual','approved')", (tid, f"Question {i} ?", i * 1000))
    return tid


def ids(K):
    return [t["id"] for t in rq("GET", "/kids/talks", headers=K).json()["talks"]]


H, uid, email = parent("learning")
K, pid = kid(H, "Yacine")
T1, T2, T3 = talk("Alpha", nq=5), talk("Beta"), talk("Gamma")

# ---- Durée quotidienne
c = rq("GET", f"/me/kids/profiles/{pid}/controls", headers=H).json()
ok(c["dailyLimitMin"] is None and c["catalogMode"] == "all", "par défaut : pas de limite, tout le catalogue Kids")
ok(rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": 3}).status_code == 400, "limite < 5 min refusée")
ok(rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": 999}).status_code == 400, "limite > 8 h refusée")
ok(rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=K, json={"dailyLimitMin": 600}).status_code == 403, "l'enfant ne peut pas changer ses réglages")
ok(rq("GET", f"/me/kids/profiles/{pid}/controls", headers=K).status_code == 403, "l'enfant ne peut pas les lire non plus")
ok(rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": 10}).json()["dailyLimitMin"] == 10, "limite 10 min enregistrée")
other, _, _ = parent("standard")
ok(rq("GET", f"/me/kids/profiles/{pid}/controls", headers=other).status_code == 404, "le profil d'un autre parent est introuvable")

p = rq("POST", "/kids/ping", headers=K).json()
ok(p["limitMin"] == 10 and 0 < p["usedSec"] <= 10 and p["leftSec"] > 500 and not p["timeUp"], "premier ping : 10 s comptées, il reste du temps")
time.sleep(3)
p2 = rq("POST", "/kids/ping", headers=K).json()
ok(2 <= p2["usedSec"] - p["usedSec"] <= 5, "ping suivant : le temps réellement écoulé est ajouté (pas la durée annoncée)")
ok(rq("POST", "/kids/ping", headers=K, json={"seconds": 99999}).json()["usedSec"] - p2["usedSec"] <= 3, "un faux « seconds » envoyé par la page est ignoré")
ok(rq("POST", "/kids/ping", headers=H).status_code in (401, 403), "le ping est réservé à l'espace enfant")
ok(rq("GET", f"/talks/{T1}", headers=K).status_code == 200, "avant la limite : la vidéo se lance")

# Limite atteinte
cur.execute("update kid_usage set seconds = 600, last_ping = now() where profile_id = %s", (pid,))
s = rq("GET", "/kids/summary", headers=K).json()
ok(s["time"]["timeUp"] and s["time"]["leftSec"] == 0, "limite atteinte : timeUp = vrai")
r = rq("GET", "/kids/talks", headers=K).json()
ok(r["talks"] == [] and r["time"]["timeUp"], "limite atteinte : plus aucune vidéo proposée")
g = rq("GET", f"/talks/{T1}", headers=K)
ok(g.status_code == 403 and g.json().get("code") == "kid_time_up", "limite atteinte : la vidéo est refusée par le serveur")
ok(rq("GET", f"/kids/talks/{T1}/quiz", headers=K).json().get("code") == "kid_time_up", "limite atteinte : le quiz aussi")
ok(rq("PUT", f"/kids/progress/{T1}", headers=K, json={"positionMs": 9000, "durationMs": 600000}).status_code == 403, "limite atteinte : la progression n'est plus enregistrée")
ok(rq("POST", "/kids/ping", headers=K).json()["timeUp"], "le ping signale la fin")
# Le parent allonge : l'enfant peut reprendre ; sans limite : illimité
rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": 30})
ok(rq("GET", f"/talks/{T1}", headers=K).status_code == 200, "le parent allonge la durée : l'enfant reprend")
rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": None})
ok(rq("POST", "/kids/ping", headers=K).json()["leftSec"] is None, "sans limite : illimité")
# Le temps d'un jour ne déborde pas sur le lendemain
cur.execute("update kid_usage set day = day - 1 where profile_id = %s", (pid,))
rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": 10})
ok(not rq("GET", "/kids/summary", headers=K).json()["time"]["timeUp"], "le lendemain : compteur remis à zéro")

# ---- Catalogue
rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"dailyLimitMin": None})
cat = rq("GET", f"/me/kids/profiles/{pid}/catalog", headers=H).json()
mine = {t["id"]: t for t in cat["talks"]}
ok(cat["mode"] == "all" and all(mine[x]["allowed"] for x in (T1, T2, T3)), "mode « tout » : tout est autorisé")
ok({T1, T2, T3} <= set(ids(K)), "l'enfant voit les 3 conférences")
ok(rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T2], "allowed": False}).status_code == 200, "le parent bloque Beta")
ok(T2 not in ids(K) and {T1, T3} <= set(ids(K)), "Beta disparaît du catalogue de l'enfant")
g = rq("GET", f"/talks/{T2}", headers=K)
ok(g.status_code == 404 and g.json().get("code") == "kid_locked", "Beta bloquée : lecture directe refusée (404)")
ok(rq("GET", f"/kids/talks/{T2}/quiz", headers=K).status_code == 404, "Beta bloquée : quiz refusé")
ok(rq("PUT", f"/kids/progress/{T2}", headers=K, json={"positionMs": 9000, "durationMs": 600000}).status_code == 404, "Beta bloquée : progression refusée")
ok(rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T2], "allowed": True}).status_code == 200 and T2 in ids(K), "le parent débloque Beta")

# Mode « sélection » : on part de ce que l'enfant voit déjà
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T3], "allowed": False})
rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"catalogMode": "selected"})
cat = rq("GET", f"/me/kids/profiles/{pid}/catalog", headers=H).json()
mine = {t["id"]: t for t in cat["talks"]}
ok(cat["mode"] == "selected" and mine[T1]["allowed"] and mine[T2]["allowed"] and not mine[T3]["allowed"], "passage en « sélection » : l'état actuel est conservé")
ok(T3 not in ids(K) and {T1, T2} <= set(ids(K)), "l'enfant voit toujours la même chose")
new = talk("Delta")  # une nouvelle conférence Kids n'apparaît pas toute seule en mode sélection
ok(new not in ids(K), "mode sélection : une nouvelle conférence n'apparaît pas sans accord du parent")
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [new], "allowed": True})
ok(new in ids(K), "le parent l'autorise : elle apparaît")
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T1, T2, T3, new], "allowed": False})
ok(not ({T1, T2, T3, new} & set(ids(K))), "« tout retirer » : aucune de ces conférences")
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T1, T2, T3, new], "allowed": True})
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T2], "allowed": False})
# Retour au mode « tout » : ce qui était retiré devient bloqué (rien ne réapparaît tout seul)
rq("PUT", f"/me/kids/profiles/{pid}/controls", headers=H, json={"catalogMode": "all"})
ok(T2 not in ids(K) and {T1, T3, new} <= set(ids(K)), "retour au mode « tout » : Beta reste bloquée")
newer = talk("Epsilon")
ok(newer in ids(K), "mode « tout » : une nouvelle conférence apparaît")
# Âge : le catalogue parent ne propose que ce qui convient à l'âge de l'enfant
old = talk("Pour grands", band="11-14")
ok(old not in {t["id"] for t in rq("GET", f"/me/kids/profiles/{pid}/catalog", headers=H).json()["talks"]}, "le catalogue du parent respecte la tranche d'âge")
ok(rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [old], "allowed": True}).status_code == 200 and old not in ids(K), "autoriser une conférence trop grande ne la rend pas visible")
# Le blocage vaut aussi pour « à rejouer »
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T2], "allowed": True})
cur.execute("insert into kid_revision(profile_id,talk_id,stage,due_on) values (%s,%s,0,(now() at time zone 'Europe/Paris')::date)", (pid, T2))
ok(any(x["id"] == T2 for x in rq("GET", "/kids/summary", headers=K).json()["due"]), "« à rejouer » : visible si autorisé")
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T2], "allowed": False})
ok(not any(x["id"] == T2 for x in rq("GET", "/kids/summary", headers=K).json()["due"]), "« à rejouer » : disparaît si bloqué")
# Un autre parent ne peut pas toucher au catalogue
ok(rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=other, json={"talkIds": [T1], "allowed": False}).status_code == 404, "catalogue : réservé au parent du profil")
ok(rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=K, json={"talkIds": [T1], "allowed": True}).status_code == 403, "catalogue : refusé avec un jeton enfant")

# ---- Rapport
K2, pid2 = kid(H, "Sara", band="7-10")
rq("PUT", f"/me/kids/profiles/{pid}/catalog", headers=H, json={"talkIds": [T2], "allowed": True})
for i in range(6):
    rq("POST", "/kids/ping", headers=K); time.sleep(1)
cur.execute("update kid_usage set seconds = 1500 where profile_id = %s and day = (now() at time zone 'Europe/Paris')::date", (pid,))
cur.execute("insert into kid_progress(profile_id,talk_id,position_ms,completed) values (%s,%s,500000,true)", (pid, T1))
qs = rq("GET", f"/kids/talks/{T1}/quiz", headers=K).json()["questions"]
res = rq("POST", f"/kids/talks/{T1}/quiz/submit", headers=K, json={"answers": [{"questionId": q["id"], "index": 1} for q in qs]}).json()
ok(res["stars"] == 3, "quiz parfait : 3 étoiles")
R = rq("GET", "/me/kids/report?days=7", headers=H).json()
ok(R["days"] == 7 and [x["name"] for x in R["profiles"]] == ["Yacine", "Sara"], "rapport : un bloc par enfant, dans l'ordre de création")
y, sa = R["profiles"]
ok(y["minutes"] == 35 and y["watched"] == 1 and y["quizzes"] == 1 and y["avgPercent"] == 100 and y["stars"] == 3 and y["starsGained"] == 3, "rapport de Yacine : minutes, vidéos, quiz, moyenne, étoiles")
ok(len(y["usage"]) == 7 and y["activeDays"] == 2, "rapport : 7 jours de temps passé")
ok(len(y["badges"]) >= 1, "rapport : badges (Apprentissage)")
ok(not sa["active"] and sa["minutes"] == 0 and sa["quizzes"] == 0, "Sara n'a rien fait : bloc vide")
ok(not any(k in str(R).lower() for k in ("rank", "classement", "best", "winner")), "aucun classement ni comparaison entre enfants")
ok(rq("GET", "/me/kids/report", headers=K).status_code == 403, "rapport : refusé avec un jeton enfant")
ok(rq("GET", "/me/kids/report", headers=other).json()["profiles"] == [], "rapport : chaque parent ne voit que ses enfants")
# Réponse ratée -> « à reprendre »
tq = rq("GET", f"/kids/talks/{T1}/quiz", headers=K).json()["questions"]
rq("POST", f"/kids/talks/{T1}/quiz/submit", headers=K, json={"answers": [{"questionId": q["id"], "index": 0} for q in tq]})
R = rq("GET", "/me/kids/report?days=7", headers=H).json()
ok(R["profiles"][0]["retry"] and "Alpha" in R["profiles"][0]["retry"][0], "dernier quiz faible : à reprendre en douceur")
ok(rq("GET", "/me/kids/report?days=30", headers=H).json()["days"] == 30 and len(rq("GET", "/me/kids/report?days=30", headers=H).json()["profiles"][0]["usage"]) == 30, "période de 30 jours")
std, _, _ = parent("standard"); Ks, _ = kid(std, "Nour")
ok(rq("GET", "/me/kids/report", headers=std).json()["profiles"][0]["badges"] == [], "Mejliss : rapport sans badges")

# ---- Préférence e-mail
ok(rq("GET", "/me/kids", headers=H).json()["reportEmail"] is True, "rapport par e-mail activé par défaut")
ok(rq("PUT", "/me/kids/report-prefs", headers=H, json={"email": False}).json()["email"] is False and rq("GET", "/me/kids", headers=H).json()["reportEmail"] is False, "le parent peut désactiver l'e-mail")
rq("PUT", "/me/kids/report-prefs", headers=H, json={"email": True})
mine = rq("GET", "/me/kids", headers=H).json()["profiles"][0]
ok(mine["dailyLimitMin"] is None and mine["catalogMode"] == "all", "GET /me/kids expose les réglages de chaque profil")

# ---- Envoi immédiat (mis en file)
cur.execute("delete from email_outbox where to_email=%s", (email,))
ok(rq("POST", "/me/kids/report/send", headers=H).status_code == 200, "envoi immédiat demandé")
cur.execute("select kind, subject, vars from email_outbox where to_email=%s and kind='kids_report'", (email,)); row = cur.fetchone()
ok(row is not None and "Yacine" in row[2]["summary"] and "Sara" in row[2]["summary"] and "pas d'activité" in row[2]["summary"], "e-mail en file : une ligne par enfant")
ok(rq("POST", "/me/kids/report/send", headers=Ks).status_code == 403, "envoi : refusé avec un jeton enfant")
empty, _, _ = parent("standard")
ok(rq("POST", "/me/kids/report/send", headers=empty).status_code == 409, "envoi : refusé sans profil enfant")

# ---- Suppression du profil : tout part avec
rq("DELETE", f"/me/kids/profiles/{pid}", headers=H)
cur.execute("select (select count(*) from kid_usage where profile_id=%s)+(select count(*) from kid_catalog where profile_id=%s)", (pid, pid))
ok(cur.fetchone()[0] == 0, "profil supprimé : temps et catalogue supprimés")
print("TOUT OK")
