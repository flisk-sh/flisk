// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { applyDoctorFixes, planDoctorFixes } from "./doctor-fix.js";
/** Docker has no free subnet left for a new network. */
const POOL_EXHAUSTED = /all predefined address pools have been fully subnetted/i;
const dockerDeps = {
    probe() {
        const name = `flisk_demo_probe_${process.pid}`;
        try {
            execFileSync("docker", ["network", "create", name], { stdio: "pipe", timeout: 30_000 });
        }
        catch (err) {
            return String(err.stderr ?? err).trim();
        }
        try {
            execFileSync("docker", ["network", "rm", name], { stdio: "pipe", timeout: 30_000 });
        }
        catch {
            // A leftover probe is removed by `flisk doctor --fix`.
        }
        return null;
    },
    planUnused: () => planDoctorFixes(undefined, undefined, { machine: true }),
    apply: (actions) => applyDoctorFixes(actions, { dryRun: false, confirm: async () => true }),
};
/**
 * Makes sure Docker can create the demo's networks before the stack starts.
 *
 * Every Flisk project creates several networks and `flisk down` keeps them, so after a few projects Docker runs out of
 * address pools. Tilt then fails `init-networks` within a second, but nothing else can start, and the demo sat on
 * "Starting services" for minutes. Unused networks (no container attached) are safe to remove: `flisk up` recreates
 * them. Any other probe failure is left to the stack, which reports it.
 */
export async function ensureNetworkCapacity(deps = dockerDeps) {
    const first = deps.probe();
    if (first === null || !POOL_EXHAUSTED.test(first))
        return { ok: true, removed: [] };
    const planned = (await deps.planUnused()).filter((action) => action.id.startsWith("remove-network:") && action.status === "planned");
    const applied = await deps.apply(planned);
    const removed = applied
        .filter((action) => action.status === "applied")
        .map((action) => action.id.slice("remove-network:".length));
    const second = deps.probe();
    if (second === null)
        return { ok: true, removed };
    return { ok: !POOL_EXHAUSTED.test(second), removed, error: second.split(/\r?\n/)[0] };
}
