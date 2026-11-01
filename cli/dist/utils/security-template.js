// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";
/** The security-agent starter: scanner, triage and reporter, all local processes (no Docker). */
export const SECURITY_PORTS = { scanner: 4200, triage: 4201, reporter: 4202 };
const AGENTS = ["scanner", "triage", "reporter"];
/** The service.json of each agent, keyed by its path in the project folder. */
export function securityManifests() {
    const env = {
        scanner: { TRIAGE_URL: `http://localhost:${SECURITY_PORTS.triage}` },
        triage: { REPORTER_URL: `http://localhost:${SECURITY_PORTS.reporter}` },
        reporter: {},
    };
    const dependsOn = {
        scanner: ["triage"],
        triage: ["reporter"],
        reporter: [],
    };
    const manifests = {};
    for (const name of AGENTS) {
        manifests[`${name}/service.json`] = {
            schemaVersion: 1,
            appName: name,
            appType: "backend",
            command: "node server.mjs",
            port: SECURITY_PORTS[name],
            healthCheckPath: "/health",
            env: env[name],
            dependsOn: dependsOn[name],
        };
    }
    return manifests;
}
const README = `# Flisk security agents

Three agents in a line: the scanner finds risky patterns, triage rates them, the reporter keeps the report.
Everything runs as local processes: no Docker.

\`\`\`bash
flisk up
curl -X POST localhost:${SECURITY_PORTS.scanner}/scan -H 'content-type: application/json' \\
  -d '{"files":{"app.js":"const apiKey = \\"abcdef123456\\";\\neval(input)"}}'
curl localhost:${SECURITY_PORTS.reporter}/report
\`\`\`

Add rules in \`scanner/server.mjs\` and advice in \`triage/server.mjs\`, or call a model from either.
`;
/** Writes the security-agent project into `dir`. */
export function writeSecurityProject(dir, readTemplate = loadTemplate) {
    const files = { "README.md": README };
    for (const name of AGENTS)
        files[`${name}/server.mjs`] = readTemplate(`security/${name}/server.mjs`);
    for (const [name, manifest] of Object.entries(securityManifests())) {
        files[name] = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    for (const [name, contents] of Object.entries(files)) {
        const path = join(dir, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
    }
}
