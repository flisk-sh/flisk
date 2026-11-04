// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Daemonless static validation tier:
// Validates service.json variants from tests/chaos/docker/variants.ts without requiring Docker CLI,
// Docker daemon, Compose, or Buildx. Runs in seconds.
//
// For every variant in the catalog:
// 1. Applies the variant patch to the target service.
// 2. Runs the flisk up gate (`flisk up --dry-run --json`) to verify gate acceptance / rejection.
// 3. For accepted variants, validates generated Compose schema (using Ajv & YAML) and Dockerfile syntax.
// 4. Verifies verdicts match variant.expect ("accept" | "reject") with zero discrepancies.
//
//   bun docker/static-validate.ts [--service orders|storefront] [--jobs 8]
//
import { spawn } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import { parse as parseYaml } from "yaml";
import { createWorkspace, flisk, Project, REPO_ROOT } from "../graph/project.js";
import { INITIAL } from "../graph/steps.js";
import { FRONTEND_VARIANTS, VARIANTS, type Variant } from "./variants.js";

const TARGET = process.argv.includes("--service")
  ? process.argv[process.argv.indexOf("--service") + 1]
  : "orders";

const FLISK_BIN = process.env.FLISK_BIN ?? join(REPO_ROOT, "cli/bin/flisk.js");

// Compose Specification schema validator using Ajv
const ajv = new Ajv({ strict: false });
const composeServiceSchema = {
  type: "object",
  properties: {
    services: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          image: { type: "string" },
          build: {
            type: ["object", "string"],
            properties: {
              context: { type: "string" },
              dockerfile: { type: "string" },
            },
          },
          ports: {
            type: "array",
            items: { type: ["string", "number", "object"] },
          },
          environment: {
            type: ["array", "object"],
          },
          labels: {
            type: ["array", "object"],
          },
          deploy: {
            type: "object",
          },
          volumes: {
            type: "array",
          },
        },
      },
    },
  },
};
const validateCompose = ajv.compile(composeServiceSchema);

interface Outcome {
  id: string;
  expect: Variant["expect"];
  gate: boolean;
  gateSaid: string;
  staticValid: boolean;
  detail: string[];
}

function applyVariant(dir: string, variant: Variant, target: string): void {
  const path = join(dir, "services", "main", target, "service.json");
  const manifest = JSON.parse(readFileSync(path, "utf-8"));
  for (const [key, value] of Object.entries(variant.patch)) {
    if (value === undefined) delete manifest[key];
    else manifest[key] = JSON.parse(JSON.stringify(value).split("$SELF").join(target));
  }
  if (typeof variant.patch.appName === "string") manifest.name = variant.patch.appName;

  const secrets = variant.patch.secrets as { required?: unknown } | null | undefined;
  if (!variant.noSecretValues && Array.isArray(secrets?.required)) {
    const envPath = join(dir, ".env");
    const lines = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    const extra = secrets.required
      .filter((s) => typeof s === "string" && /^[A-Z_][A-Z0-9_]*$/.test(s))
      .map((s) => `${s}=chaos-secret-value\n`)
      .join("");
    writeFileSync(envPath, lines + extra);
  }
  writeFileSync(path, JSON.stringify(manifest, null, 2));
}

function runFliskAsync(dir: string): Promise<{ status: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(FLISK_BIN, ["up", "--dry-run", "--json"], {
      cwd: dir,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ status, out });
    });
    child.on("error", (error) => done({ status: 127, out: String(error) }));
  });
}

function runTilt(dir: string): Promise<{ status: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn("tilt", ["alpha", "tiltfile-result", "-f", ".flisk/.flisk-out/Tiltfile"], {
      cwd: dir,
      env: { ...process.env, FLISK_PROJECT_ROOT: dir, NO_COLOR: "1" },
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ status, out });
    });
    child.on("error", (error) => done({ status: 127, out: String(error) }));
  });
}

function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".flisk-contract") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name === name) return path;
  }
  return null;
}

/** Static OCI repository/tag reference validator */
export function validateOciImageReference(image: string): boolean {
  if (!image) return true;
  // OCI reference format: [registry/][namespace/]repository[:tag|@digest]
  // Must be lowercase for repository components, no spaces
  if (/\s/.test(image)) return false;
  // Disallow uppercase in repo path before tag/digest
  const [repo] = image.split(/[:@]/);
  if (/[A-Z]/.test(repo)) return false;
  return true;
}

export function validateDockerfileSyntax(content: string): { valid: boolean; error?: string } {
  const lines = content.split("\n");
  let hasFrom = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    if (/^FROM\s+/i.test(line)) {
      hasFrom = true;
      const match = /^FROM\s+(?:--\S+\s+)*(\S+)/i.exec(line);
      if (!match || !match[1]) {
        return { valid: false, error: `Line ${i + 1}: Malformed FROM instruction` };
      }
    }
  }
  if (!hasFrom) return { valid: false, error: "Missing FROM instruction" };
  return { valid: true };
}

