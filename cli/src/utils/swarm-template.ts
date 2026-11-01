// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";

/** The swarm starter: one coordinator and three workers, all local processes (no Docker). */
export const SWARM_COORDINATOR_PORT = 4100;
export const SWARM_WORKERS = 3;

const TEMPLATE_FILES = ["coordinator/server.mjs", "worker/server.mjs"] as const;

/** The service.json of each service, keyed by its path in the project folder. */
export function swarmManifests(): Record<string, Record<string, unknown>> {
  const coordinatorUrl = `http://localhost:${SWARM_COORDINATOR_PORT}`;
  const manifests: Record<string, Record<string, unknown>> = {
    "coordinator/service.json": {
      schemaVersion: 1,
      appName: "coordinator",
      appType: "backend",
      command: "node server.mjs",
      port: SWARM_COORDINATOR_PORT,
      healthCheckPath: "/health",
    },
  };
  for (let n = 1; n <= SWARM_WORKERS; n++) {
    manifests[`worker-${n}/service.json`] = {
      schemaVersion: 1,
      appName: `worker-${n}`,
      appType: "worker",
      command: "node ../worker/server.mjs",
      port: SWARM_COORDINATOR_PORT + n,
      healthCheckPath: "/health",
      env: { WORKER_NAME: `worker-${n}`, COORDINATOR_URL: coordinatorUrl },
      dependsOn: ["coordinator"],
    };
  }
  return manifests;
}

const README = `# Flisk swarm

A coordinator splits a goal into subtasks. Three workers pull subtasks, do them and post the answers.
Everything runs as local processes: no Docker.

\`\`\`bash
flisk up
curl -X POST localhost:${SWARM_COORDINATOR_PORT}/goals -H 'content-type: application/json' \\
  -d '{"goal":"Read the docs. Summarize them and list the risks"}'
open http://localhost:${SWARM_COORDINATOR_PORT}
\`\`\`

Edit \`work()\` in \`worker/server.mjs\` to call your model or tool. Add workers by copying a \`worker-N\` folder.
`;

/** Writes the swarm project into `dir`. */
export function writeSwarmProject(
  dir: string,
  readTemplate: (name: string) => string = loadTemplate,
): void {
  const files: Record<string, string> = { "README.md": README };
  for (const name of TEMPLATE_FILES) files[name] = readTemplate(`swarm/${name}`);
  for (const [name, manifest] of Object.entries(swarmManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}
