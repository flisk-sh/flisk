import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  formatCount
} from "./chunk-ARPSTQFE.js";
import {
  findOnPath
} from "./chunk-73W4Y4TI.js";

// dist/utils/toolchain.js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
var TOOLS = {
  node: { programs: ["node"], args: ["--version"], pattern: /v?(\d+(?:\.\d+){0,2})/ },
  bun: { programs: ["bun"], args: ["--version"], pattern: /(\d+(?:\.\d+){0,2})/ },
  deno: { programs: ["deno"], args: ["--version"], pattern: /deno (\d+(?:\.\d+){0,2})/ },
  python: {
    programs: ["python3", "python"],
    args: ["--version"],
    pattern: /Python (\d+(?:\.\d+){0,2})/
  },
  go: { programs: ["go"], args: ["version"], pattern: /go(\d+(?:\.\d+){0,2})/ },
  ruby: { programs: ["ruby"], args: ["--version"], pattern: /ruby (\d+(?:\.\d+){0,2})/ }
};
var TOOLCHAIN_PATTERN = /^([a-z]+)@(\d+(?:\.\d+){0,2})$/;
var probeVersion = (program, args) => {
  try {
    return execFileSync(program, args, {
      encoding: "utf-8",
      timeout: 1e4,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const output = error ?? {};
    const text = `${output.stdout ?? ""}${output.stderr ?? ""}`;
    return text.trim() ? text : null;
  }
};
function declaredToolchain(resource) {
  const raw = resource.config?.toolchain;
  if (raw !== void 0) {
    const match = typeof raw === "string" ? TOOLCHAIN_PATTERN.exec(raw.trim()) : null;
    if (!match)
      return {
        problem: `"toolchain" must look like "node@24" or "python@3.12", got ${JSON.stringify(raw)}`
      };
    return {
      tool: match[1],
      version: match[2],
      source: "service.json",
      isHint: false
    };
  }
  for (const [file, tool] of [
    [".nvmrc", "node"],
    [".node-version", "node"],
    [".python-version", "python"]
  ]) {
    const path = join(resource.path, file);
    if (!existsSync(path))
      continue;
    const version = /^v?(\d+(?:\.\d+){0,2})/.exec(readFileSync(path, "utf-8").trim())?.[1];
    if (version)
      return { tool, version, source: file, isHint: true };
  }
  return null;
}
function versionMatches(wanted, found) {
  const want = wanted.split(".");
  const have = found.split(".");
  return want.every((part, index) => Number(part) === Number(have[index] ?? Number.NaN));
}
function installedVersion(tool, probe = probeVersion) {
  const spec = TOOLS[tool];
  if (!spec)
    return null;
  for (const program of spec.programs) {
    const output = probe(program, spec.args);
    const version = output ? spec.pattern.exec(output)?.[1] : void 0;
    if (version)
      return version;
  }
  return null;
}
function findToolchainMismatches(resources, probe = probeVersion, isInstalled = (tool) => (TOOLS[tool]?.programs ?? []).some((program) => findOnPath(program) !== null)) {
  const cache = /* @__PURE__ */ new Map();
  const findings = [];
  for (const resource of resources) {
    const declared = declaredToolchain(resource);
    if (!declared)
      continue;
    if ("problem" in declared) {
      findings.push({
        service: resource.name,
        tool: "",
        version: "",
        source: "service.json",
        isHint: false,
        found: null,
        problem: declared.problem
      });
      continue;
    }
    if (!TOOLS[declared.tool]) {
      findings.push({
        ...declared,
        service: resource.name,
        found: null,
        problem: `unknown tool "${declared.tool}" (known: ${Object.keys(TOOLS).join(", ")})`
      });
      continue;
    }
    if (!cache.has(declared.tool))
      cache.set(declared.tool, installedVersion(declared.tool, probe));
    const found = cache.get(declared.tool) ?? null;
    if (found && versionMatches(declared.version, found))
      continue;
    findings.push({
      ...declared,
      service: resource.name,
      found,
      ...found === null && isInstalled(declared.tool) ? { isUnreadable: true } : {}
    });
  }
  return findings;
}
function describeToolchainFinding(finding) {
  if (finding.problem)
    return `${finding.service}: ${finding.problem}`;
  const wanted = `${finding.tool}@${finding.version}`;
  const found = finding.found ? `${finding.tool} ${finding.found} is on PATH` : finding.isUnreadable ? `the ${finding.tool} on PATH did not report a version` : `${finding.tool} is not installed`;
  return `${finding.service}: wants ${wanted} (${finding.source}), ${found}`;
}
function checkToolchains(resources, probe = probeVersion, isInstalled) {
  const findings = findToolchainMismatches(resources, probe, isInstalled);
  if (findings.length === 0) {
    return {
      name: "Service toolchains",
      didPass: true,
      message: "Every service that names a toolchain finds that version on PATH"
    };
  }
  const isHintOnly = findings.every((finding) => finding.isHint);
  return {
    name: "Service toolchains",
    didPass: isHintOnly,
    isWarning: isHintOnly,
    message: `${formatCount(findings.length, "service")} ${findings.length === 1 ? "needs" : "need"} another runtime version:
    ${findings.map(describeToolchainFinding).join("\n    ")}`,
    fix: 'Switch to that version with your version manager (nvm, fnm, mise, pyenv, ...), or change "toolchain" in the service.json'
  };
}

export {
  findToolchainMismatches,
  describeToolchainFinding,
  checkToolchains
};
