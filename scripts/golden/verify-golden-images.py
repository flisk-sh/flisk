#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Checks the published golden images from outside, the way `flisk up` pulls them: for every registry and layer, the image
for this Dockerfile's hash must pull without a login on GHCR (a private package fails here), carry linux/amd64 and
linux/arm64, weigh between MIN_BYTES and MAX_BYTES compressed on each platform, carry the flisk.golden.hash label the
local build compares, and have the same digest in every registry. Reads the registries' HTTP API; pulls nothing to disk.

usage: verify-golden-images.py <golden-layers.Dockerfile or its sha256> <registry> [<registry>...]
Docker Hub is read with DOCKERHUB_USERNAME / DOCKERHUB_TOKEN when set, so the check does not spend anonymous pulls.
"""

import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

LAYERS = ["l1", "l2", "l3-backend", "l3-frontend", "l4-backend", "l4-backend-node", "l4-frontend", "l4-migrator"]
PLATFORMS = ["amd64", "arm64"]
# Compressed size of each platform image. Measured 2026-11-01: 21 MB (l4-frontend) to 155 MB (l3-backend).
MIN_BYTES = 10_000_000
MAX_BYTES = 400_000_000
ACCEPT = ",".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])


def check(observed, full_hash):
    """observed: {registry: {layer: {"digest", "sizes": {arch: bytes}, "hash_label"} or {"error"}}}. Returns problems."""
    problems = []
    for registry, layers in observed.items():
        for layer in LAYERS:
            ref = f"{registry}/golden-{layer}:{full_hash[:12]}"
            image = layers.get(layer)
            if image is None or "error" in image:
                problems.append(f"{ref}: cannot pull without a login ({(image or {}).get('error', 'not checked')})")
                continue
            for arch in PLATFORMS:
                size = image["sizes"].get(arch)
                if size is None:
                    problems.append(f"{ref}: no linux/{arch} image")
                elif not MIN_BYTES <= size <= MAX_BYTES:
                    problems.append(f"{ref}: linux/{arch} is {size / 1e6:.1f} MB, outside {MIN_BYTES / 1e6:.0f}-{MAX_BYTES / 1e6:.0f} MB")
            if image.get("hash_label") != full_hash:
                problems.append(f"{ref}: flisk.golden.hash label is {image.get('hash_label')!r}, not the Dockerfile's hash")
    for layer in LAYERS:
        digests = {r: l[layer]["digest"] for r, l in observed.items() if "digest" in l.get(layer, {})}
        if len(set(digests.values())) > 1:
            problems.append(f"golden-{layer}: registries hold different images: {digests}")
    return problems


_OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler())


def _open(request, timeout):
    """GET a registry URL. The opener only has an HTTPS handler, so any other scheme fails instead of being fetched."""
    return _OPENER.open(request, timeout=timeout)


def _split(registry):
    host, _, namespace = registry.partition("/")
    return ("registry-1.docker.io" if host == "docker.io" else host), namespace


def _token(host, repo):
    try:
        _open(f"https://{host}/v2/", timeout=30)
        return None
    except urllib.error.HTTPError as err:
        challenge = err.headers.get("WWW-Authenticate", "")
    params = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
    url = f"{params['realm']}?service={params.get('service', '')}&scope=repository:{repo}:pull"
    request = urllib.request.Request(url)
    user, secret = os.environ.get("DOCKERHUB_USERNAME"), os.environ.get("DOCKERHUB_TOKEN")
    if host == "registry-1.docker.io" and user and secret:
        request.add_header("Authorization", "Basic " + base64.b64encode(f"{user}:{secret}".encode()).decode())
    body = json.load(_open(request, timeout=30))
    return body.get("token") or body.get("access_token")


def _inspect(registry, layer, tag):
    host, namespace = _split(registry)
    repo = f"{namespace}/golden-{layer}"
    headers = {"Accept": ACCEPT}
    token = _token(host, repo)
    if token:
        headers["Authorization"] = f"Bearer {token}"

    def get(path):
        response = _open(urllib.request.Request(f"https://{host}/v2/{repo}/{path}", headers=headers), timeout=60)
        return response.headers.get("Docker-Content-Digest"), json.load(response)

    digest, index = get(f"manifests/{tag}")
    sizes, hash_label = {}, None
    for entry in index.get("manifests", []):
        platform = entry.get("platform", {})
        if platform.get("os") != "linux" or platform.get("architecture") not in PLATFORMS:
            continue
        _, manifest = get(f"manifests/{entry['digest']}")
        sizes[platform["architecture"]] = sum(item["size"] for item in manifest["layers"])
        if hash_label is None:
            _, config = get(f"blobs/{manifest['config']['digest']}")
            hash_label = (config.get("config", {}).get("Labels") or {}).get("flisk.golden.hash")
    return {"digest": digest, "sizes": sizes, "hash_label": hash_label}


def main(argv):
    if len(argv) < 3:
        print(__doc__.strip().splitlines()[-2], file=sys.stderr)
        return 2
    if re.fullmatch(r"[0-9a-f]{64}", argv[1]):
        full_hash = argv[1]
    else:
        with open(argv[1], "rb") as dockerfile:
            full_hash = hashlib.sha256(dockerfile.read()).hexdigest()
    observed = {}
    for registry in argv[2:]:
        observed[registry] = {}
        for layer in LAYERS:
            try:
                image = _inspect(registry, layer, full_hash[:12])
            except (urllib.error.URLError, KeyError, ValueError) as err:
                image = {"error": str(err)}
            observed[registry][layer] = image
            sizes = " ".join(f"{a}={s / 1e6:.1f}MB" for a, s in image.get("sizes", {}).items())
            print(f"{registry}/golden-{layer}:{full_hash[:12]} {image.get('digest') or image.get('error')} {sizes}")
    problems = check(observed, full_hash)
    for problem in problems:
        print(f"::error::{problem}")
    print(f"{len(problems)} problems in {len(LAYERS)} golden images x {len(argv) - 2} registries")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
