import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  cliInvocation
} from "./chunk-CFZG7IYF.js";
import {
  FliskError
} from "./chunk-73W4Y4TI.js";

// dist/utils/demo-reset.js
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, realpathSync, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";

// dist/utils/project-registry.js
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
var MAX_ROOTS = 20;
function projectRegistryDir(home = homedir()) {
  return join(home, ".flisk", "projects");
}
function recordPath(name, home) {
  return join(projectRegistryDir(home), `${encodeURIComponent(name)}.json`);
}
function parseRecord(text) {
  try {
    const value = JSON.parse(text);
    if (typeof value.name !== "string" || !Array.isArray(value.roots))
      return void 0;
    return {
      name: value.name,
      roots: value.roots.filter((root) => typeof root === "string"),
      // Records written by 1.4.42 have no stacks: their infra volumes and golden images are still found.
      stacks: Array.isArray(value.stacks) ? value.stacks.filter((stack) => typeof stack === "string") : [],
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
    };
  } catch {
    return void 0;
  }
}
function projectNameAt(root) {
  try {
    const parsed = JSON.parse(readFileSync(join(root, ".flisk", "project.json"), "utf8"));
    return typeof parsed.project?.name === "string" ? parsed.project.name.toLowerCase() : void 0;
  } catch {
    return void 0;
  }
}
function recordProjectRoot(projectRoot, options = {}) {
  const home = options.home ?? homedir();
  const name = projectNameAt(projectRoot);
  if (!name)
    return;
  const root = resolve(projectRoot);
  try {
    const path = recordPath(name, home);
    const existing = existsSync(path) ? parseRecord(readFileSync(path, "utf8")) : void 0;
    const roots = [...(existing?.roots ?? []).filter((r) => r !== root), root].slice(-MAX_ROOTS);
    mkdirSync(projectRegistryDir(home), { recursive: true });
    const record = {
      name,
      roots,
      stacks: [.../* @__PURE__ */ new Set([...existing?.stacks ?? [], ...options.stacks ?? []])].sort(),
      updatedAt: (options.now ?? /* @__PURE__ */ new Date()).toISOString()
    };
    writeFileSync(path, `${JSON.stringify(record, null, 2)}
`);
  } catch {
  }
}
function readProjectRecords(home = homedir()) {
  const dir = projectRegistryDir(home);
  let files;
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const records = [];
  for (const file of files) {
    try {
      const record = parseRecord(readFileSync(join(dir, file), "utf8"));
      if (record)
        records.push(record);
    } catch {
    }
  }
  return records.sort((a, b) => a.name.localeCompare(b.name));
}
function forgetProject(name, home = homedir()) {
  rmSync(recordPath(name, home), { force: true });
}
function folderHoldsProject(root, name, pathExists = existsSync) {
  const mount = /^(\/Volumes\/[^/]+|\/mnt\/[^/]+|\/media\/[^/]+\/[^/]+)/.exec(root)?.[1];
  if (mount && !pathExists(mount))
    return true;
  let text;
  try {
    text = readFileSync(join(root, ".flisk", "project.json"), "utf8");
  } catch (err) {
    const code = err.code;
    return code !== "ENOENT" && code !== "ENOTDIR";
  }
  try {
    const found = JSON.parse(text).project?.name;
    return typeof found !== "string" || found.toLowerCase() === name;
  } catch {
    return true;
  }
}
function isRecordStale(record, holds = folderHoldsProject) {
  if (record.roots.length === 0)
    return false;
  return record.roots.every((root) => !holds(root, record.name));
}

