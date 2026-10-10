# Golden Image Integration Guide

## Overview

The TDK Landscape monorepo now includes a **Golden Image** workflow that significantly reduces service build times from 60+ seconds to **<5 seconds** by pre-building heavy dependencies into a base Docker image.

## Architecture Integration

### 1. Provider Layer (`.tilt/providers/docker/`)

**File**: `.tilt/providers/docker/golden-image.star`

The golden image provider follows the established Tilt SDK pattern:

```starlark
GoldenImage = struct(
    build = _build_golden_image,              # Builds the base image
    check_exists = _check_golden_image_exists, # Validates existence
    get_reference = _get_golden_image_reference, # Returns image name
    generate_dockerfile = _generate_golden_dockerfile # Generates Dockerfile
)
```

**Exported via**: `.tilt/providers/docker/index.star`
```starlark
Docker = struct(
    # ... existing functions
    golden_image = GoldenImage,
)
```

### 2. Infrastructure Layer (`.tilt/provisioner/infra-loader.star`)

The golden image is treated as **infrastructure**, building before application services:

```starlark
def load_all_infrastructure(should_enable, fix_docker_networks_fn, docker_provider, write_file_fn):
    # Initialize networks first
    _init_networks(fix_docker_networks_fn)
    
    # Build golden image before other infrastructure
    _generate_golden_dockerfile(should_enable, docker_provider, write_file_fn)
    golden_image_resource = _load_golden_image(should_enable, docker_provider)
    
    # Load other infrastructure (database, verdaccio, etc.)
    ...
    
    return golden_image_resource
```

**Key Functions**:
- `_load_golden_image()` - Creates `local_resource` for building the image
- `_generate_golden_dockerfile()` - Auto-generates `docker/golden.Dockerfile` if missing

### 3. Orchestrator Integration (`.tilt/provisioner/orchestrator/apply.star`)

Services automatically depend on the golden image:

```starlark
# Infrastructure dependencies
infra_deps = []
if should_enable('database-management'):
    infra_deps.extend(['postgres', 'provision-db-' + s_name])
if should_enable('verdaccio'):
    infra_deps.append('verdaccio')
if should_enable('golden-image') and ctx.get('golden_image_resource'):
    infra_deps.append(ctx['golden_image_resource'])  # ← Added
```

This ensures the golden image builds before any service Dockerfiles are processed.

### 4. Layer Generator Updates (`.tilt/providers/docker/layers/l1_base_layers.star`)

The L1 base layer now intelligently uses the golden image:

```starlark
GOLDEN_IMAGE = "TDK Landscape-base:latest"

def L1_generate_os_base(base_image = None, maintainer = "TDK Landscape", use_golden = True):
    if base_image == None:
        base_image = GOLDEN_IMAGE if use_golden else ALPINE_BASE
    
    # If using golden image, skip dependency installation
    if base_image == GOLDEN_IMAGE or "TDK Landscape-base" in base_image:
        return (
            "FROM " + base_image + " AS l1_os_base\n"
            + "# Dependencies pre-installed in golden image\n"
            + "WORKDIR /app\n"
        )
    
    # Standard base with full dependency installation
    ...
```

### 5. Configuration (`.tilt/core/registry/config.star`)

Golden image is **enabled by default**. Verdaccio is Premium and off by
default - it requires TDK_LICENSE_KEY (see project-features.ts):

```starlark
DEFAULTS = {
    # Infrastructure defaults
    'database-management': True,
    'proxy': True,
    'verdaccio': False,  # Premium - requires TDK_LICENSE_KEY
    'golden-image': True,  # ← Added
    ...
}
```

### 6. Tiltfile Integration

The main Tiltfile passes required context:

```starlark
# Infrastructure loading with golden image support
GOLDEN_IMAGE_RESOURCE = Infra.load_all(
    should_enable, 
    Utils.fix_docker_networks,
    Docker,                      # ← Docker provider
    Utils.write_file_if_changed  # ← File writer
)

# Store in context for orchestrator
if GOLDEN_IMAGE_RESOURCE:
    TILT_CONTEXT['golden_image_resource'] = GOLDEN_IMAGE_RESOURCE
```

## Resource Dependencies Graph

```
init-networks
    ↓
golden-image-build (local_resource)
    ↓
database, verdaccio, ... (infrastructure)
    ↓
service-backend-1, service-backend-2, ... (applications)
```

## How It Works

### Build Process

1. **Tilt Startup**:
   - `Infra.load_all()` is called
   - `_generate_golden_dockerfile()` creates `docker/golden.Dockerfile` if missing
   - `_load_golden_image()` registers a `local_resource` named `golden-image-build`

2. **Golden Image Build**:
   - Resource: `golden-image-build`
   - Labels: `['infra.docker', 'golden-image']`
   - Trigger: Manual or when `docker/golden.Dockerfile` changes
   - Command: `docker build -f docker/golden.Dockerfile -t TDK Landscape-base:latest .`

3. **Service Builds**:
   - Services declare `resource_deps=['golden-image-build']` (added automatically via `infra_deps`)
   - Service Dockerfiles generate with `FROM TDK Landscape-base:latest AS l1_os_base`
   - Only service-specific layers rebuild (dependencies already in base)

