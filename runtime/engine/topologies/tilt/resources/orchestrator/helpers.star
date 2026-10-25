# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🧩 TILT SDK - ORCHESTRATOR HELPERS
# =============================================================================
# Path: .tilt/provisioner/orchestrator/helpers.star
# Purpose: Shared helper functions for orchestrator
# =============================================================================

def _get_db_name_for_resource(resource_name, res_name):
    """Get database name from manifest databaseName field dynamically."""
    # Database names now come from service.json databaseName field
    # No hardcoded mappings - all from service.json
    # Default: {project}_{resource_name}
    return resource_name


def _get_resource_display_name(resource_name, res_name):
    """Get human-readable service name for display."""
    display_name = resource_name.replace('-', ' ').title()
    
    # Dynamic service type detection from resource name
    # No hardcoded service names - pattern-based detection
    if '-planner' in res_name or 'planner' in res_name:
        return display_name + ' Planner'
    elif '-management' in res_name:
        return display_name + ' Management'
    
    return display_name


OrchestratorHelpers = struct(
    get_db_name = _get_db_name_for_resource,
    get_display_name = _get_resource_display_name,
)
