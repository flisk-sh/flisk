/**
 * A repo can pin the oldest CLI it works with: `"minFliskVersion": "1.3.80"` in .flisk/project.json.
 * Shared by `flisk doctor` and `flisk up` so both say the same thing.
 */
export type FliskVersionFloor = {
    status: "none";
} | {
    status: "ok";
    required: string;
} | {
    status: "too-old";
    required: string;
    message: string;
    fix: string;
} | {
    status: "malformed";
    message: string;
    fix: string;
};
export declare function evaluateFliskVersionFloor(projectRoot: string, currentVersion: string): FliskVersionFloor;
