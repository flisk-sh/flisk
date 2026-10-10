# =============================================================================
# 🏗️ TILT SDK - GOLDEN IMAGE CONSTANTS
# =============================================================================

# Load project configuration to get the project name as prefix
# Falls back to 'tdk-project' if project.json is not found
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_golden_prefix():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        return _project_json.get('project', {}).get('name', 'tdk-project')
    return 'tdk-project'

_GOLDEN_IMAGE_PREFIX = _load_golden_prefix()

GOLDEN_IMAGE_PREFIX = _GOLDEN_IMAGE_PREFIX
GOLDEN_DOCKERFILE = '.tdk/.tdk-out/golden-layers.Dockerfile'

GOLDEN_LAYERS = {
    'l1': {
        'name': GOLDEN_IMAGE_PREFIX + '-l1',
        'tag': 'latest',
        'description': 'OS base + runtime environment',
        'target': 'l1_golden',
    },
    'l2': {
        'name': GOLDEN_IMAGE_PREFIX + '-l2',
        'tag': 'latest',
        'description': 'Dependencies + node_modules',
        'target': 'l2_golden',
    },
    'l3-backend': {
        'name': GOLDEN_IMAGE_PREFIX + '-l3-backend',
        'tag': 'latest',
        'description': 'Backend build tools (Prisma only, Infisical CLI skipped to avoid CDN hangs)',
        'target': 'l3_backend_golden',
    },
    'l3-frontend': {
        'name': GOLDEN_IMAGE_PREFIX + '-l3-frontend',
        'tag': 'latest',
        'description': 'Frontend build tools (no Prisma)',
        'target': 'l3_frontend_golden',
    },
    'l4-backend': {
        'name': GOLDEN_IMAGE_PREFIX + '-l4-backend',
        'tag': 'latest',
        'description': 'Backend production runtime (Bun, no Infisical CLI)',
        'target': 'l4_backend_bun',
    },
    'l4-backend-node': {
        'name': GOLDEN_IMAGE_PREFIX + '-l4-backend-node',
        'tag': 'latest',
        'description': 'Backend production runtime (Node.js - lightweight, no Infisical CLI)',
        'target': 'l4_backend_node',
    },
    'l4-frontend': {
        'name': GOLDEN_IMAGE_PREFIX + '-l4-frontend',
        'tag': 'latest',
        'description': 'Frontend production runtime',
        'target': 'l4_frontend_golden',
    },
    'l4-migrator': {
        'name': GOLDEN_IMAGE_PREFIX + '-l4-migrator',
        'tag': 'latest',
        'description': 'Migrator production runtime (no Infisical CLI - uses env vars)',
        'target': 'l4_migrator_golden',
    },
}


# Layers that are no longer built, mapped to the layer that replaced them.
# l3-migrator installed the same Prisma as l3-backend and produced identical layers.
LAYER_ALIASES = {
    'l3-migrator': 'l3-backend',
}

# Image names older engines built that nothing uses now; the golden build untags them.
LEGACY_GOLDEN_IMAGES = [
    GOLDEN_IMAGE_PREFIX + '-l3-migrator:latest',
]


def get_layer_reference(layer):
    """Returns the full image reference for a specific layer."""
    layer = LAYER_ALIASES.get(layer, layer)
    if layer not in GOLDEN_LAYERS:
        fail("Invalid layer: " + layer + ". Must be one of: l1, l2, l3, l4")

    layer_info = GOLDEN_LAYERS[layer]
    return '{name}:{tag}'.format(
        name=layer_info['name'],
        tag=layer_info['tag'],
    )

CONSTANTS = {}
