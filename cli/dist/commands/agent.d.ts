import { Command } from "commander";
import { type AgentSessionList } from "../utils/agent-sessions.js";
export { formatAge } from "../utils/agent-format.js";
export { agentSessionRequest, httpGet } from "../utils/agent-sessions.js";
/** The plain-text table `flisk agent sessions <resource>` prints, one line per session. */
export declare function formatSessionTable(list: AgentSessionList, now?: number): string[];
export declare const agentCommand: Command;
