import type { CheckResult } from "../types/index.js";
import { type ColimaStatus } from "./colima.js";
export declare const COLIMA_DISK_CHECK = "Colima Disk";
/** The disk file is a problem when it holds this many times what Docker reports... */
export declare const COLIMA_DISK_RATIO = 3;
/** ...and the difference is at least this many GiB, so a small VM never warns. */
export declare const COLIMA_DISK_MIN_GAP_GIB = 5;
export declare const COLIMA_TRIM_COMMAND = "colima ssh -- sudo fstrim -av";
export interface ColimaDiskReport {
    /** Space the VM's disk file takes on the Mac (allocated blocks, not the sparse apparent size). */
    diskFileBytes: number;
    /** Images, containers, volumes and build cache, as `docker system df` reports them. */
    dockerBytes: number;
    /** diskFileBytes / dockerBytes, or null when Docker reports nothing. */
    ratio: number | null;
}
export interface ColimaDiskDeps {
    /** Bytes the disk file takes on the host, or null when there is none. */
    diskFileBytes(): number | null;
    /** The `docker system df --format "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"` output. */
    dockerDf(): Promise<string>;
    colimaStatus(): ColimaStatus;
}
/** Lima keeps Colima's data disk here; the default profile is named "colima". */
export declare function colimaDiskPath(home?: string): string;
/** Allocated bytes of the (sparse) disk file: `blocks * 512`, not its apparent size. */
export declare function readColimaDiskFileBytes(path?: string): number | null;
/** Sums the Size column of every row of `docker system df` (images, containers, volumes, build cache). */
export declare function sumDockerUsageBytes(dfOutput: string): number;
export declare function defaultColimaDiskDeps(): ColimaDiskDeps;
export declare function formatBytes(bytes: number): string;
/** True when the disk file holds far more than Docker uses, so a trim would return space to the Mac. */
export declare function isColimaDiskBloated(report: ColimaDiskReport): boolean;
/** Reads the disk file and Docker usage; null when this is not a running Colima VM or either cannot be read. */
export declare function readColimaDisk(deps?: ColimaDiskDeps): Promise<ColimaDiskReport | null>;
/** `flisk doctor`: reports the Colima disk file against Docker's own usage and warns when it is over 3x. */
export declare function checkColimaDisk(deps?: ColimaDiskDeps): Promise<CheckResult & {
    colimaDisk?: ColimaDiskReport;
}>;
export type ColimaTrimRunner = () => Promise<void>;
export declare const runColimaTrim: ColimaTrimRunner;
/**
 * Trims the Colima VM and says how much the disk file shrank on the Mac. Null when Docker is not on a running
 * Colima VM. Pruning only frees space inside the VM, so this is what makes the Mac's free space grow.
 */
export declare function trimColimaAndMeasure(options?: {
    status?: ColimaStatus;
    diskFileBytes?: () => number | null;
    trim?: ColimaTrimRunner;
}): Promise<{
    returnedBytes: number;
    before: number | null;
    after: number | null;
} | null>;
