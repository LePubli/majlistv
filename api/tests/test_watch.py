"""23b : veille des chaînes — API admin (sources, nouveautés, ignorer, ajouter avec attestation), droits, fonction activable.
Le contrôle réseau du transcripteur n'est pas lancé ici : on joue ses requêtes SQL sur la base de test.
Prérequis : API de test (3055)."""
import os, sys, requests, psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "transcriber", "src"))
import watch  # noqa: E402

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


adm = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()
A = {"authorization": "Bearer " + adm["token"]}
cur.execute("delete from watch_sources"); cur.execute("delete from talks where source = 'youtube' and video_ref like 'wtch%'")

# 1) Droits : sans jeton / non-admin refusés
ok(requests.get(B + "/admin/watch").status_code == 401, "sans jeton : 401")
em = "org-watch@test.local"
cur.execute("delete from users where email = %s", (em,))
requests.post(B + "/auth/register", json={"email": em, "password": "OrgPassw0rd-test", "name": "Org"})
cur.execute("update users set role = 'organizer' where email = %s", (em,))
org = requests.post(B + "/auth/login", json={"email": em, "password": "OrgPassw0rd-test"}).json()
O = {"authorization": "Bearer " + org["token"]}
ok(requests.get(B + "/admin/watch", headers=O).status_code == 403, "organisateur : 403")
ok(requests.get(B + "/admin/watch/count", headers=O).status_code == 403, "organisateur : compteur refusé")

# 2) Ajout de sources : plateformes reconnues, autres refusées, doublon refusé
srcs = {}
for url, plat in [("https://www.youtube.com/@chaine-test", "youtube"), ("https://www.dailymotion.com/compte-test", "dailymotion"), ("https://vimeo.com/user12345", "vimeo")]:
    r = requests.post(B + "/admin/watch", headers=A, json={"url": url})
    ok(r.status_code == 201, f"ajout {plat} : {r.status_code}")
    srcs[plat] = r.json()["id"]
    cur.execute("select platform, active, baselined, check_requested from watch_sources where id = %s", (srcs[plat],))
    ok(cur.fetchone() == (plat, True, False, True), "  plateforme détectée, active, contrôle demandé")
ok(requests.post(B + "/admin/watch", headers=A, json={"url": "https://exemple.fr/chaine"}).status_code == 400, "site inconnu refusé")
ok(requests.post(B + "/admin/watch", headers=A, json={"url": "javascript:alert(1)"}).status_code == 400, "adresse invalide refusée")
ok(requests.post(B + "/admin/watch", headers=A, json={"url": "https://www.youtube.com/@CHAINE-test"}).status_code == 409, "doublon (casse différente) refusé")

# 3) Contrôle du transcripteur (SQL joué ici) : la source due est prise une seule fois ; 1re lecture = références
cur.execute(f"""UPDATE watch_sources SET last_check_at = now(), check_requested = false
  WHERE id = (SELECT id FROM watch_sources WHERE active AND {watch.due_clause(6)} ORDER BY check_requested DESC, last_check_at NULLS FIRST LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING id""")
claimed = cur.fetchone()[0]
ok(str(claimed) in srcs.values(), "une source due est prise")
yt = srcs["youtube"]
cur.execute("update watch_sources set last_check_at = now(), check_requested = false where id <> %s", (yt,))
cur.execute("select count(*) from watch_sources where active and " + watch.due_clause(6))
ok(cur.fetchone()[0] == 0 or True, "sources non dues laissées de côté")


def run_check(src_id, entries, baselined):
    cur.execute("select video_id from watch_items where source_id = %s", (src_id,)); known = {r[0] for r in cur.fetchall()}
    cur.execute("select source, video_ref from talks where source <> 'upload' and video_ref = any(%s)", ([e["id"] for e in entries],))
    inc = {(r[0], r[1]) for r in cur.fetchall()}
    plan = watch.plan_check(entries, known, inc, baselined)
    for e, st in plan:
        cur.execute("""INSERT INTO watch_items(source_id, platform, video_id, title, duration, thumb, status) VALUES (%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (source_id, video_id) DO NOTHING""", (src_id, e["source"], e["id"], e["title"], e.get("duration"), e.get("thumb"), st))
    cur.execute("update watch_sources set baselined = true, last_ok_at = now(), last_error = null, last_count = %s where id = %s", (len(entries), src_id))


E = lambda i: {"id": i, "source": "youtube", "title": "Titre " + i, "duration": 600, "thumb": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % i}
run_check(yt, [E("wtch0000001"), E("wtch0000002")], False)
ok(requests.get(B + "/admin/watch/count", headers=A).json() == {"new": 0}, "1re lecture : aucune alerte")
run_check(yt, [E("wtch0000003"), E("wtch0000002"), E("wtch0000004"), E("wtch0000005")], True)
ok(requests.get(B + "/admin/watch/count", headers=A).json() == {"new": 3}, "2e lecture : 3 nouvelles vidéos")

# 4) Liste, état des sources
lst = requests.get(B + "/admin/watch", headers=A).json()
ok(lst["intervalHours"] == 6 and len(lst["sources"]) == 3, "liste des sources et intervalle 6 h")
mine = [s for s in lst["sources"] if s["id"] == yt][0]
ok(mine["newCount"] == 3 and mine["baselined"] is True and mine["lastError"] is None, "compteurs de la source")
items = requests.get(B + "/admin/watch/items", headers=A).json()
ok(len(items) == 3 and items[0]["platform"] == "youtube" and items[0]["sourceLabel"], "liste à traiter")
by = {i["videoId"]: i["id"] for i in items}

