"""12.2 : vignettes interactives — réglages dans /config, aperçu au survol (/talks/:id/hover). Prérequis : API (3055), PG (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(source, access="free", pub="published", status="ready", ref="abc12345678"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,access,publication,video_status,description) values('Vignette','X',%s,%s,%s,%s,%s,%s,%s) returning id",
                (source, ref, aid, access, pub, status, "Texte  long\n" * 100)); return cur.fetchone()[0]


# --- /config
put({"card_hover": None, "card_preview": None, "card_preview_delay": None, "card_preview_seconds": None, "card_show_language": None})
c = requests.get(B + "/config").json()["cards"]
ok(c["hover"] is True and c["preview"] is True and c["previewDelay"] == 1500 and c["previewSeconds"] == 20, "valeurs par défaut")
ok(set(c["show"]) == {"access", "duration", "speaker", "category", "language", "description", "favorite", "progress"} and all(c["show"].values()), "toutes les infos affichées par défaut")
put({"card_hover": "false", "card_preview_delay": "3000", "card_preview_seconds": "10", "card_show_language": "false", "card_show_speaker": "false"})
c = requests.get(B + "/config").json()["cards"]
ok(c["hover"] is False and c["previewDelay"] == 3000 and c["previewSeconds"] == 10 and c["show"]["language"] is False and c["show"]["speaker"] is False, "réglages pris en compte")
ok(put({"card_preview_delay": "100"}).status_code == 400, "délai trop court refusé")
ok(put({"card_preview_seconds": "300"}).status_code == 400, "durée trop longue refusée")
ok(requests.get(B + "/config").json()["appName"], "appName toujours présent")
put({k: None for k in ("card_hover", "card_preview_delay", "card_preview_seconds", "card_show_language", "card_show_speaker")})

# --- aperçu
up, yt_free, yt_prem, vi_free, ar = mk("upload"), mk("youtube"), mk("youtube", "premium"), mk("vimeo", ref="123456"), mk("archive", ref="item-x")
up_prem, draft, pending = mk("upload", "premium"), mk("upload", pub="draft"), mk("upload", status="pending")
g = lambda i: requests.get(f"{B}/talks/{i}/hover")
r = g(up).json(); ok(r["kind"] == "hls" and f"/hls/{up}/master.m3u8?t=p" in r["src"], "vidéo envoyée : flux d'aperçu (jeton d'aperçu)")
r = g(up_prem).json(); ok(r["kind"] == "hls" and "?t=p" in r["src"], "vidéo envoyée premium : jeton d'aperçu seulement")
ok(g(yt_free).json() == {"kind": "youtube", "ref": "abc12345678"}, "YouTube gratuit : aperçu")
ok(g(vi_free).json() == {"kind": "vimeo", "ref": "123456"}, "Vimeo gratuit : aperçu")
ok(g(yt_prem).json() == {"kind": "none"}, "YouTube premium : pas d'aperçu")
ok(g(ar).json() == {"kind": "none"}, "archive.org : pas d'aperçu")
ok(g(draft).status_code == 404 and g(pending).status_code == 404, "brouillon / conversion en cours : 404")
ok(g(uuid.uuid4()).status_code == 404 and requests.get(B + "/talks/xyz/hover").status_code == 400, "inconnu / identifiant invalide")
put({"card_preview": "false"}); ok(g(up).json() == {"kind": "none"}, "aperçu désactivable")
put({"card_preview": None})

# --- résumés dans les listes
t = requests.get(B + "/talks?limit=100").json(); m = next(x for x in t if x["id"] == str(yt_free))
ok(0 < len(m["summary"]) <= 170 and "\n" not in m["summary"], "résumé court dans /talks")
h = requests.get(B + "/home").json(); rows = [x for r in h["rows"] for x in r["talks"]]
ok(all("summary" in x for x in rows), "résumé dans /home")
requests.put(f"{B}/me/favorites/{yt_free}", headers=A)
f = requests.get(B + "/me/favorites", headers=A).json(); ok(any(x["id"] == str(yt_free) and 0 < len(x["summary"]) <= 170 for x in f), "résumé dans les favoris")
requests.delete(f"{B}/me/favorites/{yt_free}", headers=A)
cur.execute("delete from talks where title='Vignette'")
print("TOUT OK")
