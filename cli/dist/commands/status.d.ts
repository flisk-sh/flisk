import { Command } from "commander";
import { strictNotReady } from "../utils/service-readiness.js";
/** Kept here for callers that already import the gate from the command; the implementation is shared with `wait`. */
export { strictNotReady };
export declare const statusCommand: Command;
