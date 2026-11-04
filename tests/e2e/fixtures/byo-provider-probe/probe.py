"""GET /health: alive. GET /provider: what the ibm-quantum provider looks like from inside the container, as JSON.

The token itself is never returned, only its length.
"""

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer


def provider():
    fallback = os.environ.get("PROVIDER_IBM_QUANTUM_FALLBACK_URL", "")
    reply = ""
    if fallback:
        try:
            with urllib.request.urlopen(fallback + "/health", timeout=3) as r:
                reply = json.load(r).get("status", "")
        except Exception as error:  # noqa: BLE001 - the error text is the diagnostic
            reply = "error: {}".format(error)
    return {
        "url": os.environ.get("PROVIDER_IBM_QUANTUM_URL", ""),
        "remote": os.environ.get("PROVIDER_IBM_QUANTUM_REMOTE", ""),
        "token_length": len(os.environ.get("IBM_QUANTUM_TOKEN", "")),
        "fallback_url": fallback,
        "fallback_reply": reply,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith("/health"):
            payload, status = {"status": "ok"}, 200
        elif self.path.endswith("/provider"):
            payload, status = provider(), 200
        else:
            payload, status = {"error": "not found"}, 404
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "4500"))), Handler).serve_forever()
