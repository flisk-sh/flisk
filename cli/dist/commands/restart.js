// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { STANDARD_PORTS } from "../utils/constants.js";
import { errorFactories, runCommand, TdkError } from "../utils/errors.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { isTiltAvailable, runTilt } from "../utils/tilt.js";
import { isTiltConnectionFailure } from "../utils/tilt-logs.js";
import { tiltUnreachableMessage } from "../utils/tilt-unreachable-message.js";
export const restartCommand = new Command("restart")
    .description("Restart a running resource in the stack")
    .argument("<resource>", "Name of the resource (service) to restart")
    .option("--port <n>", "Tilt UI port (default: TILT_PORT or 10350)")
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
        const portText = options.port ?? process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
        let tiltAvailable = false;
        try {
            tiltAvailable = await isTiltAvailable();
        }
        catch {
            tiltAvailable = false;
        }
        if (!tiltAvailable) {
            const msg = tiltUnreachableMessage(portText);
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                process.exit(1);
            }
            throw new TdkError(msg, ["Start the stack first with: tdk up"]);
        }
        const result = await runTilt("trigger", [resourceName, "--port", portText], {
            inheritStdio: false,
        });
        if (result.exitCode !== 0) {
            const detail = result.stderr.trim();
            if (!detail || isTiltConnectionFailure(detail)) {
                const msg = tiltUnreachableMessage(portText);
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_NOT_RUNNING", message: msg }])));
                    process.exit(1);
                }
                throw new TdkError(msg, ["Start the stack first with: tdk up"]);
            }
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(null, [{ code: "TILT_TRIGGER_FAILED", message: detail }])));
                process.exit(1);
            }
            throw new TdkError(`Failed to restart ${resourceName}: ${detail}`);
        }
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({ resource: resourceName, restarted: true })));
            return;
        }
        console.log(chalk.green(`✓ Triggered restart for ${resourceName}`));
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
