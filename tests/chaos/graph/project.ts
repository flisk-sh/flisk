// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Kind, type Model, type ServiceSpec, STACKS } from "./model.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FLISK_BIN = process.env.FLISK_BIN ?? join(REPO_ROOT, "cli/bin/flisk.js");

/** Run this repository's CLI (not a globally installed flisk) with the runtime running the tests. */
export function flisk(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [FLISK_BIN, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
}

function must(result: SpawnSyncReturns<string>, what: string): void {
  if (result.status !== 0) {
    throw new Error(`${what} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
}

export interface Touched {
  path: string;
  kind: "added" | "changed" | "removed";
}

export interface Workspace {
  root: string;
  /** A generated project with no services and every stack in STACKS enabled. */
  base: string;
  /** A scaffolded directory per kind that new services are copied from. */
  templates: Record<Kind, string>;
}

const FIRST_PORT: Record<Kind, number> = { backend: 4000, frontend: 3000, worker: 4500 };

/** Scaffold one project with the real CLI; every run clones it, so the slow part happens once per test file. */
export function createWorkspace(): Workspace {
  // Tilt reports watched paths under the real path, so resolve /tmp -> /private/tmp style links up front.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-chaos-")));
  const base = join(root, "chaosbase");
  mkdirSync(base);
  must(flisk(base, ["project", "--yes", "--no-agent-skills"]), "flisk project");
  // A frontend scaffold looks for a backend to point at, so the backend goes first.
  const templates = {} as Record<Kind, string>;
  for (const kind of ["backend", "frontend", "worker"] as const) {
    const name = `tmpl-${kind}`;
    must(
      flisk(base, ["resource", name, "--yes", "--type", kind, "--stack", STACKS[0]]),
      `flisk resource (${kind})`,
    );
    templates[kind] = join(root, name);
    cpSync(join(base, "services", STACKS[0], name), templates[kind], { recursive: true });
  }
  for (const kind of ["backend", "frontend", "worker"] as const) {
    rmSync(join(base, "services", STACKS[0], `tmpl-${kind}`), { recursive: true });
  }

  // `flisk up` adds a newly discovered stack to pre_alpha itself; a dry run does not, so enable them up front.
  const projectJson = join(base, ".flisk/project.json");
  const config = JSON.parse(readFileSync(projectJson, "utf-8"));
  const enabled: string[] = config.phases.pre_alpha.enabledStacks;
  for (const stack of STACKS) if (!enabled.includes(stack)) enabled.push(stack);
  writeFileSync(projectJson, `${JSON.stringify(config, null, 2)}\n`);
  must(flisk(base, ["config", "regenerate"]), "flisk config regenerate");
  return { root, base, templates };
}

/** What a hand edit left in the dependsOn key. */
function rawDependsOn(spec: ServiceSpec): unknown {
  switch (spec.shape ?? "array") {
    case "string":
      return spec.dependsOn.join(",") || "orders";
    case "null":
      return null;
    case "object":
      return Object.fromEntries(spec.dependsOn.map((entry) => [entry, true]));
    default:
      return spec.dependsOn;
  }
}

/** A project on disk that follows a Model: `sync` writes only the service.json files whose content changed, like an editor. */
export class Project {
  private readonly paths: Record<string, string> = {};
  private readonly ports: Record<string, number> = {};
  private readonly nextPort: Record<Kind, number> = { ...FIRST_PORT };

  private constructor(
    readonly dir: string,
    private readonly templates: Record<Kind, string>,
  ) {}

  static clone(workspace: Workspace, name: string): Project {
    const dir = join(workspace.root, name);
    rmSync(dir, { recursive: true, force: true });
    cpSync(workspace.base, dir, { recursive: true });
    return new Project(dir, workspace.templates);
  }

  /** The same services in a fresh directory whose generated files are rebuilt from scratch (no state left by earlier runs). */
  coldCopy(name: string): Project {
    const dir = join(dirname(this.dir), name);
    rmSync(dir, { recursive: true, force: true });
    const generated = join(this.dir, ".flisk", ".flisk-out");
    cpSync(this.dir, dir, { recursive: true, filter: (source) => !source.startsWith(generated) });
    must(flisk(dir, ["config", "regenerate"]), "flisk config regenerate (cold copy)");
    const copy = new Project(dir, this.templates);
    Object.assign(copy.paths, this.paths);
    Object.assign(copy.ports, this.ports);
    return copy;
  }

  /** The service's own directory (where its .autogenerated files are). */
  serviceDir(name: string): string | null {
    return name in this.paths ? join(this.dir, this.paths[name]) : null;
  }

  /** Returns the service.json files it added, changed or removed. */
  sync(model: Model): Touched[] {
    const touched: Touched[] = [];
    for (const name of Object.keys(this.paths)) {
      if (!(name in model)) {
        touched.push({ path: join(this.dir, this.paths[name], "service.json"), kind: "removed" });
        rmSync(join(this.dir, this.paths[name]), { recursive: true, force: true });
        delete this.paths[name];
      }
    }
    for (const [name, spec] of Object.entries(model)) {
      const changed = this.write(name, spec);
      if (changed) touched.push(changed);
    }
    return touched;
  }

  private write(name: string, spec: ServiceSpec): Touched | null {
    const added = !(name in this.paths);
    if (added) {
      // The directory keeps the stack it was created in; moving a service later only edits its service.json, as a user would.
      this.paths[name] = join("services", spec.stack, name);
      this.ports[name] ??= this.nextPort[spec.kind]++;
      const dir = join(this.dir, this.paths[name]);
      cpSync(this.templates[spec.kind], dir, { recursive: true });
      const pkgPath = join(dir, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, name }, null, 2)}\n`);
    }
    const manifestPath = join(this.dir, this.paths[name], "service.json");
    const manifest = JSON.parse(
      readFileSync(join(this.templates[spec.kind], "service.json"), "utf-8"),
    );
    manifest.dependencies = undefined;
    manifest.backendName = undefined;
    const next = `${JSON.stringify(
      {
        ...manifest,
        appName: name,
        name,
        stack: spec.stack,
        port: this.ports[name],
        dependsOn: rawDependsOn(spec),
        ...(spec.legacy ? { dependencies: spec.legacy } : {}),
        ...(spec.kind === "frontend" && spec.backendName ? { backendName: spec.backendName } : {}),
      },
      null,
      2,
    )}\n`;
    if (existsSync(manifestPath) && readFileSync(manifestPath, "utf-8") === next) return null;
    writeFileSync(manifestPath, next);
    return { path: manifestPath, kind: added ? "added" : "changed" };
  }
}
