# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The flisk CLI image (ghcr.io/flisk-sh/flisk, docker.io/alexdykyi/flisk), built by scripts/release/push-flisk-image.sh from a
# release's own assets: the build context holds flisk-linux-amd64, flisk-linux-arm64 and flisk-cli-engine.tar.gz, so the CLI
# is the released binary and is never compiled a second time. The image talks to the host's Docker through a mounted
# /var/run/docker.sock; docs/install/container.md has the rules for running it.

# Docker CLI with the Compose and Buildx plugins. The binaries are static, so they run on Debian.
FROM docker:29.9.2-cli@sha256:5e6baf67325a79f64ed3bed6863954d5e05d0f3d4e57cbdb14809346814bbfdb AS docker-cli

# Slim Debian (trixie) with Bun, which flisk needs on PATH for generated JS services and `command` services that run bun.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4

ARG TARGETARCH
ARG VERSION=dev
# The same Tilt release .github/actions/setup-tilt installs, checked against its SHA-256.
ARG TILT_VERSION=0.37.8
ARG TILT_SHA256_AMD64=e39513f958705d30524d55f68b1d46fbef2b46a0da568efd00e6383dee6be44f
ARG TILT_SHA256_ARM64=7a21281e830930be158202b7f8405ba62445613788b4d9708512ffe51f5cce90

# python3 and PyYAML run the engine's helpers (the discovery daemon, the service.json to YAML converter); `flisk down` finds the
# `tilt up` to stop with ps (procps). tini is PID 1, so SIGTERM and Ctrl+C reach flisk: a PID 1 without handlers ignores them,
# and `docker stop` or an MCP client closing the server would wait for a kill.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git procps python3 python3-yaml tini \
  && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
  case "$TARGETARCH" in \
    amd64) tilt_arch=x86_64; sha="$TILT_SHA256_AMD64" ;; \
    arm64) tilt_arch=arm64; sha="$TILT_SHA256_ARM64" ;; \
    *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/tilt.tgz "https://github.com/tilt-dev/tilt/releases/download/v${TILT_VERSION}/tilt.${TILT_VERSION}.linux.${tilt_arch}.tar.gz"; \
  echo "${sha}  /tmp/tilt.tgz" | sha256sum -c -; \
  tar -xzf /tmp/tilt.tgz -C /usr/local/bin tilt; \
  rm /tmp/tilt.tgz; \
  tilt version

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx

# The installed layout: the binary finds its engine in flisk-cli/ next to itself (template-engine.ts, findCliAssetRoot).
COPY flisk-linux-${TARGETARCH} /opt/flisk/flisk
ADD flisk-cli-engine.tar.gz /opt/flisk/
RUN chmod 0755 /opt/flisk/flisk && /opt/flisk/flisk --version

# HOME is world-writable so `docker run --user "$(id -u):$(id -g)"` works too: Tilt, Docker and flisk keep state there.
# TILT_HOST makes the Tilt UI listen on all interfaces, so `-p 10350:10350` reaches it from the host.
RUN mkdir -m 1777 /home/flisk
ENV PATH="/opt/flisk:${PATH}" \
  HOME=/home/flisk \
  TILT_HOST=0.0.0.0

LABEL org.opencontainers.image.title="flisk" \
  org.opencontainers.image.version="${VERSION}"

EXPOSE 10350
ENTRYPOINT ["/usr/bin/tini", "--", "flisk"]
CMD ["--help"]
