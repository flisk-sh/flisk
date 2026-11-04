# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# A bring-your-own sidecar that shares another resource's network namespace (service.json `sidecarOf`, #2908).
# Compose writes this as `network_mode: "service:<host>"`: the sidecar reaches the host, and the host reaches it, on 127.0.0.1
# (yt-dlp inside tubehaus finds the bgutil PO-token server on 127.0.0.1:4416). Such a container cannot join networks, publish
# ports or carry its own Traefik route, so the generator leaves those out. Keep in step with sidecarErrors in
# cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_NAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_.-"


def byo_sidecar_of(manifest):
    """The resource name a bring-your-own sidecar shares its network with, or None.

    Fails for a value that is not a resource name, that names the resource itself, or that is combined with extraPorts or replicas.
    """
    host = manifest.get('sidecarOf') if manifest else None
    if host == None or manifest.get('appType') != 'bring-your-own':
        return None
    if type(host) != "string" or not host or host[0] in "_.-":
        fail("MANIFEST ERROR: 'sidecarOf' must be the appName of another resource in the same stack")
    for c in host.elems():
        if c not in _NAME_CHARS:
            fail("MANIFEST ERROR: 'sidecarOf' must be the appName of another resource in the same stack")
    if host == manifest.get('appName'):
        fail("MANIFEST ERROR: 'sidecarOf' cannot name the resource itself")
    if manifest.get('extraPorts'):
        fail("MANIFEST ERROR: a sidecar has no ports of its own; publish 'extraPorts' on '{}' instead".format(host))
    if manifest.get('replicas', 1) != 1:
        fail("MANIFEST ERROR: 'sidecarOf' needs a single container; remove 'replicas'")
    return host
