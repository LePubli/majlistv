"""16.1 : données publiques de référencement (/seo/…), vignettes stables, plan du site. Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(title, pub="published", status="ready", access="free", source="youtube", ref="dQw4w9WgXcQ"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language) values(%s,%s,'Cheikh Test',%s,%s,%s,%s,%s,%s,3725,'fr') returning id",
                (f"{title}{tag}", f"Description de {title} " * 5, source, ref, aid, pub, status, access))
    return str(cur.fetchone()[0])


free, prem, draft, proc = mk("Libre"), mk("Premium", access="premium"), mk("Brouillon", pub="draft"), mk("Encours", status="processing")
t = requests.get(f"{B}/seo/talks/{free}")
ok(t.status_code == 200, "conférence publique : données de référencement")
d = t.json()
ok(d["title"] == f"Libre{tag}" and d["speaker"] == "Cheikh Test" and d["durationSeconds"] == 3725 and d["language"] == "fr" and d["access"] == "free", "titre, intervenant, durée, langue, accès")
ok(d["embed"] == {"kind": "youtube", "ref": "dQw4w9WgXcQ"} and d["posterPath"] is None, "YouTube : lien d'intégration ; pas de miniature sans image connue")
ok(d["site"]["baseUrl"].startswith("http") and d["site"]["appName"], "adresse du site et nom fournis")
ok(not any(k in d for k in ("playbackToken", "hlsPath", "tracks", "transcript", "video_ref")), "aucune donnée de lecture ou de transcription")
p = requests.get(f"{B}/seo/talks/{prem}").json()
ok(p["access"] == "premium" and "playbackToken" not in p, "premium : titre et description seulement")
ok(requests.get(f"{B}/seo/talks/{draft}").status_code == 404, "brouillon : introuvable")
ok(requests.get(f"{B}/seo/talks/{proc}").status_code == 404, "conversion en cours : introuvable")
ok(requests.get(f"{B}/seo/talks/not-a-uuid").status_code == 400, "identifiant invalide refusé")

# --- vignette stable
cur.execute("update talks set external_thumb='https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' where id=%s", (free,))
d = requests.get(f"{B}/seo/talks/{free}").json()
ok(d["posterPath"] == f"/api/seo/poster/talks/{free}", "miniature : adresse stable annoncée")
r = requests.get(f"{B}/seo/poster/talks/{free}", allow_redirects=False)
ok(r.status_code == 302 and r.headers["location"].startswith("https://i.ytimg.com/"), "miniature : redirection vers l'image d'origine")
ok(requests.get(f"{B}/seo/poster/talks/{draft}", allow_redirects=False).status_code == 404, "miniature d'un brouillon : introuvable")
ok(requests.get(f"{B}/seo/poster/talks/{prem}", allow_redirects=False).status_code == 404, "sans image : 404")

# --- série
sid = requests.post(f"{B}/series", headers=adm, json={"title": f"Série {tag}", "hasSeasons": True, "access": "free", "speaker": "Cheikh Test", "description": "Une série"}).json()["id"]
s1 = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()["seasons"][0]["id"]
requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": free, "seasonId": s1}, {"talkId": prem, "seasonId": s1}, {"talkId": draft, "seasonId": s1}]})
ok(requests.get(f"{B}/seo/series/{sid}").status_code == 404, "série non publiée : introuvable")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": True})
s = requests.get(f"{B}/seo/series/{sid}").json()
ok([e["id"] for e in s["episodes"]] == [free, prem] and s["episodes"][0]["number"] == 1 and s["episodes"][1]["seasonNumber"] == 1, "série : épisodes visibles dans l'ordre (brouillon exclu), numérotés")
ok(s["posterPath"] == f"/api/seo/poster/series/{sid}", "série : miniature stable (d'après le premier épisode illustré)")
r = requests.get(f"{B}/seo/poster/series/{sid}", allow_redirects=False)
ok(r.status_code == 302 and "ytimg" in r.headers["location"], "série : redirection de la vignette")
d = requests.get(f"{B}/seo/talks/{free}").json()
ok(d["series"]["id"] == sid and d["series"]["number"] == 1, "conférence : appartenance à la série")

# --- plan du site
sm = requests.get(f"{B}/seo/sitemap").json()
tids = [x["id"] for x in sm["talks"]]
ok(free in tids and prem in tids and draft not in tids and proc not in tids, "plan du site : conférences visibles seulement")
ok(sid in [x["id"] for x in sm["series"]], "plan du site : série publiée")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": False})
ok(sid not in [x["id"] for x in requests.get(f"{B}/seo/sitemap").json()["series"]], "série dépubliée : retirée du plan du site")
ok(requests.get(f"{B}/seo/series/{sid}").status_code == 404, "série dépubliée : introuvable")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": True})

# --- réglage
r = requests.put(f"{B}/admin/settings", headers=adm, json={"values": {"seo_description": f"Ma description {tag}"}})
ok(r.status_code == 200 and requests.get(f"{B}/seo/site").json()["description"] == f"Ma description {tag}", "description du site modifiable dans le back-office")
requests.put(f"{B}/admin/settings", headers=adm, json={"values": {"seo_description": None}})
print("TOUT EST OK")
