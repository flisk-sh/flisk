# Golden Image Integration Guide

## Overview

The golden image workflow builds the heavy, rarely changing parts of every service image once, as a set of local base images, so a service build only adds its own code. The images are named `<project>-l1` to `<project>-l4-*` after the `project.name` in `.tdk/project.json` (`tdk-project` when there is none). For measured build times, see [Warm starts and build speed](#warm-starts-and-build-speed-local-development-only).

## Architecture Integration

### 1. Provider Layer (`engine/topologies/platform/docker/`)

**Files**: `engine/topologies/platform/docker/build/golden_image.star` (the public struct), with `golden_image_constants.star` (layer names), `golden_image_dockerfile.star` (Dockerfile text) and `golden_image_build.star` (the Tilt build).

```starlark
GoldenImage = struct(
    build = build_golden_layers,            # registers the golden-layers-build resource
    get_layer = get_layer_reference,        # e.g. get_layer('l2') -> '<project>-l2:latest'
    l1 = lambda: get_layer_reference('l1'), # also l2, l3_backend, l3_frontend, l3_migrator,
                                            # l4_backend, l4_frontend, l4_migrator
    layers = GOLDEN_LAYERS,
    prefix = GOLDEN_IMAGE_PREFIX,
    generate_dockerfile = generate_golden_dockerfile,
)
```

**Exported via**: `engine/topologies/platform/docker/index.star`
```starlark
Docker = struct(
    # ... existing functions
    golden_image = GoldenImage,
)
```

### 2. Infrastructure Layer (`engine/topologies/tilt/resources/infra-loader.star`)

The golden images are treated as **infrastructure**: they are built before the other infrastructure and before any service:

```starlark
def load_all_infrastructure(should_enable, fix_docker_networks_fn=None, docker_provider=None, write_fn=None, project_root=None, env_file=None):
    # Initialize networks first
    ...
    # Build golden image before other infrastructure (if enabled)
    golden_image_resource = None
    if docker_provider and write_fn:
        _generate_golden_dockerfile(should_enable, docker_provider, write_fn)
        golden_image_resource = _load_golden_image(should_enable, docker_provider, project_root=project_root or '.')
    ...
    return golden_image_resource
```

**Key Functions**:
- `_load_golden_image()` - returns `GoldenImage.build(...)`, which creates the `golden-layers-build` `local_resource`; returns `None` when `golden-image` is off
- `_generate_golden_dockerfile()` - writes `.tdk/.tdk-out/golden-layers.Dockerfile` (through `write_file_if_changed`, so the file is only touched when its content changes)

### 3. Orchestrator Integration (`engine/topologies/tilt/resources/orchestrator/`)

Services and migrators depend on the golden resource. The helper in `apply_compose_resource_registration.star` collects the infrastructure dependencies of an app resource:

```starlark
    if should_enable('golden-image') and ctx.get('golden_image_resource'):
        infra_deps.append(ctx['golden_image_resource'])
    return infra_deps
```

`apply_migrator_orchestration.star` adds the same resource to each migrator's dependencies (`migrator_db_deps`). This makes the golden images build before any service Dockerfile is processed.

### 4. Layer Generator (`engine/topologies/platform/docker/layers/l1_base_layers.star`)

The L1 layer of a service Dockerfile starts from the golden L1 image when `use_golden` is true:

```starlark
GOLDEN_L1_IMAGE = GLOBAL_CONFIG['docker'].get('golden_l1_image', _GOLDEN_PREFIX + '-l1:latest')

def L1_generate_os_base(base_image = None, maintainer = None, use_golden = True):
    if base_image == None:
        base_image = GOLDEN_L1_IMAGE if use_golden else ALPINE_BASE   # ALPINE_BASE = "alpine:3.22"

    # If using golden L1 image, skip dependency installation (already in base)
    if base_image == GOLDEN_L1_IMAGE or _GOLDEN_PREFIX + "-l1" in base_image:
        return (
            "# ---- L1: os_base (Golden L1: " + base_image + ") ----\n"
            + "FROM " + base_image + " AS l1_os_base\n"
            + ...
        )

    # Standard base with dependency installation
    ...
```

`maintainer` defaults to `None`, which becomes the project name. The other layers take the same `use_golden` parameter: `L2_generate_dependency_manifest`, the L3 builders and `L4_generate_backend_runtime` / `L4_generate_frontend_runtime` (in `layers/`), and `L4_generate_orchestrator` (in `engine/topologies/platform/docker/generators/golden_docker_generator_v2.star`), which calls all of them.

### 5. Configuration

The feature is named `golden-image` and is **enabled by default** (`enabled_by_default: true` in `cli/src/utils/project-features.ts`). In `.tdk/project.json` it is the `optional_infra.golden_image` flag:

```json
{
  "optional_infra": {
    "monitoring": false,
    "elk": false,
    "debezium": false,
    "golden_image": true,
    "verdaccio": false
  }
}
```

Verdaccio is Premium and off by default; it requires `TDK_LICENSE_KEY` (see `project-features.ts`).

### 6. Tiltfile Integration

The generated Tiltfile (`cli/templates/Tiltfile.hbs`) passes the Docker provider and the file writer to the infrastructure loader, and stores the result for the orchestrator:

```starlark
GOLDEN_IMAGE_RESOURCE = Infra.load_all(
    should_enable=should_enable,
    fix_docker_networks_fn=Utils.fix_docker_networks,
    docker_provider=Docker,                       # provides Docker.golden_image
    write_fn=Utils.write_file_if_changed,
    project_root=PROJECT_ROOT,
)

# Later, in the context handed to the orchestrator:
#     'golden_image_resource': GOLDEN_IMAGE_RESOURCE,
```

## Resource Dependencies Graph

```
init-networks
    ↓
golden-layers-build (local_resource)
    ↓
service-backend-1, service-backend-2, ... (applications and migrators)
```

`golden-layers-build` does not wait for `init-networks`; it is built next to the other infrastructure (Postgres, Traefik, ...), and each service lists it in its `resource_deps`.

## How It Works

### Build Process

1. **Tilt Startup**:
   - `Infra.load_all()` is called
   - `_generate_golden_dockerfile()` writes `.tdk/.tdk-out/golden-layers.Dockerfile`
   - `_load_golden_image()` registers a `local_resource` named `golden-layers-build`

2. **Golden Image Build**:
   - Resource: `golden-layers-build`
   - Labels: `['infra.docker', 'golden-layers']`
   - Trigger: when Tilt starts, and when `.tdk/.tdk-out/golden-layers.Dockerfile` changes (`deps=[...]`)
   - Command: one `docker buildx bake` for all targets, or one `docker build --target <target>` per image when buildx is missing (see [Warm starts](#warm-starts-and-build-speed-local-development-only))
   - Result: eight local images, one per layer in `GOLDEN_LAYERS`: `<project>-l1`, `-l2`, `-l3-backend`, `-l3-frontend`, `-l4-backend`, `-l4-backend-node`, `-l4-frontend` and `-l4-migrator`, all tagged `:latest`

3. **Service Builds**:
   - Services and migrators declare `resource_deps` on `golden-layers-build` (added automatically through `infra_deps`)
   - Their generated Dockerfile (`.autogenerated/Dockerfile.app.autogenerated`, or `Dockerfile.migrator.autogenerated`) starts with `FROM <project>-l1:latest AS l1_os_base`
   - Only the service-specific layers rebuild; the dependencies are already in the base images

## Usage

### Enable/Disable

**Via CLI** (writes `optional_infra.golden_image` in `.tdk/project.json`):
```bash
tdk config disable-infra golden_image
tdk config regenerate
```

Use `enable-infra` to turn it back on. The setting is for the whole project, not per service.

**Focus mode**: `golden-layers-build` is one of the infrastructure resources kept enabled in focus mode (`_ALWAYS_ENABLED_INFRA_RESOURCES` in the Tiltfile), so `tdk up --only <service>` still builds the golden images.

### Rebuild Golden Image

**Trigger in Tilt UI**:
1. Find `golden-layers-build` resource in left sidebar
2. Click resource name
3. Click "Trigger Update" button

An unchanged Dockerfile skips the build; to force it, set `TDK_GOLDEN_REBUILD=1` (see below).

**CLI**, one image (here L1) from the project root:
```bash
docker build -f .tdk/.tdk-out/golden-layers.Dockerfile --target l1_golden -t <project>-l1:latest .
```

**Automatic Rebuild**:
- Triggered when `.tdk/.tdk-out/golden-layers.Dockerfile` changes
- Tilt watches this file via `deps=[dockerfile_from_tiltfile]`

### Customize Golden Image

The Dockerfile is generated, so edits to it are lost the next time Tilt starts.

**To change what goes into the images** (permanent):
```bash
vim engine/topologies/platform/docker/build/golden_image_dockerfile.star
# Edit generate_golden_dockerfile()
# Restart Tilt to regenerate .tdk/.tdk-out/golden-layers.Dockerfile
```

## Warm starts and build speed (local development only)

These settings change how `tdk up` builds images on your machine. They do not change the images that run, and they do not generate Kubernetes manifests.

- **Golden images are skipped when unchanged.** Each golden image carries a `tdk.golden.hash` label, the hash of the generated golden Dockerfile. When every golden tag exists with the current hash, `golden-layers-build` exits with "Golden images are up to date" and builds nothing.
- **Force a golden rebuild** with `TDK_GOLDEN_REBUILD=1 tdk up ...`.
- **Golden targets build in one `docker buildx bake`** (with `--load`). The filesystem entitlement is passed only on Buildx 0.19 or later. Without buildx, each target is built with `docker build`, labelled with the same hash.
- **Parallel image builds** come from the Docker engine: Tilt's `max_parallel_updates` is set from the engine's CPU count (minus two) and memory (about 1.5 GiB per build), with a minimum of 3 and a maximum of 8. Set `TDK_MAX_PARALLEL_BUILDS=<n>` to choose the value. If `docker info` cannot be read, Tilt's default applies and the Tilt log says why.
- **Frontend type-checks run outside the image.** A frontend whose build script is `tsc --noEmit && vite build` builds with `bunx vite build` inside the image, and a non-blocking `<service>-typecheck` resource runs `tsc --noEmit` on the host. The resource needs the service's dependencies installed (`bun install`); without them it says so. A plain `tsc` (which emits output) and a custom Vite config keep the script's own build.
- **Measure a start** with `node scripts/benchmark/tilt-build-durations.mjs --port <tilt port>`, which prints each resource's latest build time.

**Measured on `tdk-restaurant-example`** (macOS 26.5.2, arm64, 8 CPUs; tdk 1.3.144): a cold start (all project images and build cache removed) takes 281 seconds to all eight containers healthy. Warm starts take 38 to 50 seconds to healthy, and the golden base build is skipped in about 2 seconds instead of rebuilding for 2 minutes. Full tables, the chart and the raw data are in [`benchmarks/results/tdk-up-warm-start-2026-10-11`](../../benchmarks/results/tdk-up-warm-start-2026-10-11/README.md). To measure your own project, see [`scripts/benchmark/README.md`](../../scripts/benchmark/README.md#tdk-up-warm-start-benchmark).

## File Structure

Generated in your project:

```
<project>/
├── .tdk/
│   ├── project.json                         # optional_infra.golden_image
│   └── .tdk-out/
│       ├── Tiltfile                         # Generated from cli/templates/Tiltfile.hbs
│       └── golden-layers.Dockerfile         # Generated base images (all layers)
```

Source in this repository:

```
engine/topologies/
├── platform/docker/
│   ├── build/
│   │   ├── golden_image.star                # GoldenImage struct (public API)
│   │   ├── golden_image_constants.star      # GOLDEN_LAYERS, image names
│   │   ├── golden_image_dockerfile.star     # Dockerfile text
│   │   └── golden_image_build.star          # golden-layers-build resource
│   ├── index.star                           # Exports GoldenImage
│   ├── generators/
│   │   └── golden_docker_generator_v2.star  # L4_generate_orchestrator
│   └── layers/
│       ├── l1_base_layers.star              # L1_generate_os_base (use_golden)
│       ├── l2_dependency_layers.star
│       ├── l3_builder_layers.star
│       └── l4_runtime_layers.star
└── tilt/resources/
    ├── infra-loader.star                    # Builds golden images
    └── orchestrator/                        # Adds resource deps
        ├── apply_compose_resource_registration.star
        └── apply_migrator_orchestration.star
```

## Troubleshooting

### Golden Image Not Building

**Symptoms**: Services fail with "pull access denied" or "image not found" for `<project>-l1:latest` (or another golden image)

**Diagnosis**:
```bash
docker image inspect <project>-l1:latest
```

**Fix**: trigger `golden-layers-build` in the Tilt UI, or build one image by hand:
```bash
docker build -f .tdk/.tdk-out/golden-layers.Dockerfile --target l1_golden -t <project>-l1:latest .
```
See [troubleshoot-l1.md](../../docs/troubleshoot-l1.md) for the L1 failures.

### Services Not Using Golden Image

**Symptoms**: Service builds still install every dependency

**Check Generated Dockerfiles**:
```bash
grep -rn "AS l1_os_base" services --include='Dockerfile.*.autogenerated'
```

**Expected Output** (the project name replaces `<project>`):
```
FROM <project>-l1:latest AS l1_os_base
```

**If it says `FROM alpine:3.22 AS l1_os_base`**: the golden image is off. Check `optional_infra.golden_image` in `.tdk/project.json`, or look at the `use_golden` argument that reached `L1_generate_os_base`.

### Golden Image Resource Missing

**Symptoms**: `ctx.get('golden_image_resource')` returns None

**Check**:
1. Verify `optional_infra.golden_image` is `true` in `.tdk/project.json`
2. Check the Tiltfile stores `GOLDEN_IMAGE_RESOURCE` in `TILT_CONTEXT` (`'golden_image_resource': GOLDEN_IMAGE_RESOURCE`)
3. Restart Tilt

## Testing

The golden layers are covered by `tests/tilt-engine/test_golden_layers.py` and `cli/src/generator/__tests__/golden-generated-output.test.ts`:

```bash
make test-tilt-engine                                   # needs the tests/tilt-engine Python environment
cd cli && npx vitest run src/generator/__tests__/golden-generated-output.test.ts
```

## Disabling the Golden Image

There is no per-service switch: `service.json` has no golden image field. The golden image is turned off for the whole project (see [Enable/Disable](#enabledisable)). The `use_golden` parameter of the layer generators is how that setting reaches each Dockerfile:

```starlark
# engine/topologies/platform/docker/generators/golden_docker_generator_v2.star
def L4_generate_orchestrator(res_path, res_type = 'backend', resource_name = 'service', ..., use_golden = True, manifest = None):
    parts.append(L1_generate_os_base(use_golden=use_golden))
    ...
```

## Local Images and Runtime Compatibility

The golden images are local-only and work with any local Docker engine (Docker Desktop, OrbStack, Colima, etc.):

- No registry push or pull is needed for the golden images: they are built and loaded into the local Docker engine
- Images stay in the local engine cache (OrbStack, Docker Desktop, or Colima)
- Fast layer sharing between services of the same project
- Resource-efficient: the heavy base layers are shared rather than rebuilt per service

**Does NOT require**:
- An external Docker registry
- Image push/pull credentials
- Network bandwidth for the base images after the first successful build

OrbStack users in particular benefit from its fast local cache and layer sharing on macOS. See [OrbStack features](https://orbstack.dev/features) for details on its Docker compatibility.

## Next Steps

1. **Extend Golden Image**: Add more common dependencies (e.g., PostgreSQL client, Redis tools)
2. **Version Golden Image**: Tag with version numbers for reproducibility
3. **Multi-Architecture**: Support ARM64 and AMD64 variants
4. **Layer Optimization**: Further reduce golden image size

## References

- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Tilt Local Resources](https://docs.tilt.dev/local_resource.html)
- [OrbStack](https://orbstack.dev/)
