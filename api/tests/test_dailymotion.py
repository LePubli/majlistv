"""23a : Dailymotion comme source — ajout par lien (toutes les formes d'adresse), lecture, aperçu premium, cartes, import de comptes,
copie « chez nous », réglage du Player ID. Prérequis : API de test (3055) ; pas de réseau vers Dailymotion nécessaire."""
import sys, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


adm = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()
A = {"authorization": "Bearer " + adm["token"]}


def create(url, access="free", title="Conf Dailymotion", rights=False):
    return requests.post(B + "/talks", headers=A, json={"title": title, "language": "fr", "access": access, "videoUrl": url, "rightsConfirmed": rights, "translateTo": []})


# 1) Toutes les formes d'adresse sont reconnues (même identifiant : un doublon est refusé ensuite)
forms = [
    ("https://www.dailymotion.com/video/x8abc12", "x8abc12"),
    ("https://dai.ly/x8def34", "x8def34"),
    ("https://www.dailymotion.com/embed/video/x8ghi56", "x8ghi56"),
    ("https://www.dailymotion.com/video/x8jkl78_titre-de-la-video_news", "x8jkl78"),
    ("https://geo.dailymotion.com/player.html?video=x8mno90", "x8mno90"),
    ("https://m.dailymotion.com/video/x8pqr12", "x8pqr12"),
]
cur.execute("delete from talks where source = 'dailymotion'")
ids = {}
for url, ref in forms:
    r = create(url, title=f"DM {ref}")
    ok(r.status_code == 201, f"{url} -> {r.status_code} {r.text[:120]}")
    ids[ref] = r.json()["id"]
    cur.execute("select source, video_ref from talks where id = %s", (ids[ref],))
    ok(cur.fetchone() == ("dailymotion", ref), f"  source dailymotion, identifiant {ref}")
r = create("https://dai.ly/x8abc12")
ok(r.status_code == 409, f"doublon refusé ({r.status_code})")

# 2) Adresses refusées (chaîne, page d'accueil, identifiant invalide)
for bad in ["https://www.dailymotion.com/MonCompte", "https://www.dailymotion.com/", "https://dai.ly/", "https://www.dailymotion.com/video/a b", "https://example.com/video/x8abc12"]:
    r = create(bad)
    ok(r.status_code == 400, f"adresse refusée : {bad} ({r.status_code})")
ok("Dailymotion" in create("https://www.dailymotion.com/MonCompte").json().get("error", ""), "le message cite Dailymotion")

# 3) Lecture : la fiche renvoie la source et l'identifiant (conférence gratuite)
t = requests.get(f"{B}/talks/{ids['x8abc12']}").json()
ok(t["source"] == "dailymotion" and t["video_ref"] == "x8abc12" and not t.get("locked"), "fiche gratuite : source + identifiant")

# 4) Premium : un visiteur a l'aperçu limité (durée donnée au lecteur), jamais l'accès complet
pid = create("https://www.dailymotion.com/video/x8stu34", access="premium", title="DM premium").json()["id"]
t = requests.get(f"{B}/talks/{pid}").json()
ok(t.get("locked") is True and t.get("preview") is True and t.get("previewSeconds", 0) > 0 and "tracks" not in t, "premium : verrouillé, aperçu avec durée")

# 5) Cartes : l'extrait de survol d'une conférence gratuite Dailymotion
h = requests.get(f"{B}/talks/{ids['x8abc12']}/hover").json()
ok(h.get("kind") == "dailymotion" and h.get("ref") == "x8abc12", f"survol : {h}")
hp = requests.get(f"{B}/talks/{pid}/hover").json()
ok(hp.get("kind") != "dailymotion", "survol : jamais pour une conférence premium")

# 6) Player ID : réglage admin -> config publique (seulement lettres et chiffres)
cfg = lambda: requests.get(B + "/config").json()
ok(cfg().get("dailymotionPlayerId") == "", "sans réglage : vide")
r = requests.put(B + "/admin/settings", headers=A, json={"values": {"dailymotion_player_id": "x8lr5"}})
ok(r.status_code == 200, f"réglage enregistré ({r.status_code} {r.text[:100]})")
ok(cfg().get("dailymotionPlayerId") == "x8lr5", "config publique : x8lr5")
requests.put(B + "/admin/settings", headers=A, json={"values": {"dailymotion_player_id": "x8lr5\"><script>"}})
ok(cfg().get("dailymotionPlayerId") == "", "identifiant piégé : jamais renvoyé")
requests.put(B + "/admin/settings", headers=A, json={"values": {"dailymotion_player_id": ""}})

# 7) Import de comptes / playlists : l'adresse Dailymotion est acceptée, une autre refusée
r = requests.post(B + "/imports", headers=A, json={"url": "https://www.dailymotion.com/MonCompte"})
ok(r.status_code in (200, 201, 202), f"import d'un compte Dailymotion accepté ({r.status_code} {r.text[:100]})")
r = requests.post(B + "/imports", headers=A, json={"url": "https://example.com/chaine"})
ok(r.status_code == 400, f"autre site refusé ({r.status_code})")

# 8) Copie « chez nous » : la conférence Dailymotion peut être importée (adresse reconstruite)
r = requests.post(f"{B}/talks/{ids['x8abc12']}/import", headers=A, json={"rightsConfirmed": True})
ok(r.status_code in (200, 201, 202), f"import chez nous demandé ({r.status_code} {r.text[:120]})")
cur.execute("select origin, source_url from media_imports where talk_id = %s order by created_at desc limit 1", (ids["x8abc12"],))
row = cur.fetchone()
ok(row == ("dailymotion", "https://www.dailymotion.com/video/x8abc12"), f"origine et adresse enregistrées : {row}")

cur.execute("delete from media_imports where talk_id in (select id from talks where source in ('dailymotion','upload') and title like 'DM %%' or title = 'Conf Dailymotion')")
print("TOUT OK")
