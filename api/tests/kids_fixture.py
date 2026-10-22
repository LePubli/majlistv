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
# 22b-9b : un quiz approuvé (5 questions, bonne réponse = index 1) et un court publié.
cur.execute("update talks set quiz_enabled = true where id=%s", (talk,))
for i in range(5):
    cur.execute("insert into quiz_questions(talk_id, lang, question, options, correct_index, explanation, evidence_ms, origin, status) values (%s,'fr',%s,%s,1,%s,%s,'manual','approved')",
                (talk, f"Question {i + 1} ?", json.dumps(["Faux", "Vrai", "Peut-être"]), f"Explication {i + 1}", 1000 * (i + 1)))
cur.execute("insert into public_shorts(talk_id, title, video_key, duration_s, status, published_at) values (%s,%s,%s,12,'published', now()) returning id", (talk, "Un court sur les étoiles", "shorts/test-kids.mp4"))
short = cur.fetchone()[0]
em = f"kc-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Parent"})
cur.execute("update users set role='admin' where email=%s", (em,))
tok = requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]
print(json.dumps({"token": tok, "talkId": str(talk), "rubricId": rid, "shortId": str(short)}))
