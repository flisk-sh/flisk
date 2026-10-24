# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load('./vite/generators.star',
    'generate_frontend',
    'generate_backend',
    'generate_library',
    'generate_sdk',
    'generate_for_manifest',
)

# =============================================================================
# 📦 VITE STRUCT (Public API)
# =============================================================================

Vite = struct(
    # Specific generators
    frontend = generate_frontend,
    backend = generate_backend,
    library = generate_library,
    sdk = generate_sdk,
    
    # Universal dispatcher
    for_manifest = generate_for_manifest,
)
