"""Tests unitaires (sans base ni réseau) de la vérification des questions du quiz : python3 translator/tests/test_quiz_clean.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from quiz import Quiz, norm


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


segs = [
    {"start_ms": 0, "end_ms": 9000, "text": "Bienvenue à cette conférence sur la patience."},
    {"start_ms": 9000, "end_ms": 21000, "text": "La patience, dit l'intervenant, est d'abord une manière de regarder les épreuves."},
    {"start_ms": 21000, "end_ms": 40000, "text": "Elle ne consiste pas à se taire, mais à ne pas se laisser dominer par la colère."},
    {"start_ms": 40000, "end_ms": 60000, "text": "Bienvenue à cette conférence sur la patience."},  # phrase répétée plus tard
    {"start_ms": 60000, "end_ms": 80000, "text": "قَالَ الشيخ: الصَّبْرُ مِفْتَاحُ الفَرَجِ في كل حال"},
]
q = Quiz(log=print, conn_params=lambda: {}, fatal_error=RuntimeError, lang_names={})
hay, owner = q.index_transcript(segs)


def item(quote, secs=0, **kw):
    d = {"question": "Quelle est la définition donnée ?", "options": ["A", "B", "C", "D"], "correct_index": 2, "explanation": "Parce que.",
         "evidence_quote": quote, "evidence_seconds": secs}
    d.update(kw)
    return d


ok(norm("« Oui, Dieu !  » [00:01:02] ") == "oui dieu", "normalisation : ponctuation, horodatage et espaces")
ok(norm("الصَّبْرُ") == norm("الصبر"), "normalisation : voyelles brèves arabes ignorées")

out, dropped = q.clean({"questions": [item("La patience, dit l'intervenant, est d'abord une manière de regarder les épreuves", 12)]}, segs, [])
ok(len(out) == 1 and dropped == 0 and out[0]["evidence_ms"] == 9000, "citation exacte (sans point final) : gardée, minute recalée sur le segment")
ok(out[0]["evidence_quote"].startswith("La patience, dit l'intervenant"), "la citation stockée est le texte de la transcription")

out, dropped = q.clean({"questions": [item("Elle ne consiste pas à se taire, mais à ne pas se laisser dominer", 25)]}, segs, [])
ok(len(out) == 1 and out[0]["evidence_ms"] == 21000, "citation partielle d'un segment : retrouvée")

out, _ = q.clean({"questions": [item("regarder les épreuves. Elle ne consiste pas à se taire, mais à ne pas se laisser dominer", 15)]}, segs, [])
ok(len(out) == 1 and out[0]["evidence_ms"] == 9000 and "Elle ne consiste" in out[0]["evidence_quote"], "citation à cheval sur deux segments : les deux segments sont cités")

out, _ = q.clean({"questions": [item("Bienvenue à cette conférence sur la patience", 41)]}, segs, [])
ok(out[0]["evidence_ms"] == 40000, "phrase répétée : on retient l'occurrence la plus proche de la minute indiquée")

out, dropped = q.clean({"questions": [item("L'intervenant affirme que la patience mène toujours au paradis sans exception")]}, segs, [])
ok(out == [] and dropped == 1, "citation inventée : question écartée")

out, dropped = q.clean({"questions": [item("trop court")]}, segs, [])
ok(out == [] and dropped == 1, "citation trop courte pour prouver quoi que ce soit : écartée")

out, _ = q.clean({"questions": [item("قال الشيخ الصبر مفتاح الفرج في كل حال", 62)]}, segs, [])
ok(len(out) == 1 and out[0]["evidence_ms"] == 60000, "arabe : citation retrouvée malgré les voyelles brèves et la ponctuation")

good = "Elle ne consiste pas à se taire, mais à ne pas se laisser dominer"
bad_cases = {
    "bonne réponse hors liste": item(good, 21, correct_index=7),
    "réponses en double": item(good, 21, options=["Oui", "oui ", "Non", "Peut-être"]),
    "deux réponses seulement": item(good, 21, options=["Oui", "Non"], correct_index=0),
    "sans explication": item(good, 21, explanation=" "),
    "champ manquant": {"question": "Une question sans réponses ?"},
}
for name, bad in bad_cases.items():
    out, dropped = q.clean({"questions": [bad]}, segs, [])
    ok(out == [] and dropped == 1, f"écartée : {name}")

out, dropped = q.clean({"questions": [item(good, 21)]}, segs, ["quelle est la définition donnée ?"])
ok(out == [] and dropped == 1, "question déjà validée (même texte) : pas de doublon")

many = {"questions": [item(good, 21, question=f"Question {i} sur la colère ?") for i in range(5)] + [item("Bienvenue à cette conférence sur la patience", 0, question="Introduction ?")]}
out, _ = q.clean(many, segs, [])
ok([x["evidence_ms"] for x in out] == sorted(x["evidence_ms"] for x in out), "questions classées dans l'ordre de la vidéo")
seen, same = set(), True
for _ in range(40):
    o, _ = q.clean({"questions": [item(good, 21)]}, segs, [])
    same = same and o[0]["options"][o[0]["correct_index"]] == "C"
    seen.add(o[0]["correct_index"])
ok(same, "après mélange, la bonne réponse suit toujours son texte (40 essais)")
ok(len(seen) > 1, "les réponses sont bien mélangées (la bonne n'est pas toujours au même rang)")
print("TOUT OK")
