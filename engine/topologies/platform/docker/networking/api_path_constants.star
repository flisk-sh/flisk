# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🌐 - API PATH CONSTANTS (Dynamic)
# =============================================================================
# API paths are generated dynamically from manifest stack and appName fields
# No hardcoded resource names - all from service.json
# =============================================================================



# =============================================================================
# API VERSION AND BASE PATH
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
HEALTH_CHECK_PATH = "/health"
# === END INLINED CONSTANTS ===


API_VERSION_V1 = "v1"
API_BASE_PATH = "/api"

# =============================================================================
# DYNAMIC API PATH GENERATION
# =============================================================================

def generate_api_path(stack, app_name):
    """Generate API path from manifest stack and appName.
    
    URL Restructuring: Changed from /api/v1/{app-name} to /api/{stack}-management
    This provides clean separation between frontend and backend while removing version from path.
    """
    # NEW: Use /api/{stack}-management pattern
    # Examples: /api/user-management, /api/order-management
    return "/api/" + stack + "-management"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _pluralize_stack(stack):
    """Convert stack to proper plural form.
    
    Handles irregular plurals and special cases for platform stacks.
    
    Args:
        stack: Singular stack name (e.g., "user", "order", "product")
    
    Returns:
        str: Pluralized stack name (e.g., "users", "orders", "products")
    """
    # Already plural
    if stack.endswith("s"):
        return stack
    
    # Special cases - irregular plurals (common English patterns)
    irregulars = {
        "category": "categories",
        "city": "cities",
        "company": "companies",
        "story": "stories",
    }
    
    if stack in irregulars:
        return irregulars[stack]
    
    # Words ending in 'y' (not preceded by a vowel) -> 'ies'
    if stack.endswith("y") and len(stack) > 1 and stack[-2] not in "aeiou":
        return stack[:-1] + "ies"
    
    # Words ending in 'ch', 'sh', 'ss', 'x', 'z', 'o' -> add 'es'
    if stack.endswith(("ch", "sh", "ss", "x", "z", "o")):
        return stack + "es"
    
    # Default: add 's'
    return stack + "s"


def get_api_path_for_stack(stack, manifest=None):
    """Returns the full API path for a service stack.
    
    URL Restructuring: Changed from /api/v1/{stack}s to /api/{stack}-management
    This aligns API paths with resource naming conventions.
    
    Args:
        stack: Service stack name from manifest.json
        manifest: Optional manifest dict that may contain 'apiPath' override
    
    Returns:
        Full API path string (e.g., "/api/user-management")
        Falls back to "/api/{stack}-management" if not found
        Returns apiPath from manifest if explicitly specified
    """
    # Check for explicit apiPath override in manifest
    if manifest and manifest.get("apiPath"):
        return manifest.get("apiPath")
    
    # NEW: Use /api/{stack}-management pattern instead of /api/v1/{pluralized}
    return "/api/" + stack + "-management"

# Backwards compatibility alias
get_api_path_for_domain = get_api_path_for_stack


def get_frontend_base_path(manifest, res_name=None):
    """Returns the public route a frontend is served under, e.g. "/floor-app".

    Single source of truth. Three separate generators need this value and they
    MUST agree, because they are three halves of one route:

      - compose.star   -> the Traefik router rule and its stripprefix middleware
      - vite/frontend  -> `base`, which prefixes every asset URL in index.html
      - env.star       -> PUBLIC_URL

    If they disagree the app still "starts" but serves a white page: Traefik
    routes /a, index.html asks for /b/assets/*, and nothing answers. They used
    to default to `stack + 's'`, `'/' + stack + 's'` and `'/' + stack`
    respectively -- three different answers, one of which ("operations" + "s")
    produced the nonsense route /operationss.

    Defaults to the service name: it is unique per service (a stack with two
    frontends would otherwise collide on one route) and it matches the URL
    `flisk up` prints, so what the CLI advertises is what Traefik serves.
    """
    base_path = manifest.get('basePath') if manifest else None
    if not base_path:
        base_path = res_name or (manifest.get('appName') if manifest else None) or ''
    if not base_path:
        return ''
    if not base_path.startswith('/'):
        base_path = '/' + base_path
    return base_path

def get_api_path_for_resource(resource_name):
    """Returns the full API path for a resource name.
    
    Args:
        resource_name: Resource appName from manifest
    
    Returns:
        Full API path string
    """
    # Extract stack from resource name using pattern matching
    # No hardcoded resource names - all patterns derived from naming conventions
    if "-management-backend" in resource_name:
        stack = resource_name.replace("-management-backend", "")
    elif "-management-frontend" in resource_name:
        stack = resource_name.replace("-management-frontend", "")
    elif "-planner-backend" in resource_name:
        stack = resource_name.replace("-planner-backend", "")
    elif "-planner-frontend" in resource_name:
        stack = resource_name.replace("-planner-frontend", "")
    elif "-backend" in resource_name:
        stack = resource_name.replace("-backend", "")
    elif "-frontend" in resource_name:
        stack = resource_name.replace("-frontend", "")
    else:
        stack = resource_name
    
    return get_api_path_for_stack(stack)

# Backwards compatibility alias
get_api_path_for_service = get_api_path_for_resource

# Load project name for dynamic localhost domain
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_project_localhost():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        return _project_json.get('project', {}).get('name', 'tdk-project') + ".localhost"
    return "tdk-project.localhost"

_PROJECT_LOCALHOST = _load_project_localhost()

def build_traefik_url(api_path, host=None, scheme="http"):
    """Builds full Traefik gateway URL from API path.

    Args:
        api_path: API path
        host: Gateway host (default: {project}.localhost from project.json)
        scheme: URL scheme (default: http)

    Returns:
        Full URL string
    """
    if host == None:
        host = _PROJECT_LOCALHOST
    return scheme + "://" + host + api_path

def build_health_endpoint(api_path, health_path="/health"):
    """Builds health check endpoint path from API path.
    
    Args:
        api_path: API path
        health_path: Health endpoint suffix (default: /health)
    
    Returns:
        Full health endpoint path
    """
    return api_path + health_path
