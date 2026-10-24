# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# ✅ ORCHESTRATOR APPLY - resource VALIDATION
# =============================================================================

load('../../common/utils.star', 'Utils')


def validate_resource(resource_config):
    resource_name = resource_config['name']
    resource_paths = []

    for resource in resource_config.get('resources', []):
        resource_paths.append(resource_config['path'] + "/" + resource['name'])

    circular_deps = Utils.detect_circular_deps(resource_paths)
    if circular_deps:
        error_msg = "🔴 CIRCULAR DEPENDENCY DETECTED IN RESOURCE: " + resource_name + "\n"
        for cycle in circular_deps:
            error_msg += "   🔄 " + ' → '.join(cycle) + "\n"
        fail(error_msg)

    for resource_path in resource_paths:
        naming_errors = Utils.validate_lib_naming(resource_path)
        if naming_errors:
            # Print warnings but don't fail - allow services to load with missing libs
            print("⚠️  LIBRARY NAMING WARNING in " + resource_name)
            for err in naming_errors:
                print("   ❌ " + err['package'] + ": " + err['error'])
            print("   📝 Continuing despite missing libraries (this may cause build failures)")


ResourceValidation = struct(
    validate = validate_resource,
)

VALIDATION = {}
