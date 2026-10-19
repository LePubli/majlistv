#!/usr/bin/env python3
"""Mejliss TV — Doublage, étape 0 : test de voix et mesures.

Prend un fichier de sous-titres français (.vtt) et l'audio d'origine d'une conférence,
fabrique la voix française (moteur Chatterbox, ou « fake » pour tester la chaîne sans modèle),
cale chaque phrase dans son créneau, mixe avec l'original baissé (~15 %) et écrit un rapport.

Règles de sécurité :
- Une cue dont le texte commence par « # » n'est JAMAIS synthétisée (verset, hadith, invocation) :
  l'original reste à plein volume pendant ce créneau.
- Avec le moteur chatterbox, --consent-date et --consent-by sont obligatoires (consentement daté).
"""
import argparse, json, os, re, resource, statistics, subprocess, sys, tempfile, time, wave
import numpy as np

MAX_BORROW = 1.0  # secondes de silence qu'une phrase peut emprunter après son créneau
SR = 24000  # fréquence de travail (celle de Chatterbox)

# ---------- Seuils de décision (PROPOSITIONS, à valider avec Epok après mesure) ----------
THRESH = {"rtf_median_max": 3.0, "overflow_share_max": 0.20, "ram_gb_max": 6.0}


def ts(s):
    """'00:01:02.500' ou '01:02.500' -> secondes."""
    p = s.replace(",", ".").split(":")
    p = [float(x) for x in p]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def parse_vtt(text):
    """Retourne [{start,end,text}] depuis un WebVTT."""
    cues = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n").strip()):
        lines = [l for l in block.split("\n") if l.strip()]
        for i, l in enumerate(lines):
            m = re.match(r"\s*([\d:.,]+)\s*-->\s*([\d:.,]+)", l)
            if m:
                body = " ".join(x.strip() for x in lines[i + 1:])
                body = re.sub(r"<[^>]+>", "", body).strip()
                if body:
                    cues.append({"start": ts(m.group(1)), "end": ts(m.group(2)), "text": body})
                break
    return cues


