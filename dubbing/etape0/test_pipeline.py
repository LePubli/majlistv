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


# --- moteurs légers (faux modules : on teste notre code d'intégration, pas les vrais moteurs) ---
import types, stat
with tempfile.TemporaryDirectory() as d:
    audio, vtt = f"{d}/o.wav", f"{d}/s.vtt"
    bench.write_wav(audio, np.zeros(8 * bench.SR, dtype=np.float32))
    open(vtt, "w", encoding="utf-8").write("WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nBonjour à tous.\n\n00:00:04.000 --> 00:00:06.000\nMerci beaucoup.\n")
    voice = f"{d}/v.wav"; bench.write_wav(voice, 0.1 * np.ones(bench.SR, dtype=np.float32))
    # Piper : faux exécutable qui écrit un bip (durée selon le texte) en 22,05 kHz
    shim = f"{d}/fakepiper.py"
    open(shim, "w").write("import sys,wave,struct,math\ntext=sys.stdin.read()\nout=sys.argv[sys.argv.index('-f')+1]\nn=int(22050*0.05*len(text))\nw=wave.open(out,'wb');w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050)\nw.writeframes(b''.join(struct.pack('<h',int(6000*math.sin(i/9))) for i in range(n)));w.close()\n")
    os.environ["PIPER_CMD"] = f"{sys.executable} {shim}"
    rep = bench.main(["--vtt", vtt, "--audio", audio, "--out", f"{d}/p", "--engine", "piper"])
    check("piper : 2 phrases synthétisées", rep["engine"] == "piper" and all(x["raw_s"] > 0.3 for x in rep["details"]))
    check("piper : rééchantillonné à 24 kHz (durée cohérente)", abs(rep["details"][0]["raw_s"] - 0.05 * len("Bonjour à tous.")) < 0.15)
    rep = bench.main(["--vtt", vtt, "--audio", audio, "--out", f"{d}/p2", "--engine", "piper", "--piper-speaker", "1"])
    check("piper : option locuteur acceptée", rep["segments"] == 2)
    # Kokoro : faux module
    class FakePipe:
        def __init__(self, lang_code): assert lang_code == "f"
        def __call__(self, text, voice):
            yield "g", "p", 0.1 * np.ones(int(0.04 * len(text) * bench.SR), dtype=np.float32)
    sys.modules["kokoro"] = types.SimpleNamespace(KPipeline=FakePipe)
    rep = bench.main(["--vtt", vtt, "--audio", audio, "--out", f"{d}/k", "--engine", "kokoro"])
    check("kokoro : synthèse via KPipeline", rep["engine"] == "kokoro" and rep["details"][0]["raw_s"] > 0.3)
    # Conversion de voix : faux ChatterboxVC (double l'amplitude, mesure l'appel)
    calls = []
    class FakeVC:
        @classmethod
        def from_pretrained(cls, device): return cls()
        def set_target_voice(self, p): calls.append(p)
        def generate(self, path):
            a, _ = bench.read_wav(path); return np.clip(a * 2, -1, 1)
    chat = types.ModuleType("chatterbox"); vcm = types.ModuleType("chatterbox.vc"); vcm.ChatterboxVC = FakeVC
    sys.modules["chatterbox"], sys.modules["chatterbox.vc"] = chat, vcm
    rep = bench.main(["--vtt", vtt, "--audio", audio, "--out", f"{d}/c", "--engine", "kokoro",
                      "--vc-voice", voice, "--consent-date", "2026-10-16", "--consent-by", "Epok"])
    check("conversion de voix appelée avec la voix cible", calls == [voice] and rep["engine"] == "kokoro+vc")
    check("consentement consigné pour la conversion", rep["consent"] == {"date": "2026-10-16", "by": "Epok"})
    check("durée de conversion rapportée", rep["vc_mean_s"] is not None)
    # --vc-steps : l'option doit arriver jusqu'à s3gen.inference
    seen = []
    class FakeS3(object):
        def inference(self, *a, **k): seen.append(k.get("n_cfm_timesteps"))
    class FakeVC2(FakeVC):
        def __init__(self): self.s3gen = FakeS3()
        def generate(self, path):
            self.s3gen.inference(); return FakeVC.generate(self, path)
    vcm.ChatterboxVC = FakeVC2
    rep = bench.main(["--vtt", vtt, "--audio", audio, "--out", f"{d}/s", "--engine", "kokoro", "--vc-voice", voice,
                      "--consent-date", "2026-10-16", "--consent-by", "Epok", "--vc-steps", "5"])
    check("--vc-steps transmis à la conversion", seen and set(seen) == {5} and rep["vc_steps"] == 5)
    # garde-fous
    base = [sys.executable, os.path.join(os.path.dirname(__file__), "bench.py"), "--vtt", vtt, "--audio", audio, "--out", f"{d}/z"]
    r = subprocess.run(base + ["--engine", "kokoro", "--vc-voice", voice], capture_output=True, text=True)
    check("conversion refusée sans consentement", r.returncode != 0 and "consent" in r.stderr.lower())
    r = subprocess.run(base + ["--engine", "kokoro", "--voice", voice], capture_output=True, text=True)
    check("--voice refusé avec kokoro", r.returncode != 0 and "--vc-voice" in r.stderr)
    r = subprocess.run(base + ["--engine", "chatterbox", "--vc-voice", voice], capture_output=True, text=True)
    check("--vc-voice refusé avec chatterbox", r.returncode != 0)

print("\n%d échec(s)" % len(fails))
sys.exit(1 if fails else 0)
