# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# ⚡ TILT SDK - VITE PROVIDER GENERATORS
# =============================================================================
# Path: .tilt/providers/vite/generators.star
# Purpose: Vite config generators dispatcher
# =============================================================================

load('./frontend.star', _generate_frontend = 'generate_frontend')
load('./backend.star', _generate_backend = 'generate_backend')
load('./library.star', _generate_library = 'generate_library')
load('./sdk.star', _generate_sdk = 'generate_sdk')

generate_frontend = _generate_frontend
generate_backend = _generate_backend
generate_library = _generate_library
generate_sdk = _generate_sdk

def generate_for_manifest(manifest, backend_manifest=None, write_fn=None):
    """
    Universal dispatcher that generates the appropriate vite.config.ts
    based on manifest appType.
    
    This is the main entry point that Tilt should call for ALL services.
    """
    app_type = manifest.get('appType', 'backend')
    needs_vite = manifest.get('needsVite', True)
    
    if not needs_vite:
        return None
    
    if app_type == 'frontend':
        return generate_frontend(manifest, backend_manifest, write_fn)
    elif app_type == 'backend':
        return generate_backend(manifest, write_fn)
    elif app_type == 'library':
        return generate_library(manifest, write_fn)
    elif app_type == 'sdk':
        return generate_sdk(manifest, write_fn)
    elif app_type == 'migrator':
        return generate_backend(manifest, write_fn)
    else:
        print("   ⚠️  Unknown appType '" + app_type + "' for Vite config generation")
        return None
