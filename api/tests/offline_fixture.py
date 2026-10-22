"""Fabrique un abonné + une conférence HLS prête (vrai FFmpeg) et affiche {"token", "talkId", "freeToken"} pour mobile/tests/offline_contract.ts."""
import json, sys, importlib.util, os
spec = importlib.util.spec_from_file_location("t", os.path.join(os.path.dirname(__file__), "test_offline.py"))
src = open(spec.origin, encoding="utf-8").read().split("# Réglage de validité")[0]  # réutilise les fonctions du test (sans lancer ses vérifications)
ns = {"__name__": "fixture"}; exec(compile(src, "test_offline_head", "exec"), ns)
talk = ns["make_talk"](); ns["make_hls"](talk)
sub = ns["user"](True); free = ns["user"](False)
cur = ns["cur"]
cur.execute("insert into talk_insights(talk_id, lang, status, summary, key_points, chapters) values (%s,'fr','ready','Résumé test','[\"Point A\"]','[{\"ms\":0,\"title\":\"Introduction\"}]')", (talk,))
cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',0,0,4000,'Bonjour')", (talk,))
cur.execute("update talks set transcript_language='fr' where id=%s", (talk,))
for i in range(5):
    cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,origin,status) values (%s,'fr',%s,'[\"a\",\"b\",\"c\"]',1,'parce que',%s,'manual','approved')", (talk, f"Question {i}", i * 1000))
fr = ns["make_talk"](access="free"); ns["make_hls"](fr)
print(json.dumps({"token": sub["authorization"][7:], "freeToken": free["authorization"][7:], "talkId": str(talk), "freeTalkId": str(fr)}))
