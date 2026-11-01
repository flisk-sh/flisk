# Troubleshooting: Which layer broke my Docker build? (L1–L4 overview)

Flisk uses a four-tier layered Docker architecture (L1–L4) to make local image builds fast and cache-friendly across services. Instead of building every dependency and toolchain from scratch for each microservice, Flisk builds a set of shared **golden images** locally via Tilt (`golden-layers-build` local resource) and Docker Buildx. Every service's generated Dockerfile inherits from these golden layers.

When a Docker build fails during `flisk up` or service compilation, you need to identify quickly:
1. Did a shared golden layer fail to build?
2. Did an application service fail when compiling on top of a healthy golden layer?
3. Which specific layer (L1, L2, L3, or L4) caused the failure?

This guide maps each layer and variant to its source module, target stage, image tag, and actual identifying log messages.

---

## Golden Layers Reference (L1–L4)

The golden image hierarchy defines exactly 8 target images. These images are local-only and are tagged with your project name prefix (loaded from `.flisk/project.json`, falling back to `flisk-project`):

| Layer | Purpose | Source module | Image or target | Actual identifying log line |
|---|---|---|---|---|
| **L1** | Foundational Alpine OS and Bun runtime environment | [`layers/l1_base_layers.star`](../runtime/engine/topologies/platform/docker/layers/l1_base_layers.star) | Target: `l1_golden`<br/>Image: `<project>-l1:latest` | `target "l1"`<br/>`FROM oven/bun:1.3.11-alpine... AS l1_golden` |
| **L2** | Common dependencies, debugging utilities, and pre-warmed `/cache/bun` & `/cache/prisma` | [`layers/l2_dependency_layers.star`](../runtime/engine/topologies/platform/docker/layers/l2_dependency_layers.star) | Target: `l2_golden`<br/>Image: `<project>-l2:latest` | `target "l2"`<br/>`FROM l1_golden AS l2_golden`<br/>`RUN mkdir -p /cache/bun /cache/prisma` |
| **L3-backend** | Backend and migrator build tools (Prisma CLI; Infisical CLI omitted) | [`layers/l3_builder_layers.star`](../runtime/engine/topologies/platform/docker/layers/l3_builder_layers.star) | Target: `l3_backend_golden`<br/>Image: `<project>-l3-backend:latest` | `target "l3-backend"`<br/>`FROM l2_golden AS l3_backend_golden`<br/>`RUN bun add -g prisma@` |
| **L3-frontend** | Frontend build tools without database tooling | [`layers/l3_builder_layers.star`](../runtime/engine/topologies/platform/docker/layers/l3_builder_layers.star) | Target: `l3_frontend_golden`<br/>Image: `<project>-l3-frontend:latest` | `target "l3-frontend"`<br/>`FROM l2_golden AS l3_frontend_golden` |
| **L4-backend** | Lean backend production runtime using Bun with `--smol` GC options and HTTP health check | [`layers/l4_runtime_layers.star`](../runtime/engine/topologies/platform/docker/layers/l4_runtime_layers.star) | Target: `l4_backend_bun`<br/>Image: `<project>-l4-backend:latest` | `target "l4-backend"`<br/>`FROM l1_golden AS l4_backend_bun` |
| **L4-backend-node** | Lightweight alternative backend runtime using Node.js 22 Alpine | [`layers/l4_runtime_layers.star`](../runtime/engine/topologies/platform/docker/layers/l4_runtime_layers.star) | Target: `l4_backend_node`<br/>Image: `<project>-l4-backend-node:latest` | `target "l4-backend-node"`<br/>`FROM node:22-alpine... AS l4_backend_node` |
| **L4-frontend** | Minimal frontend static asset runtime using Nginx 1.27 Alpine | [`layers/l4_runtime_layers.star`](../runtime/engine/topologies/platform/docker/layers/l4_runtime_layers.star) | Target: `l4_frontend_golden`<br/>Image: `<project>-l4-frontend:latest` | `target "l4-frontend"`<br/>`FROM nginx:1.27-alpine... AS l4_frontend_golden` |
| **L4-migrator** | Database migration runner copying Prisma from L3-backend | [`layers/l4_runtime_layers.star`](../runtime/engine/topologies/platform/docker/layers/l4_runtime_layers.star) | Target: `l4_migrator_golden`<br/>Image: `<project>-l4-migrator:latest` | `target "l4-migrator"`<br/>`FROM l1_golden AS l4_migrator_golden`<br/>`COPY --from=l3_backend_golden /root/.bun/install/global` |

