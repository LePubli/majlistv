"""Tests unitaires (sans base ni réseau) de la détection des références : python3 translator/tests/test_references_clean.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from references import References, fold, match_score, tokens, clean_number, ref_key, decide_status, MATCH_OK


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


class R(References):
    """Sans base : les textes de la source viennent de tables fournies par le test."""
    QURAN = {(2, 255): (["اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ"], ["Allah ! Pas de divinité à part Lui, le Vivant, Celui qui subsiste par lui-même"]),
             (2, 153): (["يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ"], ["O vous qui croyez ! Cherchez secours dans l'endurance et la prière"])}
    HADITH = {("bukhari", "1"): (["إنما الأعمال بالنيات"], ["Les actes ne valent que par les intentions"])}

    def verse_texts(self, sura, a, b):
        ar, fr = [], []
        for x in range(a, b + 1):
            t = self.QURAN.get((sura, x))
            if t:
                ar += t[0]
                fr += t[1]
        return ar, fr

    def hadith_texts(self, collection, number):
        return self.HADITH.get((collection, number), ([], []))


segs = [
    {"idx": 0, "start_ms": 0, "end_ms": 9000, "text": "Bienvenue dans cette conférence sur la patience et la prière."},
    {"idx": 1, "start_ms": 9000, "end_ms": 21000, "text": "Allah dit dans la sourate Al-Baqara : O vous qui croyez ! Cherchez secours dans l'endurance et la prière."},
    {"idx": 2, "start_ms": 21000, "end_ms": 40000, "text": "Le Prophète a dit, rapporté par Boukhari numéro 1 : les actes ne valent que par les intentions."},
    {"idx": 3, "start_ms": 40000, "end_ms": 60000, "text": "Et un autre hadith dit : celui qui ne remercie pas les gens ne remercie pas Allah, sans qu'on sache d'où il vient."},
    {"idx": 4, "start_ms": 60000, "end_ms": 80000, "text": "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وهذه آية الكرسي"},
]
r = R(log=print, conn_params=lambda: {}, fatal_error=RuntimeError, lang_names={})

# --- fonctions pures
ok(fold("ٱلصَّبْرُ") == fold("الصبر"), "fold : alif wasla et voyelles brèves ignorées")
ok(match_score("a b", ["a b c"]) is None, "match : extrait trop court = non mesurable")
ok(match_score("O vous qui croyez cherchez secours dans l'endurance", ["O vous qui croyez ! Cherchez secours dans l'endurance et la prière"]) == 100, "match : extrait contenu dans le verset = 100")
ok(match_score("rien à voir avec ce verset du tout", ["O vous qui croyez ! Cherchez secours dans l'endurance"]) < 30, "match : texte sans rapport = faible")
ok(clean_number(" n° 0012 ") == "0012" and clean_number("zéro") == "" and clean_number("0") == "", "numéro : chiffres seulement, zéro refusé")
ok(ref_key("quran", 2, 255, 255, "", "", "") == "q:2:255-255" and ref_key("hadith", None, None, None, "bukhari", "1", "") == "h:bukhari:1", "clés de référence")
ok(decide_status("quran", True, MATCH_OK, True) == "approved", "verset prouvé : publié d'office")
ok(decide_status("quran", True, MATCH_OK, False) == "draft", "réglage coupé : brouillon")
ok(decide_status("quran", True, MATCH_OK - 1, True) == "draft" and decide_status("quran", False, 90, True) == "draft" and decide_status("quran", True, None, True) == "draft", "verset non prouvé : brouillon")
ok(decide_status("hadith", True, 100, True) == "draft", "hadith : TOUJOURS en brouillon")

# --- nettoyage des propositions
data = {"references": [
    {"kind": "quran", "sura": 2, "aya_from": 153, "aya_to": 153, "excerpt": "O vous qui croyez ! Cherchez secours dans l'endurance et la prière", "seconds": 12},
    {"kind": "hadith", "collection": "bukhari", "number": "1", "excerpt": "rapporté par Boukhari numéro 1 : les actes ne valent que par les intentions", "seconds": 25},
    {"kind": "hadith", "collection": "", "number": "", "excerpt": "celui qui ne remercie pas les gens ne remercie pas Allah", "seconds": 45},
    {"kind": "quran", "sura": 2, "aya_from": 255, "excerpt": "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ", "seconds": 62},
    {"kind": "quran", "sura": 99, "aya_from": 1, "excerpt": "Phrase inventée qui ne figure pas dans la transcription du tout", "seconds": 5},   # extrait introuvable
    {"kind": "quran", "sura": 115, "aya_from": 1, "excerpt": "Allah dit dans la sourate Al-Baqara : O vous qui croyez", "seconds": 12},          # sourate hors limites
    {"kind": "quran", "sura": 2, "aya_from": 153, "excerpt": "Cherchez secours dans l'endurance et la prière", "seconds": 13},                      # doublon
    {"kind": "tafsir", "excerpt": "Bienvenue dans cette conférence sur la patience et la prière", "seconds": 0},                                 # type inconnu
]}
out, dropped = r.clean_refs(data, segs, True)
by = {x["ref_key"]: x for x in out}
ok(len(out) == 4 and dropped == 4, f"4 gardées, 4 écartées (extrait introuvable, sourate invalide, doublon, type inconnu) — {len(out)}/{dropped}")
q = by["q:2:153-153"]
ok(q["found"] and q["match"] >= MATCH_OK and q["status"] == "approved" and q["start_ms"] == 9000, "verset cité avec son texte : prouvé, publié d'office, minute recalée sur le segment")
ok(q["excerpt"].startswith("Allah dit dans la sourate Al-Baqara"), "l'extrait stocké est le texte de la transcription, pas celui de l'IA")
h = by["h:bukhari:1"]
ok(h["found"] and h["status"] == "draft" and h["collection"] == "bukhari" and h["number"] == "1", "hadith avec source dite : trouvé dans le corpus mais TOUJOURS en brouillon")
u = [x for x in out if x["kind"] == "hadith" and not x["collection"]][0]
ok(u["number"] == "" and u["said_as"] == "" and not u["found"] and u["status"] == "draft" and u["ref_key"].startswith("h:?:"), "hadith sans source : « source non précisée », rien deviné, brouillon")
a = by["q:2:255-255"]
ok(a["found"] and a["match"] >= MATCH_OK and a["status"] == "approved", "verset récité en arabe : concordance prouvée malgré les voyelles")
out2, _ = r.clean_refs(data, segs, False)
ok(all(x["status"] == "draft" for x in out2), "réglage « publier sans relecture » coupé : tout en brouillon")

# verset dont le texte n'est pas dans la source : gardé en brouillon, « non trouvé »
d2 = {"references": [{"kind": "quran", "sura": 18, "aya_from": 10, "excerpt": "Allah dit dans la sourate Al-Baqara : O vous qui croyez", "seconds": 12}]}
o3, _ = r.clean_refs(d2, segs, True)
ok(len(o3) == 1 and not o3[0]["found"] and o3[0]["match"] is None and o3[0]["status"] == "draft", "verset absent de la source : brouillon, texte non trouvé")
# verset mal attribué : l'extrait ne ressemble pas au verset annoncé → concordance faible, brouillon
d3 = {"references": [{"kind": "quran", "sura": 2, "aya_from": 255, "excerpt": "Allah dit dans la sourate Al-Baqara : O vous qui croyez ! Cherchez secours", "seconds": 12}]}
o4, _ = r.clean_refs(d3, segs, True)
ok(len(o4) == 1 and o4[0]["found"] and o4[0]["match"] < MATCH_OK and o4[0]["status"] == "draft", "verset mal attribué : concordance faible, jamais publié d'office")
ok(r.clean_refs("pas un objet", segs, True) == ([], 0) and r.clean_refs({"references": "x"}, segs, True) == ([], 0) and r.clean_refs({"references": ["x"]}, segs, True) == ([], 1), "réponse inattendue de l'IA : rien, sans erreur")

# fenêtres
text = "\n".join(f"[00:00:{i:02d}] " + "mot " * 300 for i in range(40))
w = r.windows(text)
ok(len(w) > 1 and all(len(x) < 9000 for x in w), f"découpage en fenêtres ({len(w)})")
ok(w[1].split("\n")[0] == w[0].split("\n")[-1], "recouvrement d'une ligne entre fenêtres")
print("Tous les contrôles sont passés.")
