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
