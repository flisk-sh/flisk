type FloorWarning = {
    deprecationWarning?: string;
};
export type FliskVersionFloor = ({
    status: "none";
} & FloorWarning) | ({
    status: "ok";
    required: string;
} & FloorWarning) | ({
    status: "too-old";
    required: string;
    message: string;
    fix: string;
} & FloorWarning) | ({
    status: "malformed";
    message: string;
    fix: string;
} & FloorWarning);
export type FliskVersionPin = {
    status: "none";
} | {
    status: "ok";
    required: string;
} | {
    status: "mismatch";
    required: string;
    current: string;
    message: string;
    fix: string;
} | {
    status: "malformed";
    message: string;
    fix: string;
};
export type FliskVersionEvaluation = {
    status: "none";
    deprecationWarning?: string;
} | {
    status: "ok";
    source: "pin" | "floor";
    required: string;
    deprecationWarning?: string;
} | {
    status: "malformed" | "too-old" | "mismatch";
    message: string;
    fix: string;
    required?: string;
    deprecationWarning?: string;
};
/**
 * Evaluates both the repository's minimum supported CLI version and exact pin.
 * An exact pin takes precedence over a floor mismatch because it provides
 * the correct version to install. A malformed floor remains a configuration error.
 */
export declare function evaluateFliskVersion(projectRoot: string, currentVersion: string): FliskVersionEvaluation;
/**
 * A repo can pin the oldest CLI it works with:
 * `"minFliskVersion": "1.3.80"` in .flisk/project.json.
 * `minTdkVersion` remains supported as a deprecated alias for one release.
 * Shared by `flisk doctor` and `flisk up` so both say the same thing.
 */
export declare function evaluateFliskVersionFloor(projectRoot: string, currentVersion: string): FliskVersionFloor;
/**
 * A repository can require one exact CLI version through
 * `pinnedFliskVersion` in .flisk/project.json.
 */
export declare function evaluateFliskVersionPin(projectRoot: string, currentVersion: string): FliskVersionPin;
export {};
