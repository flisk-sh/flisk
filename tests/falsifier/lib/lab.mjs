// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The scratch space FALSIFIER runs in. It reuses ORACLE's CLI runner and scaffolder (which draw on ENIGMA's plan), and keeps one
// pristine project plus one backend and one bring-your-own template so graph scenarios cost a file copy, not a `flisk resource`.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drawScenario } from "../../oracle/lib/scenario.mjs";
import { parseEnvelope, runFlisk, scaffold } from "../../oracle/lib/surfaces.mjs";

export { parseEnvelope, runFlisk };

function must(label, r) {
  if (r.code !== 0) throw new Error(`${label} exited ${r.code}: ${(r.stderr || r.stdout).slice(0, 300)}`);
  return r;
}

export function makeLab() {
  const root = mkdtempSync(path.join(os.tmpdir(), "falsifier-"));
  let templates;
  let base;
  try {
    const init = (dir) => {
      mkdirSync(dir, { recursive: true });
      spawnSync("git", ["init", "-q", "."], { cwd: dir });
      must("flisk project", runFlisk(dir, ["project", "--yes", "--json"]));
    };
    base = path.join(root, "base");
    init(base);
    // Templates come from a throwaway project, so `base` stays exactly what `flisk project` wrote.
    const tplProject = path.join(root, "tpl-project");
    init(tplProject);
    must("template backend", runFlisk(tplProject, ["resource", "tpl-backend", "--type", "backend", "--stack", "main", "--json"]));
    must("template byo", runFlisk(tplProject, ["resource", "tpl-byo", "--type", "bring-your-own", "--stack", "main", "--dockerfile", "Dockerfile", "--json"]));
    templates = { backend: path.join(root, "t-backend"), byo: path.join(root, "t-byo") };
    cpSync(path.join(tplProject, "services/main/tpl-backend"), templates.backend, { recursive: true });
    cpSync(path.join(tplProject, "services/main/tpl-byo"), templates.byo, { recursive: true });
  } catch (e) {
    rmSync(root, { recursive: true, force: true });
    throw e;
  }
  const enigma = new Map();
  let shared = null;
  const scratch = [];
  let n = 0;
  const lab = {
    shared() { if (!shared) { shared = lab.clone(); scratch.pop(); lab.addService(shared, { name: "existing", port: 4999 }); } return shared; },
    root, base, templates,
    clone() { const d = path.join(root, `c${n++}`); cpSync(base, d, { recursive: true }); scratch.push(d); return d; },
    // Scenario copies are deleted after each scenario so a long run stays small.
    sweep() { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); },
    // One ENIGMA-drawn project per seed, scaffolded once and cloned for each property that reads it.
    enigmaProject(seed, count) {
      const key = `${seed}/${count}`;
      if (!enigma.has(key)) {
        const dir = path.join(root, `enigma-${seed}-${count}`, "project");
        const scenario = drawScenario(seed, { shape: "enigma-mix", count });
        scaffold(scenario, dir);
        enigma.set(key, { dir, scenario });
      }
      const { dir, scenario } = enigma.get(key);
      const copy = path.join(root, `e${n++}`);
      cpSync(dir, copy, { recursive: true });
      scratch.push(copy);
      return { dir: copy, scenario };
    },
    addService(dir, { name, stack = "main", template = "backend", port, dependsOn = [], patch = {} }) {
      const target = path.join(dir, "services", stack, name);
      cpSync(templates[template], target, { recursive: true });
      const file = path.join(target, "service.json");
      const json = { ...JSON.parse(readFileSync(file, "utf8")), appName: name, name, stack, port, dependsOn, ...patch };
      if (json.dependsOn.length === 0) delete json.dependsOn;
      writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    },
    dispose() { rmSync(root, { recursive: true, force: true }); },
  };
  return lab;
}

export function walk(dir, skip = new Set(["node_modules", ".git"])) {
  const out = [];
  const go = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) go(path.join(d, e.name), r); else out.push(r);
    }
  };
  if (existsSync(dir)) go(dir, "");
  return out.sort();
}

export function envelope(r) { try { return parseEnvelope(r.stdout); } catch { return null; } }
