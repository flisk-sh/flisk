# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔧 TILT SDK - CORE UTILITIES MODULE
# =============================================================================
# Path: .tilt/topologies/tilt/common/utils.star
# Purpose: Foundational helper functions, constants, and shared API surface.
# =============================================================================

load('./utils_env.star',
    'load_dotenv',
    'project_env_file',
    'should_enable',
)
load('./utils_debug.star',
    'DEBUG_MODE',
    'debug_log',
    'inspect',
    'breadcrumb',
    'fail_with_context',
)
load('./utils_docker_networks.star',
    _fix_docker_networks = 'fix_docker_networks',
    _cleanup_docker_networks = 'cleanup_docker_networks',
)
load('./utils_output.star',
    'print_resource_summary',
    'get_template_header',
)
load('../../platform/docker/constants.star', 'PlatformDockerConstants')

# =============================================================================
# 📦 INTERNAL DEPENDENCY CONSTANTS
# =============================================================================

INTERNAL_SCOPE = PlatformDockerConstants.NPM_SCOPE

LIBRARY_ROOTS = {
    'platform': 'shared-platform-engineering',
    'product': 'shared-product-engineering',
    'ddd': 'shared-ddd-layers',
}

DDD_LAYERS = ['domain', 'application', 'infrastructure', 'presentation']

# =============================================================================
# 📦 MIGRATED PACKAGES CONFIGURATION
# =============================================================================
# Map of package names that have been moved from their conventional locations
# to new paths. This allows the resolver to find packages at non-standard paths.
# Format: "package-name": ("path-relative-to-repo-root", "library-type")
# =============================================================================

MIGRATED_PACKAGES = {
    # Introvertic packages reorganized into unified folder
    "introvertic-core": ("shared-product-engineering/introvertic/core", "product"),
    "introvertic-ui": ("shared-product-engineering/introvertic/ui", "product"),
    "introvertic-docs": ("shared-product-engineering/introvertic/ui/docs", "product"),
}

# Import from canonical location to avoid duplication
load("../manifest/constants.star", "MANIFEST_FILENAME")

# List of all shared platform networks
# All networks use PROJECT_NAME format (e.g., tdk_project_*)
PLATFORM_NETWORKS = [
  PlatformDockerConstants.NETWORK_TRAEFIK_PUBLIC,
  PlatformDockerConstants.PROJECT_NAME + "_traefik-private",
  PlatformDockerConstants.NETWORK_BACKEND,
  PlatformDockerConstants.NETWORK_DATABASE,
  PlatformDockerConstants.NETWORK_INFISICAL,
  PlatformDockerConstants.VERDACCIO_NETWORK,
  PlatformDockerConstants.NETWORK_PROXY,
]

# =============================================================================
# 🔍 CENTRALIZED DEPENDENCY EXTRACTION (Single Source of Truth)
# =============================================================================

def get_internal_deps(resource_path):
    """
    Extract all @tdk/* dependencies from a service's package.json.
    """
    pkg_json_path = resource_path + '/package.json'
    pkg_content = read_file(pkg_json_path, default='')

    if not pkg_content or not str(pkg_content).strip():
        return []

    pkg = decode_json(pkg_content)
    if not pkg:
        return []

    internal_deps = []

    # Scan all dependency types in one pass
    for dep_type in ['dependencies', 'devDependencies', 'peerDependencies']:
        deps = pkg.get(dep_type, {})
        for dep_name in deps.keys():
            if dep_name.startswith(INTERNAL_SCOPE) and dep_name not in internal_deps:
                internal_deps.append(dep_name)

    return internal_deps


def resolve_lib_path(package_name):
    """
    Resolve @tdk/* package name to workspace path using naming conventions.
    
    Checks MIGRATED_PACKAGES first for packages that have been moved from their
    conventional locations, then falls back to standard naming conventions.
    """
    if not package_name.startswith(INTERNAL_SCOPE):
        return (None, None)

    lib_name = package_name[len(INTERNAL_SCOPE):]

    # Check migrated packages first (packages moved from conventional locations)
    if lib_name in MIGRATED_PACKAGES:
        return MIGRATED_PACKAGES[lib_name]

    # Standard naming convention resolution
    if lib_name in DDD_LAYERS:
        return (LIBRARY_ROOTS['ddd'] + '/' + lib_name, 'ddd')

    if lib_name.startswith('platform-'):
        return (LIBRARY_ROOTS['platform'] + '/' + lib_name, 'platform')

    if lib_name.startswith('product-'):
        return (LIBRARY_ROOTS['product'] + '/' + lib_name, 'product')

    return (LIBRARY_ROOTS['platform'] + '/' + lib_name, 'platform')


