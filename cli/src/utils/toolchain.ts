// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, DiscoveredResource } from "../types/index.js";
import { formatCount } from "./formatting.js";
import { findOnPath } from "./which.js";

/**
 * Runtime versions for local-process services (#2876).
 *
 * A service with a `command` runs with whatever runtime is on the host. `"toolchain": "node@24"` in its service.json says
 * which one it needs; `flisk doctor` and `flisk up` compare that with the program on PATH and name the service, the wanted
 * version and the found one. Without `toolchain`, a `.nvmrc`, `.node-version` or `.python-version` in the service folder
 * is read as a hint: a mismatch there is a warning, never a stop. Flisk installs nothing.
 */

/** The tools Flisk knows how to ask for a version: the program to run and how to read its answer. */
const TOOLS: Record<string, { programs: string[]; args: string[]; pattern: RegExp }> = {
  node: { programs: ["node"], args: ["--version"], pattern: /v?(\d+(?:\.\d+){0,2})/ },
  bun: { programs: ["bun"], args: ["--version"], pattern: /(\d+(?:\.\d+){0,2})/ },
  deno: { programs: ["deno"], args: ["--version"], pattern: /deno (\d+(?:\.\d+){0,2})/ },
  python: {
    programs: ["python3", "python"],
    args: ["--version"],
    pattern: /Python (\d+(?:\.\d+){0,2})/,
  },
  go: { programs: ["go"], args: ["version"], pattern: /go(\d+(?:\.\d+){0,2})/ },
  ruby: { programs: ["ruby"], args: ["--version"], pattern: /ruby (\d+(?:\.\d+){0,2})/ },
};

export const TOOLCHAIN_PATTERN = /^([a-z]+)@(\d+(?:\.\d+){0,2})$/;

export interface Toolchain {
  tool: string;
  version: string;
  /** Where it was declared: `service.json` (binding) or a version file (a hint). */
  source: string;
  isHint: boolean;
}

export interface ToolchainFinding extends Toolchain {
  service: string;
  /** The version on PATH, or null when the program is not installed or did not say its version. */
  found: string | null;
  /** The program is on PATH, but its version output named no version. */
  isUnreadable?: boolean;
  /** An unknown tool or a malformed toolchain value. */
  problem?: string;
}

/** Runs `<program> <args>` and returns its output, or null when it is not installed. */
export type VersionProbe = (program: string, args: string[]) => string | null;

