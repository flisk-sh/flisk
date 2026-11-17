import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/container-engine.js
var LABELS = {
  kiri: "Kiri",
  colima: "Colima",
  orbstack: "OrbStack",
  "docker-desktop": "Docker Desktop",
  podman: "Podman",
  "docker-engine": "Docker Engine",
  unknown: "Docker"
};
var VM_ENGINES = /* @__PURE__ */ new Set(["kiri", "colima", "orbstack", "docker-desktop"]);
function detectEngine(info, env = process.env) {
  const name = (info.Name ?? "").toLowerCase();
  const os = (info.OperatingSystem ?? "").toLowerCase();
  const host = env.DOCKER_HOST ?? "";
  const context = env.DOCKER_CONTEXT ?? "";
  let id = "unknown";
  if (os === "kiri" || name === "kiri" || host.includes("/.kiri/") || context === "kiri") {
    id = "kiri";
  } else if (os.includes("orbstack") || name === "orbstack" || host.includes(".orbstack")) {
    id = "orbstack";
  } else if (name.startsWith("colima") || host.includes(".colima") || context.startsWith("colima")) {
    id = "colima";
  } else if (os.includes("docker desktop") || name === "docker-desktop") {
    id = "docker-desktop";
  } else if (os.includes("podman") || host.includes("podman")) {
    id = "podman";
  } else if (os) {
    id = "docker-engine";
  }
  const version = info.ServerVersion ? ` (engine ${info.ServerVersion})` : "";
  return { id, label: `${LABELS[id]}${version}`, vm: VM_ENGINES.has(id) };
}
function parseDockerInfo(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function currentDockerContext(home, read) {
  try {
    const config = JSON.parse(read(`${home}/.docker/config.json`));
    return config.currentContext;
  } catch {
    return void 0;
  }
}
function kiriBuildEnv(env, context) {
  if (env.DOCKER_BUILDKIT !== void 0)
    return {};
  const host = env.DOCKER_HOST ?? "";
  return isKiriHost(env, context) ? { DOCKER_BUILDKIT: "0" } : {};
}
function isKiriHost(env, context) {
  const host = env.DOCKER_HOST ?? "";
  return host ? /\/\.?kiri\//.test(host) : (env.DOCKER_CONTEXT ?? context) === "kiri";
}
function kiriSocketEnv(env, platform, context) {
  if (env.FLISK_DOCKER_SOCKET !== void 0 || platform !== "linux")
    return {};
  const match = /^unix:\/\/(\/run\/kiri\/[^\s]+)$/.exec(env.DOCKER_HOST ?? "");
  if (match?.[1] && isKiriHost(env, context))
    return { FLISK_DOCKER_SOCKET: match[1] };
  return {};
}

export {
  detectEngine,
  parseDockerInfo,
  currentDockerContext,
  kiriBuildEnv,
  isKiriHost,
  kiriSocketEnv
};
