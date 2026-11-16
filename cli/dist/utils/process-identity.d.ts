/**
 * A process id alone does not identify a process: the OS hands the number to another process once the first one exits, and
 * after a reboot the low numbers go to whatever starts first. A pid plus the time that process started does identify it, so a
 * stale `.flisk/native/run.json` is never taken as a list of processes to kill (#3960).
 */
export type ProcessStartTimeReader = (pid: number) => Promise<string | undefined>;
export interface ProcessIdentityDeps {
    platform?: NodeJS.Platform;
    readFile?: (path: string) => Promise<string>;
    run?: (file: string, args: string[]) => Promise<string>;
}
/** Field 22 of `/proc/<pid>/stat` (clock ticks after boot). Field 2 is the name in parentheses and may hold both. */
export declare function linuxStatStartTime(stat: string): string | undefined;
/**
 * When the process with this pid started, as an opaque string that is equal for the same process and different for a later
 * process given the same pid. Undefined when no such process exists or its start time cannot be read (another user's
 * process on Windows, a missing `ps`): the caller must then treat the pid as not its own.
 */
export declare function processStartTime(pid: number, deps?: ProcessIdentityDeps): Promise<string | undefined>;
/** When this machine last booted, in epoch milliseconds. */
export declare function bootTimeMs(): number;