> [!NOTE]
> **Legacy layer note:** Older engines generated a separate `l3-migrator` image. Because it installed the identical Prisma package as `l3-backend`, `l3-migrator` is aliased directly to `l3-backend` in [`golden_image_constants.star`](../runtime/engine/topologies/platform/docker/build/golden_image_constants.star). Any stale `<project>-l3-migrator:latest` image is automatically untagged by `golden_image_build.star`:
> `🧹 Removed legacy golden image <project>-l3-migrator:latest`

---

## How to tell from a failed build which layer failed

When running `flisk up`, golden image building is managed by the Tilt resource **`golden-layers-build`** defined in [`golden_image_build.star`](../runtime/engine/topologies/platform/docker/build/golden_image_build.star).

### 1. Check Tilt status for `golden-layers-build`

If the `golden-layers-build` resource in Tilt is red, inspect its logs:
```bash
tilt logs golden-layers-build
```

#### Starting the build
When golden layers need building, the orchestrator prints:
```text
🏗️  Building golden layered images (8 total)...
  🧩 Building all golden targets with one docker buildx bake (independent stages run in parallel)
```

#### Up-to-date cache skip
If all images exist and their `flisk.golden.hash` matches the Dockerfile content hash:
```text
✅ Golden images are up to date (hash <64-char-sha256>) - skipping build
```

#### Build failure in Buildx bake
BuildKit builds independent targets in parallel. When a target fails, Docker Buildx logs:
```text
ERROR: target <target>: failed to solve: <underlying error>
```
For example:
```text
ERROR: target l4-backend: failed to solve: apk add did not complete successfully
```
Flisk automatically retries transient registry or network errors up to 3 times:
```text
  ⚠️  docker buildx bake failed (attempt 1 of 3, often a registry or package mirror hiccup) - retrying in 10s
```
If all attempts fail:
```text
❌ Golden layers build failed after 3 attempts (see the first error above)
```

#### Missing images validation
Even if the build command returned exit code 0, Flisk inspects Docker storage for all 8 images. If any image is absent:
```text
❌ Golden images missing after the build: <project>-<missing-image>:latest
```

#### Successful build completion
When all 8 images exist and are properly tagged:
```text
✅ Golden layers built (8 images):
  ✓ <project>-l1:latest
  ✓ <project>-l2:latest
  ✓ <project>-l3-backend:latest
  ✓ <project>-l3-frontend:latest
  ✓ <project>-l4-backend:latest
  ✓ <project>-l4-backend-node:latest
  ✓ <project>-l4-frontend:latest
  ✓ <project>-l4-migrator:latest
```

---

### 2. Service build failure: `pull access denied`

If a service container in Tilt turns red with:
```text
ERROR: failed to build: failed to solve: <project>-l1:latest: failed to resolve source metadata for docker.io/library/<project>-l1:latest: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed
```
Or in the Tilt web UI:
```text
pull access denied for docker.io/library/<project>-l*:latest
```

**Cause:**
Flisk's golden layers are **local-only images** built on your machine; they are never pushed to Docker Hub. If Docker tries to pull `<project>-l*` from Docker Hub, it means:
1. The `golden-layers-build` resource has not completed yet or failed.
2. Local images were removed by a Docker cleanup command (e.g. `docker system prune` or `docker rmi`).
3. The project name prefix in `.flisk/project.json` was renamed, but local images still bear the old name.

---

## How to rebuild golden layers and confirm local images

