"""26.1 : Mejliss Kids — profils enfants, code parental, jeton enfant verrouillé, catalogue par tranche d'âge, sortie par code.
Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
_hits = []


def rq(method, path, headers=None, **kw):
    now = time.time()
    _hits[:] = [h for h in _hits if now - h < 60]
    if len(_hits) >= 70:  # limite de l'API : 100 requêtes par minute
        time.sleep(61 - (now - _hits[0])); _hits.clear()
    _hits.append(time.time())
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429:  # limite de débit de l'API : on patiente et on réessaie une fois
        time.sleep(62); _hits.clear(); _hits.append(time.time())
        r = requests.request(method, B + path, headers=headers, **kw)
    return r


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(role=None):
    email = f"kid-{uuid.uuid4().hex[:6]}@test.local"
    rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Parent Test"})
    if role:
        cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,))
    uid = cur.fetchone()[0]
    return login(email, "Passw0rd-test"), uid


def subscribe(uid, tier):
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))


UP = {"3-6": ["3-6", "7-10", "11-14"], "7-10": ["7-10", "11-14"], "11-14": ["11-14"], None: []}  # ancienne règle : une conférence « 7-10 » convient aux 7-10 et aux plus grands


def talk(title, band, access="free", status="ready", pub="published", owner=None):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) "
                "values (%s,'d','Cheikh','youtube',%s,%s,%s,%s,%s,600,%s) returning id", (f"{title} {tag}", "v" + uuid.uuid4().hex[:9], owner or aid, pub, status, access, UP[band]))
    return str(cur.fetchone()[0])


tag = uuid.uuid4().hex[:6]
ADM = login("admin@test.local", "AdminPassw0rd-test"); cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ORG, uorg = member("organizer")
rq("PUT", "/admin/settings", headers=ADM, json={"values": {"kids_enabled": None, "kids_max_standard": None, "kids_max_learning": None}})
T36 = talk("Petits 3-6", "3-6"); T710 = talk("Moyens 7-10", "7-10", "premium"); T1114 = talk("Grands 11-14", "11-14"); TADULT = talk("Adultes", None)
TDRAFT = talk("Brouillon kids", "3-6", pub="draft"); TPROC = talk("En conversion", "3-6", status="processing")

# --- fiche conférence : tranche d'âge -----------------------------------------------------------
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access) values ('Mienne','d','x','youtube','vabcdefghij',%s,'published','ready','free') returning id", (uorg,)); mine = str(cur.fetchone()[0])
ok(rq("PATCH", f"/talks/{mine}", headers=ORG, json={"kidsBands": ["7-10", "11-14"]}).status_code == 200, "l'organisateur marque sa conférence « Kids 7-10 »")
ok(rq("GET", f"/talks/{mine}").json()["kidsBands"] == ["7-10", "11-14"], "tranches d'âge exposées")
ok(rq("PATCH", f"/talks/{mine}", headers=ORG, json={"kidsBands": ["20-30"]}).status_code == 400, "tranche inconnue refusée")
ok(rq("PATCH", f"/talks/{T36}", headers=ORG, json={"kidsBands": []}).status_code == 404, "pas la conférence d'un autre")
ok(rq("PATCH", f"/talks/{mine}", headers=ORG, json={"kidsBands": []}).status_code == 200 and rq("GET", f"/talks/{mine}").json()["kidsBands"] == [], "retrait de l'étiquette")

# --- parent sans abonnement ---------------------------------------------------------------------
P0, u0 = member()
d = rq("GET", "/me/kids", headers=P0).json(); ok(d["allowed"] is False and d["profiles"] == [] and d["hasPin"] is False, "sans abonnement : Kids non autorisé")
r = rq("POST", "/me/kids/profiles", headers=P0, json={"name": "Yacine", "band": "3-6"}); ok(r.status_code == 403 and r.json()["code"] == "subscription_required", "création refusée sans abonnement")
ok(rq("GET", "/me/kids").status_code == 401, "visiteur refusé")

# --- abonnement Mejliss (1 profil) ----------------------------------------------------------------
P1, u1 = member(); subscribe(u1, "standard")
ok(rq("GET", "/me/kids", headers=P1).json()["max"] == 1, "Mejliss : 1 profil")
ok(rq("POST", "/me/kids/profiles", headers=P1, json={"name": "A", "band": "2-3"}).status_code == 400, "tranche invalide refusée")
ok(rq("POST", "/me/kids/profiles", headers=P1, json={"name": "A", "band": "3-6", "avatar": "dragon"}).status_code == 400, "avatar inconnu refusé")
r = rq("POST", "/me/kids/profiles", headers=P1, json={"name": "Yacine", "band": "3-6", "avatar": "lion"}); ok(r.status_code == 201, "profil créé"); k1 = r.json()["id"]
r = rq("POST", "/me/kids/profiles", headers=P1, json={"name": "Salma", "band": "7-10"}); ok(r.status_code == 409 and r.json()["code"] == "limit", "second profil refusé (abonnement Mejliss)")
r = rq("POST", f"/me/kids/profiles/{k1}/enter", headers=P1); ok(r.status_code == 409 and r.json()["code"] == "pin_required", "entrée refusée tant qu'aucun code parental n'existe")
ok(rq("PUT", "/me/kids/pin", headers=P1, json={"code": "12ab"}).status_code == 400, "code non numérique refusé")
ok(rq("PUT", "/me/kids/pin", headers=P1, json={"code": "123"}).status_code == 400, "code trop court refusé")
ok(rq("PUT", "/me/kids/pin", headers=P1, json={"code": "2468"}).status_code == 200, "code parental défini")
cur.execute("select kids_pin_hash from users where id=%s", (u1,)); h = cur.fetchone()[0]; ok(h and "2468" not in h, "code stocké haché")
ok(rq("PUT", "/me/kids/pin", headers=P1, json={"code": "1357"}).status_code == 403, "changer le code exige l'ancien")
ok(rq("PUT", "/me/kids/pin", headers=P1, json={"code": "1357", "current": "0000"}).status_code == 403, "ancien code faux refusé")
ok(rq("PUT", "/me/kids/pin", headers=P1, json={"code": "1357", "current": "2468"}).status_code == 200, "code changé")

# --- abonnement Apprentissage (5 profils) -----------------------------------------------------------
P2, u2 = member(); subscribe(u2, "learning"); rq("PUT", "/me/kids/pin", headers=P2, json={"code": "9999"})
ok(rq("GET", "/me/kids", headers=P2).json()["max"] == 5, "Apprentissage : 5 profils")
ids = []
for i, n in enumerate(["Aya", "Bilal", "Chaïma", "Dawud", "Elias"]):
    r = rq("POST", "/me/kids/profiles", headers=P2, json={"name": n, "band": ["3-6", "7-10", "11-14", "7-10", "3-6"][i]}); ok(r.status_code == 201, f"profil {n}"); ids.append(r.json()["id"])
ok(rq("POST", "/me/kids/profiles", headers=P2, json={"name": "Farah", "band": "3-6"}).status_code == 409, "6e profil refusé")
ok(rq("PATCH", f"/me/kids/profiles/{ids[0]}", headers=P2, json={"name": "bilal"}).status_code == 409, "prénom en double refusé (insensible à la casse)")
ok(rq("PATCH", f"/me/kids/profiles/{ids[0]}", headers=P2, json={"avatar": "owl"}).json()["avatar"] == "owl", "modification du profil")
ok(rq("PATCH", f"/me/kids/profiles/{ids[0]}", headers=P1, json={"avatar": "fox"}).status_code == 404, "le profil d'un autre parent est introuvable")
ok(rq("POST", f"/me/kids/profiles/{ids[0]}/enter", headers=P1).status_code == 404, "ni entrer dedans")

# --- jeton enfant : verrouillé -----------------------------------------------------------------------
r = rq("POST", f"/me/kids/profiles/{k1}/enter", headers=P1); ok(r.status_code == 200 and r.json()["token"], "entrée dans l'espace enfant")
K1 = {"authorization": "Bearer " + r.json()["token"]}
for path in ("/auth/me", "/me/kids", "/me/favorites", "/me/continue", "/me/revision"):
    x = rq("GET", path, headers=K1); ok(x.status_code == 403 and x.json().get("code") == "kid_mode", f"jeton enfant refusé sur {path}")
ok(rq("PUT", "/me/kids/pin", headers=K1, json={"code": "0000", "current": "1357"}).status_code == 403, "l'enfant ne peut pas changer le code")
ok(rq("POST", "/me/kids/profiles", headers=K1, json={"name": "Z", "band": "3-6"}).status_code == 403, "ni créer un profil")
ok(rq("PATCH", f"/talks/{T36}", headers=K1, json={"kidsBands": []}).status_code == 403, "ni modifier une conférence")
KA = None
x = rq("POST", f"/me/kids/profiles", headers=ADM, json={"name": "Admin kid", "band": "3-6"}); 
if x.status_code == 201:
    rq("PUT", "/me/kids/pin", headers=ADM, json={"code": "1111"}) if not rq("GET", "/me/kids", headers=ADM).json()["hasPin"] else None
    KA = {"authorization": "Bearer " + rq("POST", f"/me/kids/profiles/{x.json()['id']}/enter", headers=ADM).json()["token"]}
    ok(rq("GET", "/admin/settings", headers=KA).status_code == 403, "jeton enfant d'un parent ADMIN : routes d'administration refusées")
    ok(rq("GET", "/admin/citations", headers=KA).status_code == 403, "idem citations")
    rq("DELETE", f"/me/kids/profiles/{x.json()['id']}", headers=ADM)
me = rq("GET", "/kids/me", headers=K1).json(); ok(me["name"] == "Yacine" and me["band"] == "3-6", "profil lisible par l'enfant")
ok(rq("GET", "/kids/me", headers=P1).status_code == 401, "un jeton parent n'ouvre pas /kids")
ok(rq("GET", "/kids/me").status_code == 401, "visiteur refusé")

# --- catalogue par tranche d'âge --------------------------------------------------------------------
tk = rq("GET", "/kids/talks", headers=K1).json(); got = {t["id"] for t in tk["talks"]}
ok(T36 in got and T710 not in got and T1114 not in got and TADULT not in got, "3-6 ans : uniquement le contenu 3-6")
ok(TDRAFT not in got and TPROC not in got, "brouillon et conférence en conversion absents")
r = rq("POST", f"/me/kids/profiles/{ids[1]}/enter", headers=P2); K2 = {"authorization": "Bearer " + r.json()["token"]}   # Bilal 7-10
tk2 = rq("GET", "/kids/talks", headers=K2).json(); got2 = [t["id"] for t in tk2["talks"]]
ok(T36 in got2 and T710 in got2 and T1114 not in got2 and TADULT not in got2, "7-10 ans : sa tranche + les plus jeunes (premium inclus : le parent est abonné)")
ok(got2.index(T710) < got2.index(T36), "sa propre tranche passe en premier")
r = rq("POST", f"/me/kids/profiles/{ids[2]}/enter", headers=P2); K3 = {"authorization": "Bearer " + r.json()["token"]}   # Chaïma 11-14
ok({T36, T710, T1114} <= {t["id"] for t in rq("GET", "/kids/talks", headers=K3).json()["talks"]}, "11-14 ans : tout le contenu Kids")

# --- lecture d'une conférence avec le jeton enfant ---------------------------------------------------
x = rq("GET", f"/talks/{T36}", headers=K1); ok(x.status_code == 200 and x.json().get("playbackToken") and not x.json().get("locked"), "conférence Kids : lecture autorisée")
ok(rq("GET", f"/talks/{TADULT}", headers=K1).json().get("code") == "kid_locked", "conférence non Kids : refusée à l'enfant")
ok(rq("GET", f"/talks/{T710}", headers=K1).status_code == 404, "conférence d'une tranche plus âgée : refusée")
ok(rq("GET", f"/talks/{TDRAFT}", headers=K1).status_code == 404, "brouillon refusé")
x = rq("GET", f"/talks/{T710}", headers=K2); ok(x.status_code == 200 and not x.json().get("locked"), "premium : l'enfant d'un parent abonné lit en entier")
ok(rq("GET", f"/talks/{TADULT}").status_code == 200, "le catalogue public reste inchangé pour les visiteurs")

# --- progression propre à l'enfant -------------------------------------------------------------------
ok(rq("PUT", f"/kids/progress/{T36}", headers=K1, json={"positionMs": 120000, "durationMs": 600000}).status_code == 200, "progression enregistrée")
ok(rq("PUT", f"/kids/progress/{TADULT}", headers=K1, json={"positionMs": 1000, "durationMs": 600000}).status_code == 404, "progression refusée hors Kids")
tk = rq("GET", "/kids/talks", headers=K1).json(); ok([t["id"] for t in tk["resume"]] == [T36], "« reprendre » proposé")
ok(rq("GET", f"/talks/{T36}", headers=K1).json()["resumeMs"] == 120000, "reprise à la bonne minute")
cur.execute("select count(*) from watch_progress where user_id=%s", (u1,)); ok(cur.fetchone()[0] == 0, "la progression du parent n'est pas touchée")
r = rq("PUT", f"/kids/progress/{T36}", headers=K1, json={"positionMs": 590000, "durationMs": 600000}); ok(r.json()["completed"] is True, "vidéo terminée")
ok(rq("GET", "/kids/talks", headers=K1).json()["resume"] == [], "plus de reprise une fois terminée")
rq("PUT", f"/kids/progress/{T36}", headers=K2, json={"positionMs": 1000, "durationMs": 600000})
ok(rq("GET", "/kids/talks", headers=K1).json()["talks"][0]["completed"] is True, "l'état « vu » est propre à chaque enfant")

# --- abonnement terminé : seul le gratuit reste --------------------------------------------------------
cur.execute("update subscriptions set status='canceled' where user_id=%s", (u2,)); time.sleep(0.2)
got2 = {t["id"] for t in rq("GET", "/kids/talks", headers=K2).json()["talks"]}; ok(T36 in got2 and T710 not in got2, "parent sans abonnement : contenus gratuits seulement")
cur.execute("update subscriptions set status='active' where user_id=%s", (u2,))

# --- sortie par le code parental -----------------------------------------------------------------------
r = rq("POST", "/kids/exit", headers=K1, json={"code": "0000"}); ok(r.status_code == 403 and r.json()["code"] == "bad_pin" and r.json()["left"] == 4, "mauvais code : 4 essais restants")
for _ in range(3): rq("POST", "/kids/exit", headers=K1, json={"code": "0000"})
r = rq("POST", "/kids/exit", headers=K1, json={"code": "0000"}); ok(r.status_code == 403 and r.json()["code"] == "locked", "5 erreurs : blocage temporaire")
r = rq("POST", "/kids/exit", headers=K1, json={"code": "1357"}); ok(r.status_code == 403 and r.json()["code"] == "locked", "même le bon code est refusé pendant le blocage")
cur.execute("update users set kids_pin_locked_until = now() - interval '1 minute' where id=%s", (u1,))
r = rq("POST", "/kids/exit", headers=K1, json={"code": "1357"}); ok(r.status_code == 200 and r.json()["token"], "bon code après le blocage : sortie")
PN = {"authorization": "Bearer " + r.json()["token"]}
ok(rq("GET", "/auth/me", headers=PN).status_code == 200 and rq("GET", "/me/kids", headers=PN).status_code == 200, "le jeton obtenu est un jeton parent normal")
ok(rq("POST", "/kids/exit", headers=PN, json={"code": "1357"}).status_code == 401, "un jeton parent n'utilise pas /kids/exit")

# --- suppression, désactivation --------------------------------------------------------------------------
ok(rq("DELETE", f"/me/kids/profiles/{k1}", headers=P1).status_code == 204, "profil supprimé")
ok(rq("GET", "/kids/me", headers=K1).status_code == 401, "le jeton d'un profil supprimé ne sert plus")
rq("PUT", "/admin/settings", headers=ADM, json={"values": {"kids_enabled": "false"}}); time.sleep(6)
ok(rq("GET", "/me/kids", headers=P2).status_code == 404 and rq("POST", f"/me/kids/profiles/{ids[1]}/enter", headers=P2).status_code == 404, "espace Kids désactivé dans les réglages")
rq("PUT", "/admin/settings", headers=ADM, json={"values": {"kids_enabled": None}}); time.sleep(6)
ok(rq("GET", "/me/kids", headers=P2).status_code == 200, "réactivé")
print("TOUT OK")
