#!/usr/bin/env python3
"""Test de la chaîne (VTT -> calage -> mixage -> rapport) avec le faux moteur. Ne teste PAS le vrai modèle.
Lancer : python3 test_pipeline.py"""
import json, os, subprocess, sys, tempfile
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import bench

fails = []
def check(name, cond):
    print(("OK   " if cond else "FAIL ") + name)
    if not cond: fails.append(name)

# parse
cues = bench.parse_vtt("WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nBonjour <b>à tous</b>\n\n00:00:04.000 --> 00:00:05.000\n# Sourate\n\n01:00.000 --> 01:02.500\nUne\ndeux\n")
check("parse 3 cues", len(cues) == 3)
check("balises retirées", cues[0]["text"] == "Bonjour à tous")
check("minutes:secondes", abs(cues[2]["start"] - 60) < 1e-6 and cues[2]["text"] == "Une deux")

with tempfile.TemporaryDirectory() as d:
    audio, vtt, out = f"{d}/o.wav", f"{d}/s.vtt", f"{d}/out"
    t = np.arange(12 * bench.SR) / bench.SR
    bench.write_wav(audio, (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32))
    open(vtt, "w", encoding="utf-8").write(
        "WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nBonjour à tous et bienvenue.\n\n"      # 29 car ≈ 1.9 s : tient
        "00:00:03.500 --> 00:00:05.000\n# Récitation d'un verset\n\n"                    # protégé
        "00:00:06.000 --> 00:00:07.000\nCette phrase est beaucoup trop longue pour son créneau court.\n")  # déborde
    rep = bench.main(["--vtt", vtt, "--audio", audio, "--out", out, "--engine", "fake"])
    for f in ("dub_mix.wav", "dub_mix.mp3", "voice_only.wav", "report.json", "report.md"):
        check("fichier " + f, os.path.getsize(f"{out}/{f}") > 0)
    check("1 phrase protégée", rep["protected_segments"] == 1)
    d0, d1, d2 = rep["details"]
    check("phrase 1 sans accélération", d0["speedup"] == 1.0 and d0["overflow_s"] == 0)
    check("phrase 3 accélérée au max", d2["speedup"] == 1.35 and d2["overflow_s"] > 0)
    check("débordement compté", rep["overflow_count"] == 1)
    v, _ = bench.read_wav(f"{out}/voice_only.wav")
    s0, s1 = int(3.5 * bench.SR), int(5.0 * bench.SR)
    check("aucune voix synthétique sur le segment protégé", float(np.max(np.abs(v[s0:s1]))) < 1e-4)
    m, _ = bench.read_wav(f"{out}/dub_mix.wav")
    check("original à plein volume sur le protégé", float(np.max(np.abs(m[s0:s1]))) > 0.25)
    check("original baissé ailleurs", float(np.max(np.abs(m[int(10*bench.SR):int(11*bench.SR)]))) < 0.1)
    check("report.json lisible", json.load(open(f"{out}/report.json"))["engine"] == "fake")

    # garde-fous du consentement (sortie AVANT chargement du modèle)
    base = [sys.executable, os.path.join(os.path.dirname(__file__), "bench.py"), "--vtt", vtt, "--audio", audio, "--out", out + "2", "--engine", "chatterbox", "--voice", audio]
    r = subprocess.run(base, capture_output=True, text=True)
    check("clonage refusé sans consentement", r.returncode != 0 and "consent" in r.stderr.lower())
    r = subprocess.run(base + ["--consent-date", "16/10/2026", "--consent-by", "X"], capture_output=True, text=True)
    check("date de consentement mal formée refusée", r.returncode != 0 and "AAAA-MM-JJ" in r.stderr)

print("\n%d échec(s)" % len(fails))
sys.exit(1 if fails else 0)
