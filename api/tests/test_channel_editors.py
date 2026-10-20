"""Droits par chaîne sur les conférences (20/10) : le propriétaire et les éditeurs d'une chaîne gèrent aussi les conférences
qui portent son nom, même créées par un tiers ; un étranger non ; la suppression reste réservée au créateur ; une conférence SANS chaîne
n'est visible que de son créateur. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks = [], []


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from speakers where slug like %s", (f"%{tag}%",))
    for u in users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def login(email):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)


def mk(label):
    email = f"ce-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label.title()} {tag}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (email,)); uid = cur.fetchone()[0]; users.append(uid)
    return uid, email, login(email)


own_id, own_mail, OWN = mk("proprio"); ed_id, ed_mail, ED = mk("editeur"); out_id, out_mail, OUT = mk("etranger"); third_id, _, THIRD = mk("tiers")
NAME = f"Chaîne Droits {tag}"; SLUG = f"chaine-droits-{tag}"
ok(requests.post(B + "/studio/channels", json={"name": NAME}, headers=OWN).status_code == 201, "chaîne créée par le propriétaire")
ok(requests.post(f"{B}/studio/channels/{SLUG}/members", json={"email": ed_mail}, headers=OWN).status_code == 201, "éditeur ajouté")


def talk(speaker, org, pub="draft"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language) values (%s,'d',%s,'youtube',%s,%s,%s,'ready','free',600,'fr') returning id",
                (f"Conf {tag}", speaker, "v" + uuid.uuid4().hex[:9], org, pub)); tid = str(cur.fetchone()[0]); talks.append(tid); return tid


t_chan = talk(NAME, third_id)      # créée par un tiers, rattachée à la chaîne
t_free = talk("", third_id)        # sans chaîne
ids = lambda h: {x["id"] for x in requests.get(B + "/me/talks", headers=h).json()}
ok(t_chan in ids(OWN) and t_chan in ids(ED), "propriétaire et éditeur voient la conférence de la chaîne dans leur liste")
ok(t_chan not in ids(OUT), "un étranger ne la voit pas")
ok(t_free not in ids(OWN) and t_free not in ids(ED) and t_free in ids(THIRD), "une conférence SANS chaîne reste à son créateur seul")
ok(requests.patch(f"{B}/talks/{t_chan}", json={"title": f"Titre par l'éditeur {tag}"}, headers=ED).status_code == 200, "l'éditeur modifie la conférence")
ok(requests.patch(f"{B}/talks/{t_chan}", json={"description": "par le propriétaire"}, headers=OWN).status_code == 200, "le propriétaire modifie la conférence")
ok(requests.patch(f"{B}/talks/{t_chan}", json={"title": "Piratage"}, headers=OUT).status_code == 404, "un étranger ne peut pas la modifier")
ok(requests.patch(f"{B}/talks/{t_free}", json={"title": "Piratage"}, headers=ED).status_code == 404, "l'éditeur ne touche pas à une conférence sans chaîne")
ok(requests.get(f"{B}/studio/talks/{t_chan}/themes", headers=ED).status_code == 200, "l'éditeur lit les étiquettes")
ok(requests.get(f"{B}/studio/talks/{t_chan}/themes", headers=OUT).status_code == 404, "étranger : étiquettes refusées")
r = requests.get(f"{B}/talks/{t_chan}/studio/quiz", headers=ED); ok(r.status_code == 200, "l'éditeur ouvre le quiz de la conférence")
ok(requests.get(f"{B}/talks/{t_chan}/studio/quiz", headers=OUT).status_code == 404, "étranger : quiz refusé")
ok(requests.get(f"{B}/talks/{t_chan}", headers=ED).status_code == 200, "l'éditeur prévisualise un brouillon de la chaîne")
ok(requests.get(f"{B}/talks/{t_chan}", headers=OUT).status_code == 404, "un étranger ne voit pas le brouillon")
ok(requests.delete(f"{B}/talks/{t_chan}", headers=ED).status_code == 404, "l'éditeur ne supprime pas la conférence (créateur seulement)")
ok(requests.delete(f"{B}/talks/{t_chan}", headers=OWN).status_code == 404, "le propriétaire de la chaîne non plus")
r = requests.post(f"{B}/talks/bulk", json={"ids": [t_chan], "changes": {"access": "free"}}, headers=ED); ok(r.status_code == 200, f"modification en lot par l'éditeur ({r.status_code})")
r = requests.post(f"{B}/talks/bulk", json={"ids": [t_free], "changes": {"access": "free"}}, headers=ED); ok(r.status_code == 404, "lot : conférence sans chaîne refusée")
# retrait de l'éditeur : plus de droits
ok(requests.delete(f"{B}/studio/channels/{SLUG}/members/{ed_id}", headers=OWN).status_code == 204, "éditeur retiré")
ok(t_chan not in ids(ED) and requests.patch(f"{B}/talks/{t_chan}", json={"title": "x"}, headers=ED).status_code == 404, "ancien éditeur : plus aucun droit")
cleanup()
print("Droits par chaîne : tout est bon")
