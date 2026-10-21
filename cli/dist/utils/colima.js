// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
const defaultDeps = () => ({
    env: process.env,
    dockerAnswers: () => {
        try {
            execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
                encoding: "utf-8",
                timeout: 10_000,
                stdio: ["ignore", "pipe", "ignore"],
            });
            return true;
        }
        catch {
            return false;
        }
    },
    run: (command, args) => {
        // colima logs to stderr, so both streams matter.
        const result = spawnSync(command, args, {
            encoding: "utf-8",
            timeout: 20_000,
            stdio: ["ignore", "pipe", "pipe"],
        });
        return `${result.stdout ?? ""}${result.stderr ?? ""}`;
    },
    exists: existsSync,
    home: process.env.HOME ?? "",
});
/** True when the Docker endpoint belongs to a Colima VM. */
export function isColimaDocker(deps = defaultDeps()) {
    const host = deps.env.DOCKER_HOST ?? "";
    if (host.includes(".colima"))
        return true;
    const socket = join(deps.home, ".colima", "default", "docker.sock");
    return deps.exists(socket) && host.includes("docker.sock") === false && host !== "";
}
/**
 * The state of the Colima VM behind Docker.
 *
 * Two failures matter and both look like "Docker is not working": the VM is not running, and
 * Lima itself is an x86_64 build on an Apple Silicon machine, which cannot start the VM.
 */
export function checkColima(deps = defaultDeps()) {
    if (!isColimaDocker(deps)) {
        return { isColima: false, running: true };
    }
    let status = "";
    try {
        status = deps.run("colima", ["status"]);
    }
    catch (error) {
        const message = String(error?.stderr ?? error);
        if (/rosetta|native arch/i.test(message)) {
            return {
                isColima: true,
                running: false,
                problem: "Lima is installed as an x86_64 build, so it cannot start the Colima VM on this Mac",
                fix: "Install a native Lima (brew reinstall lima, or use a native limactl on PATH) and run `colima start`",
            };
        }
        if (deps.dockerAnswers()) {
            // The VM is up: the colima CLI on this PATH simply cannot see it, which is what a
            // Rosetta (x86_64) limactl does on Apple Silicon.
            return {
                isColima: true,
                running: true,
                problem: "The Colima VM is running, but the colima CLI on this PATH cannot see it",
                fix: "Use a native limactl (a Rosetta x86_64 limactl cannot talk to the VM): brew reinstall lima, or put a native limactl first on PATH",
            };
        }
        if (/not running/i.test(message)) {
            return {
                isColima: true,
                running: false,
                problem: "The Colima VM is not running",
                fix: "Run `colima start`",
            };
        }
        return {
            isColima: true,
            running: false,
            problem: "The state of the Colima VM could not be read",
            fix: "Run `colima status` to see what it says",
        };
    }
    if (/is running/i.test(status)) {
        const arch = /arch:\s*(\S+)/.exec(status)?.[1];
        return { isColima: true, running: true, arch };
    }
    if (deps.dockerAnswers()) {
        return {
            isColima: true,
            running: true,
            problem: "The Colima VM is running, but the colima CLI on this PATH cannot see it",
            fix: "Use a native limactl (a Rosetta x86_64 limactl cannot talk to the VM): brew reinstall lima, or put a native limactl first on PATH",
        };
    }
    return {
        isColima: true,
        running: false,
        problem: "The Colima VM is not running",
        fix: "Run `colima start`",
    };
}
/**
 * What can be repaired about the Colima runtime: a VM that is not running is started, a VM
 * whose Docker daemon does not answer is restarted, and a colima CLI that cannot see the VM
 * (a Rosetta limactl) needs a native lima.
 */
export function planColimaRepair(status, dockerAnswers) {
    if (!status.isColima)
        return undefined;
    // A Lima that is an x86_64 build on Apple Silicon, or a colima CLI that cannot see the VM because of it,
    // needs a native limactl before anything else can start.
    if (status.problem && /x86_64|rosetta|native arch|cannot see it/i.test(status.problem)) {
        return "native-lima";
    }
    if (!status.running)
        return "start";
    if (!dockerAnswers)
        return "restart";
    return undefined;
}
/** Runs a colima command with a native limactl first on PATH, when one is installed. */
export function nativeLimaPath(env = process.env) {
    const home = env.HOME ?? "";
    // Prefer the Apple Silicon Homebrew location first; an x86_64 limactl must never be treated as native.
    const candidates = [
        "/opt/homebrew/bin",
        home ? `${home}/.local/bin` : "",
        home ? `${home}/bin` : "",
    ].filter(Boolean);
    for (const dir of candidates) {
        const candidate = join(dir, "limactl");
        try {
            if (!existsSync(candidate))
                continue;
            // Verify the binary is actually a native (arm64/aarch64) build, not a Rosetta x86_64 one.
            let archOutput = "";
            try {
                archOutput = execFileSync("file", ["-bL", candidate], {
                    encoding: "utf-8",
                    timeout: 5_000,
                    stdio: ["ignore", "pipe", "ignore"],
                });
            }
            catch {
                // `file` unavailable: fall back to accepting the candidate.
                return dir;
            }
            if (/arm64|aarch64/i.test(archOutput))
                return dir;
        }
        catch {
            // Not readable; try the next one.
        }
    }
    return undefined;
}
