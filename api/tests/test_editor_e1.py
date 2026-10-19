"""Étape E1 — module « Éditeur de montage » : projets, sauvegarde automatique, versions, verrou d'édition (lecture seule pour
les autres), aperçu 360p, pistes liées (sous-titres, voix française du doublage), droits, journal d'audit, Studio → Contenus.

Prérequis (tout en local) : API (3055), PG (5544), S3 de test moto (5599, bucket majlis-videos), FFmpeg.
Lancement depuis la racine du dépôt : python3 api/tests/test_editor_e1.py"""
import os, sys, time, uuid
import boto3, psycopg2, requests
sys.path.insert(0, os.path.dirname(__file__))
from e1_fixture import make_hls, add_transcript

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
tag = uuid.uuid4().hex[:6]; talks = []; users = []; fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, timeout=60, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, timeout=60, **kw)
    return r
def login(email, pw): return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test")
def user(n, role):
    em = f"e1-{n}-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"{n.capitalize()} {tag}"})
    cur.execute("update users set role=%s where email=%s returning id", (role, em)); users.append(str(cur.fetchone()[0]))
    return login(em, "Passw0rd-test"), users[-1]
def talk(n, owner, source="upload", video="ready", dur=120):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh Test',%s,%s,%s,'published',%s,'free',%s,'ar','ar') returning id""",
                (f"E1 {tag} {n}", source, f"talks/{tag}-{n}" if source == "upload" else f"yt{tag}{n}", owner, video, dur))
    t = str(cur.fetchone()[0]); talks.append(t); return t
S1, S2, SA = "sess-" + tag + "-one", "sess-" + tag + "-two", "sess-" + tag + "-adm"
def tl(clips, dur=120): return {"v": 1, "duration": dur, "clips": [{"id": f"c{i+1}", "in": a, "out": b} for i, (a, b) in enumerate(clips)]}