def write_wav(path, arr, sr=SR):
    a = np.clip(arr, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((a * 32767).astype("<i2").tobytes())


def read_wav(path):
    with wave.open(path, "rb") as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        assert sw == 2, "wav 16 bits attendu"
        a = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32767
        if ch > 1:
            a = a.reshape(-1, ch).mean(axis=1)
        return a, w.getframerate()


def ffmpeg(*args):
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("ffmpeg : " + r.stderr.strip()[:400])


def load_original(path):
    """Décode n'importe quel audio/vidéo en mono SR Hz."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "o.wav")
        ffmpeg("-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16", out)
        return read_wav(out)[0]


def speed_up(arr, factor):
    """Accélère sans changer la hauteur (atempo). factor >= 1."""
    if factor <= 1.001:
        return arr
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        write_wav(a, arr)
        ffmpeg("-i", a, "-filter:a", f"atempo={factor:.4f}", b)
        return read_wav(b)[0]


# ---------- Moteurs ----------
class FakeEngine:
    """Faux moteur : un bip dont la durée dépend du nombre de caractères. Sert à tester la chaîne."""
    name = "fake"
    def __init__(self, **_): pass
    def synth(self, text):
        dur = 0.065 * len(text)
        t = np.arange(int(dur * SR)) / SR
        return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def to_np(x):
    """Tenseur torch ou tableau -> numpy float32 à une dimension."""
    if hasattr(x, "detach"):
        x = x.detach().cpu().numpy()
    return np.asarray(x, dtype=np.float32).reshape(-1)


def resample_file(src, dst, sr=SR):
    ffmpeg("-i", src, "-ac", "1", "-ar", str(sr), "-sample_fmt", "s16", dst)


class ChatterboxEngine:
    """Voix + clonage en une seule passe (lent sur processeur : génération mot à mot)."""
    name = "chatterbox"
    def __init__(self, device="cpu", voice=None, lang="fr", exaggeration=0.5, cfg_weight=0.5, **_):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # import tardif : lourd
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        self.voice, self.lang = voice, lang
        self.kw = dict(exaggeration=exaggeration, cfg_weight=cfg_weight)
    def synth(self, text):
        return to_np(self.model.generate(text, language_id=self.lang, audio_prompt_path=self.voice, **self.kw))


class PiperEngine:
    """Piper : voix française très légère (ONNX), sans clonage. Appelle la ligne de commande de Piper."""
    name = "piper"
    def __init__(self, piper_voice="fr_FR-siwis-medium", piper_dir="/models/piper", piper_speaker=None, **_):
        self.speaker = piper_speaker
        self.cmd = os.environ.get("PIPER_CMD", f"{sys.executable} -m piper").split()
        self.model = os.path.join(piper_dir, piper_voice + ".onnx")
        if not os.path.isfile(self.model) and not os.environ.get("PIPER_CMD"):
            os.makedirs(piper_dir, exist_ok=True)
            r = subprocess.run([sys.executable, "-m", "piper.download_voices", piper_voice, "--download-dir", piper_dir],
                               capture_output=True, text=True)
            if r.returncode or not os.path.isfile(self.model):
                raise RuntimeError("Téléchargement de la voix Piper impossible : " + (r.stderr or r.stdout)[-300:])
    def synth(self, text):
        with tempfile.TemporaryDirectory() as d:
            raw, out = os.path.join(d, "r.wav"), os.path.join(d, "o.wav")
            extra = ["-s", str(self.speaker)] if self.speaker is not None else []
            r = subprocess.run(self.cmd + ["-m", self.model, "-f", raw] + extra, input=text, capture_output=True, text=True)
            if r.returncode or not os.path.isfile(raw):
                raise RuntimeError("piper : " + r.stderr[-300:])
            resample_file(raw, out)
            return read_wav(out)[0]


class KokoroEngine:
    """Kokoro 82M (Apache 2.0) : voix française légère, sans clonage."""
    name = "kokoro"
    def __init__(self, kokoro_voice="ff_siwis", **_):
        from kokoro import KPipeline  # import tardif
        self.pipe = KPipeline(lang_code="f")
        self.voice = kokoro_voice
    def synth(self, text):
        parts = [to_np(a) for _, _, a in self.pipe(text, voice=self.voice) if a is not None]
        return np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)


class VoiceConverter:
    """Seconde passe : donne la voix d'Epok à une voix synthétique (ChatterboxVC, sans génération mot à mot)."""
    def __init__(self, target_voice, device="cpu", steps=None):
        from chatterbox.vc import ChatterboxVC  # import tardif
        self.vc = ChatterboxVC.from_pretrained(device=device)
        self.vc.set_target_voice(target_voice)
        if steps:  # moins d'étapes de génération = plus rapide, qualité à écouter (défaut du modèle : 10)
            orig = self.vc.s3gen.inference
            self.vc.s3gen.inference = lambda *a, **k: orig(*a, n_cfm_timesteps=steps, **k)
    def convert(self, wav):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "s.wav")
            write_wav(src, wav)
            return to_np(self.vc.generate(src))


