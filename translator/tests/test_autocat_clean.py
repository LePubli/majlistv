"""Tests unitaires (sans base ni réseau) des catégories automatiques : python3 translator/tests/test_autocat_clean.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from autocat import AutoCat, MAX_SUGGESTIONS, SAMPLE_CHARS


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


ALLOWED = {10: "Sciences islamiques › Fiqh", 11: "Pratiques et adorations › Prière", 12: "Le Coran › Tafsir", 13: "Histoire › Andalousie", 14: "Famille › Éducation"}
clean = AutoCat.clean

items, dropped = clean({"categories": [
    {"category_id": 11, "confidence": 92, "reason": "Parle de la prière du vendredi."},
    {"category_id": 999, "confidence": 99, "reason": "Catégorie inventée."},            # identifiant hors liste : écarté
    {"category_id": 10, "confidence": 40, "reason": "Passage rapide sur le fiqh."},      # sous le seuil : écarté
    {"category_id": 12, "confidence": 75, "reason": "  Explique   un verset.  "},
    {"category_id": 12, "confidence": 70, "reason": "Doublon."},                         # doublon : écarté
    {"category_id": 13, "confidence": 85, "reason": "Histoire."},                        # exclue (déjà donnée) : écartée
    {"category_id": 14, "confidence": 80, "reason": ""},                                 # sans justification : écartée
    {"category_id": "abc", "confidence": 80, "reason": "x"},                             # invalide
    {"category_id": 14, "confidence": 150, "reason": "Éducation des enfants."},          # confiance bornée à 100
], }, ALLOWED, {13}, 50)
ok([x["category_id"] for x in items] == [14, 11, 12], "ordre par confiance, ids autorisés, hors seuil/doublon/exclu/vide écartés")
ok(items[0]["confidence"] == 100 and items[2]["reason"] == "Explique un verset.", "confiance bornée, justification nettoyée")
ok(dropped == 6, f"{dropped} propositions écartées")
many, _ = clean({"categories": [{"category_id": i, "confidence": 60 + i, "reason": "r"} for i in ALLOWED]}, ALLOWED, set(), 50)
ok(len(many) == MAX_SUGGESTIONS, "au plus 3 propositions")
ok(clean({"categories": "n'importe quoi"}, ALLOWED, set(), 50) == ([], 0) or clean({"x": 1}, ALLOWED, set(), 50) == ([], 0), "réponse mal formée : rien, sans erreur")
ok(clean([], ALLOWED, set(), 50) == ([], 0), "réponse qui n'est pas un objet : rien")

short = "a" * 500
ok(AutoCat.sample(short) == short, "texte court : tel quel")
long = "début " + "x" * 40000 + " milieu " + "y" * 40000 + " fin"
s = AutoCat.sample(long)
ok(len(s) < SAMPLE_CHARS + 50 and s.startswith("début") and s.endswith("fin") and "[…]" in s, "texte long : début, milieu et fin, taille bornée")


# Traitement complet avec une base et une IA simulées.
class Fake(AutoCat):
    def __init__(self, ai):
        super().__init__(log=lambda *a: None, conn_params=lambda: {}, fatal_error=RuntimeError, lang_names={"fr": "French"})
        self.ai, self.sql, self.provider = ai, [], "claude"
        class S:  # réglages simulés
            def get(_, key, env, default=""): return {"mod_autocat_min_confidence": "50"}.get(key, default)
        self.S = S()
    def query(self, q, params=(), fetch=False):
        self.sql.append((" ".join(q.split())[:60], params))
        if "FROM talks WHERE id" in q:
            return [{"title": "La prière du vendredi", "description": "", "show_adults": True, "category_id": None}]
        if "FROM categories c JOIN category_names" in q:
            return [{"id": k, "name": v} for k, v in ALLOWED.items()]
        if "transcript_segments" in q:
            return [{"idx": 0, "start_ms": 0, "end_ms": 1000, "text": "Aujourd'hui on parle de la prière."}]
        return []
    def transcript_text(self, segs): return "\n".join(s["text"] for s in segs)
    def ask(self, system, user, tool=None, max_tokens=0):
        self.asked = (system, user)
        return self.ai
    class _Cur:
        def __init__(s, o): s.o, s.rowcount = o, 1
        def __enter__(s): return s
        def __exit__(s, *a): return False
        def execute(s, q, p=()): s.o.sql.append((" ".join(q.split())[:60], p))
    class _Db:
        autocommit = True
        def __init__(s, o): s.o = o
        def cursor(s): return Fake._Cur(s.o)
        def commit(s): pass
        def rollback(s): pass
    def db(self): return Fake._Db(self)

f = Fake({"categories": [{"category_id": 11, "confidence": 90, "reason": "Prière."}, {"category_id": 777, "confidence": 99, "reason": "Inventée."}]})
f.process({"talk_id": "11111111-2222-3333-4444-555555555555", "lang": "fr", "attempts": 1})
inserted = [p for q, p in f.sql if q.startswith("INSERT INTO talk_category_suggestions")]
ok(len(inserted) == 1 and inserted[0][1] == 11 and inserted[0][2] == 90, "une seule proposition enregistrée (l'identifiant inventé est écarté)")
ok(any(q.startswith("DELETE FROM talk_category_suggestions") for q, _ in f.sql), "anciens brouillons remplacés")
ok("11: Pratiques et adorations › Prière" in f.asked[1] and "Aujourd'hui on parle de la prière." in f.asked[1], "l'IA reçoit la liste des catégories et la transcription")
ok("ignore" in f.asked[0].lower() or "untrusted" in f.asked[0].lower(), "consigne contre les instructions cachées dans le texte")
ok(any(q.startswith("UPDATE category_jobs SET status = 'ready'") and p[1] == "transcript" for q, p in f.sql), "analyse terminée, base : transcription")
print("TOUT OK")
