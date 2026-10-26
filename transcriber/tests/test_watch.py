"""Tests hors ligne de la veille (étape 23b) : python transcriber/tests/test_watch.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import watch  # noqa: E402

fails = 0


def ok(cond, msg):
    global fails
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond:
        fails += 1


def e(i, src="youtube"):
    return {"id": i, "source": src, "title": "T" + i, "duration": 60, "thumb": None}


# Première lecture : tout est « déjà vu », rien ne sonne.
p = watch.plan_check([e("a"), e("b")], set(), set(), False)
ok([s for _, s in p] == ["seen", "seen"], "première lecture : références, aucune alerte")

# Lectures suivantes : seules les vidéos inconnues deviennent « new ».
p = watch.plan_check([e("c"), e("a"), e("d")], {"a", "b"}, set(), True)
ok([(x["id"], s) for x, s in p] == [("c", "new"), ("d", "new")], "seules les nouvelles vidéos sont signalées")

# Déjà au catalogue : pas d'alerte inutile.
p = watch.plan_check([e("c"), e("d")], set(), {("youtube", "c")}, True)
ok([(x["id"], s) for x, s in p] == [("c", "seen"), ("d", "new")], "vidéo déjà au catalogue : notée vue")

# Doublons dans la même lecture, identifiants vides.
p = watch.plan_check([e("c"), e("c"), {"id": "", "source": "youtube"}], set(), set(), True)
ok(len(p) == 1, "doublons et identifiants vides ignorés")

# Rien de nouveau.
ok(watch.plan_check([e("a")], {"a"}, set(), True) == [], "aucune nouveauté : rien à enregistrer")

# Condition SQL : heures bornées.
ok("interval '6 hours'" in watch.due_clause(6), "intervalle 6 h")
ok("interval '48 hours'" in watch.due_clause(9999) and "interval '1 hours'" in watch.due_clause(-3), "intervalle borné de 1 à 48 h")
ok("1; DROP" not in watch.due_clause("6"), "valeur numérique seulement")

print("TOUT OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
