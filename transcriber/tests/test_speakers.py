"""Étape D3c — détection des intervenants (transcripteur) : partie calcul.
  1. Fonctions pures avec de fausses empreintes : regroupement (2 et 3 voix, bruit), petit groupe rattaché, nombre maximal, phrases courtes,
     lissage d'une phrase isolée, numérotation (1 = celui qui parle le plus), hauteur F0 et suggestion de catégorie.
  2. Vrai modèle d'empreinte (sherpa-onnx) si le modèle est disponible (ou téléchargeable) ET si espeak-ng / flite sont installés : une
     « conversation » de trois voix de synthèse différentes, dont on connaît le déroulé, doit être retrouvée.
     Sans eux, la partie 2 est ignorée (et dit pourquoi).
Lancement : python3 transcriber/tests/test_speakers.py"""
import os, shutil, subprocess, sys, tempfile, wave
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.setdefault("MODELS_DIR", "/tmp/claude-0/models")
import speakers as sp  # noqa: E402

bad = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: bad.append(m)

rng = np.random.default_rng(7)
D = 64
centers = [_ for _ in sp._unit(rng.normal(size=(4, D)))]
def emb(k, noise=0.35): return sp._unit(centers[k] + noise * rng.normal(size=D) / np.sqrt(D) * 3)

# --- 1. Regroupement
embs = [emb(i % 2) for i in range(40)]
lab = sp.cluster(embs, [3.0] * 40, threshold=0.5, max_speakers=6)
ok(lab.max() == 1 and len(set(lab[0::2])) == 1 and len(set(lab[1::2])) == 1 and lab[0] != lab[1], "deux voix qui alternent : deux groupes")
embs = [emb(i % 3) for i in range(60)]
lab = sp.cluster(embs, [3.0] * 60, threshold=0.5, max_speakers=6)
ok(lab.max() == 2 and all(len(set(lab[k::3])) == 1 for k in range(3)), "trois voix : trois groupes")
lab = sp.cluster([emb(0) for _ in range(30)], [3.0] * 30, 0.5, 6)
ok(lab.max() == 0, "une seule voix : un seul groupe")
lab = sp.cluster([emb(i % 4) for i in range(80)], [3.0] * 80, 0.99, 2)
ok(lab.max() == 1, "nombre maximal d'intervenants respecté (2)")
# petit groupe (3 phrases d'1,5 s) rattaché au plus proche
embs = [emb(0) for _ in range(30)] + [emb(1) for _ in range(30)] + [emb(2) for _ in range(3)]
w = [5.0] * 60 + [1.5] * 3
lab = sp.cluster(embs, w, 0.5, 6)
ok(lab.max() == 1, "groupe minuscule (4,5 s) rattaché à un autre : 2 intervenants et non 3")
# classement : 0 = le plus long
embs = [emb(0) for _ in range(10)] + [emb(1) for _ in range(30)]
lab = sp.cluster(embs, [3.0] * 40, 0.5, 6)
ok(set(lab[10:]) == {0} and set(lab[:10]) == {1}, "numérotation par temps de parole décroissant")

