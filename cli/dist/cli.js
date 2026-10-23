#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";
import chalk from "chalk";
import pkg from "../package.json" with { type: "json" };
import { showHelp } from "./commands/help.js";
import { createProgram } from "./program.js";
import { ensureGlobalInstall } from "./utils/cli-command.js";
import { formatColdPreflight, runColdPreflight } from "./utils/cold-preflight.js";
import { unknownHelpTarget } from "./utils/help-command.js";
import { bareTemplateArg } from "./utils/project-templates.js";
const program = createProgram();
// Default: show help if no command provided
if (process.argv.length === 2) {
    const result = await runColdPreflight();
    console.log(formatColdPreflight(result));
    console.log("\nCommands: flisk doctor | flisk project --yes | flisk --help");
    console.log("\nOne command from scratch (clones, boots and opens the browser):");
    console.log(`  npx -y @flisk-sh/flisk@latest demo`);
    console.log(`  npx -y @flisk-sh/flisk@latest restaurant --project=my-stack`);
    process.exit(result.ok ? 0 : 1);
}
// One command from scratch: flisk <template> | flisk --template <name> --project <dir>
// It clones a starter, installs the CLI globally, boots the stack and opens the frontend.
const templateArg = readOptionValue(process.argv, "--template") ?? bareTemplateArg(process.argv);
const projectArg = readOptionValue(process.argv, "--project");
if (templateArg) {
    // Native Windows cannot boot a stack, so the one-command flow refuses before it clones a
    // template, installs the CLI globally or writes into the home directory.
    const { nativeWindowsStackRefusal } = await import("./utils/native-windows.js");
    const platformRefusal = nativeWindowsStackRefusal(process.platform, process.env.TDK_ALLOW_NATIVE_WINDOWS);
    if (platformRefusal) {
        console.error(chalk.red(`❌ ${platformRefusal}`));
        console.error(chalk.gray("   Run it from Ubuntu in WSL2. Guide: docs/wsl2.md"));
        process.exit(1);
    }
    const { cloneProjectTemplate, templateTargetDir } = await import("./commands/project.js");
    const { assertMachineReadyOrExit } = await import("./utils/cold-preflight.js");
    await assertMachineReadyOrExit({ scope: "scaffold" });
    // A second demo in the same folder gets its own directory instead of failing.
    const { nextAvailableProjectDir } = await import("./utils/one-command.js");
    const { PROJECT_TEMPLATES } = await import("./utils/project-templates.js");
    const { listFrontendTargets, pickReadyFrontend } = await import("./commands/open.js");
    const { discoverResourcesWithProblems } = await import("./utils/services.js");
    const { openUrl } = await import("./utils/url-actions.js");
    const { createDemoStage } = await import("./utils/demo-stage.js");
    const baseName = templateTargetDir(templateArg, projectArg);
    const fixedDir = projectArg ? undefined : PROJECT_TEMPLATES[templateArg]?.fixedDir;
    const keep = process.argv.includes("--keep");
    let targetName;
    if (fixedDir) {
        // A template with a fixed directory always lands in the same place, so a demo never
        // leaves a new folder behind in whatever folder the command was typed in.
        targetName = join(homedir(), ".flisk", fixedDir);
    }
    else {
        targetName = nextAvailableProjectDir(baseName, (candidate) => {
            const path = resolve(cwd(), candidate);
            return existsSync(path) && readdirSync(path).length > 0;
        });
        if (targetName !== baseName) {
            console.log(chalk.gray(`The folder ${baseName} is taken, using ${targetName} instead.`));
        }
    }
    const destination = isAbsolute(targetName) ? targetName : resolve(cwd(), targetName);
    // Reusing an existing checkout is what keeps a second take free: the clone and the
    // dependency install are skipped, so the recording starts on the interesting part.
    let reused = false;
    if (fixedDir && existsSync(destination)) {
        if (!existsSync(join(destination, ".tdk", "project.json"))) {
            console.log(chalk.yellow(`${destination} already exists and is not a Flisk project.`));
            console.log(chalk.gray("  Remove it, or use --project <dir> to put the demo somewhere else."));
            process.exit(1);
        }
        // A stack for this project may already be running (the same example in another folder
        // shares its compose project). Then there is nothing to start: open what is up.
        const running = await pickReadyFrontend(await listFrontendTargets(destination), 0);
        if (running) {
            console.log(chalk.gray(`The demo is already running: ${running.url}`));
            await openUrl(running.url);
            process.exit(0);
        }
        if (keep) {
            reused = true;
        }
        else {
            rmSync(destination, { recursive: true, force: true });
        }
    }
    // Docker on Colima is only usable while the VM is up, and a stopped VM looks like a
    // broken Docker daemon. Say so before the long wait instead of after it.
    const { checkColima } = await import("./utils/colima.js");
    const colima = checkColima();
    if (colima.isColima && !colima.running) {
        console.log(chalk.yellow(colima.problem ?? "The Colima VM is not running."));
        console.log(chalk.gray(`  Fix: ${colima.fix ?? "colima start"}`));
        process.exit(1);
    }
    let phases = [
        {
            id: "fetch",
            label: reused ? "Reusing the demo" : "Fetching the demo",
            status: "active",
        },
        { id: "config", label: "Generating project config", status: "pending" },
        { id: "deps", label: "Installing dependencies", status: "pending" },
        { id: "start", label: "Starting services", status: "pending" },
    ];
    const stage = createDemoStage({
        title: "Flisk demo",
        subtitle: `${templateArg} starter`,
        phases,
        servicesReady: 0,
        servicesTotal: 0,
        servicesBuilding: 0,
        elapsedMs: 0,
    });
    const setPhase = (id, status, elapsedMs) => {
        phases = phases.map((phase) => phase.id === id ? { ...phase, status, elapsedMs: elapsedMs ?? phase.elapsedMs } : phase);
        stage.update({ phases });
    };
    const logLines = [`flisk ${pkg.version} ${templateArg}`, `cwd: ${destination}`];
    // 1. Clone (or reuse) and install the CLI. Both are silent so the frame on screen is the
    // only thing that moves.
    const fetchStarted = Date.now();
    try {
        if (!reused) {
            await cloneProjectTemplate(templateArg, targetName, [], { quiet: true });
        }
    }
    catch (error) {
        stage.fail(error instanceof Error ? error.message : String(error), "Check that git is installed and that you are online, then run the command again.");
        stage.stop();
        process.exit(1);
    }
    const install = ensureGlobalInstall();
    setPhase("fetch", "done", Date.now() - fetchStarted);
    const binPath = process.argv[1];
    if (!binPath || !existsSync(destination)) {
        stage.fail("The demo could not find the CLI entry point or the project folder.", "Reinstall the Flisk CLI package and run the command again.");
        stage.stop();
        process.exit(1);
    }
    const { initializeProject, installServiceDependencies, runStackQuiet } = await import("./utils/one-command.js");
    // 2. A cloned starter has no project configuration yet, and `flisk up` refuses to run
    // without one, so the project is set up before the stack starts.
    const configStarted = Date.now();
    const setup = await initializeProject(binPath, destination);
    logLines.push("--- project setup ---", setup.output ?? "");
    if (!setup.ok) {
        const logPath = writeLog(logLines);
        stage.fail(setup.error ?? "The project setup did not finish.", "Run `flisk project --yes` in the project folder to see what it printed.", logPath);
        stage.stop();
        process.exit(1);
    }
    setPhase("config", "done", Date.now() - configStarted);
    // The true service count comes from the project on disk, so the frame says "0 of 6"
    // while the stack is starting instead of "no services found".
    const discovered = discoverResourcesWithProblems(destination).resources.length;
    stage.update({ servicesTotal: discovered });
    // 3. A fresh clone has no host dependencies, and the stack typechecks the services on the
    // host, so install them before the stack starts.
    const depsStarted = Date.now();
    const installs = await installServiceDependencies(destination);
    const failedInstalls = installs.filter((entry) => !entry.ok);
    for (const entry of installs)
        logLines.push(`install ${entry.dir}: ${entry.ok ? "ok" : "failed"}`);
    if (failedInstalls.length > 0) {
        stage.fail(`${failedInstalls.length} of ${installs.length} services could not install their dependencies.`, `Run "bun install" in ${failedInstalls[0]?.dir ?? "the failed services"}.`, writeLog(logLines));
        stage.stop();
        process.exit(1);
    }
    setPhase("deps", "done", Date.now() - depsStarted);
    // 4. Start the stack and report what Tilt is doing. The Tilt port is not fixed (another
    // project may hold the default), so the ports that answer are looked at.
    const startStarted = Date.now();
    setPhase("start", "active");
    const { readStackProgress } = await import("./utils/stack-progress.js");
    const { classifyTiltPorts } = await import("./utils/tilt-port-owner.js");
    const candidates = Array.from({ length: 10 }, (_, index) => 10350 + index);
    let watching = true;
    // Tilt counts every resource it starts, including the database and the proxy. That is the
    // number the progress line shows, so the last frame has to finish on the same one.
    let lastTotal = discovered;
    void (async () => {
        while (watching) {
            try {
                const { running } = await classifyTiltPorts(candidates, destination, async (port) => (await readStackProgress(port)) !== undefined);
                for (const port of running) {
                    const progress = await readStackProgress(port);
                    if (progress) {
                        lastTotal = progress.total;
                        stage.update({
                            servicesReady: progress.ready,
                            servicesTotal: progress.total,
                            servicesBuilding: progress.building,
                        });
                        break;
                    }
                }
            }
            catch {
                // A port that closes mid-read is not a demo failure; the next pass picks it up.
            }
            await new Promise((resolve) => {
                // Never keep the process alive just because the watcher is between passes.
                const timer = setTimeout(resolve, 2000);
                timer.unref?.();
            });
        }
    })();
    const outcome = await runStackQuiet(binPath, destination);
    watching = false;
    logLines.push("--- stack ---", outcome.raw ?? "");
    if (!outcome.ok) {
        const tiltUiUrl = outcome.data?.tiltUrl ?? "http://localhost:10350";
        stage.fail(firstMachineFailure(outcome.raw) ?? outcome.error ?? "The stack stopped before it was ready.", `Run \`flisk up\` in the project folder, or watch ${tiltUiUrl}.`, writeLog(logLines));
        stage.stop();
        process.exit(1);
    }
    setPhase("start", "done", Date.now() - startStarted);
    stage.update({ servicesReady: lastTotal, servicesTotal: lastTotal });
    // 5. Open the browser only when a frontend actually answers, the same way `flisk open`
    // does. A failed open is not a failed demo: the URL is already on screen.
    const targets = await listFrontendTargets(destination);
    const first = await pickReadyFrontend(targets, 30_000);
    if (first)
        await openUrl(first.url);
    const generated = countFiles(join(destination, ".tdk"));
    const wired = countFiles(destination, ["node_modules", ".git"]);
    stage.update({ subtitle: `${templateArg} starter \u00b7 ${countLabel(wired, "file")} wired` });
    stage.finish({
        urls: (first ? [first.url, ...targets.map((target) => target.url)] : targets.map((t) => t.url))
            .filter((url, index, all) => all.indexOf(url) === index)
            .slice(0, 2),
        summary: `${countLabel(generated, "file")} generated \u00b7 ${countLabel(discovered, "app service")} \u00b7 live reload`,
        hint: "Edit any file and the browser updates.",
        version: pkg.version,
    });
    stage.stop();
    if (install === "failed") {
        console.log(chalk.gray("\n  `flisk` is not on your PATH. Next time, run this command again with npx."));
    }
    process.exit(0);
}
if (process.argv[2] === "--doctor")
    process.argv[2] = "doctor";
