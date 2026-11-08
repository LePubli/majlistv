"""Amélioration 5.3, étape 2 : lien de suivi annonceur, rapport public et PDF. Sans stockage S3.
Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
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
cur.execute("insert into ads(advertiser,title,link_url,media_kind,media_key,media_type,languages) values(%s,'Offre d''été','https://secret-annonceur.example/x','image','campaigns/x.png','image/png','{fr}') returning id", (f"Annonceur {tag}",))
ad = str(cur.fetchone()[0])
camp = lambda: next(a for a in requests.get(B + "/admin/campaigns", headers=A).json()["ads"] if a["id"] == ad)

ok(camp()["reportToken"] is None, "nouvelle publicité : pas de lien de suivi")
ok(requests.post(f"{B}/admin/campaigns/{ad}/report-link").status_code in (401, 403), "créer un lien sans être administrateur : refusé")
r = requests.post(f"{B}/admin/campaigns/{ad}/report-link", headers=A); tok = r.json()["token"]
ok(r.status_code == 200 and len(tok) == 32 and camp()["reportToken"] == tok, "lien de suivi créé (32 caractères) et visible dans l'admin")
ok(requests.post(f"{B}/admin/campaigns/{uuid.uuid4()}/report-link", headers=A).status_code == 404, "publicité inconnue : 404")

for lang in ("fr", "fr", "ar"):
    requests.post(f"{B}/ads/{ad}/impression", json={"lang": lang})
requests.post(f"{B}/ads/{ad}/impression")
requests.post(f"{B}/ads/{ad}/click", json={"lang": "fr"})

R = requests.get(f"{B}/ad-report/{tok}")
j = R.json()
ok(R.status_code == 200 and "no-store" in R.headers.get("cache-control", ""), "rapport public sans connexion : 200, pas de cache")
ok(j["totals"]["impressions"] == 4 and j["totals"]["clicks"] == 1 and j["totals"]["ctr"] == 25, "totaux : 4 affichages, 1 clic, 25 %")
ok(j["byLang"]["fr"]["impressions"] == 2 and j["byLang"]["ar"]["impressions"] == 1 and j["byLang"]["none"]["impressions"] == 1, "répartition par langue (dont « sans langue »)")
ok(len(j["daily"]) == 90 and j["daily"][-1]["impressions"] == 4 and j["daily"][-1]["clicks"] == 1, "courbe : 90 jours, aujourd'hui = 4 affichages")
ok(j["languages"] == ["fr"] and j["status"] == "live", "langues visées et situation")
txt = R.text
ok(tok not in txt and "secret-annonceur" not in txt and "campaigns/x.png" not in txt, "rapport : ni jeton, ni lien du bouton, ni visuel")

P = requests.get(f"{B}/ad-report/{tok}/pdf")
ok(P.status_code == 200 and P.content[:5] == b"%PDF-" and P.headers["content-type"] == "application/pdf" and "attachment" in P.headers["content-disposition"], "PDF téléchargeable")
ok(requests.get(f"{B}/ad-report/{'a' * 32}").status_code == 404 and requests.get(f"{B}/ad-report/court").status_code == 404, "jeton inconnu ou mal formé : 404")

# Renouveler : l'ancien lien cesse de marcher
tok2 = requests.post(f"{B}/admin/campaigns/{ad}/report-link", headers=A).json()["token"]
ok(tok2 != tok and requests.get(f"{B}/ad-report/{tok}").status_code == 404 and requests.get(f"{B}/ad-report/{tok2}").status_code == 200, "lien renouvelé : l'ancien est mort, le nouveau marche")
# Désactiver
ok(requests.delete(f"{B}/admin/campaigns/{ad}/report-link", headers=A).status_code == 200 and requests.get(f"{B}/ad-report/{tok2}").status_code == 404 and camp()["reportToken"] is None, "lien désactivé : 404")
# Fonction « Publicité » coupée : le rapport déjà remis à l'annonceur continue de marcher
tok3 = requests.post(f"{B}/admin/campaigns/{ad}/report-link", headers=A).json()["token"]
requests.put(B + "/admin/features", headers=A, json={"values": {"ads": False}})
ok(requests.get(f"{B}/ad-report/{tok3}").status_code == 200, "fonction Publicité coupée : le rapport reste lisible")
requests.put(B + "/admin/features", headers=A, json={"values": {"ads": True}})
# Suppression de la publicité : le lien disparaît
cur.execute("delete from ads where id=%s", (ad,))
ok(requests.get(f"{B}/ad-report/{tok3}").status_code == 404, "publicité supprimée : lien mort")
print("TOUT OK : rapport annonceur")