try:
    # --- module désactivé / activé
    rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": False})
    ok(rq("GET", "/studio/editor/projects", headers=A).json().get("code") == "module_off", "module désactivé : routes fermées (module_off)")
    ok(rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": True}).status_code == 200, "module activé (Admin → Modules)")
    rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True})
    mods = rq("GET", "/admin/modules", headers=A).json()
    m = next((x for x in (mods.get("modules") if isinstance(mods, dict) else mods) if x["id"] == "editor"), None)
    ok(m and m["version"] == "0.3.0" and not m.get("error"), "fiche du module valide (version 0.3.0)")

    O, oid = user("orga", "organizer"); O2, oid2 = user("autre", "organizer"); M, _ = user("modo", "moderator")
    t1 = talk("montage", oid); t_yt = talk("youtube", oid, source="youtube"); t_proc = talk("conversion", oid, video="processing"); t_other = talk("autrui", oid2)
    make_hls(s3, t1, 120); n_fr = add_transcript(cur, t1, 120)
    cur.execute("insert into dub_segments(talk_id, idx, keep_original) values (%s, 2, true)", (t1,))

    # --- liste et création
    v = rq("GET", "/studio/editor/projects", headers=O).json()
    row = {x["id"]: x for x in v["talks"]}
    ok(row[t1]["editable"] and row[t_yt]["reason"] == "external" and row[t_proc]["reason"] == "video", "liste : vidéo envoyée montable, YouTube et vidéo en conversion signalées")
    ok(t_other not in row, "liste : les conférences d'un autre organisateur n'apparaissent pas")
    ok(rq("GET", "/studio/editor/projects", headers=M).status_code == 403, "modérateur : pas d'accès à l'éditeur")
    r = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t1}); ok(r.status_code == 201 and r.json()["created"], "nouveau montage créé")
    pid = r.json()["id"]
    r = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t1}); ok(r.status_code == 200 and r.json()["id"] == pid, "deuxième demande : le même montage est rouvert")
    ok(rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t_yt}).json().get("code") == "external", "YouTube : refusé (vidéo non hébergée)")
    ok(rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t_proc}).json().get("code") == "video", "vidéo en conversion : refusée")
    ok(rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t_other}).status_code == 404, "conférence d'un autre organisateur : introuvable")
    ok(rq("GET", f"/studio/editor/projects/{pid}", headers=O2).status_code == 404, "autre organisateur : le projet est introuvable")

    # --- ouverture : montage initial, aperçu 360p, pistes liées
    p = rq("GET", f"/studio/editor/projects/{pid}?session={S1}", headers=O).json()
    pj = p["project"]; md = p["media"]
    ok(pj["timeline"]["clips"] == [{"id": "c1", "in": 0, "out": 120}] and pj["versionNumber"] == 1 and pj["rev"] == 1, "montage de départ : la vidéo entière, version 1")
    ok(pj["lock"]["active"] is False, "verrou libre à l'ouverture")
    ok(md["preview"]["quality"] == "360p" and "/v0/index.m3u8?t=" in md["preview"]["hls"], "aperçu : playlist 360p (v0) avec jeton de lecture")
    h = rq("GET", md["preview"]["hls"]); ok(h.status_code == 200 and "#EXTINF" in h.text and "X-Amz-Signature" in h.text, "la playlist 360p se lit (segments signés)")
    ok(md["subtitles"]["lang"] == "fr" and len(md["subtitles"]["cues"]) == n_fr, f"sous-titres français liés ({n_fr} phrases)")
    ok(md["dub"] and len(md["dub"]["segments"]) == n_fr and md["dub"]["segments"][2]["keep"] is True, "voix française : phrases du doublage, passage en voix d'origine signalé")

    # --- verrou : un éditeur à la fois, les autres en lecture seule
    l = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S1}).json()
    ok(l["acquired"] and l["lock"]["mine"], "organisateur : prend la main (onglet 1)")
    l2 = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S2}).json()
    ok(not l2["acquired"] and l2["lock"]["otherTab"] and l2["lock"]["canTake"], "même personne, autre onglet : lecture seule, peut reprendre la main")
    la = rq("POST", f"/studio/editor/projects/{pid}/lock", headers=A, json={"session": SA}).json()
    ok(not la["acquired"] and la["lock"]["by"].startswith("Orga") and la["lock"]["canTake"], "administrateur : lecture seule, voit qui modifie, peut reprendre la main")
    ok(rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": "x"}).status_code == 400, "séance invalide : refusée")

    # --- sauvegarde automatique
    cut = tl([(0, 30), (45, 120)])
    ok(rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": cut, "rev": 1, "session": S2}).json().get("code") == "locked", "enregistrer depuis l'onglet en lecture seule : refusé (423)")
    r = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": cut, "rev": 1, "session": S1}); s = r.json()
    ok(r.status_code == 200 and s["rev"] == 2 and s["versionNumber"] == 2 and s["editedDuration"] == 105, "coupe enregistrée (rev 2, version 2, 1 min 45)")
    vs = rq("GET", f"/studio/editor/projects/{pid}/versions", headers=O).json()["versions"]
    ok(len(vs) == 1 and vs[0]["auto"] and vs[0]["editedDuration"] == 120, "copie automatique de l'état d'avant (version 1 : vidéo entière)")
    moved = tl([(45, 120), (0, 30)])
    s = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": moved, "rev": 2, "session": S1}).json()
    ok(s["rev"] == 3 and s["versionNumber"] == 2, "déplacement enregistré, pas de nouvelle copie dans la même séance")
    r = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": cut, "rev": 2, "session": S1})
    ok(r.status_code == 409 and r.json()["rev"] == 3 and r.json()["timeline"]["clips"][0]["in"] == 45, "révision dépassée : conflit (409) avec le montage à jour, rien n'est écrasé")
    for bad, why in [(tl([(0, 130)]), "dépasse la fin"), ({"v": 1, "duration": 120, "clips": []}, "aucun extrait"),
                     (tl([(10, 10.1)]), "extrait trop court"), ({"v": 1, "duration": 120, "clips": [{"id": "a", "in": 0, "out": 5}, {"id": "a", "in": 6, "out": 9}]}, "identifiant en double"),
                     ({"v": 2, "duration": 120, "clips": [{"id": "a", "in": 0, "out": 5}]}, "version inconnue")]:
        r = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": bad, "rev": 3, "session": S1})
        ok(r.status_code == 400, f"montage invalide refusé : {why} ({r.json().get('error')})")
    cur.execute("select timeline->'clips'->0->>'in', rev from editor_projects where id=%s", (pid,)); ok(cur.fetchone() == ("45", 3), "base : montage valide conservé")

    # --- versions nommées et retour à une version
    ok(rq("POST", f"/studio/editor/projects/{pid}/versions", headers=O, json={"label": "Essai", "session": S2}).status_code == 423, "version nommée depuis l'onglet en lecture seule : refusée")
    r = rq("POST", f"/studio/editor/projects/{pid}/versions", headers=O, json={"label": "Montage validé", "session": S1})
    ok(r.status_code == 201 and r.json()["n"] == 2 and r.json()["versionNumber"] == 3, "version nommée « Montage validé » (n° 2)")
    ok(rq("POST", f"/studio/editor/projects/{pid}/versions", headers=O, json={"label": "  ", "session": S1}).status_code == 400, "version sans nom : refusée")
    r = rq("POST", f"/studio/editor/projects/{pid}/versions/1/restore", headers=O, json={"session": S1}); s = r.json()
    ok(r.status_code == 200 and s["timeline"]["clips"] == [{"id": "c1", "in": 0, "out": 120}] and s["rev"] == 4, "retour à la version 1 : vidéo entière")
    vs = rq("GET", f"/studio/editor/projects/{pid}/versions", headers=O).json()["versions"]
    ok(any(x["label"] == "Montage validé" and not x["auto"] for x in vs), "la version nommée reste dans la liste")
    ok(rq("POST", f"/studio/editor/projects/{pid}/versions/99/restore", headers=O, json={"session": S1}).status_code == 404, "version inexistante : introuvable")
    s = rq("POST", f"/studio/editor/projects/{pid}/versions/2/restore", headers=O, json={"session": S1}).json()
    ok(s["timeline"]["clips"][0]["in"] == 45, "retour à la version nommée : le déplacement revient")
    vs = rq("GET", f"/studio/editor/projects/{pid}/versions", headers=O).json()["versions"]
    ok(any(x["label"] == "Avant le retour à la version 2" for x in vs), "copie « Avant le retour à la version 2 » (rien n'est perdu)")
    rev = s["rev"]

    # --- l'administrateur reprend la main (journal d'audit)
    cur.execute("select count(*) from audit_log where route like '/studio/editor%%'"); before = cur.fetchone()[0]
    t = rq("POST", f"/studio/editor/projects/{pid}/takeover", headers=A, json={"session": SA}).json()
    ok(t["acquired"] and t["lock"]["mine"], "administrateur : reprend la main")
    time.sleep(0.5)  # le journal est écrit juste après la réponse
    cur.execute("select summary from audit_log where route = '/studio/editor/projects/:id/takeover' order by id desc limit 1")
    ok("reprise du projet" in (cur.fetchone() or [""])[0], "journal d'audit : reprise de la main inscrite")
    g = rq("GET", f"/studio/editor/projects/{pid}?session={S1}", headers=O).json()["project"]["lock"]
    ok(g["active"] and not g["mine"] and not g["canTake"], "organisateur : désormais en lecture seule, ne peut pas reprendre la main à l'administrateur")
    ok(rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": cut, "rev": rev, "session": S1}).json().get("code") == "locked", "organisateur : enregistrement refusé pendant que l'administrateur modifie")
    ok(rq("POST", f"/studio/editor/projects/{pid}/takeover", headers=O, json={"session": S1}).status_code == 403, "organisateur : reprise de la main refusée")
    s = rq("PUT", f"/studio/editor/projects/{pid}", headers=A, json={"timeline": cut, "rev": rev, "session": SA}).json()
    ok(s.get("rev") == rev + 1, "administrateur : enregistre (rev suivante)")
    for _ in range(3): rq("POST", f"/studio/editor/projects/{pid}/lock", headers=A, json={"session": SA})
    time.sleep(0.5)
    cur.execute("select method, route from audit_log where route like '/studio/editor%%' order by id")
    logged = cur.fetchall()[before:]
    ok(("PUT", "/studio/editor/projects/:id") not in logged and not any(r.endswith("/lock") for _, r in logged), "journal : ni sauvegardes automatiques ni renouvellements du verrou")
    ok(rq("POST", f"/studio/editor/projects/{pid}/unlock", headers=A, json={"session": SA}).json()["released"], "administrateur : rend la main")
    ok(rq("POST", f"/studio/editor/projects/{pid}/lock", headers=O, json={"session": S1}).json()["acquired"], "organisateur : reprend la main une fois le projet libre")

    # --- verrou expiré (onglet fermé sans prévenir, ordinateur en veille)
    cur.execute("update editor_projects set lock_until = now() - interval '1 second' where id=%s", (pid,))
    ok(rq("POST", f"/studio/editor/projects/{pid}/lock", headers=A, json={"session": SA}).json()["acquired"], "verrou expiré : l'administrateur prend la main sans forcer")
    rq("POST", f"/studio/editor/projects/{pid}/unlock", headers=A, json={"session": SA})

    # --- Studio → Contenus : étape « Montée »
    pr = rq("GET", "/studio/production", headers=O).json()["talks"]
    ok(pr[t1].get("editor", {}).get("project") and pr[t1]["editor"]["edited"], "Studio → Contenus : la conférence a un montage en cours")
    ok("editor" not in pr[t_yt], "conférence sans montage : rien")

    # --- au plus 30 copies automatiques
    cur.execute("select rev from editor_projects where id=%s", (pid,)); rev = cur.fetchone()[0]
    for i in range(34):
        ss = f"sess-{tag}-loop{i:02d}"
        rq("POST", f"/studio/editor/projects/{pid}/takeover", headers=O, json={"session": ss})  # nouvel onglet : reprend sa propre main
        s = rq("PUT", f"/studio/editor/projects/{pid}", headers=O, json={"timeline": tl([(0, 10 + i), (60, 120)]), "rev": rev, "session": ss}).json()
        rev = s["rev"]
    cur.execute("select count(*) filter (where auto), count(*) filter (where not auto) from editor_versions where project_id=%s", (pid,))
    na, nn = cur.fetchone(); ok(na == 30 and nn == 1, f"copies automatiques limitées à 30, version nommée gardée ({na} + {nn})")

    # --- suppression
    rq("POST", f"/studio/editor/projects/{pid}/takeover", headers=A, json={"session": SA})
    ok(rq("DELETE", f"/studio/editor/projects/{pid}?session={S1}", headers=O).status_code == 423, "supprimer pendant qu'un autre modifie : refusé")
    rq("POST", f"/studio/editor/projects/{pid}/unlock", headers=A, json={"session": SA})
    ok(rq("DELETE", f"/studio/editor/projects/{pid}?session={S1}", headers=O).json()["deleted"], "projet supprimé (la conférence ne change pas)")
    cur.execute("select count(*) from editor_versions where project_id=%s", (pid,)); ok(cur.fetchone()[0] == 0, "versions supprimées avec le projet")
    cur.execute("select video_status from talks where id=%s", (t1,)); ok(cur.fetchone()[0] == "ready", "la conférence et sa vidéo sont intactes")
    ok(t1 in {x["id"] for x in rq("GET", "/studio/editor/projects", headers=O).json()["talks"]}, "la conférence redevient « à monter »")

    # --- module désactivé : routes fermées, données gardées
    r = rq("POST", "/studio/editor/projects", headers=O, json={"talkId": t1}); pid2 = r.json()["id"]
    rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": False})
    ok(rq("GET", f"/studio/editor/projects/{pid2}", headers=O).status_code == 404 and "editor" not in rq("GET", "/studio/production", headers=O).json()["talks"][t1], "module désactivé : éditeur fermé, Contenus sans étape « Montée »")
    cur.execute("select count(*) from editor_projects where id=%s", (pid2,)); ok(cur.fetchone()[0] == 1, "module désactivé : les montages sont conservés")
finally:
    rq("PUT", "/admin/modules/editor", headers=A, json={"enabled": True})
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    for t in talks:
        objs = s3.list_objects_v2(Bucket="majlis-videos", Prefix=f"hls/{t}/").get("Contents", [])
        for o in objs: s3.delete_object(Bucket="majlis-videos", Key=o["Key"])

print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'Tout est bon'}")
sys.exit(1 if fails else 0)
