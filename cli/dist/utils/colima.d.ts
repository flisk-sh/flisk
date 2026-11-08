export type ColimaStatus = {
    /** True when Docker runs on a Colima VM. */
    isColima: boolean;
    /** True when the VM is up. */
    running: boolean;
    /** The architecture the VM runs on, when it is known. */
    arch?: string;
    /** What is wrong, in one line. */
    problem?: string;
    /** What to run to fix it. */
    fix?: string;
};
export interface ColimaDeps {
    env: NodeJS.ProcessEnv;
    /** Whether the Docker daemon answers. The VM can be up while the colima CLI cannot see it. */
    dockerAnswers: () => boolean;
    /** Runs a command and returns its output. Throws when the command fails. */
    run: (command: string, args: string[]) => string;
    /** Whether a path exists. */
    exists: (path: string) => boolean;
    /** The home directory. */
    home: string;
}
/** True when the Docker endpoint belongs to a Colima VM. */
export declare function isColimaDocker(deps?: ColimaDeps): boolean;
/**
 * The state of the Colima VM behind Docker.
 *
 * Two failures matter and both look like "Docker is not working": the VM is not running, and
 * Lima itself is an x86_64 build on an Apple Silicon machine, which cannot start the VM.
 */
export declare function checkColima(deps?: ColimaDeps): ColimaStatus;
export type ColimaRepair = "start" | "restart" | "native-lima";
/**
 * What can be repaired about the Colima runtime: a VM that is not running is started, a VM
 * whose Docker daemon does not answer is restarted, and a colima CLI that cannot see the VM
 * (a Rosetta limactl) needs a native lima.
 */
export declare function planColimaRepair(status: ColimaStatus, dockerAnswers: boolean): ColimaRepair | undefined;
/** Runs a colima command with a native limactl first on PATH, when one is installed. */
export declare function nativeLimaPath(env?: NodeJS.ProcessEnv): string | undefined;
