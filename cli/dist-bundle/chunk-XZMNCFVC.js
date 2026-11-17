import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  defaultDockerRunner
} from "./chunk-X45DIH6R.js";
import {
  ownedComposeProjects,
  projectNameAt,
  readProjectRecords
} from "./chunk-ICMIEDFD.js";
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";
import {
  lastShownError
} from "./chunk-73W4Y4TI.js";

// dist/utils/json-output.js
import { writeSync } from "node:fs";
function createJsonEmitter(failureCode, command) {
  let emitted = false;
  const emit = (data, errors = []) => {
    if (emitted)
      return;
    emitted = true;
    writeSync(1, `${JSON.stringify(createMachineEnvelope(data, errors))}
`);
  };
  process.once("exit", (code) => {
    const shown = lastShownError();
    emit({ ok: false }, [
      {
        code: failureCode,
        message: shown?.message ?? (code === 0 ? `${command} exited before reporting a result` : `${command} exited with code ${code}`),
        ...shown && shown.suggestions.length > 0 ? { suggestions: shown.suggestions } : {}
      }
    ]);
  });
  return emit;
}

// dist/utils/project-owner.js
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
var defaultDocker = (args) => execFileSync("docker", args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});
function canonical(path) {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}
function isSameFolder(a, b) {
  return canonical(a) === canonical(b);
}
function projectRootOf(directory) {
  let current = resolve(directory);
  for (; ; ) {
    if (existsSync(join(current, ".flisk", "project.json")))
      return current;
    const parent = dirname(current);
    if (parent === current)
      return void 0;
    current = parent;
  }
}
function findForeignContainerOwners(name, stacks, projectRoot, docker = defaultDocker) {
  let output;
  try {
    output = docker([
      "ps",
      "-a",
      "--format",
      '{{.Names}}	{{.Label "com.docker.compose.project"}}	{{.Label "com.docker.compose.project.working_dir"}}'
    ]);
  } catch {
    return [];
  }
  const composeProjects = ownedComposeProjects(name, [...stacks]);
  const byRoot = /* @__PURE__ */ new Map();
  for (const line of output.split(/\r?\n/)) {
    const [container = "", composeProject = "", workingDir = ""] = line.trim().split("	");
    if (!container || !workingDir.trim() || !composeProjects.has(composeProject))
      continue;
    const root = projectRootOf(workingDir);
    if (!root || isSameFolder(root, projectRoot) || projectNameAt(root) !== name)
      continue;
    byRoot.set(root, [...byRoot.get(root) ?? [], container]);
  }
  return [...byRoot].map(([root, containers]) => ({ root, containers }));
}
function findOtherRecordedFolders(name, projectRoot, readRecords = readProjectRecords) {
  const record = readRecords().find((candidate) => candidate.name === name);
  if (!record)
    return [];
  return record.roots.filter((root) => !isSameFolder(root, projectRoot) && projectNameAt(root) === name);
}
var RENAME_HINT = 'Give this project its own name: change "project.name" in .flisk/project.json, then run flisk config regenerate.';
function upOwnerRefusal(name, owners) {
  if (owners.length === 0)
    return void 0;
  const folders = owners.map((owner) => owner.root);
  const containers = owners.flatMap((owner) => owner.containers);
  return {
    message: `Project "${name}" already has Docker containers from another folder: ${folders.join(", ")} (${containers.join(", ")}). Starting here would replace them, and both folders would use one database volume.`,
    suggestions: [
      RENAME_HINT,
      ...folders.map((folder) => `Or stop the other one first: cd ${folder} && flisk down`)
    ]
  };
}
function purgeOwnerRefusal(name, owners, recordedFolders) {
  const folders = [.../* @__PURE__ */ new Set([...owners.map((owner) => owner.root), ...recordedFolders])];
  if (folders.length === 0)
    return void 0;
  return {
    message: `flisk down --purge would delete the database volume, networks and images of "${name}", which ${folders.join(", ")} also use${folders.length === 1 ? "s" : ""}. Nothing was removed.`,
    suggestions: [
      RENAME_HINT,
      "Or delete the other folder first, or run the purge from the folder whose data should go, once the others have their own names."
    ]
  };
}

// dist/utils/tilt-images.js
var UNITS = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
function sizeToBytes(raw) {
  const m = /^([\d.]+)\s*([KMGT]?B)$/i.exec(raw.trim());
  return m ? Math.round(Number(m[1]) * (UNITS[(m[2] ?? "B").toUpperCase()] ?? 1)) : 0;
}
function selectSupersededTiltImages(rows, keep) {
  const byRepo = /* @__PURE__ */ new Map();
  for (const line of rows.split("\n")) {
    const [repo = "", tag = "", created = "", size = ""] = line.split("	");
    if (!tag.startsWith("tilt-") || !repo || repo === "<none>")
      continue;
    const list = byRepo.get(repo) ?? [];
    list.push({
      repo,
      tag,
      created: Date.parse(created.replace(/ [A-Z]{2,5}$/, "")) || 0,
      bytes: sizeToBytes(size)
    });
    byRepo.set(repo, list);
  }
  const remove = [];
  const kept = [];
  for (const list of byRepo.values()) {
    list.sort((a, b) => b.created - a.created);
    kept.push(...list.slice(0, keep));
    remove.push(...list.slice(keep));
  }
  return { remove, kept };
}
async function pruneSupersededTiltImages(keep = 1, run = defaultDockerRunner) {
  const result = { removed: [], kept: [], removedBytes: 0 };
  let rows;
  try {
    rows = await run([
      "image",
      "ls",
      "--format",
      "{{.Repository}}	{{.Tag}}	{{.CreatedAt}}	{{.Size}}"
    ]);
  } catch {
    return result;
  }
  const { remove, kept } = selectSupersededTiltImages(rows, keep);
  result.kept = kept.map((i) => `${i.repo}:${i.tag}`);
  for (const image of remove) {
    const ref = `${image.repo}:${image.tag}`;
    try {
      await run(["rmi", ref]);
      result.removed.push(ref);
      result.removedBytes += image.bytes;
    } catch {
      result.kept.push(ref);
    }
  }
  return result;
}

export {
  createJsonEmitter,
  findForeignContainerOwners,
  findOtherRecordedFolders,
  upOwnerRefusal,
  purgeOwnerRefusal,
  pruneSupersededTiltImages
};