### 1. Verify existing images
To check which golden layer images currently exist in your local Docker daemon, run:
```bash
docker image ls "*l1*" "*l2*" "*l3*" "*l4*"
```
Or filter by your project's prefix:
```bash
docker image ls "<project>-l*"
```
Expected output when healthy:
```text
REPOSITORY                    TAG       IMAGE ID       CREATED          SIZE
flisk-project-l1              latest    a1b2c3d4e5f6   10 minutes ago   180MB
flisk-project-l2              latest    b2c3d4e5f6a1   10 minutes ago   210MB
flisk-project-l3-backend      latest    c3d4e5f6a1b2   10 minutes ago   290MB
flisk-project-l3-frontend     latest    d4e5f6a1b2c3   10 minutes ago   220MB
flisk-project-l4-backend      latest    e5f6a1b2c3d4   10 minutes ago   195MB
flisk-project-l4-backend-node latest    f6a1b2c3d4e5   10 minutes ago   175MB
flisk-project-l4-frontend     latest    a2b3c4d5e6f7   10 minutes ago    45MB
flisk-project-l4-migrator     latest    b3c4d5e6f7a8   10 minutes ago   295MB
```

### 2. Force rebuild via Flisk (Recommended)
Set `FLISK_GOLDEN_REBUILD=1` when running `flisk up`:
```bash
FLISK_GOLDEN_REBUILD=1 flisk up
```
This forces the `golden-layers-build` Tilt resource to bypass image hash checks and run a fresh `docker buildx bake`.

### 3. Trigger rebuild in Tilt
If `flisk up` is already running:
1. Open the Tilt web UI (`http://localhost:10350` or the port printed by `flisk up`).
2. Locate the **`golden-layers-build`** resource under the `infra.docker` group.
3. Click the manual reload / trigger icon (↻).
4. Once `golden-layers-build` turns green, click reload on any failed service resources.

### 4. Diagnostic isolated build
To test whether the multi-stage Dockerfile builds cleanly without running Tilt:
```bash
docker buildx bake -f .flisk/.flisk-out/golden-layers.bake.hcl --load
```
Or test an individual stage directly:
```bash
docker build -f .flisk/.flisk-out/golden-layers.Dockerfile --target l1_golden -t <project>-l1:latest .
```
*(Note: Manual diagnostic builds do not update the `flisk.golden.hash` label used by Tilt. Use Method 2 or 3 to restore normal orchestrator state.)*

---

## Detailed Layer Guides

For specific failure modes, reproduction cases, and step-by-step remedies for individual layers, refer to:

- **[Troubleshoot L1 (base image)](troubleshoot-l1.md):** Base Alpine OS, Bun installation, upstream network timeouts, rate limits, and package repository mirrors.
- **[Troubleshoot L2 (dependency layer)](troubleshoot-l2.md):** Manifest invalidation, cache mounts (`/cache/bun`), missing native build toolchains (`node-gyp`), and `CACHE_BUSTER` behavior.
- **Troubleshoot L3 (builder layer):** TypeScript backend compilation failures, frontend asset bundling, and Prisma client generation (tracking issue [#915](https://github.com/flisk-sh/flisk/issues/915)).
- **Troubleshoot L4 (runtime layer):** Non-root user permissions, port binding discrepancies (ports 3000/4000), static file serving paths in Nginx, and healthcheck probes (tracking issue [#916](https://github.com/flisk-sh/flisk/issues/916)).

---

## Related documentation

- [Troubleshooting overview](troubleshooting.md): General troubleshooting for Flisk and Tilt error messages.
- [Docker Platform Infrastructure (`AGENTS.md`)](../runtime/engine/topologies/platform/docker/AGENTS.md): Architectural specification of Dockerfile generators and layer builders.
- [Golden Image Integration (`GOLDEN_IMAGE_INTEGRATION.md`)](../runtime/engine/docs/GOLDEN_IMAGE_INTEGRATION.md): Integration guide for the golden image pipeline.