### Performance Impact

**Before (without golden image)**:
- Each service: ~60-90 seconds
- Total for 5 services: ~5-7 minutes
- Includes: Alpine base download, Bun installation, Prisma CLI, system deps

**After (with golden image)**:
- Golden image: ~45 seconds (one-time)
- Each service: ~3-5 seconds
- Total for 5 services: ~1 minute
- Includes: Only service-specific code and dependencies

**Savings**: ~80% reduction in total build time

## Usage

### Enable/Disable

**Via .env**:
```bash
# Not needed - controlled via DEFAULTS
```

**Via CLI**:
```bash
tilt up -- --golden-image=false  # Disable
```

**Via Focus Mode**:
```bash
tilt up -- --focus user          # Golden image auto-enabled (in ALWAYS_ENABLED_INFRA)
```

### Rebuild Golden Image

**Trigger in Tilt UI**:
1. Find `golden-image-build` resource in left sidebar
2. Click resource name
3. Click "Trigger Update" button

**CLI**:
```bash
docker build -f docker/golden.Dockerfile -t TDK Landscape-base:latest .
```

**Automatic Rebuild**:
- Triggered when `docker/golden.Dockerfile` changes
- Tilt watches this file via `deps=[GOLDEN_DOCKERFILE]`

### Customize Golden Image

**Option 1: Edit Generated File** (temporary):
```bash
vim docker/golden.Dockerfile
# Trigger rebuild in Tilt
```

**Option 2: Update Generator** (permanent):
```bash
vim .tilt/providers/docker/golden-image.star
# Edit _generate_golden_dockerfile() function
# Delete docker/golden.Dockerfile
# Restart Tilt to regenerate
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

```
tdk/
├── docker/
│   ├── golden.Dockerfile          # Auto-generated base image
│   └── README.md                   # Usage guide
├── .tilt/
│   ├── providers/
│   │   └── docker/
│   │       ├── golden-image.star  # Provider implementation
│   │       ├── index.star         # Exports GoldenImage
│   │       └── layers/
│   │           └── l1_base_layers.star  # Uses golden image
│   ├── lifecycle/
│   │   ├── infra-loader.star      # Builds golden image
│   │   └── orchestrator/
│   │       └── apply.star         # Adds resource deps
│   └── core/
│       └── registry/
│           └── config.star        # DEFAULTS configuration
└── Tiltfile                        # Main integration
```

## Troubleshooting

### Golden Image Not Building

**Symptoms**: Services fail with "image not found: TDK Landscape-base:latest"

**Diagnosis**:
```bash
docker image inspect TDK Landscape-base:latest
```

**Fix**:
```bash
docker build -f docker/golden.Dockerfile -t TDK Landscape-base:latest .
```

### Services Not Using Golden Image

**Symptoms**: Service builds still take 60+ seconds

**Check Generated Dockerfiles**:
```bash
grep "FROM TDK Landscape-base" services/*/*/*/Dockerfile.app.autogenerated
```

**Expected Output**:
```
FROM TDK Landscape-base:latest AS l1_os_base
```

**If Missing**: L1 layer not using golden image - check `use_golden` parameter

### Golden Image Resource Missing

**Symptoms**: `ctx.get('golden_image_resource')` returns None

**Check**:
1. Verify `'golden-image': True` in DEFAULTS
2. Check Tiltfile stores `GOLDEN_IMAGE_RESOURCE` in `TILT_CONTEXT`
3. Restart Tilt

## Testing

Run integration tests:
```bash
./test-golden-image.sh
```

**Tests**:
1. ✅ Provider files exist
2. ✅ DEFAULTS configuration
3. ✅ Docker provider exports GoldenImage
4. ✅ Infrastructure loader integrates golden image
5. ✅ Tiltfile passes Docker provider
6. ✅ L1 layer supports golden image

## Advanced: Disabling Per-Service

To opt-out a specific service from using the golden image:

**In `golden_docker_generator_v2.star`**:
```starlark
def L4_generate_orchestrator(res_path, use_golden_image = True, ...):
    parts.append(L1_generate_os_base(use_golden=use_golden_image))
    ...
```

**In service manifest** (`.tilt/service.manifest.json`):
```json
{
  "useGoldenImage": false
}
```

## OrbStack Compatibility

The golden image is optimized for **OrbStack**:
- No registry push/pull needed
- Images stored in local OrbStack cache
- Fast layer sharing between services
- Resource-efficient (single base image shared)

**Does NOT require**:
- External Docker registry
- Image push/pull credentials
- Network bandwidth for base image

## Next Steps

1. **Extend Golden Image**: Add more common dependencies (e.g., PostgreSQL client, Redis tools)
2. **Version Golden Image**: Tag with version numbers for reproducibility
3. **Multi-Architecture**: Support ARM64 and AMD64 variants
4. **Layer Optimization**: Further reduce golden image size

## References

- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Tilt Local Resources](https://docs.tilt.dev/local_resource.html)
- [OrbStack Performance](https://orbstack.dev/features)
