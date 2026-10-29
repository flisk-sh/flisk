// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Docker tier: take a valid project, change one service.json field to a good or bad value, and follow the value to the places
// that break. For every value `flisk up` accepts (the gate), execute the generated Tiltfile, validate the generated Compose
// file with `docker compose config`, and lint the generated Dockerfile with `docker buildx build --check`. A value the gate
// accepted and one of those refuses is a bug: `flisk up` should have said no before starting anything.
//
//   bun docker/run.ts [--jobs 4] [--only appName]
//
// Needs tilt and docker (Compose and Buildx) on PATH. No image is built and no container starts: the base images the generated
// Dockerfile names are replaced by a local image through --build-context, and only the Dockerfile is checked.
import { spawn } from "node:child_process";
import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWorkspace, flisk, Project, REPO_ROOT } from "../graph/project.js";
import { INITIAL } from "../graph/steps.js";
import { FRONTEND_VARIANTS, VARIANTS, type Variant } from "./variants.js";

/** The service whose service.json each variant edits: `orders` (a backend) or `storefront` (a frontend). */
const TARGET = process.argv.includes("--service")
  ? process.argv[process.argv.indexOf("--service") + 1]
  : "orders";

const FLISK_BIN = process.env.FLISK_BIN ?? join(REPO_ROOT, "cli/bin/flisk.js");

interface Run {
  status: number | null;
  out: string;
}

function sh(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<Run> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env, NO_COLOR: "1" } });
    let out = "";
    const collect = (data: Buffer): void => {
      out += data;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill("SIGKILL"), 240_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ status, out });
    });
    child.on("error", (error) => done({ status: 127, out: String(error) }));
  });
}

const tail = (text: string, lines = 3): string =>
  text
    .split("\n")
    .filter((line) => line.trim())
    .slice(-lines)
    .join(" | ")
    .slice(0, 400);

