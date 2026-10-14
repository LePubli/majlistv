"""18 : statistiques d'audience anonymes — collecte (site + Kids), rapports admin / organisateur, droits, CSV, confidentialité.
Prérequis : API (3055), PG de test (5544). Attendre ~30 s entre deux suites (limite de débit)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
UA_D = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36"
UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1"


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def hit(body, ua=UA_D, extra=None, token=None):
    h = {"user-agent": ua, "accept-language": "fr-FR,fr;q=0.9"}
    h.update(extra or {})
    if token: h["authorization"] = "Bearer " + token
    return requests.post(B + "/stats/hit", json=body, headers=h)


def login(email, pw):
    return requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]


def member(role=None):
    email = f"st-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Test"})
    if role: cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    return login(email, "Passw0rd-test"), str(uid)


def mk(title, owner, pub="published", status="ready", bands=None, source="youtube", cat=None):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,access,publication,video_status,duration_seconds,kids_bands,category_id) values (%s,'Cheikh Test',%s,'v1',%s,'free',%s,%s,600,%s,%s) returning id",
                (title, source, owner, pub, status, bands or [], cat)); return str(cur.fetchone()[0])


def rep(path, token, **p):
    return requests.get(B + path, headers={"authorization": "Bearer " + token}, params=p)


cur.execute("delete from stat_dim_daily"); cur.execute("delete from stat_talk_daily"); cur.execute("delete from stat_talk_dim_daily"); cur.execute("delete from stat_seen")
cur.execute("select id from users where email='admin@test.local'"); admin_id = str(cur.fetchone()[0])
ADM = login("admin@test.local", "AdminPassw0rd-test")
ORG1, o1 = member("organizer"); ORG2, o2 = member("organizer"); USER, u1 = member()
T1 = mk("Conf A", o1); T2 = mk("Conf B", o1); T3 = mk("Conf C autre organisateur", o2); TD = mk("Brouillon", o1, pub="draft")
tag = uuid.uuid4().hex[:6]

# --- collecte : pages
ok(hit({"type": "page"}).status_code == 204, "page : 204")
ok(hit({"type": "page"}).status_code == 204, "même visiteur, 2e page")
hit({"type": "page"}, ua=UA_M, extra={"cf-ipcountry": "FR"})
hit({"type": "page", "entry": True, "ref": "https://www.google.com/search?q=x"}, ua="Mozilla/5.0 Firefox/127.0 Linux")
hit({"type": "page", "entry": True, "ref": "http://127.0.0.1:3055/autre"}, ua="Mozilla/5.0 Firefox/127.0 Mac")  # même site : ignoré comme provenance
hit({"type": "page", "entry": True, "ref": "https://www.facebook.com/x"}, ua="Mozilla/5.0 Firefox/127.0 Win")
hit({"type": "page", "entry": True, "ref": "https://exemple-blog.fr/article"}, ua="Mozilla/5.0 Firefox/127.0 BSD")
hit({"type": "page", "entry": True}, ua="Mozilla/5.0 Firefox/127.0 Other")
r = rep("/admin/stats", ADM, days=7)
ok(r.status_code == 200, "rapport admin 200")
d = r.json()
ok(d["site"]["totals"]["pageviews"] == 8 and d["site"]["totals"]["visitors"] == 7, f"pages vues 8, visiteurs uniques 7 (obtenu {d['site']['totals']})")
src = {x["value"]: x["views"] for x in d["dims"]["source"]}
ok(src == {"search": 1, "social": 1, "other": 1, "direct": 1}, f"provenance (même site ignoré) {src}")
ok({x["value"] for x in d["dims"]["referrer"]} == {"google.com", "facebook.com", "exemple-blog.fr"}, "domaines référents")
dev = {x["value"]: x["views"] for x in d["dims"]["device"]}
ok(dev.get("mobile") == 1 and dev.get("desktop") == 7, f"appareils {dev}")
ok({x["value"] for x in d["dims"]["country"]} == {"FR"}, "pays (en-tête CDN)")
ok(d["dims"]["lang"][0]["value"] == "fr", "langue")

# --- ignorés
n0 = rep("/admin/stats", ADM, days=7).json()["site"]["totals"]["pageviews"]
hit({"type": "page"}, ua="Googlebot/2.1 (+http://www.google.com/bot.html)")
hit({"type": "page"}, ua="curl/8.0")
hit({"type": "page"}, extra={"DNT": "1"})
hit({"type": "page"}, extra={"Sec-GPC": "1"})
hit({"type": "page"}, token=ADM)
ok(requests.post(B + "/stats/hit", json={"type": "nimporte"}, headers={"user-agent": UA_D}).status_code == 204, "corps invalide : 204 quand même")
ok(requests.post(B + "/stats/hit", data="pas json", headers={"user-agent": UA_D, "content-type": "application/json"}).status_code in (204, 400), "JSON cassé : pas d'erreur serveur")
ok(rep("/admin/stats", ADM, days=7).json()["site"]["totals"]["pageviews"] == n0, "robots, DNT, GPC, admin : non comptés")

# --- collecte : conférences
V = lambda **k: hit({"talkId": T1, **k}, ua=k.pop("ua", UA_D) if False else UA_D)
hit({"type": "view", "talkId": T1, "entry": True, "ref": "https://www.google.com/"})
hit({"type": "view", "talkId": T1}, ua=UA_M)
hit({"type": "view", "talkId": T1})                      # même visiteur que le 1er : vue +1, spectateur inchangé
hit({"type": "play", "talkId": T1}); hit({"type": "play", "talkId": T1}, ua=UA_M)
hit({"type": "progress", "talkId": T1, "seconds": 60}); hit({"type": "progress", "talkId": T1, "seconds": 30}, ua=UA_M)
ok(hit({"type": "progress", "talkId": T1, "seconds": 9999}).status_code == 204, "secondes excessives refusées sans erreur")
hit({"type": "quartile", "talkId": T1, "q": 25}); hit({"type": "quartile", "talkId": T1, "q": 25}, ua=UA_M); hit({"type": "quartile", "talkId": T1, "q": 50})
hit({"type": "quartile", "talkId": T1, "q": 33})
hit({"type": "complete", "talkId": T1})
hit({"type": "view", "talkId": T2}); hit({"type": "play", "talkId": T2})
hit({"type": "view", "talkId": T3}); hit({"type": "play", "talkId": T3}); hit({"type": "play", "talkId": T3})
hit({"type": "view", "talkId": TD}); hit({"type": "view", "talkId": str(uuid.uuid4())})                 # brouillon / inconnue : ignorées
hit({"type": "view", "talkId": T1}, token=ORG1)                  # le propriétaire n'est pas compté
hit({"type": "view", "talkId": T1}, token=ADM)                   # ni l'admin
hit({"type": "view", "talkId": T1}, token=ORG2, ua=UA_M)         # un autre organisateur est un spectateur (même appareil que le mobile : même personne du jour)

o = rep("/admin/stats", ADM, days=7, talk=T1).json()["totals"]
ok(o["views"] == 4 and o["viewers"] == 2, f"conf A : 4 ouvertures, 2 spectateurs/jour (même appareil = 1 personne) (obtenu {o['views']}/{o['viewers']})")
ok(o["plays"] == 2 and o["minutes"] == 1.5 and o["q25"] == 2 and o["q50"] == 1 and o["q75"] == 0 and o["completes"] == 1, f"lectures, minutes (90 s -> 1,5), quartiles, fin : {o}")
ok(o["completionRate"] == 50, "taux de fin 50 %")
ok(o["avgWatchPct"] == 8, f"% moyen regardé = 90 s / (2 x 600 s) ≈ 8 % (obtenu {o['avgWatchPct']})")

# --- rapports
a = rep("/admin/stats", ADM, days=30).json()
ok(a["totals"]["plays"] == 5 and {t["title"] for t in a["top"]} == {"Conf A", "Conf B", "Conf C autre organisateur"}, "admin : voit toutes les conférences (brouillon exclu)")
ok(a["top"][0]["title"] == "Conf C autre organisateur" or a["top"][0]["plays"] >= a["top"][-1]["plays"], "tri par lectures")
ok(len(a["series"]) == 30 and a["series"][-1]["views"] >= 1 and a["series"][0]["views"] == 0, "série de 30 jours complète")
ok([f["key"] for f in a["funnel"]] == ["views", "plays", "q25", "q50", "q75", "completes"], "entonnoir")
ok(a["categories"] and a["speakers"][0]["name"] == "Cheikh Test", "catégories et intervenants")
ok(a["prev"]["plays"] == 0, "période précédente vide")
s1 = rep("/studio/stats", ORG1, days=30).json()
ok({t["title"] for t in s1["top"]} == {"Conf A", "Conf B"} and s1["totals"]["plays"] == 3, "organisateur 1 : ses 2 conférences seulement")
ok("site" not in s1 and s1["scope"] == "mine", "organisateur : aucun chiffre du site entier")
ok({t["title"] for t in s1["talks"]} == {"Conf A", "Conf B", "Brouillon"}, "liste de ses conférences pour le filtre")
ok(s1["dims"]["source"][0]["value"] == "search" and any(x["value"] == "mobile" for x in s1["dims"]["device"]), "provenance et appareil de SES conférences")
s2 = rep("/studio/stats", ORG2, days=30).json()
ok({t["title"] for t in s2["top"]} == {"Conf C autre organisateur"} and s2["totals"]["plays"] == 2, "organisateur 2 : sa conférence seule")
ok(rep("/studio/stats", ORG2, days=30, talk=T1).status_code == 404, "organisateur : conférence d'un autre → 404")
ok(rep("/studio/stats", ORG1, days=30, talk=T1).json()["totals"]["plays"] == 2, "filtre sur une de ses conférences")
ok(rep("/admin/stats", ORG1).status_code == 403 and rep("/admin/stats", USER).status_code == 403, "admin/stats : réservé aux admins")
ok(rep("/studio/stats", USER).status_code == 403, "studio/stats : membre simple refusé")
ok(requests.get(B + "/admin/stats").status_code == 401 and requests.get(B + "/studio/stats").status_code == 401, "sans connexion : 401")
ok(rep("/admin/stats", ADM, days=15).status_code == 400 and rep("/admin/stats", ADM, audience="x").status_code == 400, "paramètres invalides : 400")
c = rep("/studio/stats", ORG1, days=30, format="csv")
ok(c.status_code == 200 and c.headers["content-type"].startswith("text/csv") and "attachment" in c.headers["content-disposition"] and c.text.startswith("﻿") and "Conf A" in c.text and "Conf C" not in c.text, "export CSV (organisateur : ses données seulement)")

# --- Kids
cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,'standard')", ("sub_" + uuid.uuid4().hex[:12], u1))
PAR = {"authorization": "Bearer " + login(*[x for x in ()] or ("admin@test.local", "AdminPassw0rd-test"))}
requests.put(B + "/me/kids/pin", headers=PAR, json={"pin": "1234"})
cur.execute("delete from kid_profiles where user_id=%s", (admin_id,))
kid = requests.post(B + "/me/kids/profiles", headers=PAR, json={"name": "Enfant", "band": "7-10"}).json()["id"]
KT = requests.post(B + f"/me/kids/profiles/{kid}/enter", headers=PAR, json={"pin": "1234"}).json()["token"]
K = {"authorization": "Bearer " + KT}
TK = mk("Conf Kids", o1, bands=["7-10", "11-14"]); TA = mk("Conf adulte", o1)
ks = lambda body: requests.post(B + "/kids/stats", json=body, headers=K)
ok(ks({"type": "view", "talkId": TK}).status_code == 204, "kids/stats : 204")
ks({"type": "view", "talkId": TK}); ks({"type": "play", "talkId": TK}); ks({"type": "progress", "talkId": TK, "seconds": 45}); ks({"type": "complete", "talkId": TK})
ks({"type": "view", "talkId": TA})                                         # pas une conférence Kids : ignorée
ok(requests.post(B + "/kids/stats", json={"type": "view", "talkId": TK}).status_code == 401, "kids/stats sans jeton : 401")
ok(requests.post(B + "/kids/stats", json={"type": "view", "talkId": TK}, headers=PAR).status_code in (204, 403), "jeton du parent : pas de comptage enfant")
cur.execute("insert into kid_quiz_attempts(profile_id,talk_id,score,total,percent,stars) values (%s,%s,4,5,80,2),(%s,%s,5,5,100,3)", (kid, TK, kid, TK))
cur.execute("insert into kid_usage(profile_id,day,seconds) values (%s,(now() at time zone 'Europe/Paris')::date,600) on conflict (profile_id,day) do update set seconds=600", (kid,))
ka = rep("/admin/stats", ADM, days=7, audience="kids").json()
ok(ka["totals"]["views"] == 2 and ka["totals"]["viewers"] == 1 and ka["totals"]["plays"] == 1 and ka["totals"]["completes"] == 1, f"kids admin : ouvertures/spectateur/lecture/fin {ka['totals']}")
ok(ka["kids"]["quiz"]["attempts"] == 2 and ka["kids"]["quiz"]["avgPercent"] == 90 and ka["kids"]["quiz"]["avgStars"] == 2.5, "quiz : 2 essais, 90 %, 2,5 étoiles")
ok(ka["kids"]["usage"]["activeKids"] >= 1 and ka["kids"]["usage"]["minutes"] >= 10 and any(b["band"] == "7-10" for b in ka["kids"]["usage"]["bands"]), "usage Kids (enfants actifs, minutes, tranches)")
ok(ka["top"][0]["title"] == "Conf Kids" and ka["top"][0]["quizAttempts"] == 2, "top Kids avec quiz")
ko = rep("/studio/stats", ORG1, days=7, audience="kids").json()
ok(ko["totals"]["plays"] == 1 and "usage" not in ko["kids"] and ko["kids"]["quiz"]["attempts"] == 2, "kids organisateur : ses vidéos, sans usage global")
ko2 = rep("/studio/stats", ORG2, days=7, audience="kids").json()
ok(ko2["totals"]["views"] == 0 and ko2["kids"]["quiz"]["attempts"] == 0, "kids : l'autre organisateur ne voit rien")
txt = str(ka) + str(ko)
ok("Enfant" not in txt and kid not in txt, "aucun nom ni identifiant d'enfant dans les rapports")
cur.execute("select count(*) from stat_dim_daily where audience='kids'"); ok(cur.fetchone()[0] == 0, "Kids : aucune provenance / appareil / langue / pays enregistrés")

# --- confidentialité : rien de personnel en base
cur.execute("select h from stat_seen limit 5"); hs = [x[0] for x in cur.fetchall()]
ok(hs and all(len(h) == 22 and "." not in h and "127" not in h for h in hs), "empreintes du jour : 22 caractères opaques, pas d'adresse IP")

# --- interrupteur
requests.put(B + "/admin/settings", headers={"authorization": "Bearer " + ADM}, json={"values": {"stats_enabled": "false"}})
n = rep("/admin/stats", ADM, days=7).json()["site"]["totals"]["pageviews"]
hit({"type": "page"}, ua="Mozilla/5.0 Safari autre-1")
ok(rep("/admin/stats", ADM, days=7).json()["site"]["totals"]["pageviews"] == n, "collecte désactivée : plus de comptage")
ok(requests.get(B + "/config").json()["stats"] is False, "/config : stats=false")
requests.put(B + "/admin/settings", headers={"authorization": "Bearer " + ADM}, json={"values": {"stats_enabled": None}})
ok(requests.get(B + "/config").json()["stats"] is True, "réactivée : /config stats=true")

# --- suppression d'une conférence : ses compteurs disparaissent
cur.execute("delete from talks where id=%s", (T2,)); cur.execute("select count(*) from stat_talk_daily where talk_id=%s", (T2,)); ok(cur.fetchone()[0] == 0, "conférence supprimée : compteurs supprimés (cascade)")
cur.execute("delete from talks where title in ('Conf A','Conf C autre organisateur','Brouillon','Conf Kids','Conf adulte')")
print("TOUT OK")