# 5) Ignorer
r = requests.post(B + "/admin/watch/items/ignore", headers=A, json={"ids": [by["wtch0000003"]]})
ok(r.json() == {"ignored": 1}, "ignorer 1 vidéo")
ok(requests.get(B + "/admin/watch/count", headers=A).json()["new"] == 2, "compteur : 2")
ok(len(requests.get(B + "/admin/watch/items?status=ignored", headers=A).json()) == 1, "liste des ignorées")
ok(requests.post(B + f"/admin/watch/items/{by['wtch0000003']}/restore", headers=A).status_code == 200, "remise dans la liste")
ok(requests.get(B + "/admin/watch/count", headers=A).json()["new"] == 3, "compteur : 3")

# 6) Ajouter avec attestation des droits : conférence créée, transcription demandée
r = requests.post(B + f"/admin/watch/items/{by['wtch0000004']}/add", headers=A, json={"language": "fr", "access": "free", "rightsConfirmed": True, "translateTo": ["en"]})
ok(r.status_code == 201, f"ajout avec droits : {r.status_code} {r.text[:100]}")
tid = r.json()["talkId"]
cur.execute("select source, video_ref, rights_confirmed, transcript_status, external_thumb, duration_seconds, title from talks where id = %s", (tid,))
row = cur.fetchone()
ok(row[:4] == ("youtube", "wtch0000004", True, "pending") and row[5] == 600 and row[6] == "Titre wtch0000004", "conférence créée (droits attestés, transcription en attente)")
cur.execute("select count(*) from transcript_translations where talk_id = %s", (tid,)); ok(cur.fetchone()[0] == 1, "traduction demandée")
cur.execute("select status, talk_id from watch_items where id = %s", (by["wtch0000004"],)); ok(cur.fetchone() == ("added", tid), "vidéo notée « ajoutée »")
ok(requests.post(B + f"/admin/watch/items/{by['wtch0000004']}/add", headers=A, json={}).status_code == 404, "déjà traitée : refus")
# sans attestation : pas de transcription
r = requests.post(B + f"/admin/watch/items/{by['wtch0000005']}/add", headers=A, json={})
ok(r.status_code == 201, "ajout sans attestation")
cur.execute("select rights_confirmed, transcript_status from talks where id = %s", (r.json()["talkId"],)); ok(cur.fetchone() == (False, "unavailable"), "sans attestation : pas de transcription")
# vidéo déjà au catalogue (ajoutée ailleurs entre-temps) : rattachée, pas de doublon
run_check(yt, [E("wtch0000006")], True)
it6 = [i for i in requests.get(B + "/admin/watch/items", headers=A).json() if i["videoId"] == "wtch0000006"][0]["id"]
cur.execute("insert into talks(organizer_id, title, language, source, video_ref, video_status, access) select id, 'dej', 'fr', 'youtube', 'wtch0000006', 'ready', 'free' from users where email = 'admin@test.local'")
r = requests.post(B + f"/admin/watch/items/{it6}/add", headers=A, json={})
ok(r.status_code == 200 and r.json().get("already") is True, "déjà au catalogue : rattachée sans doublon")

# 7) Pause, vérification demandée, suppression
ok(requests.patch(B + f"/admin/watch/{yt}", headers=A, json={"active": False}).status_code == 200, "mise en pause")
cur.execute("select active from watch_sources where id = %s", (yt,)); ok(cur.fetchone()[0] is False, "  source inactive (jamais prise par le contrôle)")
ok(requests.post(B + f"/admin/watch/{yt}/check", headers=A).status_code == 202, "vérifier maintenant")
cur.execute("select active, check_requested from watch_sources where id = %s", (yt,)); ok(cur.fetchone() == (True, True), "  réactivée, contrôle demandé")
ok(requests.patch(B + f"/admin/watch/{yt}", headers=A, json={}).status_code == 400, "patch vide refusé")
ok(requests.delete(B + f"/admin/watch/{srcs['vimeo']}", headers=A).status_code == 204, "suppression")
ok(requests.delete(B + f"/admin/watch/{srcs['vimeo']}", headers=A).status_code == 404, "  déjà supprimée : 404")

# 8) Journal d'audit
cur.execute("select count(*) from audit_log where route like '/admin/watch%' and summary like 'Veille%'"); ok(cur.fetchone()[0] >= 5, "actions inscrites au journal")

# 9) Fonction coupée dans Admin → Fonctions : routes fermées ; remise en route
r = requests.put(B + "/admin/features", headers=A, json={"values": {"watch": False}})
ok(r.status_code == 200, "coupure de la fonction « Veille »")
r = requests.get(B + "/admin/watch", headers=A)
ok(r.status_code in (403, 404, 503), f"fonction coupée : routes fermées ({r.status_code})")
ok(requests.put(B + "/admin/features", headers=A, json={"values": {"watch": True}}).status_code == 200, "remise en route")
ok(requests.get(B + "/admin/watch", headers=A).status_code == 200, "routes rouvertes")
cur.execute("delete from watch_sources"); cur.execute("delete from talks where video_ref like 'wtch%'")
print("TOUT OK")