def build_deps_mapping(resource_path, internal_deps=None):
    """Build a mapping of package_name -> library path for internal dependencies."""
    if internal_deps == None:
        internal_deps = get_internal_deps(resource_path)

    mapping = {}
    for dep_name in internal_deps:
        lib_info = resolve_lib_path(dep_name)
        lib_path = lib_info[0]

        if lib_path:
            mapping[dep_name] = lib_path

    return mapping


# =============================================================================
# 🔍 VALIDATION FUNCTIONS
# =============================================================================

def validate_lib_naming(resource_path):
    """
    Validate that package names in package.json match folder naming conventions.
    """
    errors = []
    internal_deps = get_internal_deps(resource_path)

    for dep_name in internal_deps:
        lib_info = resolve_lib_path(dep_name)
        expected_path = lib_info[0]

        if not expected_path:
            continue

        pkg_json = expected_path + '/package.json'
        content = read_file(pkg_json, default='')

        if not content or not str(content).strip():
            errors.append({
                'package': dep_name,
                'expected_path': expected_path,
                'error': 'Library folder not found at expected location',
            })
            continue

        pkg = decode_json(content)
        if pkg:
            actual_name = pkg.get('name', '')
            if actual_name != dep_name:
                errors.append({
                    'package': dep_name,
                    'expected_path': expected_path,
                    'actual_name': actual_name,
                    'error': 'Package name mismatch: expected "' + dep_name + '" but found "' + actual_name + '"',
                })

    return errors


def detect_circular_deps(resource_paths, max_depth=10):
    """
    Detect circular dependencies between libraries.
    """
    circular = []
    visited_chains = {}

    def check_chain(pkg_name, chain, depth):
        if depth > max_depth:
            return

        if pkg_name in chain:
            cycle_start = chain.index(pkg_name)
            cycle = chain[cycle_start:] + [pkg_name]
            cycle_str = ' -> '.join(cycle)
            if cycle_str not in visited_chains:
                visited_chains[cycle_str] = True
                circular.append(cycle)
            return

        lib_info = resolve_lib_path(pkg_name)
        lib_path = lib_info[0]

        if not lib_path:
            return

        lib_deps = get_internal_deps(lib_path)
        for dep in lib_deps:
            check_chain(dep, chain + [pkg_name], depth + 1)

    for resource_path in resource_paths:
        deps = get_internal_deps(resource_path)
        for dep in deps:
            check_chain(dep, [], 0)

    return circular


def encode_json(obj, _depth=0):
    """
    Simple JSON encoder for Starlark.
    Supports: dict, list, string, int, bool, None
    """
    # Prevent stack overflow from circular references or deeply nested data
    if _depth > 50:
        return '"<max-depth-exceeded>"'
    
    if obj == None:
        return 'null'
    t = type(obj)
    if t == 'string':
        return '"' + obj.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t') + '"'
    if t == 'int':
        return str(obj)
    if t == 'bool':
        return 'true' if obj else 'false'
    if t == 'list':
        return '[' + ', '.join([encode_json(i, _depth + 1) for i in obj]) + ']'
    if t == 'dict':
        parts = []
        sorted_keys = sorted(obj.keys())
        for k in sorted_keys:
            parts.append(encode_json(k, _depth + 1) + ': ' + encode_json(obj[k], _depth + 1))
        return '{' + ', '.join(parts) + '}'
    return '"' + str(obj) + '"'


# =============================================================================
# 📁 FILE I/O UTILITIES
# =============================================================================

def _is_allowed_generated_path(file_path, project_root):
    path = file_path.replace('\\', '/').strip()
    root = project_root.replace('\\', '/').rstrip('/')
    if root and path.startswith(root + '/'):
        path = path[len(root) + 1:]
    if path.startswith('./'):
        path = path[2:]
    parts = path.split('/')
    if '..' in parts or path.startswith('/'):
        return False
    if '.autogenerated' in parts:
        return True
    if path.startswith('.tdk/.tdk-out/'):
        return True
    if path == 'services/platform/database-management/docker-compose.yml':
        return True
    if path.startswith('product_autogenerated_resource_manifests/') or path.startswith('product_autogenerated_services_list/'):
        return True
    if path == 'Tiltfile' or path == '.tiltignore':
        return True
    if len(parts) == 1 and path.startswith('TILT_') and path.endswith('.star'):
        return True
    return False

