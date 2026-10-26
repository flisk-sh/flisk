#!/bin/bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# ============================================================================
# Cron Jobs Status HTTP Server
# Serves cron job status as JSON for the UI extension
# ============================================================================

STATUS_FILE="/tmp/cron-jobs-status.json"
PORT=10352

echo "🌐 Cron Jobs Status Server starting on port ${PORT}..."

# Simple HTTP server using Python
python3 << 'PYEOF'
import http.server
import socketserver
import json
import os

STATUS_FILE = "/tmp/cron-jobs-status.json"
PORT = 10352

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/cron-jobs-status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            # Read status file or return default
            if os.path.exists(STATUS_FILE):
                with open(STATUS_FILE, 'r') as f:
                    data = f.read()
                self.wfile.write(data.encode())
            else:
                default = {"jobs": [], "updatedAt": None}
                self.wfile.write(json.dumps(default).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suppress log messages
        pass

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Cron Jobs Status Server running on port {PORT}")
    httpd.serve_forever()
PYEOF
