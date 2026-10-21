# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load("./TILT_DISCOVERY.star",
    "VALID_STACKS",
    "VALID_RESOURCE_FEATURES",
    "PORT_RANGES",
)
load("../engine/topologies/tilt/manifest/constants.star", "VALID_APP_TYPES")


def validate(manifest):
    issues = []

    app_name = manifest.get("appName")
    if not app_name:
        issues.append("Missing required field: appName")
    elif type(app_name) != "string":
        issues.append("appName must be a string")
    elif len(app_name) < 3:
        issues.append("appName too short: '" + app_name + "'. Minimum 3 characters")
    elif len(app_name) > 64:
        issues.append("appName too long: '" + app_name + "'. Maximum 64 characters")

    for i in range(len(app_name or "")):
        char = app_name[i]
        if not (char.islower() or char.isdigit() or char == "-"):
            issues.append("Invalid character in appName: '" + char + "'. Must be kebab-case")
            break
    if app_name and (app_name.startswith("-") or app_name.endswith("-")):
        issues.append("appName cannot start or end with a hyphen")

    app_type = manifest.get("appType")
    if not app_type:
        issues.append("Missing required field: appType")
    elif app_type not in VALID_APP_TYPES:
        issues.append("Invalid appType: " + str(app_type) + ". Must be one of: " + ", ".join(VALID_APP_TYPES))

    stack = manifest.get("stack")
    if not stack:
        issues.append("Missing required field: stack")
    elif len(VALID_STACKS) > 0 and stack not in VALID_STACKS:
        # Only validate against list if VALID_STACKS is not empty
        issues.append("Invalid stack: " + str(stack) + ". Must be one of: " + ", ".join(VALID_STACKS))

    port = manifest.get("port")
    if port == None:
        if app_type != "infra":
            issues.append("Missing required field: port")
    elif type(port) != "int":
        issues.append("Invalid port: " + str(port) + ". Must be an integer")
    elif app_type != "infra":
        if port < 3000 or port > 9999:
            issues.append("Invalid port: " + str(port) + ". Must be integer 3000-9999")
        elif app_type and app_type in PORT_RANGES:
            port_range = PORT_RANGES[app_type]
            if port < port_range["min"] or port > port_range["max"]:
                issues.append("Port " + str(port) + " out of range for " + app_type)

    features = manifest.get("featuresEnabled", [])
    if type(features) != "list":
        issues.append("Invalid features: must be an array")
    else:
        for feature in features:
            if feature not in VALID_RESOURCE_FEATURES:
                issues.append("Invalid feature: " + str(feature))

    deps = manifest.get("dependsOn", [])
    if type(deps) != "list":
        issues.append("Invalid dependsOn: must be an array")

    replicas = manifest.get("replicas")
    if replicas != None:
        if type(replicas) != "int":
            issues.append("Invalid replicas: must be an integer")
        elif replicas < 1:
            issues.append("Invalid replicas: " + str(replicas) + ". Minimum is 1")
        elif replicas > 10:
            issues.append("Invalid replicas: " + str(replicas) + ". Maximum is 10")

    return issues