class QwenEngine:
    """Étape D3 : Qwen3-TTS (Apache 2.0), clonage direct d'un échantillon de voix (10 à 30 s), sans conversion.
    Image séparée (dubbing/d3bench) : qwen-tts exige transformers 4.57, incompatible avec chatterbox-tts 0.1.7.
    Avec le texte lu dans l'échantillon (--ref-text) : mode « ICL », le plus fidèle ; sans lui : empreinte de voix seule."""
    name = "qwen"
    def __init__(self, voice=None, device="cpu", qwen_model="Qwen/Qwen3-TTS-12Hz-0.6B-Base", ref_text=None, qwen_lang="French", **_):
        if not voice:
            raise RuntimeError("qwen : --voice (échantillon de 10 à 30 s) est obligatoire")
        import torch
        from qwen_tts import Qwen3TTSModel  # import tardif : lourd
        self.model = Qwen3TTSModel.from_pretrained(qwen_model, device_map=device, dtype=torch.float32)
        self.lang = qwen_lang
        self.name = "qwen-" + qwen_model.rsplit("-", 2)[-2].lower() if "-" in qwen_model else "qwen"
        self.prompt = self.model.create_voice_clone_prompt(ref_audio=voice, ref_text=ref_text or None, x_vector_only_mode=not ref_text)
    def synth(self, text):
        wavs, sr = self.model.generate_voice_clone(text=text, language=self.lang, voice_clone_prompt=self.prompt)
        wav = to_np(wavs[0])
        if sr != SR:
            with tempfile.TemporaryDirectory() as d:
                a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
                write_wav(a, wav, sr)
                resample_file(a, b)
                wav = read_wav(b)[0]
        return wav


