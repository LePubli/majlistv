"""Amélioration 4.2, étape 1 : événements en direct (API). Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, datetime as dt, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


tag = uuid.uuid4().hex[:6]
A = login("admin@test.local", "AdminPassw0rd-test")


def user(prefix, role=None):
    mail = f"{prefix}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": mail, "password": "Passw0rd-test", "name": prefix})
    if role:
        cur.execute("update users set role=%s where email=%s", (role, mail))
    cur.execute("select id from users where email=%s", (mail,))
    return cur.fetchone()[0], login(mail, "Passw0rd-test")


oid, O = user("orga", "organizer"); o2id, O2 = user("orga2", "organizer"); mid, M = user("membre"); m2id, M2 = user("membre2")
iso = lambda d: (dt.datetime.now(dt.timezone.utc) + d).replace(microsecond=0).isoformat()
YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
body = lambda **k: {**{"title": f"Direct {tag}", "speaker": "Cheikh", "description": "Une rencontre en direct.", "language": "fr", "url": YT, "startsAt": iso(dt.timedelta(days=3)), "durationMinutes": 60, "status": "published"}, **k}

# Droits de création
ok(requests.post(B + "/studio/events", headers=M, json=body()).status_code == 403, "membre : création refusée")
ok(requests.post(B + "/studio/events", json=body()).status_code == 401, "visiteur : création refusée")
ok(requests.post(B + "/studio/events", headers=O, json=body(url="https://example.org/live")).status_code == 400, "adresse autre que YouTube / Vimeo refusée")
ok(requests.post(B + "/studio/events", headers=O, json=body(durationMinutes=2)).status_code == 400, "durée trop courte refusée")
ok(requests.post(B + "/studio/events", headers=O, json=body(startsAt="demain")).status_code == 400, "date illisible refusée")
r = requests.post(B + "/studio/events", headers=O, json=body()); ok(r.status_code == 201, "organisateur : création"); ev = r.json(); E1 = ev["id"]
ok(ev["phase"] == "upcoming" and ev["video"]["ref"] == "dQw4w9WgXcQ" and ev["url"] == YT, "studio : forme complète (lien visible de l'auteur)")
dr = requests.post(B + "/studio/events", headers=O, json=body(title=f"Brouillon {tag}", status="draft")).json()["id"]

# Public : le lien du direct est caché avant l'ouverture
lst = requests.get(B + "/events").json()
mine = next((e for e in lst if e["id"] == E1), None)
ok(mine and mine["phase"] == "upcoming" and "video" not in mine and mine["reminded"] is False, "liste publique : événement à venir sans lien du direct")
ok(all(e["id"] != dr for e in lst), "brouillon absent de la liste publique")
ok(requests.get(f"{B}/events/{dr}").status_code == 404, "brouillon : fiche introuvable pour le public")
ok(requests.get(f"{B}/events/{dr}", headers=O).status_code == 200, "brouillon : visible de son auteur")
ok(requests.get(f"{B}/events/{dr}", headers=O2).status_code == 404, "brouillon : introuvable pour un autre organisateur")
f = requests.get(f"{B}/events/{E1}").json()
ok(f["title"] == f"Direct {tag}" and "video" not in f and f["replay"] is None, "fiche publique : pas de lien avant l'heure")
ok(requests.get(f"{B}/events/00000000-0000-0000-0000-000000000000").status_code == 404, "fiche inconnue : 404")

# Fichier agenda
r = requests.get(f"{B}/events/{E1}/calendar.ics")
ok(r.status_code == 200 and r.headers["content-type"].startswith("text/calendar") and "attachment" in r.headers["content-disposition"], "agenda : type et téléchargement")
ok("BEGIN:VEVENT" in r.text and f"SUMMARY:Direct {tag}" in r.text and "TRIGGER:-PT1H" in r.text and "dQw4w9WgXcQ" not in r.text, "agenda : contenu, sans le lien du direct")
ok(requests.get(f"{B}/events/{dr}/calendar.ics").status_code == 404, "agenda d'un brouillon : 404")

# Me rappeler
ok(requests.put(f"{B}/me/events/{E1}/remind").status_code == 401, "rappel : connexion requise")
ok(requests.put(f"{B}/me/events/{E1}/remind", headers=M).json() == {"reminded": True}, "rappel : inscription")
requests.put(f"{B}/me/events/{E1}/remind", headers=M)
cur.execute("select count(*) from event_reminders where event_id=%s", (E1,)); ok(cur.fetchone()[0] == 1, "rappel : pas de doublon")
ok(requests.put(f"{B}/me/events/{dr}/remind", headers=M).status_code == 404, "rappel sur un brouillon refusé")
ok(requests.get(B + "/me/events/ids", headers=M).json() == [E1], "mes rappels")
ok(next(e for e in requests.get(B + "/events", headers=M).json() if e["id"] == E1)["reminded"] is True, "liste : rappel visible du membre")
ok(next(e for e in requests.get(B + "/events", headers=M2).json() if e["id"] == E1)["reminded"] is False, "liste : pas celui d'un autre membre")
ok(requests.get(f"{B}/events/{E1}", headers=M).json()["reminded"] is True, "fiche : rappel visible du membre")
ok(requests.get(B + "/studio/events", headers=O).json()[0]["reminders"] == 1 or any(e["reminders"] == 1 for e in requests.get(B + "/studio/events", headers=O).json()), "studio : nombre d'inscrits")

# Isolation des organisateurs
ok(requests.get(f"{B}/studio/events/{E1}", headers=O2).status_code == 404, "autre organisateur : fiche studio refusée")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O2, json={"title": "x"}).status_code == 404, "autre organisateur : modification refusée")
ok(requests.delete(f"{B}/studio/events/{E1}", headers=O2).status_code == 404, "autre organisateur : suppression refusée")
ok(all(e["createdBy"] == str(oid) for e in requests.get(B + "/studio/events", headers=O).json()), "organisateur : seulement les siens")
ok(any(e["id"] == E1 for e in requests.get(B + "/studio/events", headers=A).json()), "administrateur : voit tout")

# Direct ouvert : le lien apparaît
r = requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"startsAt": iso(dt.timedelta(minutes=5))}); ok(r.status_code == 200 and r.json()["phase"] == "live", "modification de l'heure")
f = requests.get(f"{B}/events/{E1}").json()
ok(f["phase"] == "live" and f["video"] == {"source": "youtube", "ref": "dQw4w9WgXcQ"}, "5 min avant l'heure : lecteur ouvert, lien donné")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_events_open_minutes": "0"}})
ok(requests.get(f"{B}/events/{E1}").json()["phase"] == "upcoming", "réglage « ouverture avant l'heure » à 0 : encore annoncé")
requests.put(B + "/admin/settings", headers=A, json={"values": {"mod_events_open_minutes": "10"}})

# Après l'événement : rediffusion
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,description) values(%s,'S','youtube','abc',%s,'published','ready','d') returning id", (f"Rediff {tag}", oid)); tid = cur.fetchone()[0]
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,description) values(%s,'S','youtube','abc',%s,'published','ready','d') returning id", (f"Autre {tag}", o2id)); tid2 = cur.fetchone()[0]
requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"startsAt": iso(-dt.timedelta(hours=3))})
f = requests.get(f"{B}/events/{E1}").json()
ok(f["phase"] == "ended" and "video" not in f and f["replay"] is None, "terminé : plus de direct, pas encore de rediffusion")
ok(requests.put(f"{B}/me/events/{E1}/remind", headers=M2).status_code == 409, "rappel sur un événement terminé refusé")
ok(all(e["id"] != E1 for e in requests.get(B + "/events").json()), "terminé : sorti de « à venir »")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"talkId": str(tid2)}).status_code == 400, "rediffusion : conférence d'un autre auteur refusée")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"talkId": "00000000-0000-0000-0000-000000000000"}).status_code == 400, "rediffusion : conférence inconnue refusée")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"talkId": str(tid)}).status_code == 200, "rediffusion rattachée")
f = requests.get(f"{B}/events/{E1}").json()
ok(f["replay"] == {"talkId": str(tid), "title": f"Rediff {tag}"}, "fiche : renvoi vers la rediffusion")
past = next((e for e in requests.get(B + "/events?scope=past").json() if e["id"] == E1), None)
ok(past and past["replay"]["talkId"] == str(tid), "liste « passés » : rediffusion indiquée")
cur.execute("update talks set publication='draft' where id=%s", (tid,))
ok(requests.get(f"{B}/events/{E1}").json()["replay"] is None, "rediffusion non publiée : non montrée")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"talkId": None}).status_code == 200 and requests.get(f"{B}/studio/events/{E1}", headers=O).json()["talkId"] is None, "rediffusion détachée")

# Annulation, suppression, fonction coupée
requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"startsAt": iso(dt.timedelta(days=2)), "status": "cancelled"})
f = requests.get(f"{B}/events/{E1}").json(); ok(f["phase"] == "cancelled" and "video" not in f, "annulé : indiqué, sans lien")
ok("STATUS:CANCELLED" in requests.get(f"{B}/events/{E1}/calendar.ics").text, "annulé : agenda marqué annulé")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O, json={}).status_code == 400, "modification vide refusée")
ok(requests.patch(f"{B}/studio/events/{E1}", headers=O, json={"inconnu": 1}).status_code == 400, "champ inconnu refusé")
ok(requests.delete(f"{B}/studio/events/{E1}", headers=O).status_code == 204 and requests.get(f"{B}/events/{E1}").status_code == 404, "suppression")
cur.execute("select count(*) from event_reminders where event_id=%s", (E1,)); ok(cur.fetchone()[0] == 0, "suppression : inscriptions supprimées")
fid = requests.get(B + "/admin/features", headers=A).json()
ok(any((x.get("id") == "events") for x in (fid if isinstance(fid, list) else fid.get("features", []))), "Admin → Fonctions : « Événements en direct » listée")
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_events": "false"}})
ok(requests.get(B + "/events").status_code in (403, 404) and requests.get(B + "/studio/events", headers=O).status_code in (403, 404), "fonction coupée : routes fermées")
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_events": "true"}})
ok(requests.get(B + "/events").status_code == 200, "fonction rétablie")
print("test_events : TOUT OK")
