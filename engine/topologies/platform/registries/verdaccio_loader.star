# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📦 VERDACCIO (NPM Registry) - loader (free-tier stub)
# =============================================================================
# Path: engine/topologies/platform/registries/verdaccio_loader.star
# =============================================================================
# The real loader (stands up the Verdaccio private npm registry container and
# wires it into the project's Docker network) is part of a paid Flisk license.
# When a valid license grants the "verdaccio" resource,
# cli/src/generator/template-engine.ts (vendorTdkExtension) overwrites this
# file with the licensed version fetched via extension-fetch.ts before Tilt
# loads it. Same function signature either way, so nothing else in the
# loader pipeline changes.
# =============================================================================


def load_verdaccio(_should_enable, _root_prefix="", _env_file=None):
    """Free-tier stub - see module header. Always skipped."""
    print("ℹ️  Verdaccio skipped — requires a Flisk Premium license (run `flisk upgrade`)")
