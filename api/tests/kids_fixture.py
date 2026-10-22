"""Fabrique un parent (administrateur : pas d'abonnement à simuler) et une conférence Kids prête (vrai HLS) rangée dans une rubrique,
et affiche {"token", "talkId", "rubricId"} pour mobile/tests/kids_contract.ts."""
import json, os, uuid, requests, importlib.util
spec = importlib.util.spec_from_file_location("t", os.path.join(os.path.dirname(__file__), "test_offline.py"))
src = open(spec.origin, encoding="utf-8").read().split("# Réglage de validité")[0]
ns = {"__name__": "kidsfixture"}; exec(compile(src, "test_offline_head", "exec"), ns)
cur, B = ns["cur"], ns["B"]
talk = ns["make_talk"](access="free"); ns["make_hls"](talk)
cur.execute("update talks set kids_bands=%s, title=%s where id=%s", (["7-10", "11-14"], "Les étoiles de la nuit", talk))
cur.execute("select id from kid_rubrics where active order by position, id limit 1"); rid = cur.fetchone()[0]
cur.execute("insert into talk_kid_rubrics(talk_id, rubric_id) values (%s,%s) on conflict do nothing", (talk, rid))
em = f"kc-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Parent"})
cur.execute("update users set role='admin' where email=%s", (em,))
tok = requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]
print(json.dumps({"token": tok, "talkId": str(talk), "rubricId": rid}))
