"""16.2b : pages intervenants. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:5]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def talk(title, speaker, pub="published", adult=True):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,show_adults) "
                "values (%s,'d',%s,'youtube',%s,%s,%s,'ready','free',600,%s) returning id", (title, speaker, "v" + uuid.uuid4().hex[:9], aid, pub, adult))
    return str(cur.fetchone()[0])


name = f"Cheikh Ámine {tag}"
a = talk(f"A {tag}", name); b = talk(f"B {tag}", name.lower()); c = talk(f"C {tag}", name, pub="draft"); k = talk(f"K {tag}", name, adult=False)
slug = f"cheikh-amine-{tag}"
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d',%s,'youtube','vv'||%s::text,%s,'published','ready','free',60)", (f"Arabe {tag}", "الشيخ " + "".join(chr(0x0627 + int(ch, 16)) for ch in tag), tag, aid))
# 1. Fiche : regroupe les graphies, ignore brouillon et contenu réservé aux enfants
r = requests.get(f"{B}/speakers/{slug}"); ok(r.status_code == 200, "fiche par slug")
j = r.json(); ok(j["talks"] == 2 and j["name"] in (name, name.lower()), f"2 conférences visibles, graphies regroupées ({j['name']})")
ok(requests.get(f"{B}/speakers/inconnu-{tag}").status_code == 404, "intervenant inconnu : 404")
ok(requests.get(f"{B}/speakers/A%20B").status_code == 400, "slug invalide refusé")
# 2. Liste
lst = requests.get(f"{B}/speakers").json(); ok(any(x["slug"] == slug and x["talks"] == 2 for x in lst), "présent dans la liste avec son nombre")
ok(any(x["slug"].startswith("intervenant-") for x in lst), "nom arabe : slug de repli « intervenant-… »")
# 3. Conférences filtrées par intervenant
ts = requests.get(f"{B}/talks", params={"speaker": slug}).json(); ok(sorted(x["title"] for x in ts) == [f"A {tag}", f"B {tag}"], "/talks?speaker= : conférences de l'intervenant seulement")
ok(requests.get(f"{B}/talks", params={"speaker": f"zzz-{tag}"}).json() == [], "/talks?speaker= inconnu : liste vide")
# 4. Série de l'intervenant
cur.execute("insert into series(owner_id,title,description,published,speaker) values (%s,%s,'d',true,%s) returning id", (aid, f"Série {tag}", name)); sid = str(cur.fetchone()[0])
cur.execute("insert into series_episodes(series_id,talk_id,position) values (%s,%s,1)", (sid, a))
j = requests.get(f"{B}/speakers/{slug}").json(); ok([s["id"] for s in j["series"]] == [sid] and j["seriesCount"] == 1, "séries de l'intervenant")
# 5. Lien depuis la conférence
ok(requests.get(f"{B}/talks/{a}").json()["speakerSlug"] == slug, "conférence : speakerSlug")
# 6. Présentation : réservée à l'admin, modifiable, effaçable
ok(requests.put(f"{B}/admin/speakers/{slug}", json={"bio": "x"}).status_code == 401, "présentation : refusée sans connexion")
r = requests.put(f"{B}/admin/speakers/{slug}", headers=adm, json={"bio": "  Imam et enseignant.  "}); ok(r.status_code == 200 and r.json()["bio"] == "Imam et enseignant.", "présentation enregistrée")
ok(requests.get(f"{B}/speakers/{slug}").json()["bio"] == "Imam et enseignant.", "présentation visible")
ok(requests.put(f"{B}/admin/speakers/introuvable-{tag}", headers=adm, json={"bio": "x"}).status_code == 404, "présentation d'un inconnu : 404")
ok(requests.put(f"{B}/admin/speakers/{slug}", headers=adm, json={"bio": "x" * 3001}).status_code == 400, "présentation trop longue refusée")
ad = requests.get(f"{B}/admin/speakers", headers=adm).json(); ok(any(x["slug"] == slug and x["bio"] and x["talks"] >= 3 for x in ad), "admin : liste avec présentation (brouillons compris)")
# 7. SEO
sj = requests.get(f"{B}/seo/speakers/{slug}").json(); ok(sj["name"] and len(sj["talks"]) == 2 and all(t["slug"] for t in sj["talks"]) and sj["series"][0]["slug"] and sj["site"]["baseUrl"], "seo : fiche avec adresses lisibles")
ok(any(x["slug"] == slug for x in requests.get(f"{B}/seo/sitemap").json()["speakers"]), "plan du site : intervenant listé")
requests.put(f"{B}/admin/speakers/{slug}", headers=adm, json={"bio": ""})
ok(requests.get(f"{B}/speakers/{slug}").json()["bio"] == "", "présentation effacée")
print("TOUT OK")
