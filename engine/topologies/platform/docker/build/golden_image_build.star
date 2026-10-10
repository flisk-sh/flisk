# =============================================================================
# 🏗️ TILT SDK - GOLDEN IMAGE BUILDERS
# =============================================================================

load('./golden_image_constants.star', 'GOLDEN_DOCKERFILE', 'GOLDEN_IMAGE_PREFIX', 'GOLDEN_LAYERS', 'LEGACY_GOLDEN_IMAGES')

# Label that records which golden Dockerfile an image was built from.
GOLDEN_HASH_LABEL = 'tdk.golden.hash'

# Shell template for the golden build. Placeholders (@@...@@) are replaced in
# build_golden_layers(); plain `$VAR` references are expanded by the shell.
_GOLDEN_BUILD_TEMPLATE = '''
DF_REL=@@DF_REL@@
ROOT_REL=@@ROOT_REL@@
DF="$(cd "$(dirname "$DF_REL")" && pwd)/$(basename "$DF_REL")"
ROOT="$(cd "$ROOT_REL" && pwd)"
HASH="$(cat "$DF" | (sha256sum 2>/dev/null || shasum -a 256) | cut -c1-64)"
IMAGES="@@IMAGES@@"

if [ -z "$TDK_GOLDEN_REBUILD" ]; then
  fresh=1
  for img in $IMAGES; do
    [ "$(docker image inspect -f '{{index .Config.Labels "@@HASH_LABEL@@"}}' "$img" 2>/dev/null)" = "$HASH" ] || fresh=0
  done
  if [ "$fresh" = 1 ]; then
    echo "✅ Golden images are up to date (hash $HASH) - skipping build"
    exit 0
  fi
fi

echo "🏗️  Building golden layered images (@@COUNT@@ total)..."
if docker buildx version >/dev/null 2>&1; then
  echo "  🧩 Building all golden targets with one docker buildx bake (independent stages run in parallel)"
  cat > golden-layers.bake.hcl <<HCL
variable "HASH" {
  default = ""
}

group "default" {
  targets = [@@TARGET_NAMES@@]
}
@@BAKE_TARGETS@@
HCL
  # Buildx 0.19 and later ask for read access outside the bake file's directory; older releases do not know the flag.
  BUILDX_VER="$(docker buildx version 2>/dev/null | sed -n 's/.* v\\([0-9]*\\)\\.\\([0-9]*\\).*/\\1 \\2/p')"
  BUILDX_MAJOR="${BUILDX_VER%% *}"
  BUILDX_MINOR="${BUILDX_VER##* }"
  BAKE_ALLOW=""
  if [ "${BUILDX_MAJOR:-0}" -gt 0 ] || [ "${BUILDX_MINOR:-0}" -ge 19 ]; then BAKE_ALLOW="--allow fs.read=$ROOT"; fi
  HASH="$HASH" docker buildx bake $BAKE_ALLOW -f golden-layers.bake.hcl --load
else
  echo "  ⚠️  docker buildx is not available - building golden targets one at a time"
  @@SERIAL_BUILDS@@
fi

# Untag golden images that older engines built and nothing uses now; an image still in use is left alone.
for img in @@LEGACY_IMAGES@@; do
  docker image rm "$img" >/dev/null 2>&1 && echo "  🧹 Removed legacy golden image $img"
done

echo "✅ Golden layers built (@@COUNT@@ images):"
@@SUMMARY@@
'''


def _sh_quote(text):
    return "'" + text.replace("'", "'\\''") + "'"


def build_golden_layers(project_root='.'):
    """
    Build all golden layer images using local_resource.
    Returns the resource name for dependency tracking.

    project_root: path back to the project root from wherever
    local_resource cmds actually run (the Tiltfile's own directory,
    .tdk/.tdk-out/ - not the project root), e.g. '../../'. GOLDEN_DOCKERFILE
    is itself project-root-relative, so it must be prefixed with this to
    resolve correctly - passing project_root='.' (the default) only works
    when the Tiltfile happens to live at the project root.

    The build is skipped when every golden image already exists with a
    `tdk.golden.hash` label matching the current Dockerfile. Set
    TDK_GOLDEN_REBUILD=1 to force a rebuild. Otherwise all targets are built
    with one `docker buildx bake`, falling back to serial `docker build` when
    buildx is not installed.
    """
    resource_name = 'golden-layers-build'
    dockerfile_from_tiltfile = (
        GOLDEN_DOCKERFILE if project_root in (None, '.', '')
        else project_root.rstrip('/') + '/' + GOLDEN_DOCKERFILE
    )
    context = project_root or '.'

    images = []
    summary = []
    bake_targets = []
    serial_builds = []
    target_names = []
    for key in GOLDEN_LAYERS:
        layer = GOLDEN_LAYERS[key]
        ref = layer['name'] + ':' + layer['tag']
        images.append(ref)
        summary.append('echo "  ✓ ' + ref + '"')
        target_names.append('"' + key + '"')
        bake_targets.append('''target "{key}" {{
  dockerfile = "$DF"
  context = "$ROOT"
  target = "{target}"
  tags = ["{ref}"]
  labels = {{
    "{label}" = HASH
  }}
}}
'''.format(key=key, target=layer['target'], ref=ref, label=GOLDEN_HASH_LABEL))
        serial_builds.append(
            'docker build --label "{label}=$HASH" -f "$DF" --target {target} -t {ref} "$ROOT" || exit 1'.format(
                label=GOLDEN_HASH_LABEL, target=layer['target'], ref=ref,
            )
        )

    cmd = (_GOLDEN_BUILD_TEMPLATE
        .replace('@@DF_REL@@', _sh_quote(dockerfile_from_tiltfile))
        .replace('@@ROOT_REL@@', _sh_quote(context))
        .replace('@@IMAGES@@', ' '.join(images))
        .replace('@@LEGACY_IMAGES@@', ' '.join(LEGACY_GOLDEN_IMAGES))
        .replace('@@HASH_LABEL@@', GOLDEN_HASH_LABEL)
        .replace('@@COUNT@@', str(len(images)))
        .replace('@@TARGET_NAMES@@', ', '.join(target_names))
        .replace('@@BAKE_TARGETS@@', '\n'.join(bake_targets))
        .replace('@@SERIAL_BUILDS@@', '\n  '.join(serial_builds))
        .replace('@@SUMMARY@@', '\n'.join(summary))
    )

    local_resource(
        resource_name,
        cmd=cmd,
        labels=['infra.docker', 'golden-layers'],
        deps=[dockerfile_from_tiltfile],
        allow_parallel=True,
        auto_init=True,
    )

    return resource_name
