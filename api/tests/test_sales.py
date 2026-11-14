"""Étape C-1 — contenus payants à l'unité, sans Stripe : prix (Studio), droits (organisateur, admin), accès forcé, accès selon
achat / location / abonnement, Audyn, « Mes achats », retrait de la vente, fonction coupée. Prérequis : API :3055, Postgres :5544."""
import os, sys, uuid
import psycopg2, requests

B = os.environ.get("API", "http://127.0.0.1:3055")
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
tag = uuid.uuid4().hex[:6]
db = psycopg2.connect(os.environ.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis")); db.autocommit = True; cur = db.cursor()
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}

def user(prefix, role=None):
    em = f"{prefix}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": prefix})
    cur.execute("select id from users where email=%s", (em,)); uid = str(cur.fetchone()[0])
    if role: cur.execute("update users set role=%s where id=%s", (role, uid))
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}, uid, em

ORG, oid, _ = user("org", "organizer"); ORG2, oid2, _ = user("org2", "organizer")
U, uid, uem = user("buyer"); SUB, sid, _ = user("member")
cur.execute("update users set premium_until = now() + interval '30 days' where id=%s", (sid,))
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d',%s,'upload',%s,%s,'published','ready','free',600,'fr','fr','unavailable') returning id""", (f"Vente {tag}", f"Cheikh {tag}", f"v-{tag}", oid))
T = str(cur.fetchone()[0])

def feature(on):
    requests.put(B + "/admin/features", headers=A, json={"values": {"sales": on}})

# --- fonction coupée par défaut
feature(False)
ok(requests.get(f"{B}/studio/sales/talk/{T}", headers=ORG).status_code in (403, 404), "fonction coupée : Studio → vente fermé")
feature(True)

# --- droits sur le prix
ok(requests.get(f"{B}/studio/sales/talk/{T}", headers=U).status_code == 403, "un membre ne fixe pas de prix")
ok(requests.get(f"{B}/studio/sales/talk/{T}", headers=ORG2).status_code == 403, "un autre organisateur ne fixe pas le prix de ma vidéo")
r = requests.get(f"{B}/studio/sales/talk/{T}", headers=ORG); ok(r.status_code == 200 and r.json()["offer"] is None, "l'organisateur voit la vente de sa vidéo (pas encore en vente)")
ok(requests.get(f"{B}/studio/sales/talk/{uuid.uuid4()}", headers=A).status_code == 404, "contenu inconnu : 404")
ok(requests.put(f"{B}/studio/sales/talk/{T}", headers=ORG, json={}).json().get("code") == "no_price", "aucun prix : refusé")
ok(requests.put(f"{B}/studio/sales/talk/{T}", headers=ORG, json={"buyPrice": "0,20"}).json().get("code") == "bad_price", "prix sous 0,50 : refusé")
ok(requests.put(f"{B}/studio/sales/talk/{T}", headers=ORG, json={"buyPrice": "900"}).json().get("code") == "bad_price", "prix au-dessus de 500 : refusé")
r = requests.put(f"{B}/studio/sales/talk/{T}", headers=ORG, json={"buyPrice": "4,99", "rentPrice": "1.99", "rentHours": 48, "memberDiscountPct": 20})
o = r.json().get("offer") or {}
ok(r.status_code == 200 and o["buyCents"] == 499 and o["rentCents"] == 199 and o["memberBuyCents"] == 399 and o["memberRentCents"] == 159 and o["rentHours"] == 48, f"vente enregistrée : achat 4,99, location 1,99 / 48 h, abonnés −20 % ({o})")
cur.execute("select access from talks where id=%s", (T,)); ok(cur.fetchone()[0] == "premium", "en vente : la vidéo passe en accès réservé")
cur.execute("update talks set access='free' where id=%s", (T,)); cur.execute("select access from talks where id=%s", (T,))
ok(cur.fetchone()[0] == "premium", "impossible de la rouvrir en « accès libre » tant qu'elle est en vente (déclencheur)")

# --- accès
t = requests.get(f"{B}/talks/{T}").json()
ok(t.get("locked") is True and t["sale"]["buy"]["yourPrice"] == 499 and t["sale"]["rent"]["hours"] == 48 and t["sale"]["owned"] is None and t["sale"]["member"] is False, "visiteur : vidéo verrouillée, prix normal affiché")
ok(t.get("preview") is True, "aperçu toujours proposé")
t = requests.get(f"{B}/talks/{T}", headers=SUB).json()
ok(t.get("locked") is True and t["sale"]["member"] is True and t["sale"]["buy"]["yourPrice"] == 399 and t["sale"]["rent"]["yourPrice"] == 159, "abonné : verrouillée aussi, mais prix réduit")
t = requests.get(f"{B}/talks/{T}", headers=ORG).json(); ok(not t.get("locked"), "le responsable de la vidéo y a accès sans payer")
t = requests.get(f"{B}/talks/{T}", headers=A).json(); ok(not t.get("locked"), "l'administrateur y a accès")

