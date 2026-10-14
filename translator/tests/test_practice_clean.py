"""Tests unitaires (sans base ni réseau) du tri des propositions d'action : python3 translator/tests/test_practice_clean.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from practice import Practice


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


segs = [
    {"idx": 0, "start_ms": 0, "end_ms": 9000, "text": "Bienvenue à cette conférence sur l'aumône et la générosité au quotidien."},
    {"idx": 1, "start_ms": 9000, "end_ms": 21000, "text": "L'aumône commence par un geste simple envers la personne qui est à côté de nous."},
    {"idx": 2, "start_ms": 21000, "end_ms": 40000, "text": "Elle purifie le cœur de celui qui donne autant que la vie de celui qui reçoit."},
]
p = Practice(log=print, conn_params=lambda: {}, fatal_error=RuntimeError, lang_names={})


def item(text="Donner ce soir une petite somme à une personne dans le besoin", size=1, quote="L'aumône commence par un geste simple envers la personne qui est à côté de nous", secs=9):
    return {"text": text, "size": size, "evidence_quote": quote, "evidence_seconds": secs}


def run(items, existing=()):
    return p.clean_practice({"suggestions": items}, segs, list(existing))


out, dropped = run([item()])
ok(len(out) == 1 and dropped == 0 and out[0]["evidence_ms"] == 9000, "proposition valide gardée, minute recalée sur le passage trouvé")
out, dropped = run([item(quote="Cette phrase n'a jamais été dite par l'intervenant dans cette vidéo")])
ok(not out and dropped == 1, "passage introuvable : proposition écartée")
out, dropped = run([item(quote="L'aumône")])
ok(not out and dropped == 1, "passage trop court : écartée")
for bad in ["Réciter ce hadith chaque matin", "Dire « Que Dieu te récompense » à un proche", 'Lire "la sourate" ce soir', "Il est obligatoire de donner chaque jour",
            "Éviter ce qui est interdit autour de toi", "Le Prophète a dit de sourire, sourire donc à un voisin"]:
    out, dropped = run([item(text=bad)])
    ok(not out and dropped == 1, f"texte religieux ou citation écartés : {bad[:40]}")
out, dropped = run([item(size=4)])
ok(not out and dropped == 1, "taille hors 1-3 : écartée")
out, dropped = run([item(text="Court")])
ok(not out and dropped == 1, "texte trop court : écartée")
out, dropped = run([item(), item()])
ok(len(out) == 1 and dropped == 1, "doublon dans la même série : écarté")
out, dropped = run([item()], existing=["Donner ce soir une petite somme à une personne dans le besoin"])
ok(not out and dropped == 1, "déjà publiée : écartée")
out, dropped = run([{"text": "x"}, "n'importe quoi", None])
ok(not out and dropped == 3, "éléments mal formés : écartés sans planter")
ok(p.clean_practice(None, segs, [])[0] == [] and p.clean_practice({}, segs, [])[0] == [], "réponse vide : aucune proposition")
out, _ = run([item(size=3), item(text="Appeler un proche pour prendre de ses nouvelles", size=1, quote="Elle purifie le cœur de celui qui donne autant que la vie de celui qui reçoit", secs=21)])
ok([o["size"] for o in out] == [1, 3], "tri : petit pas d'abord")
print("tout est bon")