export async function runStaticVariant(
  variant: Variant,
  dir: string,
  target: string,
): Promise<Outcome> {
  applyVariant(dir, variant, target);
  const gateRun = await runFliskAsync(dir);
  const gate = gateRun.status === 0;

  const outcome: Outcome = {
    id: variant.id,
    expect: variant.expect,
    gate,
    gateSaid: gateRun.out.trim(),
    staticValid: true,
    detail: [],
  };

  // If gate passed, perform static validations
  if (gate) {
    // Check if an image field was supplied and validates against OCI grammar
    if (typeof variant.patch.image === "string" && !validateOciImageReference(variant.patch.image)) {
      outcome.staticValid = false;
      outcome.detail.push(`OCI grammar violation: ${variant.patch.image}`);
    }

    // Materialise the generated files with Tilt (no daemon), then check them statically.
    const tilt = await runTilt(dir);
    if (tilt.status !== 0) {
      outcome.staticValid = false;
      outcome.detail.push(`tilt: ${tilt.out.trim().split("\n").pop()?.slice(0, 300)}`);
      return outcome;
    }
    const compose = findFile(join(dir, "services"), "docker-compose.app.autogenerated.yml");
    if (compose) {
      try {
        const doc = parseYaml(readFileSync(compose, "utf-8"));
        if (!validateCompose(doc)) {
          outcome.staticValid = false;
          outcome.detail.push(`compose schema: ${ajv.errorsText(validateCompose.errors)}`);
        }
      } catch (error) {
        outcome.staticValid = false;
        outcome.detail.push(`compose YAML: ${String(error).slice(0, 200)}`);
      }
    }
    const dockerfile = findFile(join(dir, "services", "main", target), "Dockerfile.app.autogenerated");
    if (dockerfile) {
      const check = validateDockerfileSyntax(readFileSync(dockerfile, "utf-8"));
      if (!check.valid) {
        outcome.staticValid = false;
        outcome.detail.push(`Dockerfile: ${check.error}`);
      }
    }
  }

  return outcome;
}

export async function runAllStaticVariants(options: {
  target?: string;
  jobs?: number;
  only?: string;
}): Promise<Outcome[]> {
  const target = options.target ?? TARGET;
  const jobs = options.jobs ?? 8;
  const only = options.only ?? "";

  const variants = (target === "storefront" ? FRONTEND_VARIANTS : VARIANTS).filter(
    (variant) => !only || variant.id.startsWith(only) || variant.id === "baseline",
  );

  const workspace = createWorkspace();
  const seed = Project.clone(workspace, "seed");
  seed.sync(
    target === "orders"
      ? { orders: INITIAL.orders }
      : { orders: INITIAL.orders, [target]: INITIAL[target] },
  );
  flisk(seed.dir, ["config", "regenerate"]);

  const outcomes: Outcome[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let index = next++; index < variants.length; index = next++) {
      const dir = join(workspace.root, `variant-${index}`);
      cpSync(seed.dir, dir, { recursive: true });
      const outcome = await runStaticVariant(variants[index], dir, target);
      outcomes.push(outcome);
      process.stdout.write(outcome.gate ? "." : "x");
    }
  };

  await Promise.all(Array.from({ length: jobs }, lane));
  rmSync(workspace.root, { recursive: true, force: true });
  return outcomes;
}

function report(outcomes: Outcome[]): never {
  outcomes.sort((a, b) => a.id.localeCompare(b.id));
  const broken = outcomes.filter((o) => o.gate && (!o.staticValid || o.detail.length > 0));
  const lenient = outcomes.filter((o) => o.expect === "reject" && o.gate && !broken.includes(o));
  const strict = outcomes.filter((o) => o.expect === "accept" && !o.gate);
  const accepted = outcomes.filter((o) => o.gate).length;

  console.log(
    `\n${outcomes.length} variants: ${accepted} accepted by flisk up gate, ${outcomes.length - accepted} refused`,
  );
  console.log(`\nACCEPTED BY flisk up, THEN BROKEN IN STATIC CHECKS (${broken.length}):`);
  for (const o of broken) console.log(`  ${o.id}\n      ${o.detail.join("\n      ")}`);
  console.log(`\nREFUSED BY flisk up THOUGH VALID (${strict.length}):`);
  for (const o of strict) console.log(`  ${o.id}: ${o.gateSaid}`);
  console.log(`\nACCEPTED THOUGH EXPECTED TO BE REFUSED (${lenient.length}):`);
  for (const o of lenient) console.log(`  ${o.id}`);

  writeFileSync(resolve("docker-static-report.json"), JSON.stringify(outcomes, null, 2));
  process.exit(broken.length > 0 || strict.length > 0 || lenient.length > 0 ? 1 : 0);
}

async function main(): Promise<void> {
  const flag = (name: string): string | undefined => {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  const jobs = Number(flag("jobs")) || 8;
  const only = flag("only") ?? "";

  const t0 = performance.now();
  console.log(`Starting static validation for target "${TARGET}" with ${jobs} workers...`);
  const outcomes = await runAllStaticVariants({ target: TARGET, jobs, only });
  console.log(`\nCompleted in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  report(outcomes);
}

if (import.meta.main) await main();
