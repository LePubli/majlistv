"""Faux serveur Stripe pour tester l'API sans compte ni réseau (STRIPE_API_BASE=http://127.0.0.1:12111)."""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlsplit
LOG = []
PRICES = {"price_m": {"id": "price_m", "object": "price", "unit_amount": 990, "currency": "eur", "recurring": {"interval": "month"}},
          "price_y": {"id": "price_y", "object": "price", "unit_amount": 9900, "currency": "eur", "recurring": {"interval": "year"}},
          "price_lm": {"id": "price_lm", "object": "price", "unit_amount": 999, "currency": "eur", "recurring": {"interval": "month"}},
          "price_ly": {"id": "price_ly", "object": "price", "unit_amount": 9999, "currency": "eur", "recurring": {"interval": "year"}}}
class H(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        raw = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(raw)))
        self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/_log": return self._send(LOG)
        if path == "/v1/account":
            return self._send({"id": "acct_" + ("B" if self.headers.get("authorization", "").endswith("other") else "A"), "object": "account"})
        if path.startswith("/v1/customers/"):
            return self._send({"id": path.rsplit("/", 1)[1], "object": "customer"})
        if path.startswith("/v1/prices/"):
            p = PRICES.get(path.rsplit("/", 1)[1]); return self._send(p) if p else self._send({"error": {"message": "no such price"}}, 404)
        if path.startswith("/v1/subscriptions/"):
            return self._send({"id": path.rsplit("/", 1)[1], "object": "subscription", "customer": "cus_1", "status": "active", "metadata": {},
                               "items": {"data": [{"price": PRICES["price_m"], "current_period_end": 4102444800}]}})
        self._send({"error": {"message": "not found"}}, 404)
    def do_POST(self):
        path = urlsplit(self.path).path
        body = {k: v[0] for k, v in parse_qs(self.rfile.read(int(self.headers.get("content-length", 0))).decode()).items()}
        LOG.append({"path": path, "body": body, "auth": self.headers.get("authorization")})
        if path == "/v1/customers": return self._send({"id": "cus_1", "object": "customer"})
        if path == "/v1/checkout/sessions" and body.get("payment_method_types[1]") == "paypal" and __import__("os").path.exists("/tmp/claude-0/paypal_reject"):
            return self._send({"error": {"type": "invalid_request_error", "param": "payment_method_types[1]", "message": 'The payment method type "paypal" is invalid. Please ensure the provided type is activated in your dashboard.'}}, 400)
        if path == "/v1/checkout/sessions":
            # identifiant distinct à chaque session, et unique d'un lancement du faux serveur à l'autre (la base de test garde les anciennes)
            n = f'{int(__import__("time").time())}_{sum(1 for x in LOG if x["path"] == "/v1/checkout/sessions")}'
            return self._send({"id": f"cs_{n}", "object": "checkout.session", "url": f"https://checkout.stripe.test/cs_{n}"})
        if path == "/v1/billing_portal/sessions": return self._send({"id": "bps_1", "object": "billing_portal.session", "url": "https://billing.stripe.test/p/1"})
        self._send({"error": {"message": "not found"}}, 404)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 12111), H).serve_forever()
