"""16.1 (site) : balises <head>, JSON-LD, robots.txt, sitemap.xml, noindex. Prérequis : API (3055), site (3077) et PG de test (5544)."""
import html as H, json, re, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; W = "http://127.0.0.1:3077"; BASE = "https://www.exemple-test.fr"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(f"{B}/admin/settings", headers=adm, json={"values": {"web_url": BASE}})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(title, pub="published", access="free"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,external_thumb) values(%s,%s,'Cheikh <b>Test</b>','youtube','dQw4w9WgXcQ',%s,%s,'ready',%s,3725,'fr','https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg') returning id",
                (f"{title}{tag}", f"Une description </script><b>piégée</b> de {title}. " * 6, aid, pub, access))
    return str(cur.fetchone()[0])


free, prem, draft = mk("Libre"), mk("Premium", access="premium"), mk("Brouillon", pub="draft")
meta = lambda html, key: (re.search(r'<meta (?:property|name)="%s" content="([^"]*)"' % re.escape(key), html) or [None, None])[1]
ld = lambda html: [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)]

h = requests.get(f"{W}/talks/{free}").text
ok(f"<title>Libre{tag} — Cheikh &lt;b&gt;Test&lt;/b&gt; | Mejliss TV</title>" in h, "titre : « Conférence — Intervenant | Site » (intervenant échappé)")
slug = requests.get(f"{B}/seo/talks/{free}").json()["slug"]
ok(f'<link rel="canonical" href="{BASE}/conferences/{slug}"' in h, "adresse canonique (adresse lisible)")
r0 = requests.get(f"{W}/talks/{free}", allow_redirects=False)
ok(r0.status_code == 308 and r0.headers["location"].endswith(f"/conferences/{slug}"), "ancienne adresse : redirection permanente")
ok(meta(h, "og:type") == "video.other" and meta(h, "og:image") == f"{BASE}/api/seo/poster/talks/{free}" and meta(h, "twitter:card") == "summary_large_image", "aperçu de partage : type, image stable, grande carte")
d = H.unescape(meta(h, "description") or ""); ok(0 < len(d) <= 160 and "piégée" in d and "<" in d and "&lt;" not in (meta(h, "description") or "").replace("&lt;", ""), "description de moins de 160 caractères, échappée dans la balise")
ok(f"Libre{tag}" in re.sub(r"<script.*?</script>", "", h, flags=re.S).split("<h1")[1][:200], "titre dans le HTML dès le premier octet (h1)")
ok("piégée" in h, "description lisible dans le HTML (hors JavaScript)")
j = ld(h); ok(len(j) == 1 and j[0]["@type"] == "VideoObject", "données structurées VideoObject")
v = j[0]
ok(v["name"] == f"Libre{tag}" and v["duration"] == "PT1H2M5S" and v["inLanguage"] == "fr" and v["isAccessibleForFree"] is True, "nom, durée ISO 8601 (1 h 02 min 05 s), langue, accès libre")
ok(v["embedUrl"] == "https://www.youtube.com/embed/dQw4w9WgXcQ" and v["thumbnailUrl"] == [f"{BASE}/api/seo/poster/talks/{free}"] and "hasPart" not in v, "intégration YouTube, vignette absolue")
ok(re.match(r"\d{4}-\d\d-\d\dT", v["uploadDate"]) is not None, "date de mise en ligne")
ok("</script><b>" not in h, "JSON-LD : balise de fermeture neutralisée")

hp = requests.get(f"{W}/talks/{prem}").text
vp = ld(hp)[0]
ok(vp["isAccessibleForFree"] is False and vp["hasPart"]["isAccessibleForFree"] is False and vp["hasPart"]["cssSelector"] == ".player-wrap", "premium : contenu payant déclaré à Google")
hd = requests.get(f"{W}/talks/{draft}").text
ok('name="robots" content="noindex' in hd and not ld(hd), "brouillon : noindex, aucune donnée structurée")
hn = requests.get(f"{W}/talks/{uuid.uuid4()}").text
ok('name="robots" content="noindex' in hn, "conférence inconnue : noindex")

# --- vignette via le site (redirection non suivie par le proxy)
r = requests.get(f"{W}/api/seo/poster/talks/{free}", allow_redirects=False)
ok(r.status_code == 302 and r.headers["location"].startswith("https://i.ytimg.com/"), "vignette stable servie par le site : redirection transmise")

# --- série
sid = requests.post(f"{B}/series", headers=adm, json={"title": f"Série {tag}", "hasSeasons": True, "access": "free", "speaker": "Cheikh", "description": "Une série complète"}).json()["id"]
s1 = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()["seasons"][0]["id"]
requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": free, "seasonId": s1}, {"talkId": prem, "seasonId": s1}]})
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": True})
hs = requests.get(f"{W}/series/{sid}").text
js = ld(hs)[0]
ok(f"<title>Série {tag} | Mejliss TV</title>" in hs and meta(hs, "og:type") == "video.tv_show", "série : titre et type de partage")
ok(js["@type"] == "TVSeries" and js["numberOfEpisodes"] == 2 and js["episode"][0]["url"] == f"{BASE}/conferences/{slug}" and js["episode"][1]["partOfSeason"]["seasonNumber"] == 1, "série : TVSeries avec épisodes et saison")
ok(f"Libre{tag}" in hs and f'href="/conferences/{slug}"' in hs, "série : liste des épisodes dans le HTML (liens explorables)")
hv = requests.get(f"{W}/talks/{free}").text
ok(js is not None and '"isPartOf"' in hv, "conférence d'une série : rattachée à la série")

# --- robots.txt et sitemap.xml
rb = requests.get(f"{W}/robots.txt").text
ok(f"Sitemap: {BASE}/sitemap.xml" in rb and "Disallow: /admin" in rb and "Disallow: /studio" in rb and "Disallow: /account" in rb and "Allow: /" in rb, "robots.txt : sitemap, espaces privés exclus")
sm = requests.get(f"{W}/sitemap.xml").text
slug_prem = requests.get(f"{B}/seo/talks/{prem}").json()["slug"]; slug_ser = requests.get(f"{B}/seo/series/{sid}").json()["slug"]
ok(f"<loc>{BASE}/conferences/{slug}</loc>" in sm and f"<loc>{BASE}/conferences/{slug_prem}</loc>" in sm and f"<loc>{BASE}/series/{slug_ser}</loc>" in sm, "sitemap : conférences et série (adresses lisibles)")
ok(draft not in sm and f"<loc>{BASE}/</loc>" in sm.replace(f"<loc>{BASE}</loc>", f"<loc>{BASE}/</loc>") and "/legal/cgv" in sm, "sitemap : sans brouillon, avec accueil et pages légales")

# --- espaces privés
for path in ("/account", "/library", "/login", "/register", "/studio", "/admin", "/welcome"):
    ok('name="robots" content="noindex' in requests.get(f"{W}{path}").text, f"{path} : noindex")
home = requests.get(f"{W}/").text
ok('name="robots" content="noindex' not in home and "<title>Mejliss TV</title>" in home and meta(home, "description"), "accueil : indexable, titre et description")
requests.put(f"{B}/admin/settings", headers=adm, json={"values": {"web_url": None}})
print("TOUT EST OK")