// dist/utils/demo-reset.js
async function stopDemoStack(projectDir, runDown = runFliskDown, stopTilt = stopRunningTilt, stopFolderContainers = stopContainersUnder) {
  if (!existsSync2(join2(projectDir, ".flisk", "project.json")))
    return false;
  const tiltfile = join2(projectDir, ".flisk", ".flisk-out", "Tiltfile");
  await stopTilt(tiltfile);
  let stuck = await stopFolderContainers(projectDir);
  if (stuck.length > 0 && existsSync2(tiltfile)) {
    try {
      runDown(projectDir);
    } catch {
    }
    stuck = await stopFolderContainers(projectDir);
  }
  if (stuck.length > 0) {
    throw new FliskError(`could not stop ${stuck.join(", ")} (docker compose down failed)`, [
      `Stop them by hand: docker stop ${stuck.join(" ")}`,
      "Then run the demo again"
    ]);
  }
  return true;
}
async function stopContainersUnder(folder) {
  const { stopComposeProjectsUnder } = await import("./down-cleanup-TETN3TGI.js");
  return stopComposeProjectsUnder(folder).failed.map((entry) => entry.name);
}
async function stopRunningTilt(tiltfile) {
  const { findProjectTiltUpPids, stopProjectTiltUp, waitForTiltUpExit } = await import("./down-cleanup-TETN3TGI.js");
  if (findProjectTiltUpPids(tiltfile).length === 0)
    return;
  stopProjectTiltUp(tiltfile);
  await waitForTiltUpExit(tiltfile);
}
function runFliskDown(projectDir) {
  const [command, ...prefix] = cliInvocation();
  execFileSync(command, [...prefix, "down", "--yes"], {
    cwd: projectDir,
    stdio: "inherit"
  });
}
var dockerVolumes = {
  list: () => execFileSync("docker", ["volume", "ls", "--format", '{{.Name}}	{{.Label "com.docker.compose.project"}}'], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean).map((line) => {
    const [name = "", composeProject = ""] = line.split("	");
    return { name, composeProject };
  }),
  remove: (name) => {
    execFileSync("docker", ["volume", "rm", name], { stdio: "ignore" });
  }
};
var INFRA_STACKS = [
  "database-management",
  "messaging",
  "infisical",
  "traefik",
  "proxy",
  "monitoring",
  "cdc",
  "elk"
];
function ownedComposeProjects(projectName, stacks) {
  return /* @__PURE__ */ new Set([
    ...INFRA_STACKS.map((infra) => `${projectName}-${infra}`),
    ...stacks.map((stack) => `${projectName}-${stack.toLowerCase()}-autogenerated`)
  ]);
}
function tryListStaleProjectVolumes(projectName, docker = dockerVolumes, stacks = []) {
  const owned = ownedComposeProjects(projectName, stacks);
  try {
    return docker.list().filter((volume) => owned.has(volume.composeProject)).map((volume) => volume.name);
  } catch {
    return void 0;
  }
}
function listStaleProjectVolumes(projectName, docker = dockerVolumes, stacks = []) {
  return tryListStaleProjectVolumes(projectName, docker, stacks) ?? [];
}
function removeProjectVolumes(names, docker = dockerVolumes) {
  const removed = [];
  for (const name of names) {
    try {
      docker.remove(name);
      removed.push(name);
    } catch {
    }
  }
  return removed;
}
function removeStaleProjectVolumes(projectName, docker = dockerVolumes, stacks = []) {
  return removeProjectVolumes(listStaleProjectVolumes(projectName, docker, stacks), docker);
}
function canonicalFolder(path) {
  const absolute = resolve2(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}
function foldersSharingProjectName(projectName, demoDir, readRecords = readProjectRecords, nameAt = projectNameAt, isDemo = isDemoFolder) {
  const record = readRecords().find((candidate) => candidate.name === projectName);
  if (!record)
    return [];
  const own = canonicalFolder(demoDir);
  return record.roots.filter((root) => canonicalFolder(root) !== own && nameAt(root) === projectName && !isDemo(root));
}
var DEMO_MARKER = join2(".flisk", "demo-docker.json");
function shouldMarkDemoFolder(starter, reused) {
  return starter === "demo" && !reused;
}
function isDemoFolder(dir) {
  return existsSync2(join2(dir, DEMO_MARKER));
}
function markDemoFolder(dir) {
  try {
    mkdirSync2(join2(dir, ".flisk"), { recursive: true });
    writeFileSync2(join2(dir, DEMO_MARKER), `${JSON.stringify({ demo: "docker" }, null, 2)}
`);
  } catch {
  }
}
function sharedNameRefusal(projectName, folders, volumes) {
  const first = folders[0] ?? "";
  return {
    message: `Nothing deleted: ${first} has the demo's project name and database.`,
    hint: "Rename that project (project.name), or run flisk down --purge there. Details: log.",
    detail: `The demo's project name "${projectName}" is also used by ${folders.join(", ")}. Docker keeps one database volume per project name (${volumes.join(", ")}), and the demo has to delete it to start clean. Nothing was deleted. Rename that project (project.name in its .flisk/project.json), or remove its data with: cd ${first} && flisk down --purge. Then run flisk demo again.`
  };
}
function sharedNameUnreadableRefusal(projectName, folders) {
  const first = folders[0] ?? "";
  return {
    message: `Nothing deleted: ${first} has the demo's project name, and Docker volumes could not be read.`,
    hint: "Start Docker and run the demo again, or rename that project (project.name). Details: log.",
    detail: `The demo's project name "${projectName}" is also used by ${folders.join(", ")}, and "docker volume ls" failed, so the demo cannot tell whether a database would be deleted. Nothing was deleted.`
  };
}
function readProjectName(projectDir) {
  try {
    const parsed = JSON.parse(readFileSync2(join2(projectDir, ".flisk", "project.json"), "utf8"));
    return typeof parsed.project?.name === "string" ? parsed.project.name.toLowerCase() : void 0;
  } catch {
    return void 0;
  }
}

export {
  projectNameAt,
  recordProjectRoot,
  readProjectRecords,
  forgetProject,
  folderHoldsProject,
  isRecordStale,
  stopDemoStack,
  ownedComposeProjects,
  tryListStaleProjectVolumes,
  listStaleProjectVolumes,
  removeProjectVolumes,
  removeStaleProjectVolumes,
  foldersSharingProjectName,
  shouldMarkDemoFolder,
  isDemoFolder,
  markDemoFolder,
  sharedNameRefusal,
  sharedNameUnreadableRefusal,
  readProjectName
};