cur.execute("insert into sale_purchases(user_id,email,kind,item_id,title,mode,amount,currency,rent_hours,status,paid_at,expires_at) values (%s,%s,'talk',%s,'x','rent',199,'eur',48,'paid',now()-interval '3 days',now()-interval '1 day')", (uid, uem, T))
ok(requests.get(f"{B}/talks/{T}", headers=U).json().get("locked") is True, "location terminée : de nouveau verrouillée")
cur.execute("insert into sale_purchases(user_id,email,kind,item_id,title,mode,amount,currency,rent_hours,status,paid_at,expires_at) values (%s,%s,'talk',%s,'x','rent',199,'eur',48,'paid',now(),now()+interval '2 days')", (uid, uem, T))
t = requests.get(f"{B}/talks/{T}", headers=U).json()
ok(not t.get("locked") and t["sale"]["owned"]["mode"] == "rent" and t["sale"]["owned"]["expiresAt"], "location en cours : vidéo ouverte, fin de location indiquée")
cur.execute("insert into sale_purchases(user_id,email,kind,item_id,title,mode,amount,currency,status,paid_at) values (%s,%s,'talk',%s,'x','buy',499,'eur','paid',now())", (uid, uem, T))
t = requests.get(f"{B}/talks/{T}", headers=U).json(); ok(not t.get("locked") and t["sale"]["owned"]["mode"] == "buy" and t["sale"]["owned"]["expiresAt"] is None, "achat : accès pour toujours (prioritaire sur la location)")
r = requests.post(B + "/sales/checkout", headers=U, json={"kind": "talk", "id": T, "mode": "buy"}); ok(r.status_code == 400 and r.json()["code"] == "terms_required", "paiement : conditions de vente obligatoires")
ok(requests.post(B + "/sales/checkout", json={"kind": "talk", "id": T, "mode": "buy", "terms": True}).status_code == 401, "paiement : connexion obligatoire")
p = requests.get(B + "/me/purchases", headers=U).json()
ok(len(p) == 3 and sum(1 for x in p if x["active"]) == 2, "Mes achats : 3 lignes, 2 encore valables")
ok(requests.get(B + "/me/purchases", headers=SUB).json() == [], "les achats d'un autre restent privés")

# --- remboursé : l'accès s'arrête
cur.execute("update sale_purchases set status='refunded', refunded_at=now() where user_id=%s and item_id=%s", (uid, T))
ok(requests.get(f"{B}/talks/{T}", headers=U).json().get("locked") is True, "remboursé : accès coupé")

# --- administration
r = requests.get(B + "/admin/sales", headers=A).json()
ok(any(x["itemId"] == T for x in r["items"]) and r["totals"]["offers"] >= 1, "Admin → Ventes : liste et totaux")
ok(requests.get(B + "/admin/sales", headers=ORG).status_code == 403, "liste des ventes réservée à l'administrateur")

# --- Audyn
cur.execute("insert into audyn_items(title,narrator,audience,access,status,created_by) values (%s,'Lecteur','adults','free','published',%s) returning id", (f"Livre {tag}", oid)); AU = str(cur.fetchone()[0])
for n in range(2):
    cur.execute("insert into audyn_chapters(item_id,position,title,audio_key,content_type,size,duration_seconds) values (%s,%s,%s,%s,'audio/mpeg',100000,60)", (AU, n, f"Partie {n + 1}", f"audyn/test/{AU}/{n}.mp3"))
ok(requests.put(f"{B}/studio/sales/audyn/{AU}", headers=ORG, json={"buyPrice": "9,90"}).status_code == 200, "l'organisateur met son livre audio en vente (achat seulement)")
cur.execute("select access from audyn_items where id=%s", (AU,)); ok(cur.fetchone()[0] == "learning", "livre en vente : accès réservé")
d = requests.get(f"{B}/audyn/{AU}").json()
ok(d["access"]["full"] is False and d["sale"]["buy"]["price"] == 990 and d["sale"]["rent"] is None and [c["playable"] for c in d["chapters"]] == [True, False], "fiche Audyn : prix, premier chapitre en aperçu seulement")
li = [x for x in requests.get(B + "/audyn").json()["items"] if x["id"] == AU]
ok(li and li[0]["onSale"] is True and li[0]["full"] is False, "liste Audyn : contenu marqué « en vente »")
cid = d["chapters"][1]["id"]
r = requests.get(f"{B}/audyn/{AU}/chapters/{cid}/play")
ok(r.status_code in (403, 503) and (r.status_code == 503 or r.json()["code"] == "purchase_required"), f"chapitre 2 sans achat : refusé ({r.status_code})")
ok(requests.post(B + "/sales/checkout", headers=U, json={"kind": "audyn", "id": AU, "mode": "rent", "terms": True}).status_code in (400, 503), "location d'un livre qui ne se loue pas : refusée")

# --- retrait de la vente
r = requests.delete(f"{B}/studio/sales/talk/{T}", headers=ORG); ok(r.status_code == 200 and r.json()["removed"] is True, "retrait de la vente")
cur.execute("select access from talks where id=%s", (T,)); ok(cur.fetchone()[0] == "free", "retirée de la vente : l'accès d'avant revient (libre)")
t = requests.get(f"{B}/talks/{T}").json(); ok("sale" not in t and not t.get("locked"), "vidéo de nouveau ouverte à tous")
requests.delete(f"{B}/studio/sales/audyn/{AU}", headers=A)
cur.execute("select access from audyn_items where id=%s", (AU,)); ok(cur.fetchone()[0] == "free", "livre retiré de la vente : accès libre rendu")

# --- fonction coupée : la vente ne bloque plus rien
requests.put(f"{B}/studio/sales/talk/{T}", headers=ORG, json={"buyPrice": "3"})
feature(False)
t = requests.get(f"{B}/talks/{T}", headers=SUB).json(); ok("sale" not in t and not t.get("locked"), "fonction coupée : la vidéo suit les règles habituelles (abonné)")
feature(True)
requests.delete(f"{B}/studio/sales/talk/{T}", headers=A)
cur.execute("delete from sale_purchases where item_id in (%s,%s)", (T, AU)); cur.execute("delete from talks where id=%s", (T,)); cur.execute("delete from audyn_items where id=%s", (AU,))
feature(False)
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