def _write_generated_file(file_path, content):
    expected = str(content).rstrip()
    dir_path = file_path.rsplit('/', 1)[0]
    if not dir_path:
        dir_path = '/'
    safe_content = (expected + '\n').replace("'", "'\\''")
    cmd = "mkdir -p '" + dir_path + "' && printf '%s' '" + safe_content + "' > '" + file_path + "'"
    local(cmd, quiet=True, echo_off=True)

def write_file_if_changed(file_path, content):
    """
    Writes content to file only if it differs from existing content.
    Uses Tilt's native read_file() - fast and silent.
    
    If file_path is relative (doesn't start with /), it will be written relative
    to the project root (TDK_PROJECT_ROOT env var) instead of Tilt working dir.
    """
    if content == None:
        content = ""

    # For relative paths, prepend project root to ensure files go to correct location
    project_root = os.environ.get('TDK_PROJECT_ROOT', '.')
    if not file_path.startswith('/'):
        # Remove leading ./ if present in file_path
        clean_file_path = file_path[2:] if file_path.startswith('./') else file_path
        file_path = project_root + '/' + clean_file_path

    if not _is_allowed_generated_path(file_path, project_root):
        fail("Flisk refused to write outside its generated-file allowlist: " + file_path)

    expected = str(content).rstrip()
    existing_blob = read_file(file_path, default='')
    existing = str(existing_blob).rstrip()

    if existing == expected:
        debug_log("WRITE: Skipping {} (no changes)".format(file_path))
    else:
        debug_log("WRITE: Writing {} bytes to {}".format(len(expected), file_path))
        _write_generated_file(file_path, expected)
        debug_log("WRITE: Completed {}".format(file_path))

    # Keep a generated-content snapshot beside the service outputs. `flisk config verify`
    # compares these snapshots with the files and the source manifest, detecting both
    # hand edits and stale generated output without needing to run Tilt from CI.
    normalized = file_path.replace('\\', '/')
    generated_marker = '/.autogenerated/'
    marker_index = normalized.rfind(generated_marker)
    if marker_index >= 0 and '/.tdk-contract/' not in normalized:
        service_root = normalized[:marker_index]
        generated_rel = normalized[marker_index + len(generated_marker):]
        contract_root = service_root + '/.autogenerated/.tdk-contract'
        _write_generated_file(contract_root + '/' + generated_rel, expected)
        manifest_content = read_file(service_root + '/service.json', default='')
        if manifest_content:
            _write_generated_file(contract_root + '/service.json.source', str(manifest_content))


# =============================================================================
# 🐳 DOCKER NETWORK MANAGEMENT
# =============================================================================

def fix_docker_networks():
    return _fix_docker_networks(PLATFORM_NETWORKS)


def cleanup_docker_networks():
    return _cleanup_docker_networks(PLATFORM_NETWORKS)


# =============================================================================
# 📦 Utils STRUCT - Public API for other modules
# =============================================================================

Utils = struct(
    # Core extraction
    get_internal_deps = get_internal_deps,
    resolve_lib_path = resolve_lib_path,
    build_deps_mapping = build_deps_mapping,

    # Validation
    validate_lib_naming = validate_lib_naming,
    detect_circular_deps = detect_circular_deps,

    # File I/O
    write_file_if_changed = write_file_if_changed,
    encode_json = encode_json,

    # Environment
    load_dotenv = load_dotenv,
    project_env_file = project_env_file,
    should_enable = should_enable,

    # Debug utilities
    debug_log = debug_log,
    inspect = inspect,
    breadcrumb = breadcrumb,
    fail_with_context = fail_with_context,
    DEBUG_MODE = DEBUG_MODE,

    # Docker networks
    fix_docker_networks = fix_docker_networks,
    cleanup_docker_networks = cleanup_docker_networks,

    # Resource summary
    print_resource_summary = print_resource_summary,

    # Template headers
    get_template_header = get_template_header,

    # Constants
    INTERNAL_SCOPE = INTERNAL_SCOPE,
    LIBRARY_ROOTS = LIBRARY_ROOTS,
    DDD_LAYERS = DDD_LAYERS,
    MANIFEST_FILENAME = MANIFEST_FILENAME,
    PLATFORM_NETWORKS = PLATFORM_NETWORKS,
    MIGRATED_PACKAGES = MIGRATED_PACKAGES,
)

CONSTANTS = {}

VALIDATION = {}

DEBUG = {}
