// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, runCommand, TdkError } from "../utils/errors.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
const SESSION_REQUEST_TIMEOUT_MS = 10_000;
export const agentCommand = new Command("agent").description("Inspect and operate AI agent resources");
agentCommand
    .command("sessions <resource>")
    .description("Inspect session checkpoints from a running AI agent resource")
    .option("--session-id <id>", "Session ID to fetch (required)")
    .option("--json", "Output one JSON object and exit", false)
    .action(async (resourceName, options) => {
    const action = async () => {
        const root = findProjectRoot();
        if (!root) {
            const error = errorFactories.notInProject();
            if (options.json)
                writeMachineError(error);
            error.exit();
        }
        const discovery = createDiscoveryContext();
        const resource = discovery.resources.find((r) => r.name === resourceName);
        if (!resource) {
            const msg = `Resource "${resourceName}" not found in project.`;
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "UNKNOWN_RESOURCE", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg);
        }
        const appType = resource.config?.appType ?? resource.type;
        if (appType !== "agent") {
            const msg = `Resource "${resourceName}" is of type "${appType}", not "agent".`;
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "NOT_AN_AGENT", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg);
        }
        const port = resource.port;
        if (!port) {
            const msg = `Agent "${resourceName}" has no assigned port.`;
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "NO_PORT", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg);
        }
        // The agent runtime keys GET /session by x-session-id and has no list endpoint, so a missing id
        // would only come back as a confusing 400. Fail before any request. Checked after resource
        // validation so UNKNOWN_RESOURCE, NOT_AN_AGENT and NO_PORT keep their precedence.
        const sessionId = typeof options.sessionId === "string" ? options.sessionId.trim() : "";
        if (!sessionId) {
            const msg = `--session-id is required: the agent "${resourceName}" returns the checkpoint of one session.`;
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "SESSION_ID_REQUIRED", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg, [`Run: tdk agent sessions ${resourceName} --session-id <id>`]);
        }
        const headers = { "x-session-id": sessionId };
        let res;
        let bodyText;
        try {
            // One signal covers both the connection and the body read, so a hung agent cannot block the CLI.
            res = await fetch(`http://127.0.0.1:${port}/session`, {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(SESSION_REQUEST_TIMEOUT_MS),
            });
            bodyText = await res.text();
        }
        catch {
            const msg = `Agent "${resourceName}" is not responding on port ${port}. Is the stack running?`;
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "AGENT_NOT_RUNNING", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg, ["Start the stack with: tdk up"]);
        }
        let body = {};
        try {
            body = bodyText ? JSON.parse(bodyText) : {};
        }
        catch {
            body = { raw: bodyText };
        }
        if (!res.ok) {
            const detail = body?.error ?? bodyText;
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [
                    {
                        code: "AGENT_REQUEST_FAILED",
                        message: `Agent returned ${res.status}: ${detail}`,
                    },
                ])));
                process.exit(1);
            }
            throw new TdkError(`Agent error (${res.status}): ${detail}`);
        }
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({
                agent: resourceName,
                port,
                session: body,
            })));
            return;
        }
        console.log(chalk.bold(`Sessions for ${resourceName}:`));
        console.log(JSON.stringify(body, null, 2));
    };
    if (options.json) {
        try {
            await action();
        }
        catch (err) {
            writeMachineError(err);
        }
        return;
    }
    await runCommand(action);
});