if (process.argv.length === 3 && ["-h", "--help", "help"].includes(process.argv[2])) {
    showHelp();
    process.exit(0);
}
const unknownHelp = unknownHelpTarget(process.argv.slice(2), program.commands);
if (unknownHelp) {
    program.error(`error: unknown command '${unknownHelp}'`, {
        exitCode: 1,
        code: "commander.unknownCommand",
    });
}
program.parse();
/** Reads `--name value` and `--name=value` out of the raw arguments. */
function readOptionValue(args, name) {
    const prefix = `${name}=`;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg.startsWith(prefix))
            return arg.slice(prefix.length);
        if (arg === name)
            return args[index + 1];
    }
    return undefined;
}
/** `1 file`, `240 files`. The frame is read by people, so the count has to agree with itself. */
function countLabel(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
/** Counts the files under `root`, skipping the directories in `skip`. */
function countFiles(root, skip = []) {
    let total = 0;
    const walk = (dir) => {
        try {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                if (skip.includes(entry.name))
                    continue;
                const path = join(dir, entry.name);
                if (entry.isDirectory())
                    walk(path);
                else if (entry.isFile())
                    total += 1;
            }
        }
        catch {
            // An unreadable directory must not cost the demo its final frame.
        }
    };
    walk(root);
    return total;
}
/**
 * The first machine check that failed in the stack output.
 *
 * `up` reports "exited with code 1" when a check fails before Tilt starts, which says
 * nothing. The check line above it says what is actually missing.
 */
function firstMachineFailure(raw) {
    if (!raw)
        return undefined;
    for (const line of raw.split("\n")) {
        const match = /^\s*FAIL\s+(.+)$/.exec(line);
        if (match?.[1])
            return match[1].trim();
    }
    return undefined;
}
/** Writes the child output somewhere a failed run can be inspected. */
function writeLog(lines) {
    try {
        const dir = join(homedir(), ".flisk", "logs");
        mkdirSync(dir, { recursive: true });
        const path = join(dir, `demo-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
        writeFileSync(path, lines.join("\n"));
        return path;
    }
    catch {
        return undefined;
    }
}
