import type { CheckResult } from "../types/index.js";
export declare const DOCKER_WSL_INTEGRATION_CHECK = "Docker WSL integration";
export interface DockerWslIntegrationOptions {
    isWsl?: boolean;
    hasDocker?: boolean;
    /** Returns normally when the Docker daemon answers from this distribution, throws otherwise. */
    pingDaemon?: () => void;
}
/** Inside WSL2, checks that Docker Desktop's WSL integration reaches this distribution. Skipped elsewhere. */
export declare function checkDockerWslIntegration(options?: DockerWslIntegrationOptions): CheckResult;
