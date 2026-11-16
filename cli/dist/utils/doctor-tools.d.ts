/** Doctor checks for host tool versions: Docker Engine and Compose, Tilt and Bun. */
import type { CheckResult } from "../types/index.js";
import { type ExecAsync } from "./exec-async.js";
export declare const EXEC_TIMEOUT_MS = 10000;
export declare const COMPOSE_TIMEOUT_MS = 30000;
export declare const DOCKER_COMPOSE_VERSION_COMMAND = "docker compose version --short";
export declare function checkDockerVersions(exec?: ExecAsync): Promise<CheckResult>;
export declare namespace checkDockerVersions {
    var requiresContainerRuntime: boolean;
    var checkName: string;
}
export declare function checkTilt(exec?: ExecAsync): Promise<CheckResult>;
export declare function checkBun(exec?: ExecAsync): Promise<CheckResult>;
