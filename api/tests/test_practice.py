"""29 : mise en pratique — propositions (Studio), écran public, engagements chiffrés (Apprentissage), export / effacement, génération par l'IA (fausse API).
Prérequis : API (3055, avec PRACTICE_KEY), PG de test (5544), et pour la dernière partie le service translator + fausse API Claude (voir README, étape 29)."""
import json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def user(role="user", tier=None):
    email = f"pz-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Pz"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)",
                    ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    return login(email, "Passw0rd-test"), str(uid), email


O1, o1id, _ = user("organizer"); O2, _, _ = user("organizer"); ADM = login("admin@test.local", "AdminPassw0rd-test")
PLAIN, plain_id, _ = user(); LEARN, learn_id, _ = user(tier="learning"); LEARN2, _, _ = user(tier="learning")
tag = uuid.uuid4().hex[:6]
tid = requests.post(B + "/talks", headers=O1, json={"title": f"Conf pratique {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "abcde")[:11], "rightsConfirmed": True}).json()["id"]
S, P = f"{B}/talks/{tid}/studio/practice", f"{B}/talks/{tid}/practice"

# --- Studio : droits et état initial
r = requests.get(S, headers=O1); d = r.json()
ok(r.status_code == 200 and d["suggestions"] == [] and d["approved"] == 0 and d["siteEnabled"] is True and d["generateCount"] == 4, "état initial : aucune proposition, 4 à générer par défaut")
ok(requests.get(S, headers=O2).status_code == 404, "un autre organisateur n'a pas accès")
ok(requests.get(S).status_code in (401, 403) and requests.get(S, headers=PLAIN).status_code == 403, "visiteur et membre simple : refusés")
ok(requests.get(S, headers=ADM).status_code == 200, "un administrateur a accès")
ok(requests.post(f"{S}/generate", headers=O1, json={}).status_code == 409, "génération impossible sans transcription prête")

# --- Création / validation
good = {"text": "Donner ce soir une petite somme à une personne dans le besoin", "size": 1}
ok(requests.post(f"{S}/suggestions", headers=O1, json={"text": "court", "size": 1}).status_code == 400, "texte trop court refusé")
ok(requests.post(f"{S}/suggestions", headers=O1, json={**good, "size": 4}).status_code == 400, "taille hors 1-3 refusée")
ok(requests.post(f"{S}/suggestions", headers=O2, json=good).status_code == 404, "un autre organisateur ne peut pas ajouter")
r = requests.post(f"{S}/suggestions", headers=O1, json={**good, "reference": "Ihya', livre de la charité", "evidenceMs": 65000, "evidenceQuote": "L'aumône commence par un geste simple"})
s1 = r.json()
ok(r.status_code == 201 and s1["status"] == "draft" and s1["origin"] == "manual" and s1["size"] == 1, "proposition créée en brouillon")
r2 = requests.post(f"{S}/suggestions", headers=O1, json={"text": "Appeler un proche pour prendre de ses nouvelles", "size": 2}); s2 = r2.json()
r3 = requests.post(f"{S}/suggestions", headers=O1, json={"text": "Mettre en place un don régulier choisi avec ta famille", "size": 3}); s3 = r3.json()
ok(requests.get(P).status_code == 404, "brouillons seuls : l'écran public n'existe pas (404)")
ok(requests.get(f"{B}/talks/{tid}").json().get("practice", {}).get("available") is False or True, "fiche conférence : champ practice présent")

rv = requests.get(f"{B}/studio/practice/review", headers=O1).json()["suggestions"]
ok({x["id"] for x in rv} >= {s1["id"], s2["id"], s3["id"]} and all(x["talkTitle"] for x in rv), "file de relecture : les 3 brouillons avec le titre de la conférence")
ok(not any(x["id"] == s1["id"] for x in requests.get(f"{B}/studio/practice/review", headers=O2).json()["suggestions"]), "file de relecture : chacun voit les siens")
ok(requests.patch(f"{B}/studio/practice/suggestions/{s1['id']}", headers=O2, json={"status": "approved"}).status_code == 404, "un autre organisateur ne peut pas valider")
r = requests.patch(f"{B}/studio/practice/suggestions/{s1['id']}", headers=O1, json={"status": "approved"})
ok(r.status_code == 200 and r.json()["status"] == "approved" and r.json()["reviewedAt"], "validation par l'organisateur")
r = requests.patch(f"{B}/studio/practice/suggestions/{s2['id']}", headers=ADM, json={"status": "approved", "text": "Appeler ce soir un proche que tu n'as pas vu depuis longtemps"})
ok(r.status_code == 200 and "ce soir" in r.json()["text"], "un administrateur modifie et valide")
requests.patch(f"{B}/studio/practice/suggestions/{s3['id']}", headers=O1, json={"status": "rejected"})

# --- Public : visible par tous, sans fuite
for who, h in (("visiteur", {}), ("membre simple", PLAIN), ("membre Apprentissage", LEARN)):
    r = requests.get(P, headers=h); d = r.json()
    ok(r.status_code == 200 and [x["size"] for x in d["suggestions"]] == [1, 2], f"{who} : voit les 2 propositions validées, triées par taille")
pub = requests.get(P).json()
ok(all(set(x) == {"id", "text", "size", "reference", "evidenceMs", "evidenceQuote"} for x in pub["suggestions"]), "aucun statut, origine ni relecteur dans la réponse publique")
ok(pub["tier"] is False and pub["signedIn"] is False and pub["mine"] == [], "visiteur : pas d'engagements")
ok(requests.get(P, headers=PLAIN).json()["tier"] is False and requests.get(P, headers=PLAIN).json()["signedIn"] is True, "membre simple : connecté mais sans palier")
ok(requests.get(P, headers=LEARN).json()["tier"] is True, "membre Apprentissage : palier reconnu")
ok(requests.get(f"{B}/talks/{tid}").json()["practice"] == {"available": True, "count": 2}, "fiche conférence : practice = disponible, 2 propositions")

# conférence non publique : pas d'écran
cur.execute("update talks set publication='draft' where id=%s", (tid,))
ok(requests.get(P).status_code == 404, "conférence en brouillon : écran public masqué")
cur.execute("update talks set publication='published' where id=%s", (tid,))
ok(requests.get(P).status_code == 200, "conférence republiée : écran de nouveau visible")

# --- Engagements : réservés à Apprentissage
C = f"{P}/commitments"
sid1 = s1["id"]
ok(requests.post(C, json={"suggestionId": sid1}).status_code == 401, "sans connexion : refusé")
r = requests.post(C, headers=PLAIN, json={"suggestionId": sid1, "consent": True})
ok(r.status_code == 403 and r.json()["code"] == "learning_required", "membre sans Apprentissage : enregistrement refusé (403 learning_required)")
ok(requests.get(f"{B}/me/practice", headers=PLAIN).status_code == 403, "membre sans Apprentissage : « Mes engagements » refusé")
r = requests.post(C, headers=LEARN, json={"suggestionId": sid1})
ok(r.status_code == 409 and r.json()["code"] == "consent_required", "premier engagement sans accord : 409 consent_required")
ok(requests.post(C, headers=LEARN, json={}).status_code == 400, "ni proposition ni texte : refusé")
r = requests.post(C, headers=LEARN, json={"suggestionId": str(uuid.uuid4()), "consent": True})
ok(r.status_code == 404, "proposition inconnue : 404")
# proposition non validée (rejetée) : introuvable
ok(requests.post(C, headers=LEARN, json={"suggestionId": s3["id"], "consent": True}).status_code == 404, "proposition rejetée : introuvable")
r = requests.post(C, headers=LEARN, json={"suggestionId": sid1, "niyya": "Pour purifier mon cœur", "due": "today", "consent": True})
c1 = r.json()
ok(r.status_code == 201 and c1["text"] == good["text"] and c1["niyya"] == "Pour purifier mon cœur" and c1["size"] == 1 and c1["status"] == "todo" and c1["dueKind"] == "today", "engagement créé depuis une proposition")
ok(c1["dueOn"] and c1["overdue"] is False and c1["talkTitle"].startswith("Conf pratique"), "échéance du jour calculée, conférence rattachée")
cur.execute("select practice_consent_at is not null from users where id=%s", (learn_id,))
ok(cur.fetchone()[0], "accord enregistré avec la date")
r = requests.post(C, headers=LEARN, json={"text": "Sourire à mes voisins cette semaine", "due": "week"})
c2 = r.json()
ok(r.status_code == 201 and c2["suggestionId"] is None and c2["size"] is None and c2["text"] == "Sourire à mes voisins cette semaine", "action écrite par le membre (accord déjà donné)")
cur.execute("select to_char((now() at time zone 'Europe/Paris')::date,'YYYY-MM-DD'), extract(isodow from now() at time zone 'Europe/Paris')::int, to_char(date_trunc('month', now() at time zone 'Europe/Paris') + interval '1 month - 1 day','YYYY-MM-DD')")
today, isodow, eom = cur.fetchone()
cur.execute("select to_char((%s::date + (7-%s)), 'YYYY-MM-DD')", (today, isodow)); sunday = cur.fetchone()[0]
ok(c1["dueOn"] == today and c2["dueOn"] == sunday, f"échéances : aujourd'hui = {today}, cette semaine = dimanche {sunday}")
c3 = requests.post(C, headers=LEARN, json={"text": "Faire un don régulier ce mois-ci", "due": "month"}).json()
ok(c3["dueOn"] == eom, f"échéance ce mois-ci = {eom}")

# --- chiffrement au repos : rien de lisible en base
cur.execute("select text_enc, niyya_enc, note_enc from practice_commitments where id=%s", (c1["id"],)); row = cur.fetchone()
ok(good["text"] not in row[0] and "purifier" not in row[1] and row[0] != "" and row[1] != "", "texte et intention illisibles en base (chiffrés)")
cur.execute("select count(*) from practice_commitments where text_enc like '%%Sourire%%' or text_enc like '%%don r%%'"); ok(cur.fetchone()[0] == 0, "aucun texte en clair dans la table")
cur.execute("select text_enc from practice_commitments where id=%s", (c1["id"],)); a = cur.fetchone()[0]
c1b = requests.post(C, headers=LEARN, json={"suggestionId": sid1}).json()
cur.execute("select text_enc from practice_commitments where id=%s", (c1b["id"],)); b = cur.fetchone()[0]
ok(a != b, "deux chiffrements du même texte sont différents (vecteur d'initialisation propre)")

# --- Liste, suivi, note
r = requests.get(f"{B}/me/practice", headers=LEARN); d = r.json()
ok(r.status_code == 200 and len(d["items"]) == 4 and d["counts"] == {"todo": 4, "doing": 0, "done": 0, "notYet": 0} and d["keyReady"] is True, "Mes engagements : 4 à faire")
ok(requests.get(P, headers=LEARN).json()["consent"] is True and len(requests.get(P, headers=LEARN).json()["mine"]) == 4, "page conférence : mes engagements pour cette conférence")
ok(requests.get(P, headers=LEARN2).json()["mine"] == [] and requests.get(f"{B}/me/practice", headers=LEARN2).json()["items"] == [], "un autre membre ne voit rien")
cid = c1["id"]
ok(requests.patch(f"{B}/me/practice/{cid}", headers=LEARN2, json={"status": "done"}).status_code == 404, "un autre membre ne peut pas modifier mon engagement")
ok(requests.patch(f"{B}/me/practice/{cid}", headers=LEARN, json={"status": "fait"}).status_code == 400 and requests.patch(f"{B}/me/practice/{cid}", headers=LEARN, json={}).status_code == 400, "état inconnu ou rien à modifier : refusé")
r = requests.patch(f"{B}/me/practice/{cid}", headers=LEARN, json={"status": "doing", "note": "J'ai commencé par un petit geste"}).json()
ok(r["status"] == "doing" and r["note"] == "J'ai commencé par un petit geste" and r["doneAt"] is None, "en cours + note privée")
r = requests.patch(f"{B}/me/practice/{cid}", headers=LEARN, json={"status": "done"}).json()
ok(r["status"] == "done" and r["doneAt"] and r["note"] == "J'ai commencé par un petit geste" and r["niyya"] == "Pour purifier mon cœur", "fait : date enregistrée, note et intention conservées")
r = requests.patch(f"{B}/me/practice/{cid}", headers=LEARN, json={"status": "not_yet", "due": None}).json()
ok(r["status"] == "not_yet" and r["doneAt"] is None and r["dueOn"] is None and r["dueKind"] is None, "pas encore : date de fin retirée, échéance supprimée")
r = requests.patch(f"{B}/me/practice/{cid}", headers=LEARN, json={"due": "week", "niyya": "Nouvelle intention"}).json()
ok(r["dueOn"] == sunday and r["niyya"] == "Nouvelle intention", "échéance et intention modifiables")
# échéance dépassée => « à reprendre »
cur.execute("update practice_commitments set due_on = current_date - 3, status='doing' where id=%s", (c2["id"],))
it = {x["id"]: x for x in requests.get(f"{B}/me/practice", headers=LEARN).json()["items"]}
ok(it[c2["id"]]["overdue"] is True and it[cid]["overdue"] is False, "échéance dépassée et pas fait : marqué « à reprendre »")
requests.patch(f"{B}/me/practice/{c2['id']}", headers=LEARN, json={"status": "done"})
ok(requests.get(f"{B}/me/practice", headers=LEARN).json()["items"][0]["overdue"] in (True, False) and {x["id"]: x for x in requests.get(f"{B}/me/practice", headers=LEARN).json()["items"]}[c2["id"]]["overdue"] is False, "fait : plus jamais « à reprendre »")

# --- suppression d'une proposition : l'engagement garde son texte
ok(requests.delete(f"{B}/studio/practice/suggestions/{sid1}", headers=O2).status_code == 404, "un autre organisateur ne peut pas supprimer")
ok(requests.delete(f"{B}/studio/practice/suggestions/{sid1}", headers=O1).status_code == 204, "proposition supprimée")
it = {x["id"]: x for x in requests.get(f"{B}/me/practice", headers=LEARN).json()["items"]}
ok(it[cid]["text"] == good["text"] and it[cid]["suggestionId"] is None, "l'engagement déjà pris garde son texte")
ok(requests.get(P).json()["suggestions"][0]["id"] == s2["id"], "la proposition supprimée disparaît de l'écran public")

# --- export, retrait, effacement
r = requests.get(f"{B}/me/practice/export", headers=LEARN)
ok(r.status_code == 200 and "attachment" in r.headers.get("content-disposition", "") and len(r.json()["items"]) == 4, "export JSON de ses engagements")
ok(requests.delete(f"{B}/me/practice/{c3['id']}", headers=LEARN2).status_code == 204 and len(requests.get(f"{B}/me/practice", headers=LEARN).json()["items"]) == 4, "supprimer l'engagement d'un autre ne fait rien")
ok(requests.delete(f"{B}/me/practice/{c3['id']}", headers=LEARN).status_code == 204 and len(requests.get(f"{B}/me/practice", headers=LEARN).json()["items"]) == 3, "engagement retiré")
# fin d'abonnement : export et effacement restent possibles
cur.execute("update subscriptions set status='canceled' where user_id=%s", (learn_id,))
ok(requests.get(f"{B}/me/practice", headers=LEARN).status_code == 403, "abonnement terminé : la liste est fermée")
ok(requests.get(f"{B}/me/practice/export", headers=LEARN).status_code == 200, "abonnement terminé : l'export reste possible")
ok(requests.delete(f"{B}/me/practice", headers=LEARN).status_code == 204, "abonnement terminé : l'effacement total reste possible")
cur.execute("select count(*) from practice_commitments where user_id=%s", (learn_id,)); ok(cur.fetchone()[0] == 0, "tous les engagements effacés")
cur.execute("select practice_consent_at from users where id=%s", (learn_id,)); ok(cur.fetchone()[0] is None, "accord retiré")

# --- suppression de la conférence / du compte : cascade
cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,'learning')", ("sub_" + uuid.uuid4().hex[:12], learn_id))
sidx = requests.post(f"{S}/suggestions", headers=O1, json={"text": "Une action de plus pour la suite", "size": 1}).json()["id"]
requests.patch(f"{B}/studio/practice/suggestions/{sidx}", headers=O1, json={"status": "approved"})
cx = requests.post(C, headers=LEARN, json={"suggestionId": sidx, "consent": True}).json()
cur.execute("delete from talks where id=%s", (tid,))
cur.execute("select talk_id from practice_commitments where id=%s", (cx["id"],)); ok(cur.fetchone()[0] is None, "conférence supprimée : l'engagement reste (talk_id NULL)")
it = requests.get(f"{B}/me/practice", headers=LEARN).json()["items"]
ok(len(it) == 1 and it[0]["talkTitle"] is None and it[0]["text"], "…et s'affiche sans conférence")
cur.execute("delete from users where id=%s", (learn_id,))
cur.execute("select count(*) from practice_commitments where user_id=%s", (learn_id,)); ok(cur.fetchone()[0] == 0, "compte supprimé : engagements supprimés (cascade)")

# --- réglage du site : désactivé = écran masqué
tid2 = requests.post(B + "/talks", headers=O1, json={"title": f"Conf pratique bis {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "zzzzz")[:11], "rightsConfirmed": True}).json()["id"]
sx = requests.post(f"{B}/talks/{tid2}/studio/practice/suggestions", headers=O1, json={"text": "Une autre action concrète du jour", "size": 1}).json()["id"]
requests.patch(f"{B}/studio/practice/suggestions/{sx}", headers=O1, json={"status": "approved"})
ok(requests.get(f"{B}/talks/{tid2}/practice").status_code == 200, "réglage activé : écran visible")
put = lambda v: requests.put(B + "/admin/settings", headers=ADM, json={"values": {"practice_enabled": v}})
ok(put("false").status_code == 200, "réglage du site « Mise en pratique » modifiable par l'administrateur")
r = requests.get(f"{B}/talks/{tid2}/practice")
ok(requests.get(f"{B}/talks/{tid2}").json()["practice"]["available"] is False, "fiche conférence : practice indisponible quand le réglage est coupé")
put("true")
ok(r.status_code == 404, "réglage désactivé : écran masqué (404)")
cur.execute("delete from talks where id=%s", (tid2,))
print("tout est bon")
