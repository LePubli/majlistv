#!/usr/bin/env python3
"""Étape D3a — tableau de comparaison des essais de voix.
Lit <dossier>/<voix>-<méthode>/report.json (méthodes : conversion = Piper Tom + ChatterboxVC ; qwen = Qwen3-TTS clonage direct)
et écrit <dossier>/comparaison.md. Usage : python compare.py /out/<conférence>/d3"""
import json, os, sys

METHODS = {"conversion": "Tom + conversion (actuel)", "qwen": "Qwen3-TTS (clonage direct)"}


def load(folder):
    rows = []
    for name in sorted(os.listdir(folder)):
        rep = os.path.join(folder, name, "report.json")
        if not os.path.isfile(rep) or "-" not in name:
            continue
        voice, method = name.rsplit("-", 1)
        r = json.load(open(rep, encoding="utf-8"))
        rtf = r.get("rtf_total") if r.get("rtf_total") is not None else r.get("rtf_median")
        rows.append({"voice": voice, "method": method, "engine": r.get("engine"), "rtf": rtf, "ram": r.get("ram_peak_gb"),
                     "overflow": r.get("overflow_share"), "segments": r.get("segments"), "load": r.get("model_load_s"),
                     "audio": r.get("audio_total_s"), "dir": name})
    return rows


def hours_for_one_hour(rtf):
    return None if rtf is None else round(rtf, 1)


def render(rows):
    L = ["# Étape D3a — comparaison des voix", "",
         "RTF = secondes de calcul par seconde de voix produite (1 = temps réel). Une conférence d'une heure demande environ RTF heures de calcul.", "",
         "| Voix | Méthode | RTF | 1 h de conférence ≈ | Mémoire max | Phrases qui débordent | Fichier à écouter |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        h = hours_for_one_hour(r["rtf"])
        L.append(f"| {r['voice']} | {METHODS.get(r['method'], r['method'])} | {r['rtf'] if r['rtf'] is not None else '—'} | "
                 f"{str(h).replace('.', ',') + ' h' if h is not None else '—'} | {r['ram'] if r['ram'] is not None else '—'} Go | "
                 f"{round((r['overflow'] or 0) * 100)} % | `{r['dir']}/dub_mix.mp3` |")
    L += ["", "## À écouter et à noter (1 à 5)", "",
          "Pour chaque voix : naturel, ressemblance avec l'échantillon, prononciation du français, absence de bruits ou de coupures.",
          "La vitesse et la mémoire sont mesurées ; la qualité, elle, se juge à l'oreille."]
    return "\n".join(L) + "\n"


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if not argv or not os.path.isdir(argv[0]):
        sys.exit("Usage : python compare.py <dossier des essais>")
    rows = load(argv[0])
    if not rows:
        sys.exit("Aucun essai trouvé (dossiers <voix>-conversion ou <voix>-qwen avec report.json).")
    md = render(rows)
    open(os.path.join(argv[0], "comparaison.md"), "w", encoding="utf-8").write(md)
    print(md)
    return rows


if __name__ == "__main__":
    main()
