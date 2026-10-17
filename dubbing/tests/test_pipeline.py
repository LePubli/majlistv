#!/usr/bin/env python3
"""Doublage (étapes D1a et D1b) — logique audio sans modèle : fenêtre d'écoute rapide, calage, conversion par blocs, voix d'origine,
mélange, encodage. Lancement : python3 dubbing/tests/test_pipeline.py (Python 3.11+, numpy, ffmpeg)."""
import os, subprocess, sys, tempfile
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import pipeline as pl
from engines import FakeBase, FakeVC
import glossary as gls

fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

P = {"vcSteps": 3, "vcChunk": 20, "maxSpeedup": 1.35, "duck": 15, "borrow": 1.0, "lengthScale": 1.0}
cues = [
    {"idx": 0, "start": 0.0, "end": 2.0, "text": "# Bismillah"},
    {"idx": 1, "start": 2.5, "end": 5.0, "text": "Bonjour à tous."},                                   # 15 car ≈ 0,9 s : tient
    {"idx": 2, "start": 5.5, "end": 6.0, "text": "Une phrase beaucoup trop longue pour son créneau."},  # déborde
    {"idx": 3, "start": 30.0, "end": 33.0, "text": "Loin après : autre bloc."},
    {"idx": 4, "start": 90.0, "end": 92.0, "text": "Hors de la fenêtre de 60 secondes."},
]
sel, win = pl.select_cues(cues, "preview", 60)
ok(win == (2.0, 62.0) and [c["idx"] for c in sel] == [1, 2, 3], "écoute rapide : 60 s à partir de la première phrase à doubler (0,5 s avant)")
ok(pl.select_cues(cues, "full", 60) == (cues, None), "doublage complet : toutes les phrases")
ok(pl.select_cues([cues[0]], "preview", 60)[0] == [], "rien à doubler si tout est gardé")

