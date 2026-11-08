# =============================================================================
# 🏗️ TILT SDK - GOLDEN IMAGE BUILDERS
# =============================================================================

load('../../../../../discovery/native_windows.star', 'POWERSHELL')
load('../../../tilt/common/windows_scripts.star', 'golden_build_script')
load('./golden_image_constants.star', 'GOLDEN_DOCKERFILE', 'GOLDEN_IMAGE_PREFIX', 'GOLDEN_LAYERS', 'LEGACY_GOLDEN_IMAGES')

# Label that records which golden Dockerfile an image was built from.
GOLDEN_HASH_LABEL = 'flisk.golden.hash'

# Where publish-golden-images.yml pushes golden-<layer>:<hash12> (public, no login). `flisk up` pulls from here first.
GOLDEN_REGISTRY_DEFAULT = 'ghcr.io/flisk-sh'

# Shell template for the golden build. Placeholders (@@...@@) are replaced in
# build_golden_layers(); plain `$VAR` references are expanded by the shell.
_GOLDEN_BUILD_TEMPLATE = '''
DF_REL=@@DF_REL@@
ROOT_REL=@@ROOT_REL@@
DF="$(cd "$(dirname "$DF_REL")" && pwd)/$(basename "$DF_REL")"
ROOT="$(cd "$ROOT_REL" && pwd)"
HASH="$(cat "$DF" | (sha256sum 2>/dev/null || shasum -a 256) | cut -c1-64)"
IMAGES="@@IMAGES@@"

if [ -z "$FLISK_GOLDEN_REBUILD" ]; then
  fresh=1
  for img in $IMAGES; do
    [ "$(docker image inspect -f '{{index .Config.Labels "@@HASH_LABEL@@"}}' "$img" 2>/dev/null)" = "$HASH" ] || fresh=0
  done
  if [ "$fresh" = 1 ]; then
    echo "✅ Golden images are up to date (hash $HASH) - skipping build"
    exit 0
  fi
fi

@@PULL_GOLDEN@@
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
  # A failed bake must fail this resource. Tilt runs the script with `sh -c` and no `set -e`, so an unchecked failure
  # used to fall through to the success message and mark the resource ready while images were missing; the resources
  # that depend on it then died with "pull access denied" for images that never existed. Registry and package-mirror
  # hiccups (an apk SSL EOF, a pull timeout) are common on CI, so retry before giving up.
  attempt=1
  until HASH="$HASH" docker buildx bake $BAKE_ALLOW -f golden-layers.bake.hcl --load; do
    if [ "$attempt" -ge 3 ]; then
      echo "❌ Golden layers build failed after $attempt attempts (see the first error above)"
      exit 1
    fi
    delay=$((attempt * ${FLISK_GOLDEN_RETRY_DELAY:-10}))
    echo "  ⚠️  docker buildx bake failed (attempt $attempt of 3, often a registry or package mirror hiccup) - retrying in ${delay}s"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
else
  echo "  ⚠️  docker buildx is not available - building golden targets one at a time"
  @@SERIAL_BUILDS@@
fi

# Untag golden images that older engines built and nothing uses now; an image still in use is left alone.
for img in @@LEGACY_IMAGES@@; do
  docker image rm "$img" >/dev/null 2>&1 && echo "  🧹 Removed legacy golden image $img"
done
@@PRUNE_OLD@@

# Report success only when every golden image exists, whatever the builder said.
missing=""
for img in $IMAGES; do
  docker image inspect -f '{{.Id}}' "$img" >/dev/null 2>&1 || missing="$missing $img"
done
if [ -n "$missing" ]; then
  echo "❌ Golden images missing after the build:$missing"
  exit 1
fi

echo "✅ Golden layers built (@@COUNT@@ images):"
@@SUMMARY@@
'''


def _pull_line(key, ref):
    """
    Pulls golden-<key>:<hash12> from the golden registry and tags it as this project's image; any failure clears
    `pulled`, and once it is cleared the remaining layers are not tried. The registry tag is removed again, which only
    untags (the project tag keeps the image): a registry tag per hash would keep every old version's image alive.
    """
    remote = '"$GOLDEN_REGISTRY/golden-' + key + ':$TAG12"'
    return ('[ "$pulled" = 1 ] && if docker pull -q ' + remote + ' >/dev/null 2>&1 && docker tag ' + remote + ' ' + ref
        + '; then docker image rm ' + remote + ' >/dev/null 2>&1; else pulled=0; fi')