export const probeVersion: VersionProbe = (program, args) => {
  try {
    return execFileSync(program, args, {
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // `python --version` printed to stderr before 3.4; any output still names the version.
    const output = (error as { stdout?: string; stderr?: string }) ?? {};
    const text = `${output.stdout ?? ""}${output.stderr ?? ""}`;
    return text.trim() ? text : null;
  }
};

/** The toolchain a service declares in service.json, else the hint from a version file in its folder. */
export function declaredToolchain(
  resource: DiscoveredResource,
): Toolchain | { problem: string } | null {
  const raw = (resource.config as Record<string, unknown> | undefined)?.toolchain;
  if (raw !== undefined) {
    const match = typeof raw === "string" ? TOOLCHAIN_PATTERN.exec(raw.trim()) : null;
    if (!match)
      return {
        problem: `"toolchain" must look like "node@24" or "python@3.12", got ${JSON.stringify(raw)}`,
      };
    return {
      tool: match[1] as string,
      version: match[2] as string,
      source: "service.json",
      isHint: false,
    };
  }
  for (const [file, tool] of [
    [".nvmrc", "node"],
    [".node-version", "node"],
    [".python-version", "python"],
  ] as const) {
    const path = join(resource.path, file);
    if (!existsSync(path)) continue;
    const version = /^v?(\d+(?:\.\d+){0,2})/.exec(readFileSync(path, "utf-8").trim())?.[1];
    // `lts/*` or a named version is not a number to compare against: no hint.
    if (version) return { tool, version, source: file, isHint: true };
  }
  return null;
}

/** True when `found` satisfies `wanted`: every part `wanted` gives must match (`24` matches 24.1.0, `3.12` matches 3.12.4). */
export function versionMatches(wanted: string, found: string): boolean {
  const want = wanted.split(".");
  const have = found.split(".");
  return want.every((part, index) => Number(part) === Number(have[index] ?? Number.NaN));
}

/** The version of a tool on PATH, or null when none of its programs is installed. */
export function installedVersion(tool: string, probe: VersionProbe = probeVersion): string | null {
  const spec = TOOLS[tool];
  if (!spec) return null;
  for (const program of spec.programs) {
    const output = probe(program, spec.args);
    const version = output ? spec.pattern.exec(output)?.[1] : undefined;
    if (version) return version;
  }
  return null;
}

/** Every local-process service whose declared (or hinted) toolchain is not the one on PATH. */
export function findToolchainMismatches(
  resources: readonly DiscoveredResource[],
  probe: VersionProbe = probeVersion,
  isInstalled: (tool: string) => boolean = (tool) =>
    (TOOLS[tool]?.programs ?? []).some((program) => findOnPath(program) !== null),
): ToolchainFinding[] {
  const cache = new Map<string, string | null>();
  const findings: ToolchainFinding[] = [];
  for (const resource of resources) {
    const declared = declaredToolchain(resource);
    if (!declared) continue;
    if ("problem" in declared) {
      findings.push({
        service: resource.name,
        tool: "",
        version: "",
        source: "service.json",
        isHint: false,
        found: null,
        problem: declared.problem,
      });
      continue;
    }
    if (!TOOLS[declared.tool]) {
      findings.push({
        ...declared,
        service: resource.name,
        found: null,
        problem: `unknown tool "${declared.tool}" (known: ${Object.keys(TOOLS).join(", ")})`,
      });
      continue;
    }
    if (!cache.has(declared.tool)) cache.set(declared.tool, installedVersion(declared.tool, probe));
    const found = cache.get(declared.tool) ?? null;
    if (found && versionMatches(declared.version, found)) continue;
    findings.push({
      ...declared,
      service: resource.name,
      found,
      ...(found === null && isInstalled(declared.tool) ? { isUnreadable: true } : {}),
    });
  }
  return findings;
}

export function describeToolchainFinding(finding: ToolchainFinding): string {
  if (finding.problem) return `${finding.service}: ${finding.problem}`;
  const wanted = `${finding.tool}@${finding.version}`;
  const found = finding.found
    ? `${finding.tool} ${finding.found} is on PATH`
    : finding.isUnreadable
      ? `the ${finding.tool} on PATH did not report a version`
      : `${finding.tool} is not installed`;
  return `${finding.service}: wants ${wanted} (${finding.source}), ${found}`;
}

/**
 * `flisk doctor` for local-process services: a binding `toolchain` that does not match fails, a hint from a version file
 * only warns.
 */
export function checkToolchains(
  resources: readonly DiscoveredResource[],
  probe: VersionProbe = probeVersion,
  isInstalled?: (tool: string) => boolean,
): CheckResult {
  const findings = findToolchainMismatches(resources, probe, isInstalled);
  if (findings.length === 0) {
    return {
      name: "Service toolchains",
      didPass: true,
      message: "Every service that names a toolchain finds that version on PATH",
    };
  }
  const isHintOnly = findings.every((finding) => finding.isHint);
  return {
    name: "Service toolchains",
    didPass: isHintOnly,
    isWarning: isHintOnly,
    message: `${formatCount(findings.length, "service")} ${findings.length === 1 ? "needs" : "need"} another runtime version:\n    ${findings.map(describeToolchainFinding).join("\n    ")}`,
    fix: 'Switch to that version with your version manager (nvm, fnm, mise, pyenv, ...), or change "toolchain" in the service.json',
  };
}
