"""16.2 : adresses lisibles, chapitres et extrait dans les données publiques. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def seo(path):
    return requests.get(B + "/seo/" + path)


tag = uuid.uuid4().hex[:5]
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def talk(title, access="free", pub="published", **extra):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_text) "
                "values (%s,'d','Cheikh','youtube',%s,%s,%s,'ready',%s,600,'fr',%s) returning id",
                (title, "v" + uuid.uuid4().hex[:9], aid, pub, access, extra.get("tr")))
    return str(cur.fetchone()[0])


# 1. Slugs : accents, ponctuation, apostrophes
t1 = talk(f"La patience dans l’épreuve {tag}")
r = seo(f"talks/{t1}"); ok(r.status_code == 200, "lecture par identifiant")
s1 = r.json()["slug"]
ok(s1 == f"la-patience-dans-l-epreuve-{tag}".replace("l-epreuve", "lepreuve") or s1.startswith("la-patience-dans-lepreuve"), f"slug sans accents ni apostrophe ({s1})")
# 2. Lecture par slug = même conférence ; slug stable
r2 = seo(f"talks/{s1}"); ok(r2.status_code == 200 and r2.json()["id"] == t1, "lecture par slug")
cur.execute("update talks set title='Titre changé' where id=%s", (t1,))
ok(seo(f"talks/{t1}").json()["slug"] == s1, "le slug ne change pas quand le titre change")
# 3. Doublons : « -2 »
a = talk(f"Même titre {tag}"); b = talk(f"Même titre {tag}")
sa = seo(f"talks/{a}").json()["slug"]; sb = seo(f"talks/{b}").json()["slug"]
ok(sa != sb and sb == sa + "-2", f"doublon : {sa} / {sb}")
# 4. Titre arabe : repli « conference-xxxxxxxx »
c = talk("سورة الفاتحة")
sc = seo(f"talks/{c}").json()["slug"]
ok(sc == "conference-" + c[:8], f"titre arabe : {sc}")
# 5. Brouillon : introuvable par slug comme par identifiant
d = talk(f"Brouillon {tag}", pub="draft")
ok(seo(f"talks/{d}").status_code == 404, "brouillon : 404 (identifiant)")
cur.execute("update talks set slug=%s where id=%s", (f"brouillon-{tag}", d))
ok(seo(f"talks/brouillon-{tag}").status_code == 404, "brouillon : 404 (slug)")
ok(seo("talks/inconnu-" + tag).status_code == 404, "slug inconnu : 404")
ok(seo("talks/..%2Fetc").status_code in (400, 404), "entrée invalide refusée")
# 6. Chapitres + extrait : gratuit oui, premium non
tr = "Au nom d'Allah. " * 200
f = talk(f"Gratuit {tag}", access="free", tr=tr)
cur.execute("insert into talk_insights(talk_id,lang,status,summary,chapters) values (%s,'fr','ready','Un résumé court.',%s)",
            (f, '[{"ms":0,"title":"Introduction"},{"ms":125000,"title":"La patience"}]'))
j = seo(f"talks/{f}").json()
ok([x["title"] for x in j["chapters"]] == ["Introduction", "La patience"] and j["chapters"][1]["ms"] == 125000, "gratuit : chapitres exposés")
ok(0 < len(j["excerpt"]) <= 1200 and j["excerpt"].startswith("Au nom d'Allah"), "gratuit : extrait de transcription")
ok(j["summary"] == "Un résumé court.", "gratuit : résumé exposé")
p = talk(f"Premium {tag}", access="premium", tr=tr)
cur.execute("insert into talk_insights(talk_id,lang,status,summary,chapters) values (%s,'fr','ready','Secret.','[{\"ms\":0,\"title\":\"Chap\"}]')", (p,))
jp = seo(f"talks/{p}").json()
ok(jp["chapters"] == [] and jp["excerpt"] == "" and jp["summary"] == "", "premium : ni chapitres, ni extrait, ni résumé")
# 7. Séries
cur.execute("insert into series(owner_id,title,description,published) values (%s,%s,'d',true) returning id", (aid, f"Série éclairée {tag}")); sid = str(cur.fetchone()[0])
cur.execute("insert into series_episodes(series_id,talk_id,position) values (%s,%s,1)", (sid, f))
rs = seo(f"series/{sid}"); ok(rs.status_code == 200, "série par identifiant")
ss = rs.json()["slug"]; ok(ss.startswith("serie-eclairee"), f"slug série ({ss})")
ok(seo(f"series/{ss}").json()["id"] == sid, "série par slug")
ok(rs.json()["episodes"][0]["slug"] == seo(f"talks/{f}").json()["slug"], "épisodes avec leur slug")
# 8. Plan du site : tous avec un slug
cur.execute("update talks set slug=null where id=%s", (a,))
sm = seo("sitemap").json()
ok(all(x.get("slug") for x in sm["talks"]) and all(x.get("slug") for x in sm["series"]), "plan du site : slugs partout")
ok(any(x["id"] == f and x["slug"] for x in sm["talks"]) and not any(x["id"] == d for x in sm["talks"]), "plan du site : visibles seulement")
print("TOUT OK")
