"""Catégories automatiques : analyse demandée par le Studio, validation / refus des propositions, droits, rattrapage administrateur.
Prérequis : API (3055), PG de test (5544), compte admin admin@test.local. Le service d'IA (translator) n'est pas lancé : ses propositions sont simulées en base ;
le contrôle de la réponse de l'IA est testé à part (translator/tests/test_autocat_clean.py)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def user(role="user"):
    email = f"ac-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "AC Test"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}, uid


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
ORG, uorg = user("organizer"); ORG2, _ = user("organizer"); MEM, _ = user("user")
cur.execute("select id from categories where is_active and catalogue_type='adult' and not exists (select 1 from categories k where k.parent_id=categories.id) order by id limit 4")
CATS = [r[0] for r in cur.fetchall()]
ok(len(CATS) == 4, "4 catégories adultes de test")
mine = []


def talk(owner, adults=True, category=None):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,language,show_adults,category_id) "
                "values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',600,'ready','fr',%s,%s) returning id", ("AutoCat " + uuid.uuid4().hex[:5], uuid.uuid4().hex[:9], owner, adults, category))
    mine.append(cur.fetchone()[0]); return str(mine[-1])


def suggest(tid, cat, conf=80, reason="Il parle de ce sujet."):
    cur.execute("insert into talk_category_suggestions(talk_id,category_id,confidence,reason) values (%s,%s,%s,%s) returning id", (tid, cat, conf, reason))
    return str(cur.fetchone()[0])


try:
    t1 = talk(uorg)
    ok(requests.post(f"{B}/talks/{t1}/studio/categories-suggest/run", headers=MEM).status_code == 403, "un membre ne peut pas lancer l'analyse")
    ok(requests.post(f"{B}/talks/{t1}/studio/categories-suggest/run", headers=ORG2).status_code == 404, "un autre organisateur : vidéo introuvable")
    ok(requests.post(f"{B}/talks/{t1}/studio/categories-suggest/run", headers=ORG).status_code == 202, "le propriétaire lance l'analyse")
    ok(requests.post(f"{B}/talks/{t1}/studio/categories-suggest/run", headers=ORG).status_code == 409, "une analyse déjà en cours : refusée (busy)")
    cur.execute("select status from category_jobs where talk_id=%s", (t1,)); ok(cur.fetchone()[0] == "pending", "demande en file pour le service d'IA")
    cur.execute("update category_jobs set status='ready' where talk_id=%s", (t1,))
    tk = talk(uorg, adults=False)
    r = requests.post(f"{B}/talks/{tk}/studio/categories-suggest/run", headers=ORG); ok(r.status_code == 202, "vidéo de l'espace enfants : l'analyse est acceptée")
    cur.execute("update category_jobs set status='ready' where talk_id=%s", (tk,))
    cur.execute("select id from categories where is_active and catalogue_type='kids' and not exists (select 1 from categories k where k.parent_id=categories.id) order by id limit 2"); KC = [r[0] for r in cur.fetchall()]
    ok(len(KC) == 2, "2 catégories Kids de test")
    sk = suggest(tk, KC[0], 88)
    st = requests.get(f"{B}/talks/{tk}/studio/categories-suggest", headers=ORG).json(); ok(st["kids"] and not st["adult"], "état : vidéo Kids reconnue")
    r = requests.post(f"{B}/studio/categories-suggest/{suggest(tk, CATS[0], 80)}/accept", headers=ORG); ok(r.status_code == 409 and r.json().get("code") == "gone", "vidéo Kids : une catégorie adultes est refusée")
    r = requests.post(f"{B}/studio/categories-suggest/{sk}/accept", headers=ORG); ok(r.status_code == 200 and r.json().get("placed") == "extra", "catégorie Kids validée : ajoutée en catégorie supplémentaire")
    cur.execute("select (select category_id from talks where id=%s), (select count(*) from talk_categories where talk_id=%s and category_id=%s)", (tk, tk, KC[0])); v = cur.fetchone(); ok(v[0] is None and v[1] == 1, "catégorie Kids jamais en catégorie principale")
    # Annulation d'une catégorie ajoutée (validée ou appliquée automatiquement)
    tu = talk(uorg); su = suggest(tu, CATS[3], 95)
    cur.execute("update talks set category_id=%s where id=%s", (CATS[3], tu)); cur.execute("update talk_category_suggestions set status='approved', auto=true, reviewed_at=now() where id=%s", (su,))
    rv = requests.get(f"{B}/studio/categories-suggest/review", headers=ORG).json(); ok(any(x["id"] == su and x["auto"] for x in rv["applied"]), "file de relecture : l'application automatique est listée")
    ok(requests.get(f"{B}/studio/categories-suggest/review", headers=ORG2).json()["applied"] == [], "application automatique : invisible pour un autre organisateur")
    ok(requests.post(f"{B}/studio/categories-suggest/{su}/undo", headers=ORG2).status_code == 404, "annuler : autre organisateur refusé")
    ok(requests.post(f"{B}/studio/categories-suggest/{su}/undo", headers=ORG).status_code == 200, "annuler : la catégorie est retirée")
    cur.execute("select category_id from talks where id=%s", (tu,)); ok(cur.fetchone()[0] is None, "annuler : catégorie principale vidée")
    cur.execute("select status, auto from talk_category_suggestions where id=%s", (su,)); ok(cur.fetchone() == ("rejected", False), "annuler : ne sera plus reproposée")
    ok(requests.post(f"{B}/studio/categories-suggest/{su}/undo", headers=ORG).status_code == 409, "annuler deux fois : refusé")
    # Traitement par lot
    tb = talk(uorg); b1, b2, b3 = suggest(tb, CATS[0], 90), suggest(tb, CATS[1], 80), suggest(tb, CATS[2], 40)
    ok(requests.post(f"{B}/studio/categories-suggest/bulk", headers=MEM, json={"ids": [b1], "action": "accept"}).status_code == 403, "lot : réservé au Studio")
    ok(requests.post(f"{B}/studio/categories-suggest/bulk", headers=ORG, json={"ids": [], "action": "accept"}).status_code == 400, "lot : liste vide refusée")
    r = requests.post(f"{B}/studio/categories-suggest/bulk", headers=ORG2, json={"ids": [b1, b2], "action": "accept"}).json(); ok(r["done"] == 0 and len(r["skipped"]) == 2, "lot : les vidéos d'un autre organisateur sont ignorées")
    r = requests.post(f"{B}/studio/categories-suggest/bulk", headers=ORG, json={"ids": [b1, b2, str(uuid.uuid4())], "action": "accept"}).json(); ok(r["done"] == 2 and len(r["skipped"]) == 1, "lot : deux validées, l'inconnue est ignorée")
    cur.execute("select category_id from talks where id=%s", (tb,)); ok(cur.fetchone()[0] == CATS[0], "lot : la première devient principale")
    cur.execute("select count(*) from talk_categories where talk_id=%s", (tb,)); ok(cur.fetchone()[0] == 1, "lot : la seconde est supplémentaire")
    r = requests.post(f"{B}/studio/categories-suggest/bulk", headers=ORG, json={"ids": [b3, b1], "action": "reject"}).json(); ok(r["done"] == 1 and r["skipped"][0]["reason"] == "handled", "lot : refus d'une proposition, une déjà traitée est signalée")
    r = requests.post(f"{B}/studio/categories-suggest/bulk", headers=ORG, json={"ids": [b2], "action": "undo"}).json(); ok(r["done"] == 1, "lot : annulation")
    cur.execute("select count(*) from talk_categories where talk_id=%s", (tb,)); ok(cur.fetchone()[0] == 0, "lot : la catégorie annulée est retirée")
    tm = talk(uorg); cur.execute("update talks set kids_bands=%s where id=%s", (["6-8"], tm))
    r = requests.post(f"{B}/studio/categories-suggest/{suggest(tm, KC[1], 70)}/accept", headers=ORG); ok(r.status_code == 200, "vidéo mixte : catégorie Kids acceptée")
    r = requests.post(f"{B}/studio/categories-suggest/{suggest(tm, CATS[1], 70)}/accept", headers=ORG); ok(r.status_code == 200 and r.json().get("placed") == "main", "vidéo mixte : catégorie adultes en principale")

    s1, s2, s3 = suggest(t1, CATS[0], 90), suggest(t1, CATS[1], 70), suggest(t1, CATS[2], 60)
    st = requests.get(f"{B}/talks/{t1}/studio/categories-suggest", headers=ORG).json()
    ok(st["transcriptReady"] and [x["confidence"] for x in st["suggestions"]] == [90, 70, 60] and st["current"] == [], "état de la vidéo : propositions triées par confiance, aucune catégorie")
    ok(requests.get(f"{B}/talks/{t1}/studio/categories-suggest", headers=ORG2).status_code == 404, "état : autre organisateur refusé")

    r = requests.post(f"{B}/studio/categories-suggest/{s1}/accept", headers=ORG2); ok(r.status_code == 404, "valider la proposition d'un autre : refusé")
    r = requests.post(f"{B}/studio/categories-suggest/{s1}/accept", headers=ORG).json()
    cur.execute("select category_id from talks where id=%s", (t1,)); ok(r["placed"] == "main" and cur.fetchone()[0] == CATS[0], "vidéo sans catégorie : la proposition devient la catégorie principale")
    r = requests.post(f"{B}/studio/categories-suggest/{s2}/accept", headers=ORG).json()
    cur.execute("select category_id from talk_categories where talk_id=%s", (t1,)); ok(r["placed"] == "extra" and [x[0] for x in cur.fetchall()] == [CATS[1]], "vidéo déjà classée : la proposition s'ajoute, rien n'est remplacé")
    cur.execute("select category_id from talks where id=%s", (t1,)); ok(cur.fetchone()[0] == CATS[0], "la catégorie principale n'a pas changé")
    ok(requests.post(f"{B}/studio/categories-suggest/{s2}/accept", headers=ORG).json().get("already") is True, "valider deux fois : sans effet")
    ok(requests.post(f"{B}/studio/categories-suggest/{s3}/reject", headers=ORG2).status_code == 404, "refuser la proposition d'un autre : refusé")
    ok(requests.post(f"{B}/studio/categories-suggest/{s3}/reject", headers=ORG).status_code == 200, "refuser une proposition")
    cur.execute("select status from talk_category_suggestions where id=%s", (s3,)); ok(cur.fetchone()[0] == "rejected", "elle est marquée refusée")
    cur.execute("insert into talk_category_suggestions(talk_id,category_id,confidence,reason) values (%s,%s,70,'x') on conflict (talk_id,category_id) do nothing", (t1, CATS[2]))
    cur.execute("select status from talk_category_suggestions where talk_id=%s and category_id=%s", (t1, CATS[2])); ok(cur.fetchone()[0] == "rejected", "une proposition refusée n'est jamais reproposée")

    # Catégorie désactivée entre-temps
    t2 = talk(uorg); s4 = suggest(t2, CATS[3]); cur.execute("update categories set is_active=false where id=%s", (CATS[3],))
    r = requests.post(f"{B}/studio/categories-suggest/{s4}/accept", headers=ORG); ok(r.status_code == 409 and r.json().get("code") == "gone", "catégorie désactivée : validation refusée")
    cur.execute("update categories set is_active=true where id=%s", (CATS[3],))

    # File de relecture
    t3 = talk(uorg); suggest(t3, CATS[0], 55)
    other = talk(user("organizer")[1]); suggest(other, CATS[1], 65)
    mine_q = {x["talkId"] for x in requests.get(B + "/studio/categories-suggest/review", headers=ORG).json()["suggestions"]}
    ok(t3 in mine_q and other not in mine_q, "file de relecture : l'organisateur ne voit que ses vidéos")
    all_q = {x["talkId"] for x in requests.get(B + "/studio/categories-suggest/review", headers=ADM).json()["suggestions"]}
    ok({t3, other} <= all_q, "file de relecture : l'administrateur voit tout")
    ok(requests.get(B + "/studio/categories-suggest/review", headers=MEM).status_code == 403, "file de relecture : un membre refusé")

    # Rattrapage administrateur
    t4 = talk(uorg)
    ok(requests.post(B + "/admin/categories-suggest/backfill", headers=ORG).status_code == 403, "rattrapage : réservé à l'administrateur")
    stats = requests.get(B + "/admin/categories-suggest/stats", headers=ADM).json(); ok(stats["withoutCategory"] >= 1 and stats["batch"] == 100, "statistiques : vidéos sans catégorie comptées")
    q = requests.post(B + "/admin/categories-suggest/backfill", headers=ADM).json()["queued"]
    cur.execute("select count(*) from category_jobs where talk_id=%s and status='pending'", (t4,)); ok(q >= 1 and cur.fetchone()[0] == 1, "rattrapage : la vidéo sans catégorie est mise en file")
    cur.execute("select count(*) from category_jobs where talk_id = any(%s::uuid[])", ([tk, t1],)); ok(cur.fetchone()[0] == 2, "rattrapage : les vidéos déjà analysées ne sont pas reprises")
    q2 = requests.post(B + "/admin/categories-suggest/backfill", headers=ADM).json()["queued"]
    cur.execute("select count(*) from category_jobs where talk_id=%s", (t4,)); ok(cur.fetchone()[0] == 1, "rattrapage répété : pas de doublon")

    # Fonction coupée : les routes se ferment
    requests.put(B + "/admin/features", headers=ADM, json={"values": {"autocat": False}})
    ok(requests.get(f"{B}/talks/{t1}/studio/categories-suggest", headers=ORG).status_code in (403, 404), "fonction coupée : routes fermées")
    requests.put(B + "/admin/features", headers=ADM, json={"values": {"autocat": True}})
    ok(requests.get(f"{B}/talks/{t1}/studio/categories-suggest", headers=ORG).status_code == 200, "fonction rallumée : routes ouvertes")
finally:
    cur.execute("delete from talks where id = any(%s::uuid[])", ([str(x) for x in mine],))
    cur.execute("update categories set is_active=true where id = any(%s)", (CATS,))
    cur.execute("delete from category_jobs where talk_id not in (select id from talks)")
print("TOUT OK")
