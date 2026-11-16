import { projectNeedsBun } from "./bun-requirement.js";
import { execAsync } from "./exec-async.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesFromRoot } from "./services.js";
import { isAtLeast, MIN_BUN_VERSION, MIN_TILT_VERSION, parseVersion, versionMeetsMinimum, } from "./tool-versions.js";
// A wedged Docker daemon makes `docker ps` block forever instead of failing,
// and doctor is exactly the tool people run when their environment is broken.
export const EXEC_TIMEOUT_MS = 10_000;
// The first `docker compose` call loads the compose plugin. On a busy machine (a CI runner running several jobs) that
// can pass 10s, and a timeout here blocks `flisk up` on a cold start even though Compose is installed.
export const COMPOSE_TIMEOUT_MS = 30_000;
// Both the Compose and the Versions check run this exact command and timeout, so a per-run cache runs it once.
export const DOCKER_COMPOSE_VERSION_COMMAND = "docker compose version --short";
// Generated healthchecks use `start_interval`, which older engines/compose reject.
const MIN_DOCKER_ENGINE_VERSION = [25, 0, 0];
const MIN_DOCKER_COMPOSE_VERSION = [2, 20, 2];
export async function checkDockerVersions(exec = execAsync) {
    const run = async (command, timeoutMs = EXEC_TIMEOUT_MS) => String(await exec(command, timeoutMs)).trim();
    let engineRaw;
    let composeRaw;
    try {
        [engineRaw, composeRaw] = await Promise.all([
            run("docker version --format '{{.Server.Version}}'"),
            run(DOCKER_COMPOSE_VERSION_COMMAND, COMPOSE_TIMEOUT_MS),
        ]);
    }
    catch {
        return {
            name: "Docker Versions",
            didPass: true,
            isSkipped: true,
            message: "Could not read Docker Engine/Compose versions - skipped version check",
        };
    }
    const engine = parseVersion(engineRaw);
    const compose = parseVersion(composeRaw);
    if (!engine || !compose) {
        return {
            name: "Docker Versions",
            didPass: true,
            isSkipped: true,
            message: `Unrecognized Docker version output (engine "${engineRaw}", compose "${composeRaw}") - skipped version check`,
        };
    }
    const problems = [];
    if (!isAtLeast(engine, MIN_DOCKER_ENGINE_VERSION)) {
        problems.push(`Docker Engine ${engineRaw} (need 25.0+)`);
    }
    if (!isAtLeast(compose, MIN_DOCKER_COMPOSE_VERSION)) {
        problems.push(`Docker Compose ${composeRaw} (need 2.20.2+)`);
    }
    if (problems.length === 0) {
        return {
            name: "Docker Versions",
            didPass: true,
            message: `Docker Engine ${engineRaw} and Compose ${composeRaw} support generated healthchecks`,
        };
    }
    return {
        name: "Docker Versions",
        didPass: false,
        message: `Docker is too old for generated healthchecks (they use start_interval):\n    ${problems.join("\n    ")}`,
        fix: "Update Docker: Docker Desktop (auto-updates), or Linux: apt/yum/dnf update docker-ce docker-compose-plugin\n  Verify: docker version --format '{{.Server.Version}}' && docker compose version --short\n  Docs: https://docs.docker.com/engine/install/",
    };
}
checkDockerVersions.requiresContainerRuntime = true;
checkDockerVersions.checkName = "Docker Versions";
export async function checkTilt(exec = execAsync) {
    let raw;
    try {
        raw = String(await exec("tilt version", EXEC_TIMEOUT_MS)).trim();
    }
    catch {
        return {
            name: "Tilt CLI",
            didPass: false,
            message: "Tilt CLI not found",
            fix: "Install Tilt: curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash\n  Verify: tilt version\n  Docs: https://docs.tilt.dev/install.html",
        };
    }
    if (!versionMeetsMinimum(raw, MIN_TILT_VERSION)) {
        return {
            name: "Tilt CLI",
            didPass: false,
            message: `Tilt ${raw || "version unknown"} is below the required v${MIN_TILT_VERSION.join(".")} floor`,
            fix: `Upgrade Tilt to v${MIN_TILT_VERSION.join(".")} or newer: https://docs.tilt.dev/install.html\n  Verify: tilt version\n  If using Homebrew: brew upgrade tilt`,
        };
    }
    return { name: "Tilt CLI", didPass: true, message: `Tilt ${raw} is available` };
}
export async function checkBun(exec = execAsync) {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
        return {
            name: "Bun",
            didPass: true,
            isSkipped: true,
            message: "Not in a project - skipping Bun check",
        };
    }
    if (!projectNeedsBun(discoverResourcesFromRoot(projectRoot))) {
        return {
            name: "Bun",
            didPass: true,
            isSkipped: true,
            message: "No generated JS services - skipping Bun check",
        };
    }
    try {
        const rawVersion = String(await exec("bun --version", EXEC_TIMEOUT_MS)).trim();
        if (!versionMeetsMinimum(rawVersion, MIN_BUN_VERSION)) {
            return {
                name: "Bun",
                didPass: false,
                message: `Bun ${rawVersion || "version unknown"} is below the required ${MIN_BUN_VERSION.join(".")} floor`,
                fix: `Upgrade Bun to ${MIN_BUN_VERSION.join(".")} or newer: https://bun.sh/install\n  Verify: bun --version\n  If using npm: npm install -g bun@latest`,
            };
        }
        return {
            name: "Bun",
            didPass: true,
            message: `Bun ${rawVersion} is available`,
        };
    }
    catch {
        return {
            name: "Bun",
            didPass: false,
            message: "Bun is not installed",
            fix: "Install Bun: curl -fsSL https://bun.sh/install | bash\n  Verify: bun --version\n  Docs: https://bun.sh/docs/installation",
        };
    }
}
