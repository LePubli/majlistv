"""Fabrique un abonné + une conférence HLS prête (vrai FFmpeg) et affiche {"token", "talkId", "freeToken"} pour mobile/tests/offline_contract.ts."""
import json, sys, importlib.util, os
spec = importlib.util.spec_from_file_location("t", os.path.join(os.path.dirname(__file__), "test_offline.py"))
src = open(spec.origin, encoding="utf-8").read().split("# Réglage de validité")[0]  # réutilise les fonctions du test (sans lancer ses vérifications)
ns = {"__name__": "fixture"}; exec(compile(src, "test_offline_head", "exec"), ns)
talk = ns["make_talk"](); ns["make_hls"](talk)
sub = ns["user"](True); free = ns["user"](False)
print(json.dumps({"token": sub["authorization"][7:], "freeToken": free["authorization"][7:], "talkId": str(talk)}))
