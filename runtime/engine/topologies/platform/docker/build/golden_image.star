# =============================================================================
# 🏗️ TILT SDK - GOLDEN LAYERED IMAGES PROVIDER
# =============================================================================
# Purpose: Public API facade for golden layered image orchestration.
# =============================================================================

load('./golden_image_constants.star',
    'GOLDEN_IMAGE_PREFIX',
    'GOLDEN_LAYERS',
    'get_layer_reference',
)
load('./golden_image_build.star', 'build_golden_layers')
load('./golden_image_dockerfile.star', 'generate_golden_dockerfile')


GoldenImage = struct(
    # Build functions
    build = build_golden_layers,

    # Reference getters
    get_layer = get_layer_reference,
    l1 = lambda: get_layer_reference('l1'),
    l2 = lambda: get_layer_reference('l2'),
    l3_backend = lambda: get_layer_reference('l3-backend'),
    l3_frontend = lambda: get_layer_reference('l3-frontend'),
    l3_migrator = lambda: get_layer_reference('l3-migrator'),
    l4_backend = lambda: get_layer_reference('l4-backend'),
    l4_frontend = lambda: get_layer_reference('l4-frontend'),
    l4_migrator = lambda: get_layer_reference('l4-migrator'),

    # Constants
    layers = GOLDEN_LAYERS,
    prefix = GOLDEN_IMAGE_PREFIX,

    # Generators
    generate_dockerfile = generate_golden_dockerfile,
)
