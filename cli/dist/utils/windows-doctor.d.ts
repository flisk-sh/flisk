import type { CheckResult } from "../types/index.js";
import { parsePublishedPortHolders } from "./doctor-runtime.js";
export declare function loopbackAddresses(addresses: string[]): boolean;
export declare function parseExcludedPortRanges(output: string): Array<[number, number]>;
export declare function findExternallyOccupiedPorts(occupied: number[], dockerHolders: ReturnType<typeof parsePublishedPortHolders>, projectName: string): number[];
export declare function checkWindowsRuntimeTools(): CheckResult;
export declare function checkWindowsDockerMode(): CheckResult;
export declare function checkWindowsHostConfiguration(): Promise<CheckResult>;
