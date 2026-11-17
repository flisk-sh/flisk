import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  projectNetworkNames
} from "./chunk-QQ2PAYEU.js";
import {
  ownedComposeProjects
} from "./chunk-ICMIEDFD.js";
import {
  toComposeProjectName
} from "./chunk-HS5H5D2L.js";

// dist/utils/project-purge.js
import { execFileSync } from "node:child_process";
var defaultDocker = (args) => execFileSync("docker", args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});
function lines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
function ownerOf(candidate, separator, names, transform = (name) => name) {
  let best;
  for (const name of names) {
    const prefix = transform(name) + separator;
    if (candidate.startsWith(prefix) && (!best || transform(best).length < transform(name).length)) {
      best = name;
    }
  }
  return best;
}
var GOLDEN_LAYERS = /* @__PURE__ */ new Set([
  "l1",
  "l2",
  "l3-backend",
  "l3-frontend",
  "l3-migrator",
  "l4-backend",
  "l4-backend-node",
  "l4-frontend",
  "l4-migrator"
]);
var INFRA_IMAGES = /* @__PURE__ */ new Set(["traefik-wake-gateway"]);
var SHARED_INFRA_IMAGE_REPOSITORIES = /* @__PURE__ */ new Set(["flisk-wake-gateway"]);
function listProjectArtifacts(name, identity, docker = defaultDocker) {
  const composeProjects = ownedComposeProjects(name, [...identity.stacks]);
  const names = [.../* @__PURE__ */ new Set([name, ...identity.knownNames ?? []])];
  const underscored = toComposeProjectName(name);
  const isServiceImage = (repository) => identity.stacks.some((stack) => {
    const lower = stack.toLowerCase();
    return repository.startsWith(`${underscored}_${lower}_`) || repository === `${underscored}_${lower}-db-migrator`;
  }) && ownerOf(repository, "_", names, toComposeProjectName) === name;
  const read = (args) => {
    try {
      return lines(docker(args));
    } catch {
      return [];
    }
  };
  const containers = read([
    "ps",
    "-a",
    "--format",
    '{{.Names}}	{{.Label "com.docker.compose.project"}}'
  ]).map((line) => line.split("	")).filter(([, composeProject = ""]) => composeProjects.has(composeProject)).map(([container = ""]) => container);
  const volumes = read([
    "volume",
    "ls",
    "--format",
    '{{.Name}}	{{.Label "com.docker.compose.project"}}'
  ]).map((line) => line.split("	")).filter(([, composeProject = ""]) => composeProjects.has(composeProject)).map(([volume = ""]) => volume);
  const existingNetworks = new Set(read(["network", "ls", "--format", "{{.Name}}"]));
  const networks = projectNetworkNames(name).filter((network) => existingNetworks.has(network));
  const ownContainers = new Set(containers);
  const isUsedByOtherProject = (ref) => read(["ps", "-a", "--filter", `ancestor=${ref}`, "--format", "{{.Names}}"]).some((container) => !ownContainers.has(container));
  const images = read(["images", "--format", "{{.Repository}}:{{.Tag}}"]).filter((ref) => {
    const [repository = "", tag = ""] = ref.split(/:(?=[^:]*$)/);
    if (!repository || repository === "<none>" || tag === "<none>")
      return false;
    if (repository.startsWith(`${name}-`) && GOLDEN_LAYERS.has(repository.slice(name.length + 1))) {
      return true;
    }
    if (repository.startsWith(`${name}-`) && INFRA_IMAGES.has(repository.slice(name.length + 1))) {
      return true;
    }
    if (SHARED_INFRA_IMAGE_REPOSITORIES.has(repository)) {
      return !isUsedByOtherProject(ref);
    }
    return isServiceImage(repository);
  });
  return { containers, volumes, networks, images };
}
function firstLine(err) {
  const stderr = String(err.stderr ?? err).trim();
  return stderr.split(/\r?\n/)[0] ?? "";
}
function removeProjectArtifacts(artifacts, docker = defaultDocker) {
  const result = {
    removed: { containers: [], volumes: [], networks: [], images: [] },
    kept: []
  };
  const steps = [
    ["containers", (name) => ["rm", "-f", name]],
    ["volumes", (name) => ["volume", "rm", name]],
    ["networks", (name) => ["network", "rm", name]],
    ["images", (name) => ["image", "rm", name]]
  ];
  for (const [kind, args] of steps) {
    for (const name of artifacts[kind]) {
      try {
        docker(args(name));
        result.removed[kind].push(name);
      } catch (err) {
        result.kept.push({ kind, name, reason: firstLine(err) });
      }
    }
  }
  return result;
}
function countArtifacts(artifacts) {
  return artifacts.containers.length + artifacts.volumes.length + artifacts.networks.length + artifacts.images.length;
}

export {
  listProjectArtifacts,
  removeProjectArtifacts,
  countArtifacts
};
