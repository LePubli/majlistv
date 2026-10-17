"""Doublage Mejliss TV — moteurs de voix.

- Voix de base : Piper (ONNX), chargé UNE fois en mémoire par modèle (le banc d'essai relançait Piper à chaque phrase,
  ce qui coûtait environ la moitié du temps). Les voix sont téléchargées une fois dans MODELS_DIR/piper.
- Conversion de voix : ChatterboxVC (licence MIT), chargé à la première demande qui a une voix cible. Le nombre d'étapes
  de génération est réglable (3 par défaut : jugé équivalent à 10 à l'écoute).
- Mode « fake » (DUB_ENGINE=fake) : faux moteurs sans modèle, pour tester toute la chaîne (file, mélange, envoi).
"""
import os
import time
from pathlib import Path

import numpy as np

from pipeline import SR, resample, write_wav

MODELS = os.environ.get("MODELS_DIR", "/models")


class FakeBase:
    """Un bip dont la durée dépend du nombre de caractères."""
    name = "fake"

    def synth(self, text, model, speaker, p):
        if os.environ.get("DUB_FAKE_DELAY"):  # tests seulement : ralentit le faux moteur pour observer une demande en cours
            time.sleep(float(os.environ["DUB_FAKE_DELAY"]))
        dur = 0.06 * len(text) * float(p.get("lengthScale") or 1)
        t = np.arange(int(dur * SR)) / SR
        return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


class FakeVC:
    name = "fake-vc"

    def __init__(self):
        self.target = None
        self.calls = 0

    def set_target(self, path, steps):
        self.target, self.steps = path, steps

    def convert(self, wav):
        self.calls += 1
        return (np.asarray(wav, dtype=np.float32) * 0.9)


class PiperBase:
    """Voix de base Piper gardées en mémoire (une par modèle)."""
    name = "piper"

    def __init__(self, log=print):
        self.voices = {}
        self.log = log
        self.dir = Path(MODELS) / "piper"

    def voice(self, model):
        if model not in self.voices:
            from piper import PiperVoice
            from piper.download_voices import download_voice

            self.dir.mkdir(parents=True, exist_ok=True)
            onnx = self.dir / f"{model}.onnx"
            if not onnx.exists():
                self.log(f"Téléchargement de la voix Piper {model}")
                download_voice(model, self.dir)
            self.voices[model] = PiperVoice.load(str(onnx))
            self.log(f"Voix Piper {model} chargée ({self.voices[model].config.sample_rate} Hz)")
        return self.voices[model]

    def synth(self, text, model, speaker, p):
        from piper import SynthesisConfig

        v = self.voice(model)
        cfg = SynthesisConfig(speaker_id=speaker, length_scale=p.get("lengthScale"), noise_scale=p.get("noiseScale"), noise_w_scale=p.get("noiseW"))
        parts = [c.audio_float_array for c in v.synthesize(text, syn_config=cfg)]
        if not parts:
            return np.zeros(0, dtype=np.float32)
        return resample(np.concatenate(parts).astype(np.float32), v.config.sample_rate, SR)


class ChatterboxConverter:
    """Conversion de voix ChatterboxVC. La voix cible est préparée une fois par travail."""
    name = "chatterbox-vc"

    def __init__(self, log=print, threads=4):
        import torch
        from chatterbox.vc import ChatterboxVC

        torch.set_num_threads(threads)
        t0 = time.time()
        self.vc = ChatterboxVC.from_pretrained(device="cpu")
        self._orig = self.vc.s3gen.inference
        self.steps = None
        log(f"Conversion de voix chargée en {time.time() - t0:.0f} s")

    def set_target(self, path, steps):
        self.vc.set_target_voice(path)
        if steps != self.steps:
            orig = self._orig
            self.vc.s3gen.inference = (lambda *a, **k: orig(*a, n_cfm_timesteps=steps, **k)) if steps else orig
            self.steps = steps

    def convert(self, wav):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "s.wav")
            write_wav(src, wav)
            out = self.vc.generate(src)
        if hasattr(out, "detach"):
            out = out.detach().cpu().numpy()
        return np.asarray(out, dtype=np.float32).reshape(-1)
