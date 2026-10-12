"""Faux archive.org pour les tests (aucun accès réseau) : /metadata, /advancedsearch.php, /download (redirection + lecture par plages), /services/img.
Usage : python3 fake_archive.py PORT CHEMIN_VIDEO_MP4"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit, unquote

PORT, VIDEO = int(sys.argv[1]), sys.argv[2]

ITEMS = {
    "conf-patience-1938": {"metadata": {"mediatype": "movies", "title": "La patience <b>dans l'épreuve</b>", "runtime": "0:06",
                                        "description": "Conférence <br/>historique.<p>Voir https://archive.org/details/conf-patience-1938</p>"},
                           "files": [{"name": "conf.mpeg", "source": "original", "format": "MPEG2", "length": "6.0", "height": "480"},
                                     {"name": "conf.ogv", "format": "Ogg Video", "length": "6.0", "height": "304"},
                                     {"name": "conf_512kb.mp4", "format": "512Kb MPEG4", "length": "6.0", "height": "240"},
                                     {"name": "conf.mp4", "format": "h.264", "length": "6.0", "height": "360"}]},
    "conf-b": {"metadata": {"mediatype": "movies", "title": "Deuxième conférence"},
               "files": [{"name": "b_512kb.mp4", "format": "512Kb MPEG4", "length": "00:00:06"}]},
    "restricted-item": {"metadata": {"mediatype": "movies", "title": "Prêt", "access-restricted-item": "true"},
                        "files": [{"name": "x.mp4", "format": "h.264"}]},
    "no-video": {"metadata": {"mediatype": "audio", "title": "Audio"}, "files": [{"name": "a.mp3", "format": "VBR MP3"}]},
    "my-collection": {"metadata": {"mediatype": "collection", "title": "Ma collection de conférences"}, "files": []},
}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        u = urlsplit(self.path)
        m = re.match(r"^/metadata/([^/]+)$", u.path)
        if m:
            return self.send_json(ITEMS.get(unquote(m.group(1)), {}))
        if u.path == "/advancedsearch.php":
            q = parse_qs(u.query)
            rows = int(q.get("rows", ["50"])[0])
            docs = [{"identifier": "conf-patience-1938", "title": "La patience", "runtime": "0:06"},
                    {"identifier": "conf-b", "title": ["Deuxième conférence"]}] if "my-collection" in q["q"][0] or "patience" in q["q"][0] else []
            return self.send_json({"response": {"numFound": len(docs), "docs": docs[:rows]}})
        m = re.match(r"^/download/([^/]+)/(.+)$", u.path)
        if m:
            item = ITEMS.get(unquote(m.group(1)))
            if not item or unquote(m.group(2)) not in [f["name"] for f in item["files"]]:
                self.send_response(404); self.end_headers(); return
            self.send_response(302)  # comme archive.org : redirection vers le serveur de stockage
            self.send_header("location", f"/files/{m.group(1)}/{m.group(2)}")
            self.end_headers()
            return
        if u.path.startswith("/files/"):
            size = os.path.getsize(VIDEO)
            start, end = 0, size - 1
            rng = self.headers.get("range")
            if rng:
                a, _, b = rng.replace("bytes=", "").partition("-")
                start = int(a or 0)
                end = int(b) if b else size - 1
                self.send_response(206)
                self.send_header("content-range", f"bytes {start}-{end}/{size}")
            else:
                self.send_response(200)
            self.send_header("accept-ranges", "bytes")
            self.send_header("content-type", "video/mp4")
            self.send_header("content-length", str(end - start + 1))
            self.end_headers()
            if not head:
                with open(VIDEO, "rb") as f:
                    f.seek(start)
                    self.wfile.write(f.read(end - start + 1))
            return
        if u.path.startswith("/services/img/"):
            self.send_response(200); self.send_header("content-type", "image/png"); self.send_header("content-length", "0"); self.end_headers(); return
        self.send_response(404); self.end_headers()


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
