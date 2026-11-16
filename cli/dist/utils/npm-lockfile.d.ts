/**
 * The command that writes package-lock.json without installing anything. `--workspaces=false`: a Flisk project root can declare
 * `workspaces`, and npm then writes the lockfile at that root instead of next to the resource. Shown to the user when it cannot be run for them. */
export declare const LOCKFILE_COMMAND = "npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps --workspaces=false";
export interface LockfileResult {
    ok: boolean;
    /** Why it failed, one line; empty when ok. */
    reason: string;
}
/**
 * Writes package-lock.json for the package in `dir`. The generated Next.js image runs `npm ci`, which needs a lockfile, so a new
 * Next.js resource gets one here. Nothing is installed (`--package-lock-only`) and no scripts run. A missing npm or no network
 * is reported, not thrown: the resource is still created and the user is told the command to run.
 */
export declare function generateNpmLockfile(dir: string): LockfileResult;
