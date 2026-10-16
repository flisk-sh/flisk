# =============================================================================
# 🏗️ TILT SDK - GOLDEN IMAGE DOCKERFILE GENERATOR
# =============================================================================

load('../../../tilt/common/utils.star', 'Utils')
load('../config/healthcheck.star', 'DOCKER_HEALTHCHECK', 'dockerfile_healthcheck_flags')


# Load project name for dynamic naming
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

_GOLDEN_PREFIX = _load_golden_prefix()

def generate_golden_dockerfile():
    """Generate the multi-stage golden-layers.Dockerfile."""
    prefix = _GOLDEN_PREFIX
    header = Utils.get_template_header(
        'dockerfile',
        'GoldenImage.generate_layered_dockerfile()',
        prefix + '-l1-l4',
        'GOLDEN LAYERED IMAGES | L1-L4 Pre-built Layers',
    )

    return header + """
# =============================================================================
# 🏗️ GOLDEN LAYERED IMAGES - Multi-Stage Base Images
# =============================================================================
# This Dockerfile builds 8 golden images:
#   - """ + prefix + """-l1:latest - OS base + Bun runtime
#   - """ + prefix + """-l2:latest - Dependencies installed
#   - """ + prefix + """-l3-backend:latest - Backend and migrator build tools (Prisma, no Infisical CLI)
#   - """ + prefix + """-l3-frontend:latest - Frontend build tools (no Prisma)
#   - """ + prefix + """-l4-backend:latest - Backend production runtime (Bun)
#   - """ + prefix + """-l4-backend-node:latest - Backend production runtime (Node.js)
#   - """ + prefix + """-l4-frontend:latest - Frontend production runtime (Nginx)
#   - """ + prefix + """-l4-migrator:latest - Migrator production runtime
#
# Migrators build on l3-backend: a separate l3-migrator stage installed the same Prisma
# and produced identical layers under a second image name.
#
# Services use these as base images to skip heavy dependency installation.
#
# ⚠️ SKIP_INFISICAL_SETUP Support:
#   All generated Dockerfiles support --build-arg SKIP_INFISICAL_SETUP=1
#   to bypass Infisical CLI installation (avoids Cloudsmith CDN hangs).
#   When SKIP_INFISICAL_SETUP=1, secrets are read from env vars only.
#   See: engine/topologies/platform/docker/layers/l3_builder_layers.star
# =============================================================================

# =============================================================================
# L1: OS BASE + RUNTIME ENVIRONMENT
# =============================================================================
FROM oven/bun:1.3.11-alpine@sha256:7ed9f74c326d1c260abe247ac423ccbf5ac92af62bb442d515d1f92f21e8ea9b AS l1_golden

LABEL layer="l1" \
      description="OS base with runtime environment" \
      maintainer="{prefix}"

# System dependencies for all services
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl \
    bash \
    openssl

# Create app user/group for security
RUN addgroup -S app && adduser -S app -G app

# Runtime environment
ENV NODE_ENV=development \
    BUN_INSTALL_CACHE_DIR=/cache/bun

WORKDIR /app


# =============================================================================
# L2: DEPENDENCY RESOLVER
# =============================================================================
FROM l1_golden AS l2_golden

LABEL layer="l2" \
      description="Base with common dependencies installed" \
      maintainer="{prefix}"

# Install minimal debugging tools (removed: vim, python3, make, g++ = -67MB)
RUN apk add --no-cache \
    curl \
    netcat-openbsd \
    jq \
    bind-tools

# Pre-create cache directories
RUN mkdir -p /cache/bun /cache/prisma

# Bun is already installed in base image
RUN echo "Bun version: $(bun --version)"


# =============================================================================
# L3-BACKEND: BACKEND BUILD TOOLS (PRISMA)
# =============================================================================
FROM l2_golden AS l3_backend_golden

LABEL layer="l3-backend" \
      description="Backend build tools with Prisma" \
      maintainer="{prefix}"

# Install Prisma CLI globally (pinned for deterministic builds)
RUN bun add -g prisma@7.5.0 @prisma/client@7.5.0

# Verify Prisma installation
RUN echo "Prisma version: $(bunx prisma --version | head -1)"

# ⚠️ CRITICAL: Infisical CLI is NOT installed in golden L3 images
# Reason: curl to dl.cloudsmith.io hangs during Docker builds when CDN is slow
# Solution: Use SKIP_INFISICAL_SETUP=1 build arg or runtime env var injection
# Services read secrets from environment variables at runtime (no CLI needed)
# See: .tilt/topologies/platform/docker/layers/l3_builder_layers.star


# =============================================================================
# L3-FRONTEND: FRONTEND BUILD TOOLS (NO PRISMA)
# =============================================================================
FROM l2_golden AS l3_frontend_golden

LABEL layer="l3-frontend" \
      description="Frontend build tools without Prisma" \
      maintainer="{prefix}"

# Frontend doesn't need Prisma, just verify Bun
RUN echo "Bun version: $(bun --version)"


# =============================================================================
# L4-BACKEND-BUN: BACKEND PRODUCTION RUNTIME (BUN)
# =============================================================================
FROM l1_golden AS l4_backend_bun

LABEL layer="l4-backend-bun" \
      description="Backend production runtime (Bun)" \
      maintainer="{prefix}"

ENV NODE_ENV=production
# Smaller heap growth and more frequent GC: idle services dominate a 100-service landscape.
ENV BUN_OPTIONS=--smol

# Service-specific tooling (e.g. hugo) is installed per service by the L4 runtime
# layer when the manifest lists it in featuresEnabled - not here for every backend.

# ⚠️ Infisical CLI is NOT installed in golden L4 images
# Services use TypeScript SDK (fetch API) or read from env vars - no CLI needed
# The entrypoint.sh gracefully handles missing CLI (falls back to env vars)
# Build with --build-arg SKIP_INFISICAL_SETUP=1 to skip CLI installation

USER bun

# Backend-specific healthcheck: probes the service over HTTP. The image is shared by every backend,
# so the port and path come from the container env (PORT is set by compose, TDK_HEALTH_PATH is optional).
HEALTHCHECK {hc_flags} \
  CMD bun -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.TDK_HEALTH_PATH||'/health')).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" || exit 1

WORKDIR /app


# =============================================================================
# L4-BACKEND-NODE: BACKEND PRODUCTION RUNTIME (NODE.JS - LIGHTWEIGHT!)
# =============================================================================
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS l4_backend_node

LABEL layer="l4-backend-node" \
      description="Backend production runtime (Node.js - lightweight)" \
      maintainer="{prefix}"

ENV NODE_ENV=production

# Minimal runtime dependencies
RUN apk add --no-cache ca-certificates tzdata curl

# Create app user for security
RUN addgroup -S app && adduser -S app -G app

# ⚠️ Infisical CLI is NOT installed in golden L4 images
# Services read secrets from environment variables at runtime

USER app

# Backend-specific healthcheck: probes the service over HTTP (port and path from container env, see the Bun stage)
HEALTHCHECK {hc_flags} \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.TDK_HEALTH_PATH||'/health')).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" || exit 1

WORKDIR /app


# Alias for backwards compatibility - defaults to Bun (most efficient)
FROM l4_backend_bun AS l4_backend_golden


# =============================================================================
# L4-FRONTEND: FRONTEND PRODUCTION RUNTIME
# =============================================================================
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS l4_frontend_golden

LABEL layer="l4-frontend" \
      description="Frontend production runtime with Nginx" \
      maintainer="{prefix}"

ENV NODE_ENV=production

# Install curl for healthchecks
RUN apk add --no-cache curl

# Frontend-specific healthcheck (checks Nginx)
HEALTHCHECK {hc_flags_frontend} \
  CMD curl -f http://localhost/ || exit 1

WORKDIR /usr/share/nginx/html


# =============================================================================
# L4-MIGRATOR: MIGRATOR PRODUCTION RUNTIME
# =============================================================================
FROM l1_golden AS l4_migrator_golden

LABEL layer="l4-migrator" \
      description="Migrator runtime with Prisma" \
      maintainer="{prefix}"

ENV NODE_ENV=production

# Copy global Prisma installation from L3 (l3-backend carries the same pinned Prisma)
COPY --from=l3_backend_golden /root/.bun/install/global /root/.bun/install/global

# ⚠️ Infisical CLI is NOT included in golden L4 images
# The migrator reads secrets directly from environment variables at runtime
# (no entrypoint wrapper needed for database migrations)
# Use --build-arg SKIP_INFISICAL_SETUP=1 to skip CLI installation in derived images

# Ensure Bun cache path is writable for non-root runtime healthcheck commands.
RUN mkdir -p /cache/bun && chown -R bun:bun /cache/bun

USER bun

# Migrators are one-shot jobs (migrate.sh runs to completion), so no healthcheck.
# The per-service l4_migrator_runtime stage sets HEALTHCHECK NONE as well.
HEALTHCHECK NONE

WORKDIR /app
""".format(
    hc_flags=dockerfile_healthcheck_flags(),
    hc_flags_frontend=dockerfile_healthcheck_flags(DOCKER_HEALTHCHECK["frontend_start_period_seconds"]),
    prefix=_GOLDEN_PREFIX,
)
