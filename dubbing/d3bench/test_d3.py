#!/usr/bin/env python3
"""Étape D3a — test du banc d'essai avec un FAUX Qwen3-TTS (aucun modèle téléchargé) : vérifie le moteur « qwen » de bench.py
(échantillon obligatoire, texte de référence transmis, langue French, rééchantillonnage), l'option --synthetic (voix de synthèse,
pas de consentement), le refus sans consentement pour une vraie voix, et le tableau compare.py.
Ne teste PAS la vraie qualité ni la vraie vitesse : c'est le rôle de run_d3.sh sur le VPS.
Lancer : python3 test_d3.py (dans l'image majlis-dub-d3, ou depuis dubbing/d3bench avec numpy et ffmpeg installés)"""
import json, os, sys, tempfile, types
import numpy as np
here = os.path.dirname(os.path.abspath(__file__))
for p in (here, os.path.join(here, "..", "etape0")):
    if os.path.isfile(os.path.join(p, "bench.py")):
        sys.path.insert(0, p)
calls = {}

class FakeQwen:
    @classmethod
    def from_pretrained(cls, name, **kw):
        calls["model"], calls["kw"] = name, kw
        return cls()
    def create_voice_clone_prompt(self, ref_audio, ref_text=None, x_vector_only_mode=False):
        calls["prompt"] = (ref_audio, ref_text, x_vector_only_mode)
        return ["PROMPT"]
    def generate_voice_clone(self, text, language=None, voice_clone_prompt=None, **kw):
        calls.setdefault("texts", []).append(text); calls["lang"] = language
        sr = 12000  # différent de 24000 : le banc doit rééchantillonner
        t = np.arange(int(0.05 * len(text) * sr)) / sr
        return [(0.2 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)], sr

sys.modules["qwen_tts"] = types.SimpleNamespace(Qwen3TTSModel=FakeQwen)
sys.modules.setdefault("torch", types.SimpleNamespace(float32="float32", set_num_threads=lambda n: None))
import bench  # noqa: E402
import compare  # noqa: E402

fails = []
def check(name, cond):
    print(("OK   " if cond else "FAIL ") + name)
    if not cond: fails.append(name)

with tempfile.TemporaryDirectory() as d:
    audio, vtt, voice, ref = f"{d}/o.wav", f"{d}/s.vtt", f"{d}/femme.wav", f"{d}/texte.txt"
    t = np.arange(12 * bench.SR) / bench.SR
    bench.write_wav(audio, (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32))
    bench.write_wav(voice, (0.3 * np.sin(2 * np.pi * 300 * t[: 5 * bench.SR])).astype(np.float32))
    open(ref, "w", encoding="utf-8").write(open(os.path.join(here, "texte-reference.txt"), encoding="utf-8").read() if os.path.isfile(os.path.join(here, "texte-reference.txt")) else "Bonjour.")
    open(vtt, "w", encoding="utf-8").write("WEBVTT\n\n00:00:00.500 --> 00:00:03.000\nBonjour à tous.\n\n00:00:03.500 --> 00:00:05.000\n# Verset protégé\n\n"
                                           "00:00:06.000 --> 00:00:09.000\nLa patience est une lumière.\n")
    base = ["--vtt", vtt, "--audio", audio]
    # Refus
    for args, why in ((["--engine", "qwen"], "qwen sans échantillon"), (["--engine", "qwen", "--voice", voice], "vraie voix sans consentement"),
                      (["--engine", "qwen", "--voice", voice, "--ref-text", f"{d}/absent.txt", "--synthetic"], "texte de référence absent")):
        try:
            bench.main(base + ["--out", f"{d}/x"] + args); check("refus : " + why, False)
        except SystemExit as e:
            check(f"refus : {why} ({str(e.code)[:60]})", isinstance(e.code, str) and "ERREUR" in e.code)
    # Essai complet avec voix de synthèse
    out = f"{d}/d3/femme-qwen"
    rep = bench.main(base + ["--out", out, "--engine", "qwen", "--voice", voice, "--ref-text", ref, "--synthetic"])
    check("modèle par défaut 0.6B-Base, processeur, float32", calls["model"] == "Qwen/Qwen3-TTS-12Hz-0.6B-Base" and calls["kw"].get("device_map") == "cpu" and calls["kw"].get("dtype") == "float32")
    check("texte de référence transmis (mode ICL)", calls["prompt"][1].startswith("Bonjour et bienvenue") and calls["prompt"][2] is False)
    check("langue French", calls["lang"] == "French")
    check("phrase protégée (#) jamais envoyée au moteur", calls["texts"] == ["Bonjour à tous.", "La patience est une lumière."])
    check("rapport : moteur qwen-0.6b, voix de synthèse", rep["engine"] == "qwen-0.6b" and rep["consent"] == {"synthetic": True} and rep["ref_text"] is True)
    raw = [s["raw_s"] for s in rep["details"] if not s["protected"]]
    check(f"rééchantillonné à 24 kHz (durées {raw})", abs(raw[0] - 0.05 * len("Bonjour à tous.")) < 0.05)
    for f in ("dub_mix.mp3", "voice_only.wav", "report.json", "report.md"):
        check("fichier " + f, os.path.getsize(f"{out}/{f}") > 0)
    # Sans texte de référence : empreinte de voix seule
    bench.main(base + ["--out", f"{d}/d3/fille-qwen", "--engine", "qwen", "--voice", voice, "--synthetic", "--qwen-model", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"])
    check("sans texte : empreinte seule ; modèle 1.7B choisi", calls["prompt"][1] is None and calls["prompt"][2] is True and calls["model"].endswith("1.7B-Base"))
    # Méthode actuelle simulée (faux moteur) pour le tableau
    os.makedirs(f"{d}/d3/femme-conversion")
    json.dump({"engine": "piper+vc", "rtf_total": 1.9, "ram_peak_gb": 3.4, "overflow_share": 0.05, "segments": 3, "model_load_s": 9, "audio_total_s": 12},
              open(f"{d}/d3/femme-conversion/report.json", "w"))
    rows = compare.main([f"{d}/d3"])
    md = open(f"{d}/d3/comparaison.md", encoding="utf-8").read()
    check("comparaison : 3 essais, 2 voix", len(rows) == 3 and {r["voice"] for r in rows} == {"femme", "fille"})
    check("comparaison : méthodes nommées, durée pour 1 h", "Tom + conversion (actuel)" in md and "Qwen3-TTS (clonage direct)" in md and "1,9 h" in md)
    try:
        compare.main([f"{d}/vide"]); check("comparaison : dossier absent refusé", False)
    except SystemExit:
        check("comparaison : dossier absent refusé", True)

print(f"\n{len(fails)} échec(s)" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
