import { Command } from "commander";
import { MASTER_CONFIG_FILES } from "../utils/constants.js";
/** How one master file changes on `flisk config regenerate`. `lineDiff` is new minus current lines (0 for a new file). */
export interface RegenerateChange {
    file: (typeof MASTER_CONFIG_FILES)[number];
    status: "new" | "modified" | "unchanged";
    lineDiff: number;
}
/** The change `flisk config regenerate` makes to each master file, from the same generator its dry run compares with. */
export declare function regeneratePlan(projectRoot: string): RegenerateChange[];
export declare const configCommand: Command;