/** A small image that is already on this machine, used in place of the golden base images (never pulled, never built). */
async function baseImage(): Promise<string> {
  if (process.env.CHAOS_BASE_IMAGE) return process.env.CHAOS_BASE_IMAGE;
  const listing = await sh(
    "docker",
    ["image", "ls", "--format", "{{.Repository}}:{{.Tag}} {{.Size}}"],
    ".",
  );
  const megabytes = (size: string): number =>
    Number.parseFloat(size) * (/GB/.test(size) ? 1000 : /kB/i.test(size) ? 0.001 : 1);
  const local = listing.out
    .split("\n")
    .map((line) => line.trim().split(" "))
    .filter(([ref]) => ref && !ref.includes("<none>"))
    .sort((a, b) => megabytes(a[1] ?? "0") - megabytes(b[1] ?? "0"));
  if (local[0]) return local[0][0];
  await sh("docker", ["pull", "alpine:3.20"], ".");
  return "alpine:3.20";
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

interface Outcome {
  id: string;
  expect: Variant["expect"];
  /** `flisk up --dry-run` accepted the project. */
  gate: boolean;
  gateSaid: string;
  tilt?: boolean;
  compose?: boolean;
  dockerfile?: boolean;
  detail: string[];
}

/** Merge the variant into the target service's service.json; a new stack is enabled the way `flisk up` would. */
function applyVariant(dir: string, variant: Variant): void {
  const path = join(dir, "services", "main", TARGET, "service.json");
  const manifest = JSON.parse(readFileSync(path, "utf-8"));
  for (const [key, value] of Object.entries(variant.patch)) {
    if (value === undefined) delete manifest[key];
    else manifest[key] = JSON.parse(JSON.stringify(value).split("$SELF").join(TARGET));
  }
  if (typeof variant.patch.appName === "string") manifest.name = variant.patch.appName;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  const stack = variant.patch.stack;
  if (typeof stack === "string" && stack) {
    const projectJson = join(dir, ".flisk/project.json");
    const config = JSON.parse(readFileSync(projectJson, "utf-8"));
    if (!config.phases.pre_alpha.enabledStacks.includes(stack))
      config.phases.pre_alpha.enabledStacks.push(stack);
    writeFileSync(projectJson, `${JSON.stringify(config, null, 2)}\n`);
    flisk(dir, ["config", "regenerate"]);
  }
}

async function runVariant(variant: Variant, dir: string, image: string): Promise<Outcome> {
  const outcome: Outcome = {
    id: variant.id,
    expect: variant.expect,
    gate: false,
    gateSaid: "",
    detail: [],
  };
  applyVariant(dir, variant);

  const up = await sh(process.execPath, [FLISK_BIN, "up", "--dry-run", "--json"], dir);
  const envelope = up.out.slice(up.out.lastIndexOf("\n{") + 1) || up.out;
  outcome.gate = up.status === 0 && /"ok":\s*true/.test(envelope);
  outcome.gateSaid = tail(envelope, 2);
  if (!outcome.gate) return outcome;

  const tilt = await sh(
    "tilt",
    ["alpha", "tiltfile-result", "-f", ".flisk/.flisk-out/Tiltfile"],
    dir,
    {
      FLISK_PROJECT_ROOT: dir,
    },
  );
  outcome.tilt = tilt.status === 0;
  if (!outcome.tilt) {
    const error = tilt.out
      .split("\n")
      .filter((line) => /Error in|^Error|error:/.test(line.trim()))
      .pop();
    outcome.detail.push(`tilt: ${(error ?? tail(tilt.out, 2)).trim().slice(0, 300)}`);
    return outcome;
  }

  const compose = findFile(join(dir, "services"), "docker-compose.app.autogenerated.yml");
  if (compose) {
    const config = await sh(
      "docker",
      ["compose", "-f", compose, "--env-file", join(dir, ".env"), "config", "-q"],
      dir,
    );
    outcome.compose = config.status === 0;
    if (!outcome.compose) outcome.detail.push(`compose: ${tail(config.out, 2)}`);
  }

  const dockerfile = findFile(
    join(dir, "services", "main", TARGET),
    "Dockerfile.app.autogenerated",
  );
  if (dockerfile) {
    const refs = new Set<string>();
    const aliases = new Set<string>();
    for (const match of readFileSync(dockerfile, "utf-8").matchAll(
      /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/gim,
    )) {
      if (match[1] && match[1] !== "scratch" && !aliases.has(match[1])) refs.add(match[1]);
      if (match[2]) aliases.add(match[2]);
    }
    const args = ["buildx", "build", "--check", "-f", dockerfile];
    for (const ref of refs) {
      // `FROM ${BASE_IMAGE}`: Compose passes the variable as a build arg, so the lint call has to as well.
      const variable = /^\$\{?(\w+)\}?$/.exec(ref)?.[1];
      if (variable) args.push("--build-arg", `${variable}=${image}`);
      else args.push("--build-context", `${ref}=docker-image://${image}`);
    }
    const lint = await sh("docker", [...args, dir], dir);
    outcome.dockerfile = lint.status === 0;
    if (!outcome.dockerfile) outcome.detail.push(`dockerfile: ${tail(lint.out)}`);
  }
  return outcome;
}

function report(outcomes: Outcome[]): never {
  outcomes.sort((a, b) => a.id.localeCompare(b.id));
  const broken = outcomes.filter(
    (o) => o.gate && (o.tilt === false || o.compose === false || o.dockerfile === false),
  );
  const lenient = outcomes.filter((o) => o.expect === "reject" && o.gate && !broken.includes(o));
  const strict = outcomes.filter((o) => o.expect === "accept" && !o.gate);
  const accepted = outcomes.filter((o) => o.gate).length;
  console.log(
    `${outcomes.length} variants: ${accepted} accepted by flisk up, ${outcomes.length - accepted} refused`,
  );
  console.log(
    `\nACCEPTED BY flisk up, THEN BROKEN IN TILT, COMPOSE OR THE DOCKERFILE (${broken.length}):`,
  );
  for (const o of broken) console.log(`  ${o.id}\n      ${o.detail.join("\n      ")}`);
  console.log(`\nREFUSED BY flisk up THOUGH VALID (${strict.length}):`);
  for (const o of strict) console.log(`  ${o.id}: ${o.gateSaid}`);
  console.log(`\nACCEPTED THOUGH EXPECTED TO BE REFUSED, AND NOTHING BROKE (${lenient.length}):`);
  for (const o of lenient) console.log(`  ${o.id}`);
  writeFileSync(resolve("docker-chaos-report.json"), JSON.stringify(outcomes, null, 2));
  // A value expected to be refused but accepted harmlessly also fails: it means the catalog says something the tool does not do.
  process.exit(broken.length > 0 || strict.length > 0 || lenient.length > 0 ? 1 : 0);
}

async function main(): Promise<void> {
  const flag = (name: string): string | undefined => {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  const jobs = Number(flag("jobs")) || 4;
  const only = flag("only") ?? "";
  const variants = (TARGET === "storefront" ? FRONTEND_VARIANTS : VARIANTS).filter(
    (variant) => !only || variant.id.startsWith(only) || variant.id === "baseline",
  );
  const image = await baseImage();
  console.log(
    `Dockerfile checks use ${image} for the base images; ${variants.length} variants, ${jobs} at a time`,
  );

  const workspace = createWorkspace();
  const seed = Project.clone(workspace, "seed");
  seed.sync(
    TARGET === "orders"
      ? { orders: INITIAL.orders }
      : { orders: INITIAL.orders, [TARGET]: INITIAL[TARGET] },
  );
  flisk(seed.dir, ["config", "regenerate"]);

  const outcomes: Outcome[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let index = next++; index < variants.length; index = next++) {
      const dir = join(workspace.root, `variant-${index}`);
      cpSync(seed.dir, dir, { recursive: true });
      const outcome = await runVariant(variants[index], dir, image);
      outcomes.push(outcome);
      process.stdout.write(outcome.gate ? "." : "x");
    }
  };
  await Promise.all(Array.from({ length: jobs }, lane));
  console.log("\n");
  report(outcomes);
}

if (import.meta.main) await main();