def _pull_block(pull_lines):
    """
    Prebuilt images, on by default. Every golden image is pulled from GOLDEN_REGISTRY_DEFAULT for this Dockerfile's
    hash before anything is built; FLISK_GOLDEN_REGISTRY names another registry, and `off` (or an empty value) turns
    the pull off. If any pull fails (offline, or no image published for this hash), the local build runs as before.
    """
    return '\n'.join([
        'GOLDEN_REGISTRY="${FLISK_GOLDEN_REGISTRY-' + GOLDEN_REGISTRY_DEFAULT + '}"',
        'case "$GOLDEN_REGISTRY" in off|none|false|0) GOLDEN_REGISTRY="" ;; esac',
        'if [ -n "$GOLDEN_REGISTRY" ] && [ -z "$FLISK_GOLDEN_REBUILD" ]; then',
        '  TAG12="$(printf \'%s\' "$HASH" | cut -c1-12)"',
        '  echo "⬇️  Pulling prebuilt golden images for $TAG12 from $GOLDEN_REGISTRY"',
        '  pulled=1',
    ] + ['  ' + line for line in pull_lines] + [
        '  if [ "$pulled" = 1 ]; then',
        '    echo "✅ Golden images pulled from $GOLDEN_REGISTRY (hash $TAG12)"',
        '    @@PRUNE_OLD@@',
        '    exit 0',
        '  fi',
        '  echo "ℹ️  No prebuilt golden images for $TAG12 in $GOLDEN_REGISTRY (offline, or not published); building them here"',
        'fi',
    ]) + '\n'


# Golden images whose tag moved to a newer hash are left untagged (<none>), one set for every engine version that changed
# the golden Dockerfile. Remove the untagged ones that carry the golden hash label; Docker skips any a container uses.
_PRUNE_OLD_GOLDEN = 'docker image prune -f --filter "label=' + GOLDEN_HASH_LABEL + '" >/dev/null 2>&1 || true'


def _sh_quote(text):
    return "'" + text.replace("'", "'\\''") + "'"


def build_golden_layers(project_root='.', needed=True):
    """
    Build all golden layer images using local_resource.
    Returns the resource name for dependency tracking.

    project_root: path back to the project root from wherever
    local_resource cmds actually run (the Tiltfile's own directory,
    .flisk/.flisk-out/ - not the project root), e.g. '../../'. GOLDEN_DOCKERFILE
    is itself project-root-relative, so it must be prefixed with this to
    resolve correctly - passing project_root='.' (the default) only works
    when the Tiltfile happens to live at the project root.

    The build is skipped when every golden image already exists with a
    `flisk.golden.hash` label matching the current Dockerfile. Set
    FLISK_GOLDEN_REBUILD=1 to force a rebuild. Otherwise all targets are built
    with one `docker buildx bake`, falling back to serial `docker build` when
    buildx is not installed.

    needed=False (a project of only bring-your-own containers) keeps the resource but touches no image. Its pull, untag and prune
    would run beside those containers' own `docker compose` pulls, and on the containerd image store that fails their layer
    extraction ("failed to extract layer ... no such file or directory", nightly adopters on Docker 29).
    """
    resource_name = 'golden-layers-build'
    if not needed:
        message = 'No resource uses the golden images; nothing to pull or build'
        local_resource(
            resource_name,
            cmd='echo ' + _sh_quote(message),
            cmd_bat=POWERSHELL + ["Write-Output '" + message + "'"],
            labels=['infra.docker', 'golden-layers'],
            allow_parallel=True,
            auto_init=True,
        )
        return resource_name

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
    pull_lines = []
    for key in GOLDEN_LAYERS:
        layer = GOLDEN_LAYERS[key]
        ref = layer['name'] + ':' + layer['tag']
        images.append(ref)
        pull_lines.append(_pull_line(key, ref))
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
        .replace('@@PULL_GOLDEN@@', _pull_block(pull_lines))
        .replace('@@PRUNE_OLD@@', _PRUNE_OLD_GOLDEN)
        .replace('@@TARGET_NAMES@@', ', '.join(target_names))
        .replace('@@BAKE_TARGETS@@', '\n'.join(bake_targets))
        .replace('@@SERIAL_BUILDS@@', '\n  '.join(serial_builds))
        .replace('@@SUMMARY@@', '\n'.join(summary))
    )

    local_resource(
        resource_name,
        cmd=cmd,
        cmd_bat=POWERSHELL + [golden_build_script()],
        env={'FLISK_GOLDEN_CONFIG': encode_json({
            'df': dockerfile_from_tiltfile,
            'root': context,
            'hash_label': GOLDEN_HASH_LABEL,
            'registry': GOLDEN_REGISTRY_DEFAULT,
            'images': images,
            'legacy': LEGACY_GOLDEN_IMAGES,
            'layers': [{'key': k, 'target': GOLDEN_LAYERS[k]['target'], 'ref': GOLDEN_LAYERS[k]['name'] + ':' + GOLDEN_LAYERS[k]['tag']} for k in GOLDEN_LAYERS],
        })},
        labels=['infra.docker', 'golden-layers'],
        deps=[dockerfile_from_tiltfile],
        allow_parallel=True,
        auto_init=True,
    )

    return resource_name
