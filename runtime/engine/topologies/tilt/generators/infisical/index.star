# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 INFISICAL GENERATORS - Master Index
# =============================================================================
# All Infisical-related generators for Tilt topology configuration
# =============================================================================
#
# This module provides complete Infisical integration for the Flisk CLI:
#   - Secret injection configuration generation
#   - Path/folder management
#   - Machine identity configuration
#   - Organization structure planning
#
# Usage:
#   load("./infisical/index.star", "Infisical")
#   
#   # Generate secret config for a service
#   config = Infisical.Secrets.generate_for_service("my-service", "/services/my-service")
#   
#   # Plan folder structure
#   paths = Infisical.Paths.plan_batch_resource_paths(["user", "order"])
#   
#   # Get machine identity
#   machine = Infisical.Identity.generate_development_machine("dev-machine")
#   
#   # Organization setup
#   org = Infisical.Org.generate_config("my-project", ["dev", "staging", "prod"])
# =============================================================================

# Load all Infisical submodules
load("./secrets_generator.star", _Secrets="SecretsGenerator")
load("./path_manager.star", _Paths="PathManager")
load("./machine_identity.star", _Identity="MachineIdentity")
load("./organization.star", _Org="Organization")

# =============================================================================
# Combined Exports
# =============================================================================

Infisical = struct(
    # Secret injection generation
    Secrets=_Secrets,
    
    # Path and folder management
    Paths=_Paths,
    
    # Machine identity management
    Identity=_Identity,
    
    # Organization configuration
    Org=_Org,
    
    # Quick access to common functions
    generate_for_service=_Secrets.generate_for_service,
    plan_resource_path=_Paths.plan_resource_path,
    generate_universal_auth=_Identity.generate_universal_auth,
    generate_org_config=_Org.generate_config,
)
