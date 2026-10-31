// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Stop the stack of an existing demo folder before the folder is deleted. Deleting the folder alone leaves its
 * containers running, and a standalone Traefik that stays up keeps port 80 for the next run.
 *
 * The live `tilt up` goes first. `flisk down` needs the Tiltfile, and it can be gone or mid-rewrite while the old
 * stack still runs; then `down` fails and the old Tilt keeps the ports and containers the new run needs, so the
 * second demo sat at "0 of 7 services ready". Returns true when a Flisk project was found.
 */
export async function stopDemoStack(projectDir, runDown = runFliskDown, stopTilt = stopRunningTilt) {
    if (!existsSync(join(projectDir, ".flisk", "project.json")))
        return false;
    const tiltfile = join(projectDir, ".flisk", ".flisk-out", "Tiltfile");
    await stopTilt(tiltfile);
    if (!existsSync(tiltfile))
        return true;
    runDown(projectDir);
    return true;
}
async function stopRunningTilt(tiltfile) {
    const { findProjectTiltUpPids, stopProjectTiltUp, waitForTiltUpExit } = await import("./down-cleanup.js");
    if (findProjectTiltUpPids(tiltfile).length === 0)
        return;
    stopProjectTiltUp(tiltfile);
    await waitForTiltUpExit(tiltfile);
}
function runFliskDown(projectDir) {
    execFileSync(process.execPath, [process.argv[1] ?? "flisk", "down", "--yes"], {
        cwd: projectDir,
        stdio: "inherit",
    });
}
const dockerVolumes = {
    list: () => execFileSync("docker", ["volume", "ls", "--format", '{{.Name}}\t{{.Label "com.docker.compose.project"}}'], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        .split("\n")
        .filter(Boolean)
        .map((line) => {
        const [name = "", composeProject = ""] = line.split("\t");
        return { name, composeProject };
    }),
    remove: (name) => {
        execFileSync("docker", ["volume", "rm", name], { stdio: "ignore" });
    },
};
/**
 * Remove the Docker volumes an earlier run of this project left behind. A fresh demo clone generates a new random
 * DB_PASSWORD, but Postgres keeps the password of the data directory it was first started with and ignores
 * POSTGRES_PASSWORD afterwards, so the second `flisk demo` failed at the migrator with Prisma P1000.
 * A volume still mounted by a running container cannot be removed and is skipped. Returns the names removed.
 */
export function removeStaleProjectVolumes(projectName, docker = dockerVolumes) {
    const removed = [];
    let volumes;
    try {
        volumes = docker.list();
    }
    catch {
        return removed;
    }
    for (const volume of volumes) {
        if (!volume.composeProject.startsWith(`${projectName}-`))
            continue;
        try {
            docker.remove(volume.name);
            removed.push(volume.name);
        }
        catch {
            // In use by a container that is still up: leave it, the stack itself reports the problem.
        }
    }
    return removed;
}
/** The `project.name` of a Flisk project folder, or undefined when it has none. */
export function readProjectName(projectDir) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectDir, ".flisk", "project.json"), "utf8"));
        return typeof parsed.project?.name === "string" ? parsed.project.name : undefined;
    }
    catch {
        return undefined;
    }
}
