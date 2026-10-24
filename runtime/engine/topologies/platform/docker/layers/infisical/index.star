# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 INFISICAL DOCKER LAYERS - Master Index
# =============================================================================
# Centralizes all Infisical-related Docker layer functionality
# =============================================================================
#
# This module provides:
#   - Dockerfile generation for Infisical integration
#   - Secret injection at runtime (L4 layers)
#   - CLI setup at build time (L3 layers)
#   - Prisma migrator secret resolution
#
# Usage:
#   load("./infisical/index.star", "InfisicalLayers")
#   
#   # Runtime setup
#   dockerfile_snippet = InfisicalLayers.Docker.runtime_setup("my-service")
#   
#   # Builder setup  
#   builder_snippet = InfisicalLayers.Docker.builder_setup(use_infisical=True)
#   
#   # Environment for docker-compose
#   env = InfisicalLayers.Docker.generate_compose_env("my-service")
# =============================================================================

# Load all Infisical Docker submodules
load("./infisical_docker.star", "InfisicalDocker")

# =============================================================================
# Exports
# =============================================================================

InfisicalLayers = struct(
    # Main Docker integration
    Docker=InfisicalDocker,
    
    # Constants
    ENTRYPOINT_PATH=InfisicalDocker.ENTRYPOINT_PATH,
    ENTRYPOINT_SOURCE=InfisicalDocker.ENTRYPOINT_SOURCE,
)
