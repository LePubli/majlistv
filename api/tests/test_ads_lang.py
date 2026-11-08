"""Amélioration 5.3, étape 1 : ciblage des publicités par langue et chiffres par langue.
Sans stockage S3 (publicités insérées en base). Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/features", headers=A, json={"values": {"ads": True}})
tag = uuid.uuid4().hex[:6]
cur.execute("insert into ads(advertiser,title,link_url,media_kind,media_key,media_type) values(%s,'T','https://exemple.fr','image','campaigns/x.png','image/png') returning id", (f"Annonceur {tag}",))
ad = cur.fetchone()[0]
camp = lambda: next(a for a in requests.get(B + "/admin/campaigns", headers=A).json()["ads"] if a["id"] == str(ad))

c = camp()
ok(c["languages"] == [] and set(c["byLang"]) == {"fr", "en", "ar", "none"}, "nouvelle publicité : toutes langues, répartition à zéro")

# Comptage : langue dans le corps, dans l'adresse, ou absente
requests.post(f"{B}/ads/{ad}/impression", json={"lang": "fr"})
requests.post(f"{B}/ads/{ad}/impression", json={"lang": "FR-fr"})
requests.post(f"{B}/ads/{ad}/impression", json={"lang": "ar"})
requests.post(f"{B}/ads/{ad}/impression?lang=en")
requests.post(f"{B}/ads/{ad}/impression")                     # version ancienne de l'application : pas de langue
requests.post(f"{B}/ads/{ad}/impression", json={"lang": "de"})  # langue non gérée : comptée « sans langue »
requests.post(f"{B}/ads/{ad}/click", json={"lang": "fr"})
requests.post(f"{B}/ads/{ad}/click", json={"lang": "ar"})
requests.post(f"{B}/ads/{ad}/skip", json={"lang": "fr"})
requests.post(f"{B}/ads/{ad}/skip")
c = camp(); b = c["byLang"]
ok(c["impressions"] == 6 and c["clicks"] == 2 and c["skips"] == 2, "totaux du jour inchangés (6 affichages, 2 clics, 2 passages)")
ok(b["fr"] == {"impressions": 2, "clicks": 1, "skips": 1}, "français : 2 affichages, 1 clic, 1 passage")
ok(b["ar"] == {"impressions": 1, "clicks": 1, "skips": 0} and b["en"] == {"impressions": 1, "clicks": 0, "skips": 0}, "arabe et anglais comptés")
ok(b["none"] == {"impressions": 2, "clicks": 0, "skips": 1}, "« sans langue » = version ancienne ou langue inconnue")
ok(sum(v["impressions"] for v in b.values()) == c["impressions"], "la somme par langue égale le total")
ok(requests.post(f"{B}/ads/00000000-0000-0000-0000-000000000000/impression", json={"lang": "fr"}).status_code == 404, "publicité inconnue : 404")

# Un total ancien (avant la mise à jour) reste visible comme « sans langue »
cur.execute("update ad_stats set impressions = impressions + 10 where ad_id = %s", (ad,))
ok(camp()["byLang"]["none"]["impressions"] == 12, "anciens totaux (sans détail) = « sans langue »")

# Choix des langues (administrateur seulement, valeurs contrôlées, doublons retirés)
ok(requests.patch(f"{B}/admin/campaigns/{ad}", json={"languages": ["fr"]}).status_code == 401, "sans jeton : refusé")
ok(requests.patch(f"{B}/admin/campaigns/{ad}", headers=A, json={"languages": ["fr", "de"]}).status_code == 400, "langue inconnue refusée")
ok(requests.patch(f"{B}/admin/campaigns/{ad}", headers=A, json={"languages": ["fr", "fr", "ar"]}).status_code == 200 and camp()["languages"] == ["fr", "ar"], "langues enregistrées sans doublon")
ok(requests.patch(f"{B}/admin/campaigns/{ad}", headers=A, json={"title": "Autre"}).status_code == 200 and camp()["languages"] == ["fr", "ar"], "autre modification : langues conservées")
ok(requests.patch(f"{B}/admin/campaigns/{ad}", headers=A, json={"languages": []}).status_code == 200 and camp()["languages"] == [], "liste vide = toutes les langues")

cur.execute("delete from ads where id=%s", (ad,))
cur.execute("select count(*) from ad_stats_lang where ad_id=%s", (ad,)); ok(cur.fetchone()[0] == 0, "suppression : chiffres par langue supprimés")
print("test_ads_lang : TOUT OK")
