"""GET /health: alive. GET /check: a round trip to each dependency named in the environment, as JSON."""

import json
import os
import socket
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

import pika


def redis_round_trip(url):
    u = urllib.parse.urlparse(url)
    with socket.create_connection((u.hostname, u.port or 6379), timeout=3) as s:
        s.sendall(b"*3\r\n$3\r\nSET\r\n$5\r\nprobe\r\n$2\r\nok\r\n*2\r\n$3\r\nGET\r\n$5\r\nprobe\r\n")
        reply = b""
        while b"ok\r\n" not in reply:
            chunk = s.recv(64)
            if not chunk:
                break
            reply += chunk
    return reply == b"+OK\r\n$2\r\nok\r\n"


def qdrant_round_trip(url):
    # Each /check starts over: creating a collection that already exists is a 409.
    urllib.request.urlopen(urllib.request.Request(url + "/collections/probe", method="DELETE"), timeout=5).close()
    body = json.dumps({"vectors": {"size": 4, "distance": "Cosine"}}).encode()
    request = urllib.request.Request(url + "/collections/probe", data=body, method="PUT")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=5) as r:
        created = json.load(r).get("status") == "ok"
    with urllib.request.urlopen(url + "/collections/probe", timeout=5) as r:
        return created and json.load(r)["result"]["config"]["params"]["vectors"]["size"] == 4


def amqp_round_trip(url):
    connection = pika.BlockingConnection(pika.URLParameters(url))
    try:
        channel = connection.channel()
        channel.queue_declare(queue="probe")
        channel.basic_publish(exchange="", routing_key="probe", body=b"ok")
        for _ in range(20):
            _, _, body = channel.basic_get(queue="probe", auto_ack=True)
            if body is not None:
                return body == b"ok"
            connection.sleep(0.1)
        return False
    finally:
        connection.close()


def minio_round_trip(url):
    with urllib.request.urlopen(url + "/minio/health/live", timeout=5) as r:
        return r.status == 200


def mlflow_round_trip(url):
    # An experiment created and read back by name; a fresh name per call, because a deleted one still holds its name.
    name = "probe-{}".format(time.time_ns())
    body = json.dumps({"name": name}).encode()
    request = urllib.request.Request(url + "/api/2.0/mlflow/experiments/create", data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=10) as r:
        experiment_id = json.load(r)["experiment_id"]
    query = urllib.parse.urlencode({"experiment_name": name})
    with urllib.request.urlopen(url + "/api/2.0/mlflow/experiments/get-by-name?" + query, timeout=10) as r:
        return json.load(r)["experiment"]["experiment_id"] == experiment_id


CHECKS = {
    "REDIS_URL": redis_round_trip,
    "QDRANT_URL": qdrant_round_trip,
    "AMQP_URL": amqp_round_trip,
    "MINIO_ENDPOINT_URL": minio_round_trip,
    "MLFLOW_TRACKING_URI": mlflow_round_trip,
}


def check():
    result = {}
    for name, fn in CHECKS.items():
        url = os.environ.get(name)
        if not url:
            result[name] = "missing"
            continue
        try:
            result[name] = "ok" if fn(url) else "wrong reply"
        except Exception as error:  # noqa: BLE001 - the error text is the diagnostic
            result[name] = "error: {}".format(error)
    return result


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith("/health"):
            payload, status = {"status": "ok"}, 200
        elif self.path.endswith("/check"):
            payload = check()
            status = 200 if all(v == "ok" for v in payload.values()) else 503
        else:
            payload, status = {"error": "not found"}, 404
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "4500"))), Handler).serve_forever()
