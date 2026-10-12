"""Fausse API Anthropic pour tester le traducteur : renvoie « [dst] texte ». Pannes simulées via MOCK_MODE."""
import json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
calls = {"n": 0}
MODE = os.environ.get("MOCK_MODE", "ok")  # ok | flaky | badlen | 401
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        calls["n"] += 1
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        if self.path.startswith("/deepseek"):  # --- faux DeepSeek ---
            def ds(code, obj):
                raw = json.dumps(obj).encode()
                self.send_response(code); self.send_header("content-type", "application/json")
                self.end_headers(); self.wfile.write(raw)
            if self.headers.get("Authorization") != "Bearer ds-key":
                return ds(401, {"error": {"message": "bad key"}})
            if MODE == "ds402":
                return ds(402, {"error": {"message": "Insufficient Balance"}})
            if MODE == "flaky" and calls["n"] % 2 == 1:  # 1er appel : contenu vide, comme DeepSeek en mode JSON
                return ds(200, {"choices": [{"finish_reason": "stop", "message": {"content": ""}}]})
            assert body["response_format"] == {"type": "json_object"} and body["thinking"] == {"type": "disabled"}
            system = body["messages"][0]["content"]
            if system.startswith("You analyse"):  # résumé + chapitres (étape 3D)
                if MODE == "flaky" and calls["n"] % 4 == 1:
                    return ds(200, {"choices": [{"finish_reason": "stop", "message": {"content": ""}}]})
                assert "[00:00:00]" in body["messages"][1]["content"]
                out = {"summary": "Résumé de test.", "key_points": ["a", "b", "c", "d"],
                       "chapters": [{"start_seconds": 3, "title": "Intro."}, {"start_seconds": 133, "title": "Milieu"},
                                    {"start_seconds": 140, "title": "Trop proche"}, {"start_seconds": 400, "title": "Fin"},
                                    {"start_seconds": 99999, "title": "Hors durée"}]}
                sys.stderr.write("mock insights: generation\n")
                return ds(200, {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(out)}}]})
            if system.startswith("You translate navigation"):
                p = json.loads(body["messages"][1]["content"])
                dst = system.split(" to ")[1].split(".")[0][:2].lower()
                out = {"summary": f"[{dst}] " + p["summary"], "key_points": [f"[{dst}] " + x for x in p["key_points"]],
                       "chapters": [{"start_seconds": c["start_seconds"], "title": f"[{dst}] " + c["title"]} for c in p["chapters"]]}
                if MODE == "badlen" and calls["n"] % 2 == 0:
                    out["chapters"] = out["chapters"][:-1]
                sys.stderr.write(f"mock insights: translation to {dst}\n")
                return ds(200, {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(out)}}]})
            payload = json.loads(body["messages"][1]["content"])
            out = [f"[ds-{payload['target_language'][:2].lower()}] {x}" for x in payload["segments"]]
            sys.stderr.write(f"mock deepseek call {calls['n']}: {len(out)} segs\n")
            return ds(200, {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"translations": out}, ensure_ascii=False)}}]})
        if self.path.startswith("/translate"):  # --- faux Azure AI Translator ---
            def az(code, obj, extra=None):
                raw = json.dumps(obj).encode()
                self.send_response(code); self.send_header("content-type", "application/json")
                for k, v in (extra or {}).items(): self.send_header(k, v)
                self.end_headers(); self.wfile.write(raw)
            if self.headers.get("Ocp-Apim-Subscription-Key") != "az-key":
                return az(401, {"error": {"code": 401000, "message": "bad key"}})
            if self.headers.get("Ocp-Apim-Subscription-Region") != "francecentral":
                return az(401, {"error": {"code": 401000, "message": "bad region"}})
            if MODE == "az403":
                return az(403, {"error": {"code": 403000, "message": "quota exceeded"}})
            if MODE == "flaky" and calls["n"] % 2 == 1:
                return az(429, {"error": {"code": 429000, "message": "throttled"}}, {"retry-after": "0"})
            to = self.path.split("to=")[1].split("&")[0]
            sys.stderr.write(f"mock azure call {calls['n']}: {len(body)} items to={to}\n")
            return az(200, [{"translations": [{"text": f"[{to}] {b['Text']}", "to": to}]} for b in body])
        assert self.headers["x-api-key"] == "test-key" or MODE == "401"
        def send(code, obj, extra=None):
            raw = json.dumps(obj).encode()
            self.send_response(code); self.send_header("content-type", "application/json")
            for k, v in (extra or {}).items(): self.send_header(k, v)
            self.end_headers(); self.wfile.write(raw)
        if MODE == "401":
            return send(401, {"error": {"type": "authentication_error", "message": "invalid x-api-key"}})
        if MODE == "flaky" and calls["n"] % 2 == 1:
            return send(429, {"error": {"message": "rate limited"}}, {"retry-after": "0"})
        payload = json.loads(body["messages"][0]["content"])
        assert body["tool_choice"]["name"] == "submit_translations"
        segs = payload["segments"]
        out = [f"[{payload['target_language'][:2].lower()}] {s}" for s in segs]
        if MODE == "badlen" and calls["n"] == 1:
            out = out[:-1]
        sys.stderr.write(f"mock call {calls['n']}: {len(segs)} segs, context={len(payload['context'])}\n")
        send(200, {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "submit_translations", "input": {"translations": out}}]})
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", int(os.environ.get("MOCK_PORT", "8099"))), H).serve_forever()
