# =============================================================================
# 🏗️ TILT SDK - BUILD CONCURRENCY
# =============================================================================
# Sets Tilt's maximum parallel updates from the Docker engine's CPU count and
# memory, instead of Tilt's default, so a warm `tdk up` on a machine with spare
# capacity builds more than three images at once.
#
# Override with TDK_MAX_PARALLEL_BUILDS=<positive integer>.
# =============================================================================

MIN_PARALLEL_BUILDS = 3
MAX_PARALLEL_BUILDS = 8
# CPUs kept free for Tilt, the Traefik/Postgres containers and the host.
RESERVED_CPUS = 2
# Rough peak memory per concurrent image build (Vite and tsc dominate).
BUILD_MEMORY_BUDGET_BYTES = 1610612736  # 1.5 GiB


def _is_positive_int(text):
    return len(text) > 0 and text.isdigit() and int(text) > 0


def _engine_resources():
    """Returns (cpus, memory_bytes) from `docker info`, or None when unavailable."""
    out = str(local(
        "docker info --format '{{.NCPU}} {{.MemTotal}}' 2>/dev/null || true",
        quiet=True,
        echo_off=True,
    )).strip()
    parts = out.split(' ')
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    return (int(parts[0]), int(parts[1]))


def compute_max_parallel_builds(cpus, memory_bytes):
    """The concurrency for an engine with `cpus` CPUs and `memory_bytes` of memory."""
    by_cpu = cpus - RESERVED_CPUS
    by_memory = memory_bytes // BUILD_MEMORY_BUDGET_BYTES
    return max(MIN_PARALLEL_BUILDS, min(MAX_PARALLEL_BUILDS, min(by_cpu, by_memory)))


def configure_build_concurrency():
    """Calls update_settings once with the chosen max_parallel_updates. Call at Tiltfile load."""
    override = os.environ.get('TDK_MAX_PARALLEL_BUILDS', '').strip()
    if _is_positive_int(override):
        value = int(override)
        print("🧮 Parallel builds: " + str(value) + " (TDK_MAX_PARALLEL_BUILDS)")
    else:
        resources = _engine_resources()
        if resources == None:
            print("🧮 Parallel builds: Tilt default (docker info unavailable, so the engine's CPU and memory could not be read)")
            return
        value = compute_max_parallel_builds(resources[0], resources[1])
        print("🧮 Parallel builds: " + str(value) + " (from Docker engine: " + str(resources[0]) + " CPUs)")
    update_settings(max_parallel_updates=value)