ENGINES = {"fake": FakeEngine, "chatterbox": ChatterboxEngine, "piper": PiperEngine, "kokoro": KokoroEngine, "qwen": QwenEngine}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vtt", required=True, help="sous-titres français .vtt")
    ap.add_argument("--audio", required=True, help="audio ou vidéo d'origine")
    ap.add_argument("--out", required=True, help="dossier de sortie")
    ap.add_argument("--engine", choices=sorted(ENGINES), default="chatterbox")
    ap.add_argument("--vc-voice", help="échantillon de voix cible : convertit la voix du moteur léger vers cette voix (piper/kokoro)")
    ap.add_argument("--vc-steps", type=int, default=0, help="conversion de voix : nombre d'étapes de génération (0 = défaut du modèle, 10 ; essayer 5 puis 3)")
    ap.add_argument("--vc-chunk", type=float, default=0, help="conversion de voix par blocs de N secondes (max 25) au lieu de phrase par phrase : amortit le coût fixe de chaque appel")
    ap.add_argument("--cfg-weight", type=float, default=0.5, help="Chatterbox : 0 = ~2 fois plus rapide (sans double passe)")
    ap.add_argument("--exaggeration", type=float, default=0.5, help="Chatterbox : expressivité")
    ap.add_argument("--threads", type=int, default=4, help="fils de calcul (= nombre de cœurs alloués au conteneur)")
    ap.add_argument("--piper-voice", default="fr_FR-siwis-medium")
    ap.add_argument("--piper-dir", default="/models/piper")
    ap.add_argument("--piper-speaker", type=int, default=None, help="numéro de locuteur (voix à plusieurs locuteurs, ex. upmc : 0 puis 1)")
    ap.add_argument("--kokoro-voice", default="ff_siwis")
    ap.add_argument("--voice", help="échantillon de voix (wav/mp3, 10–30 s) ; sans lui, voix par défaut du modèle")
    ap.add_argument("--ref-text", help="qwen : fichier texte contenant EXACTEMENT ce qui est lu dans l'échantillon --voice (plus fidèle)")
    ap.add_argument("--qwen-model", default="Qwen/Qwen3-TTS-12Hz-0.6B-Base", help="qwen : modèle (0.6B-Base ou 1.7B-Base)")
    ap.add_argument("--synthetic", action="store_true", help="l'échantillon est une voix de synthèse (Voicebox, voix créée par description) : aucune personne réelle, pas de consentement à fournir")
    ap.add_argument("--consent-date", help="AAAA-MM-JJ : date du consentement de la personne dont la voix est clonée")
    ap.add_argument("--consent-by", help="nom de la personne qui a consenti")
    ap.add_argument("--lang", default="fr")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--duck", type=float, default=0.15, help="volume de l'original sous la voix (0.15 = 15 %%)")
    ap.add_argument("--max-speedup", type=float, default=1.35, help="accélération maximale d'une phrase")
    ap.add_argument("--max-segments", type=int, default=0, help="limiter aux N premières phrases (0 = toutes)")
    a = ap.parse_args(argv)

    # Garde-fous AVANT tout chargement lourd
    clone = a.voice or a.vc_voice
    if a.vc_chunk and (a.vc_chunk > 25 or not a.vc_voice):
        sys.exit("ERREUR : --vc-chunk s'utilise avec --vc-voice et vaut au plus 25 secondes.")
    if a.engine == "qwen" and not a.voice:
        sys.exit("ERREUR : --engine qwen exige --voice (échantillon de 10 à 30 s).")
    if a.ref_text and not os.path.isfile(a.ref_text):
        sys.exit(f"ERREUR : fichier introuvable : {a.ref_text}")
    if a.voice and a.engine in ("piper", "kokoro"):
        sys.exit("ERREUR : --voice s'utilise avec --engine chatterbox ; pour piper/kokoro utilise --vc-voice.")
    if a.vc_voice and a.engine in ("chatterbox", "fake"):
        sys.exit("ERREUR : --vc-voice s'utilise avec --engine piper ou kokoro.")
    if a.engine != "fake" and not a.synthetic:
        if clone and not (a.consent_date and a.consent_by):
            sys.exit("ERREUR : un clonage de voix exige --consent-date AAAA-MM-JJ et --consent-by \"Nom\".")
        if a.consent_date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.consent_date):
            sys.exit("ERREUR : --consent-date doit être au format AAAA-MM-JJ.")
    for f in (a.vtt, a.audio) + tuple(x for x in (a.voice, a.vc_voice) if x):
        if not os.path.isfile(f):
            sys.exit(f"ERREUR : fichier introuvable : {f}")
    os.makedirs(a.out, exist_ok=True)

    cues = parse_vtt(open(a.vtt, encoding="utf-8").read())
    if a.max_segments:
        cues = cues[: a.max_segments]
    if not cues:
        sys.exit("ERREUR : aucune phrase trouvée dans le .vtt")

    for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS"):
        os.environ[k] = str(a.threads)
    t0 = time.time()
    ref_text = open(a.ref_text, encoding="utf-8").read().strip() if a.ref_text else None
    eng = ENGINES[a.engine](device=a.device, voice=a.voice, lang=a.lang, cfg_weight=a.cfg_weight, exaggeration=a.exaggeration, ref_text=ref_text, qwen_model=a.qwen_model,
                            piper_voice=a.piper_voice, piper_dir=a.piper_dir, piper_speaker=a.piper_speaker, kokoro_voice=a.kokoro_voice)
    vc = VoiceConverter(a.vc_voice, a.device, a.vc_steps) if a.vc_voice else None
    try:
        import torch
        torch.set_num_threads(a.threads)
    except ImportError:
        pass
    load_s = time.time() - t0

    orig = load_original(a.audio)
    total = max(len(orig) / SR, cues[-1]["end"])
    n = int(total * SR) + SR
    voice_track = np.zeros(n, dtype=np.float32)
    gain = np.full(n, a.duck, dtype=np.float32)  # volume de l'original, par échantillon
    segs = []
    placed = []  # (début en échantillons, voix calée) de chaque phrase parlée
    for i, c in enumerate(cues):
        s0, s1 = int(c["start"] * SR), int(c["end"] * SR)
        slot = c["end"] - c["start"]
        row = {"i": i, "start": round(c["start"], 2), "end": round(c["end"], 2), "slot_s": round(slot, 2), "text": c["text"][:80]}
        if c["text"].startswith("#"):
            gain[s0:s1] = 1.0  # original intact
            row.update(protected=True)
            segs.append(row); continue
        t = time.time()
        wav = eng.synth(c["text"])
        base_s = time.time() - t
        if vc and not a.vc_chunk:
            wav = vc.convert(wav)
        synth_s = time.time() - t
        raw = len(wav) / SR
        # Le créneau utilisable inclut le silence avant la phrase suivante (emprunt)
        nxt = cues[i + 1]["start"] if i + 1 < len(cues) else total
        room = min(max(slot, nxt - c["start"] - 0.1), slot + MAX_BORROW)
        need = raw / room if room > 0 else 99
        factor = min(max(need, 1.0), a.max_speedup)
        fit = speed_up(wav, factor)
        fit_s = len(fit) / SR
        overflow = max(0.0, fit_s - room)
        end_i = min(n, s0 + len(fit))
        voice_track[s0:end_i] += fit[: end_i - s0]
        placed.append((s0, fit[: end_i - s0]))
        row.update(protected=False, raw_s=round(raw, 2), room_s=round(room, 2), speedup=round(factor, 3),
                   fit_s=round(fit_s, 2), overflow_s=round(overflow, 2), synth_s=round(synth_s, 2), vc_s=round(synth_s - base_s, 2),
                   rtf=round(synth_s / raw, 2) if raw else None)
        segs.append(row)

    vc_total_s, vc_chunks = 0.0, 0
    if vc and a.vc_chunk and placed:
        # Regroupe les phrases voisines en blocs <= vc_chunk secondes, convertit chaque bloc en un seul appel
        groups, cur = [], [placed[0]]
        for item in placed[1:]:
            if (item[0] + len(item[1]) - cur[0][0]) / SR <= a.vc_chunk:
                cur.append(item)
            else:
                groups.append(cur); cur = [item]
        groups.append(cur)
        voice_track = np.zeros(n, dtype=np.float32)
        for g in groups:
            g0 = g[0][0]
            g1 = max(st + len(w) for st, w in g)
            local = np.zeros(g1 - g0, dtype=np.float32)
            for st, w in g:
                local[st - g0: st - g0 + len(w)] += w
            t = time.time()
            conv = vc.convert(local)
            vc_total_s += time.time() - t
            vc_chunks += 1
            conv = np.pad(conv, (0, max(0, len(local) - len(conv))))[: len(local)]  # durée conservée
            voice_track[g0:g1] += conv

    mix = voice_track + orig_pad(orig, n) * gain
    peak = float(np.max(np.abs(mix))) or 1.0
    if peak > 0.98:
        mix = mix * (0.98 / peak)
    mix_wav, mix_mp3 = os.path.join(a.out, "dub_mix.wav"), os.path.join(a.out, "dub_mix.mp3")
    write_wav(mix_wav, mix)
    write_wav(os.path.join(a.out, "voice_only.wav"), voice_track)
    ffmpeg("-i", mix_wav, "-codec:a", "libmp3lame", "-q:a", "4", mix_mp3)

    spoken = [s for s in segs if not s["protected"]]
    rtfs = [s["rtf"] for s in spoken if s["rtf"] is not None]
    over = [s for s in spoken if s["overflow_s"] > 0.05 or s["speedup"] >= a.max_speedup - 1e-6 and s["overflow_s"] > 0]
    ram_gb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024
    rep = {
        "engine": eng.name + ("+vc" if vc else ""), "threads": a.threads, "vc_steps": a.vc_steps or None, "cfg_weight": a.cfg_weight if a.engine == "chatterbox" else None, "lang": a.lang, "device": a.device, "voice": os.path.basename(clone) if clone else None,
        "consent": ({"synthetic": True} if a.synthetic else {"date": a.consent_date, "by": a.consent_by}) if clone else None,
        "ref_text": bool(a.ref_text) if a.engine == "qwen" else None,
        "model_load_s": round(load_s, 1), "segments": len(segs), "protected_segments": len(segs) - len(spoken),
        "audio_total_s": round(total, 1),
        "rtf_median": round(statistics.median(rtfs), 2) if rtfs else None,
        "rtf_max": round(max(rtfs), 2) if rtfs else None,
        "speedup_mean": round(statistics.mean(s["speedup"] for s in spoken), 3) if spoken else None,
        "vc_mean_s": round(statistics.mean(x["vc_s"] for x in spoken), 2) if spoken and vc and not a.vc_chunk else None,
        "vc_chunk": a.vc_chunk or None, "vc_chunks": vc_chunks or None, "vc_total_s": round(vc_total_s, 1) if vc_chunks else None,
        "rtf_total": round((sum(x["synth_s"] for x in spoken) + vc_total_s) / max(1e-9, sum(x["fit_s"] for x in spoken)), 2) if spoken and vc_chunks else None, "overflow_count": len(over), "overflow_share": round(len(over) / len(spoken), 3) if spoken else 0,
        "ram_peak_gb": round(ram_gb, 2), "thresholds_proposed": THRESH, "details": segs,
    }
    ok = {
        "vitesse": (rep["rtf_total"] if rep["rtf_total"] is not None else (rep["rtf_median"] if rep["rtf_median"] is not None else 99)) <= THRESH["rtf_median_max"],
        "calage": rep["overflow_share"] <= THRESH["overflow_share_max"],
        "memoire": rep["ram_peak_gb"] <= THRESH["ram_gb_max"],
    }
    rep["checks"] = ok
    json.dump(rep, open(os.path.join(a.out, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    write_md(os.path.join(a.out, "report.md"), rep)
    print(open(os.path.join(a.out, "report.md"), encoding="utf-8").read())
    return rep


def orig_pad(orig, n):
    out = np.zeros(n, dtype=np.float32)
    m = min(n, len(orig))
    out[:m] = orig[:m]
    return out


def write_md(path, r):
    L = [f"# Rapport étape 0 — moteur {r['engine']}", "",
         f"- Phrases : {r['segments']} (dont {r['protected_segments']} protégées, gardées en voix d'origine)",
         f"- Durée audio : {r['audio_total_s']} s · chargement du modèle : {r['model_load_s']} s",
         f"- Vitesse (RTF = temps de calcul / durée produite) : médiane {r['rtf_median']} · max {r['rtf_max']}",
         f"- Réglages : {r['threads']} fils" + (f" · cfg_weight {r['cfg_weight']}" if r.get("cfg_weight") is not None else ""),
         f"- Conversion de voix par blocs de {r['vc_chunk']} s : {r['vc_chunks']} blocs, {r['vc_total_s']} s au total · **RTF global (voix de base + conversion) : {r['rtf_total']}**" if r.get("vc_chunks") else
         f"- Dont conversion de voix (moyenne par phrase) : {r['vc_mean_s']} s (étapes : {r.get('vc_steps') or 'défaut 10'})" if r.get("vc_mean_s") is not None else "- Pas de conversion de voix",
         f"- Accélération moyenne pour caler : ×{r['speedup_mean']}",
         f"- Phrases qui débordent encore : {r['overflow_count']} ({round(r['overflow_share']*100)} %)",
         f"- Mémoire max : {r['ram_peak_gb']} Go", "",
         "## Verdict automatique (seuils proposés, à valider)", ""]
    t = r["thresholds_proposed"]
    L += [f"- Vitesse ≤ {t['rtf_median_max']} : {'OK' if r['checks']['vitesse'] else 'NON'}",
          f"- Débordements ≤ {int(t['overflow_share_max']*100)} % : {'OK' if r['checks']['calage'] else 'NON'}",
          f"- Mémoire ≤ {t['ram_gb_max']} Go : {'OK' if r['checks']['memoire'] else 'NON'}", "",
          "La qualité d'écoute (accent, prononciation, naturel) ne se mesure pas : écoute `dub_mix.mp3`.", "",
          "## Détail", "", "| # | début | créneau | brut | accél. | débord. | RTF | texte |", "|---|---|---|---|---|---|---|---|"]
    for s in r["details"]:
        if s["protected"]:
            L.append(f"| {s['i']} | {s['start']} | {s['slot_s']} | — | — | — | — | PROTÉGÉ : {s['text']} |")
        else:
            L.append(f"| {s['i']} | {s['start']} | {s['slot_s']} | {s['raw_s']} | ×{s['speedup']} | {s['overflow_s']} | {s['rtf']} | {s['text']} |")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
