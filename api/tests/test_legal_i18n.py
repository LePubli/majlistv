"""Étape D — pages légales en trois langues : modèle automatique rempli avec Admin → Paramètres → Informations légales,
lignes facultatives, informations manquantes (admin seulement), texte personnalisé fr / en / ar, retour au modèle, droits."""
import os, sys, uuid
import requests

B = os.environ.get("API", "http://127.0.0.1:3055")
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
em = f"legal-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "L"})
U = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
KEYS = ["legal_company", "legal_status", "legal_capital", "legal_address", "legal_siret", "legal_rcs", "legal_vat", "legal_email", "legal_phone",
        "legal_director", "legal_host_name", "legal_host_address", "legal_host_phone", "legal_mediator", "legal_court", "legal_mail_provider"]
def settings(vals): return requests.put(B + "/admin/settings", headers=A, json={"values": vals})
for s in ("mentions-legales", "cgv", "confidentialite"): requests.delete(f"{B}/admin/legal/{s}/custom", headers=A)
settings({k: "" for k in KEYS})

r = requests.get(B + "/legal/mentions-legales").json()
ok(r["custom"] is False and r["lang"] == "fr" and "[à compléter : adresse du siège]" in r["body"], "modèle automatique : informations manquantes visibles")
ok("missing" not in r, "la liste des manques n'est pas publique")
ok("Capital social" not in r["body"] and "RCS" not in r["body"], "lignes facultatives vides retirées")
a = requests.get(B + "/admin/legal/mentions-legales", headers=A).json()
ok(any(m["setting"] == "legal_address" for m in a["missing"]) and a["hasTemplate"] and a["template"]["ar"]["title"] == "الإشعار القانوني", "admin : manques listés et modèles fr / en / ar")
ok(requests.get(B + "/admin/legal/mentions-legales", headers=U).status_code == 403, "aperçu admin refusé à un membre")

r = settings({"legal_company": "Le Publicitaire Test", "legal_status": "Entreprise individuelle", "legal_address": "1 rue Test, 59100 Roubaix", "legal_siret": "123 456 789 00010",
              "legal_email": "contact@test.local", "legal_director": "Epok Test", "legal_host_name": "Hébergeur Test", "legal_host_address": "2 rue Serveur", "legal_capital": "",
              "legal_mediator": "Médiateur Test", "legal_court": "les tribunaux de Lille", "legal_mail_provider": "Envoi Test"})
ok(r.status_code == 200, "Informations légales enregistrées dans les Paramètres")
r = requests.get(B + "/legal/mentions-legales").json()
ok("Le Publicitaire Test" in r["body"] and "123 456 789 00010" in r["body"] and "à compléter" not in r["body"], "mentions remplies automatiquement")
c = requests.get(B + "/legal/cgv").json()
ok("Médiateur Test" in c["body"] and "les tribunaux de Lille" in c["body"] and "L221-28" in c["body"], "CGV remplies (médiateur, tribunal)")
p = requests.get(B + "/legal/confidentialite?lang=en").json()
ok(p["lang"] == "en" and p["title"] == "Privacy policy" and "Envoi Test" in p["body"] and "French version prevails" in p["body"], "politique de confidentialité en anglais")
ar = requests.get(B + "/legal/cgv?lang=ar").json(); ok(ar["lang"] == "ar" and ar["title"] == "الشروط العامة للبيع والاستخدام", "CGV en arabe")
ok(requests.get(B + "/legal/cgv?lang=xx").json()["lang"] == "fr", "langue inconnue : français")
li = requests.get(B + "/legal?lang=en").json(); ok(sorted(x["title"] for x in li) == sorted(["Legal notice", "Terms of sale and use", "Privacy policy"]), "liste des pages traduite")
ok(requests.get(B + "/admin/legal/mentions-legales", headers=A).json()["missing"] == [], "plus aucune information manquante")

# texte personnalisé
ok(requests.put(B + "/admin/legal/cgv", headers=U, json={"title": "x", "body": "y"}).status_code == 403, "personnalisation refusée à un membre")
r = requests.put(B + "/admin/legal/cgv", headers=A, json={"title": "CGV maison", "body": "## A\nTexte FR", "titleEn": "Terms", "bodyEn": "## A\nText EN"})
ok(r.status_code == 200 and r.json()["custom"] is True, "texte personnalisé enregistré")
ok(requests.get(B + "/legal/cgv").json()["body"] == "## A\nTexte FR", "page française personnalisée")
e = requests.get(B + "/legal/cgv?lang=en").json(); ok(e["body"] == "## A\nText EN" and e["lang"] == "en", "version anglaise personnalisée")
x = requests.get(B + "/legal/cgv?lang=ar").json(); ok(x["lang"] == "fr" and x["body"] == "## A\nTexte FR", "arabe vide : la page s'affiche en français (signalé)")
ok(requests.get(B + "/admin/legal/cgv", headers=A).json()["custom"] is True, "admin : mode personnalisé")
ok(requests.delete(B + "/admin/legal/cgv/custom", headers=U).status_code == 403, "retour au modèle refusé à un membre")
ok(requests.delete(B + "/admin/legal/cgv/custom", headers=A).status_code == 200, "retour au modèle automatique")
ok("L221-28" in requests.get(B + "/legal/cgv").json()["body"], "la page suit de nouveau le modèle")
ok(requests.get(B + "/legal/inconnue").status_code == 404, "page inconnue : 404")

settings({k: "" for k in KEYS})
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
