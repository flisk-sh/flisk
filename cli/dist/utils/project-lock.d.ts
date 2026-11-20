export interface ProjectLockOptions {
    /** Total milliseconds to wait before failing. Defaults to 30000. */
    timeoutMs?: number;
    /** Delay between acquire attempts in milliseconds. Defaults to 50. */
    retryDelayMs?: number;
    /** Process liveness predicate, injectable for tests. */
    isPidAlive?: (pid: number) => boolean;
}
export declare function isProcessAlive(pid: number): boolean;
export declare function projectLockPath(projectRoot: string): string;
/**
 * Serializes project generation across processes and concurrent calls in the same process using
 * an exclusive `.flisk/.lock` file. Waits for a live holder, reaps stale locks whose PID has
 * exited, and fails with a clear FliskError if the wait times out.
 */
export declare function withProjectLock<T>(projectRoot: string, fn: () => Promise<T> | T, options?: ProjectLockOptions): Promise<T>;
