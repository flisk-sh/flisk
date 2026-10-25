# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Entry point for modular TSConfig provider
# =============================================================================

load("./backend_tsconfig.star", "generate_backend_tsconfig")
load("./frontend_tsconfig.star", "generate_frontend_tsconfig")
load("./prisma_config.star", "generate_prisma_config")
load("./frontend_library_tsconfig.star", "generate_frontend_library_tsconfig")
load("./backend_library_tsconfig.star", "generate_backend_library_tsconfig")
load("./playwright_config.star", "generate_playwright_config")

# =============================================================================
# TSConfig Struct - Public API
# =============================================================================

TSConfig = struct(
    backend = generate_backend_tsconfig,
    frontend = generate_frontend_tsconfig,
    library_backend = generate_backend_library_tsconfig,
    library_frontend = generate_frontend_library_tsconfig,
    prisma = generate_prisma_config,
    playwright = generate_playwright_config,
)