# --- detect : phrases courtes, lissage, numérotation
ph = [(i, i * 4000, i * 4000 + 3500) for i in range(30)]
truth = [(1 if (i // 5) % 2 == 0 else 2) for i in range(30)]       # alternance par blocs de 5 phrases
E = {i: emb(0 if truth[i] == 1 else 1) for i in range(30)}
for i in (3, 12): E.pop(i)                                        # phrases trop courtes : pas d'empreinte
out, rows = sp.detect(ph, E)
acc = np.mean([out[i] == (1 if truth[i] == truth[0] else 2) for i in range(30)])
ok(acc >= 0.95 and len(rows) == 2, f"détection par blocs : {acc * 100:.0f} % des phrases bien attribuées, {len(rows)} intervenants")
ok(out[3] == out[2] and out[12] == out[11], "phrase sans empreinte : voix de la phrase précédente")
ok(abs(sum(r["seconds"] for r in rows) - 30 * 3.5) < 0.2 and sum(r["phrases"] for r in rows) == 30, "durées et nombres de phrases cohérents")
ok(rows[0]["seconds"] >= rows[1]["seconds"] and rows[0]["n"] == 1, "intervenant 1 = celui qui parle le plus")
out2, rows2 = sp.detect(ph, {})
ok(set(out2.values()) == {1} and len(rows2) == 1, "aucune empreinte : un seul intervenant")
out3, rows3 = sp.detect([], {})
ok(out3 == {} and rows3 == [], "aucune phrase : rien")
# lissage : une phrase isolée ambiguë au milieu d'un bloc revient à la voix de ses voisines
E2 = {i: emb(0) for i in range(11)}
mix = sp._unit(centers[0] * 0.62 + centers[1] * 0.58)
E2[5] = mix
for i in range(11, 22): E2[i] = emb(1)
ph2 = [(i, i * 4000, i * 4000 + 3500) for i in range(22)]
o2, _ = sp.detect(ph2, E2)
ok(len({o2[i] for i in range(0, 11)}) == 1, "phrase ambiguë isolée : lissée sur ses voisines")
# beaucoup de phrases : plus de 1500 → regroupement sur les plus longues, les autres rattachées
big = [(i, i * 3000, i * 3000 + 2500) for i in range(1800)]
Eb = {i: emb(i % 2) for i in range(1800)}
ob, rb = sp.detect(big, Eb)
ok(len(rb) == 2 and abs(rb[0]["phrases"] - 900) < 30, f"1800 phrases : 2 intervenants ({[r['phrases'] for r in rb]})")

# --- F0 et catégorie
def tone(f, dur=2.0, sr=16000):
    t = np.arange(int(dur * sr)) / sr
    return sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 8)) * 0.2
for hz, cat in ((110, "male"), (200, "female"), (300, "child")):
    est = sp.f0(tone(hz))
    ok(est is not None and abs(est - hz) / hz < 0.04, f"F0 de {hz} Hz estimée à {est and round(est)} Hz")
    ok(sp.guess_category(est) == cat, f"{hz} Hz → {cat}")
ok(sp.f0(np.zeros(16000)) is None and sp.f0(rng.normal(size=16000) * 0.1) is None, "silence ou bruit : pas de hauteur")
ok(sp.guess_category(None) == "", "hauteur inconnue : pas de suggestion")

# --- 2. Vrai modèle + voix de synthèse
def real():
    if not (shutil.which("espeak-ng") and shutil.which("flite")):
        print("SKIP vrai modèle : espeak-ng / flite absents"); return
    try:
        path = sp.ensure_model(print)
        emb_ = sp.Embedder(path, 2)
    except Exception as err:  # noqa: BLE001
        print(f"SKIP vrai modèle : indisponible ({err})"); return
    d = tempfile.mkdtemp(prefix="spk-")
    texts = ["Bonjour mes amis, aujourd'hui nous allons parler de la patience dans l'épreuve.", "La patience est une lumière pour le croyant sincère.",
             "Il faut rester constant même quand le chemin devient difficile.", "Chacun de nous traverse des moments de doute et de fatigue.",
             "Le savoir s'acquiert avec le temps, l'humilité et beaucoup de travail.", "Rappelons-nous toujours que la miséricorde précède la colère."]
    def say(voice, text, path):
        if voice.startswith("es"):
            subprocess.run(["espeak-ng", "-v", "fr+" + voice[2:], "-s", "150", text, "-w", path], check=True)
        else:
            subprocess.run(["flite", "-voice", voice[2:], "-t", text, "-o", path], check=True)
    def load(path):
        with wave.open(path) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
            sr = w.getframerate()
        if sr != 16000:
            import scipy.signal as ss
            a = ss.resample_poly(a, 16000, sr).astype(np.float32)
        return a
    # trois voix : deux voix françaises d'espeak (homme, femme) + une voix de flite
    plan = ["esm3", "esf2", "esm3", "flawb", "esf2", "esm3", "flawb", "esf2", "esm3", "flawb", "esm3", "esf2"]
    sil = np.zeros(8000, dtype=np.float32)
    pieces, ph, E, t = [], [], {}, 0
    for k, v in enumerate(plan):
        p = os.path.join(d, f"{k}.wav"); say(v, texts[k % len(texts)], p); a = load(p)
        pieces += [a, sil]
        ph.append((k, int(t * 1000), int((t + len(a) / 16000) * 1000)))
        e = emb_.embed(a)
        if e is not None: E[k] = e
        t += len(a) / 16000 + 0.5
    out, rows = sp.detect(ph, E, threshold=float(os.environ.get("SPK_THRESHOLD", "0.5")))
    # même intervenant ⇔ même voix du déroulé
    pairs_ok = sum(1 for a in range(len(plan)) for b in range(a) if (out[a] == out[b]) == (plan[a] == plan[b]))
    pairs = len(plan) * (len(plan) - 1) // 2
    print("     déroulé trouvé :", [out[i] for i in range(len(plan))], "attendu :", plan)
    ok(pairs_ok / pairs >= 0.9 and len(rows) == 3, f"vraies empreintes, 3 voix de synthèse : {pairs_ok}/{pairs} paires de phrases bien rapprochées/séparées, {len(rows)} intervenants")
    male = np.concatenate([load(os.path.join(d, f"{k}.wav")) for k, v in enumerate(plan) if v == "esm3"])
    fem = np.concatenate([load(os.path.join(d, f"{k}.wav")) for k, v in enumerate(plan) if v == "esf2"])
    hm, hf = sp.f0(male), sp.f0(fem)
    print(f"     F0 voix d'homme d'essai : {hm and round(hm)} Hz, voix de femme d'essai : {hf and round(hf)} Hz")
    ok(hm is not None and hf is not None and hm < hf, "la voix de femme d'essai est estimée plus aiguë que celle de l'homme")
real()

print("\n" + ("TOUT EST BON" if not bad else f"{len(bad)} ÉCHEC(S) : " + " | ".join(bad)))
sys.exit(1 if bad else 0)