base = FakeBase(); synth = lambda t: base.synth(t, "m", None, P)
placed, rep = pl.fit_cues(cues[:4], synth, P, total=40.0)
st = {r["idx"]: r for r in rep}
ok(st[0]["state"] == "kept" and len(placed) == 3, "phrase « # » jamais synthétisée")
ok(st[1]["state"] == "fit" and st[1]["speedup"] == 1.0, "phrase courte : calée sans accélération")
ok(st[2]["state"] == "review" and st[2]["speedup"] == 1.35 and st[2]["overflow"] > 0, "phrase trop longue : accélérée au maximum puis « à revoir »")
ok(placed[0][0] == int(2.5 * pl.SR), "phrase placée à son début")
P2 = dict(P, maxSpeedup=1.5, borrow=2.0)
_, rep2 = pl.fit_cues([cues[1], {"idx": 9, "start": 5.0, "end": 6.0, "text": "Phrase de taille moyenne ici."}], synth, P2, total=8.5)
ok(rep2[1]["state"] in ("fit", "sped"), f"emprunt de silence et accélération plus forte réglables ({rep2[1]['state']})")
n = int(40 * pl.SR)
vc = FakeVC()
track, blocks = pl.convert_blocks(placed, n, vc.convert, 20)
ok(blocks == 2 and vc.calls == 2, "conversion par blocs : 2 appels pour 3 phrases (2 proches + 1 lointaine)")
vc2 = FakeVC(); _, b2 = pl.convert_blocks(placed, n, vc2.convert, 1)
ok(b2 == 3, "blocs courts : un appel par phrase")
s0 = int(2.5 * pl.SR)
ok(abs(float(np.max(np.abs(track[s0:s0 + pl.SR // 2]))) - 0.18) < 0.01, "voix convertie à la bonne place, durée conservée")
ok(float(np.max(np.abs(track[int(10 * pl.SR):int(25 * pl.SR)]))) == 0.0, "silence entre les blocs")
gain = pl.duck_gain(n, cues[:4], 15)
ok(abs(gain[int(1 * pl.SR)] - 1.0) < 1e-6 and abs(gain[int(10 * pl.SR)] - 0.15) < 1e-6, "voix d'origine : 100 % pendant « # », 15 % ailleurs")
ok(0.15 < gain[int(2.04 * pl.SR)] < 1.0, "fondu après une phrase gardée (pas de claquement)")
orig = np.full(n, 0.9, dtype=np.float32)
m = pl.mix(track, orig, gain)
ok(float(np.max(np.abs(m))) <= 0.981 and abs(m[int(10 * pl.SR)] - 0.135) < 0.01, "mélange : original baissé, crête limitée")
sm = pl.summarize(rep)
ok(sm == {"phrases": 4, "kept": 1, "review": 1, "sped": 0, "speedupMean": round((1 + 1.35 + 1) / 3, 3)}, f"résumé ({sm})")
with tempfile.TemporaryDirectory() as d:
    out = os.path.join(d, "a.m4a"); pl.encode_m4a(m, out)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True).stdout)
    ok(abs(dur - 40) < 0.2, f"encodage AAC : {dur:.1f} s")
    src = os.path.join(d, "src.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=20", "-c:a", "aac", src], check=True)
    part = pl.load_audio(src, 5, 10)
    ok(abs(len(part) / pl.SR - 10) < 0.05, "extraction d'une portion de la voix d'origine (écoute rapide)")
# --- étape D1b : marquage depuis le Studio et glossaire de prononciation
ok(pl.kept({"text": "Bonjour", "keep": True}) and pl.kept({"text": " # x"}) and not pl.kept({"text": "Bonjour", "keep": False}), "voix d'origine : case du Studio ou ancien « # »")
mk = [dict(c) for c in cues[:4]]; mk[1]["keep"] = True
_, repk = pl.fit_cues(mk, synth, P, total=40.0)
ok({r["idx"]: r["state"] for r in repk}[1] == "kept", "phrase cochée dans le Studio : jamais synthétisée")
ok(pl.select_cues(mk, "preview", 60)[1] == (5.0, 65.0), "écoute rapide : commence après les phrases cochées")
G = gls.compile_entries([{"term": "Imam", "say": "Imame"}, {"term": "Ibn Outhaymine", "say": "Ibne Outhaïmine"},
                         {"term": "Allah", "say": "Allâh"}, {"term": "SAW", "say": "salla Allahou alayhi wa sallam", "case_sensitive": True},
                         {"term": "inactif", "say": "x", "active": False}, {"term": "ra", "say": "RA", "whole_word": False}])
ok(gls.apply("l'Imam Ibn Outhaymine, qu'Allah", G) == "l'Imame Ibne Outhaïmine, qu'Allâh", "glossaire : remplacements (apostrophe = séparation)")
ok(gls.apply("Imamat", G) == "Imamat", "glossaire : mot entier respecté")
ok(gls.apply("saw SAW", G) == "saw salla Allahou alayhi wa sallam", "glossaire : majuscules respectées sur demande")
ok(gls.apply("inactif", G) == "inactif", "glossaire : terme désactivé ignoré")
ok(gls.apply("Allah", gls.compile_entries([{"term": "Allah", "say": "Allah Allah"}])) == "Allah Allah", "glossaire : pas de remplacement en chaîne")
ok(gls.apply("mirage", G) == "miRAge", "glossaire : « aussi dans un mot »")
sy = [dict(c) for c in cues[1:2]]; sy[0]["say"] = sy[0]["text"] + " et une longue prononciation ajoutée par le glossaire"
_, r1 = pl.fit_cues(cues[1:2], synth, P, total=40.0); _, r2 = pl.fit_cues(sy, synth, P, total=40.0)
ok(r2[0]["raw"] > r1[0]["raw"], "la voix lit la prononciation du glossaire (« say »), pas le texte des sous-titres")
ok(len(pl.resample(np.zeros(22050, dtype=np.float32), 22050)) == 24000, "rééchantillonnage 22,05 → 24 kHz")
print(f"\n{len(fails)} échec(s)")
sys.exit(1 if fails else 0)
