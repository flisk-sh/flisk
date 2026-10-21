# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# On-demand scaling: Sablier + Traefik (free-tier stub)
# =============================================================================
# Path: engine/topologies/platform/docker/networking/sablier_container_cycle.star
# =============================================================================
# The real generator (Sablier + Traefik label wiring that stops idle
# containers and wakes them on the next request) is part of a paid Flisk
# license. When a valid license grants the "sablier" resource,
# cli/src/generator/template-engine.ts (vendorTdkExtension) overwrites this
# file with the licensed version fetched via extension-fetch.ts before Tilt
# loads it. Same function signatures either way, so nothing else in the
# generator pipeline changes -- every call site just gets "disabled" back
# for a manifest's `sablier` block until then.
# =============================================================================


def _sablier_config(_manifest):
    """Free-tier stub - see module header. Always disabled."""
    return False, "", ""


def sablier_middleware_suffix(_manifest, _res_name):
    """Free-tier stub - see module header. Always disabled."""
    return "", False


def sablier_container_labels(_manifest, _res_name, _indent):
    """Free-tier stub - see module header. No labels to add."""
    return ""
