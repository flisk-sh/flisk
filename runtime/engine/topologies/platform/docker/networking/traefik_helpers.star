# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐳 TILT SDK - TRAEFIK HELPERS
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
TRAEFIK_API_BASE_PATH = "/api"
# === END INLINED CONSTANTS ===


load(
    "./traefik_constants.star",
    "TRAEFIK_PROJECT_HOST",
    "TRAEFIK_PROJECT_APP_HOST",
    "TRAEFIK_PROJECT_API_HOST",
    "TRAEFIK_ENABLE_BACKEND_PATH_RULE",
    "TRAEFIK_ENABLE_BACKEND_HOST_RULE",
    "TRAEFIK_ENABLE_FRONTEND_HOST_RULE",
    "TRAEFIK_ENABLE_FRONTEND_PATH_RULE",
    "TRAEFIK_FRONTEND_LOCALHOST_SUFFIX",
    "TRAEFIK_WEB_ENTRYPOINT",
    "TRAEFIK_WEBSECURE_ENTRYPOINT",
    "TRAEFIK_API_VERSION",
)



def build_entrypoints(enable_http, enable_https):
    entrypoints = []
    if enable_http:
        entrypoints.append(TRAEFIK_WEB_ENTRYPOINT)
    if enable_https:
        entrypoints.append(TRAEFIK_WEBSECURE_ENTRYPOINT)
    if len(entrypoints) == 0:
        entrypoints.append(TRAEFIK_WEB_ENTRYPOINT)
    return ",".join(entrypoints)


def frontend_rule(res_name, base_path, traefik_host):
    parts = []
    if TRAEFIK_ENABLE_FRONTEND_HOST_RULE:
        parts.append(
            "Host(`{res_name}{suffix}`)".format(
                res_name=res_name,
                suffix=TRAEFIK_FRONTEND_LOCALHOST_SUFFIX,
            ),
        )
    if traefik_host:
        parts.append("Host(`{traefik_host}`)".format(traefik_host=traefik_host))
    if TRAEFIK_ENABLE_FRONTEND_PATH_RULE:
        parts.append(
            "(Host(`{host}`) && PathPrefix(`{base_path}`))".format(
                host=TRAEFIK_PROJECT_APP_HOST,
                base_path=base_path,
            ),
        )
        # Also accept localhost for local testing
        parts.append(
            "(Host(`localhost`) && PathPrefix(`{base_path}`))".format(
                base_path=base_path,
            ),
        )
    return " || ".join(parts)


def backend_rule(traefik_host, traefik_path):
    parts = []
    if TRAEFIK_ENABLE_BACKEND_HOST_RULE and traefik_host:
        parts.append("Host(`{host}`)".format(host=traefik_host))
    if TRAEFIK_ENABLE_BACKEND_PATH_RULE and traefik_path:
        parts.append("PathPrefix(`{path}`)".format(path=traefik_path))
    return " || ".join(parts)


def _pluralize_stack(stack):
    """Convert stack to proper plural form.

    Handles irregular plurals and special cases.

    Args:
        stack: Singular stack name (e.g., "user", "order", "product")

    Returns:
        str: Pluralized stack name (e.g., "users", "orders", "products")
    """
    # Already plural
    if stack.endswith("s"):
        return stack

    # Irregular plurals that don't follow normal rules
    irregulars = {
        "identity": "identity",
        "profile": "profile",  # profiles is wrong, profile is correct
        "staff": "staff",
        "inventory": "inventory",
    }

    if stack in irregulars:
        return irregulars[stack]

    # Words ending in 'y' preceded by a consonant -> 'ies'
    if stack.endswith("y") and len(stack) > 1 and stack[-2] not in "aeiou":
        return stack[:-1] + "ies"

    # Words ending in ch, sh, ss, x, z, o -> 'es'
    if stack.endswith(("ch", "sh", "ss", "x", "z", "o")):
        return stack + "es"

    return stack + "s"


def get_api_path(stack, manifest=None):
    """Generate API path from stack. Converts stack to proper resource name.

    URL Restructuring: Changed from /api/v1/{stack} to /api/{resource-name}

    Args:
        stack: Resource stack from manifest (from service.json)

    Returns:
        str: API path like "/api/{stack}-management"
    """
    # NEW: Use {stack}-management pattern instead of pluralized stack
    # This matches the resource naming convention ({stack}-management)
    return "{base}/{stack}-management".format(
        base=TRAEFIK_API_BASE_PATH,
        stack=stack,
    )


def cli_api_path(resource_name, manifest=None):
    """API path printed by `flisk up` and served on api.{project}.localhost.

    Matches cli/src/commands/up.ts: `/api/{name}` with a trailing `-api` stripped.
    """
    if manifest and manifest.get("apiPath"):
        return manifest.get("apiPath")
    name = resource_name or (manifest.get("appName", "") if manifest else "")
    if name.endswith("-api"):
        name = name[:-4]
    return TRAEFIK_API_BASE_PATH + "/" + name


def project_backend_rule(manifest, resource_name=None):
    """Generate routing rule for api.{project}.localhost from manifest.

    Args:
        manifest: Service manifest dictionary
        resource_name: Runtime resource name (e.g. auth-api-backend)

    Returns:
        str: Traefik routing rule for project localhost domain
    """
    if not manifest and not resource_name:
        return ""

    api_path = cli_api_path(resource_name, manifest)
    return "Host(`{host}`) && PathPrefix(`{path}`)".format(
        host=TRAEFIK_PROJECT_API_HOST,
        path=api_path,
    )
