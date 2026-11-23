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
d = requests.get(B + "/admin/campaigns", headers=A).json()["daily"]
ok(len(d) == 30 and d[-1]["day"] > d[0]["day"] and all(isinstance(x["impressions"], int) and isinstance(x["clicks"], int) for x in d), "courbe : 30 jours complets")

# ---- Lot mesures : pays, appareil, durée, conversions (sans S3 : /ads/next non testé ici) ----
cur.execute("insert into ads(advertiser,title,link_url,media_kind,media_key,media_type) values(%s,'T2','https://exemple.fr','image','campaigns/y.png','image/png') returning id", (f"Annonceur2 {tag}",))
ad2 = cur.fetchone()[0]
camp2 = lambda: next(a for a in requests.get(B + "/admin/campaigns", headers=A).json()["ads"] if a["id"] == str(ad2))
ok(camp2()["countries"] == [] and camp2()["devices"] == [], "nouvelle publicité : tous pays, tous appareils")
requests.post(f"{B}/ads/{ad2}/impression", json={"lang": "fr", "tz": "Europe/Paris", "platform": "android"})
requests.post(f"{B}/ads/{ad2}/impression", json={"lang": "fr", "tz": "Europe/Paris", "platform": "ios"})
requests.post(f"{B}/ads/{ad2}/impression", json={"tz": "Mars/X"})
requests.post(f"{B}/ads/{ad2}/click", json={"tz": "Europe/Paris", "platform": "android"})
c = camp2(); co = {x["value"]: x for x in c["byCountry"]}; de = {x["value"]: x for x in c["byDevice"]}
ok(co["FR"]["impressions"] == 2 and co["FR"]["clicks"] == 1 and co[""]["impressions"] == 1, "répartition par pays (fuseau inconnu = vide)")
ok(de["android"]["impressions"] == 1 and de["android"]["clicks"] == 1 and de["ios"]["impressions"] == 1, "répartition par appareil")
ok(requests.post(f"{B}/ads/{ad2}/watch", json={"seconds": 4, "completed": False}).status_code == 200, "durée enregistrée")
requests.post(f"{B}/ads/{ad2}/watch", json={"seconds": 6, "completed": True})
c = camp2(); ok(c["avgWatchSeconds"] == 5 and c["completionRate"] == 50 and c["watched"] == 2, "durée moyenne 5 s, 50 % allés au bout")
ok(requests.post(f"{B}/ads/{ad2}/watch", json={"seconds": 9999}).status_code == 400, "durée absurde refusée")
ok(requests.post(f"{B}/ads/00000000-0000-0000-0000-000000000000/watch", json={"seconds": 3}).status_code == 404, "durée : publicité inconnue 404")
ok(requests.patch(f"{B}/admin/campaigns/{ad2}", headers=A, json={"countries": ["FR", "FR", "MA"], "devices": ["tv"]}).status_code == 200 and camp2()["countries"] == ["FR", "MA"] and camp2()["devices"] == ["tv"], "pays et appareils enregistrés")
ok(requests.patch(f"{B}/admin/campaigns/{ad2}", headers=A, json={"countries": ["ZZ"]}).status_code == 400, "pays inconnu refusé")
ok(requests.patch(f"{B}/admin/campaigns/{ad2}", headers=A, json={"devices": ["frigo"]}).status_code == 400, "appareil inconnu refusé")
# Conversions : compte tout juste créé
r = requests.post(B + "/auth/register", json={"email": f"ad{tag}@test.local", "password": "Passw0rd-test-1", "locale": "fr"})
U = {"authorization": "Bearer " + r.json()["token"]}
ok(requests.post(B + "/me/ad-attribution", json={"ad": str(ad2)}).status_code == 401, "rattachement sans compte : refusé")
ok(requests.post(B + "/me/ad-attribution", headers=U, json={"ad": "00000000-0000-0000-0000-000000000000"}).status_code == 404, "rattachement : publicité inconnue 404")
ok(requests.post(B + "/me/ad-attribution", headers=U, json={"ad": str(ad2)}).status_code == 200, "rattachement d'un compte récent")
requests.post(B + "/me/ad-attribution", headers=U, json={"ad": str(ad2)})
ok(camp2()["signups"] == 1 and camp2()["subscriptions"] == 0, "une seule inscription comptée (pas de doublon)")
cur.execute("update users set created_at = now() - interval '5 days' where email=%s", (f"ad{tag}@test.local",))
ok(requests.post(B + "/me/ad-attribution", headers=U, json={"ad": str(ad2)}).status_code == 409, "ancien compte : refusé")
cur.execute("delete from users where email=%s", (f"ad{tag}@test.local",))
cur.execute("delete from ads where id=%s", (ad2,))
cur.execute("select (select count(*) from ad_stats_dim where ad_id=%s)+(select count(*) from ad_conversions where ad_id=%s)", (ad2, ad2)); ok(cur.fetchone()[0] == 0, "suppression : mesures supprimées")
print("test_ads_lang : TOUT OK")
