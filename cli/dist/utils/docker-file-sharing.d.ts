import type { CheckResult } from "../types/index.js";
import { type DockerRunner } from "./docker-build-cache.js";
export declare const DOCKER_FILE_SHARING_CHECK = "Docker File Sharing";
export interface DockerFileSharingOptions {
    projectRoot?: string;
    runner?: DockerRunner;
    hasDocker?: boolean;
    image?: string;
}
export declare function formatDockerFileSharingFix(projectFolder: string): string;
/**
 * Verifies that Docker can see files in the project folder through a bind mount.
 * When the folder is not shared (Docker Desktop file sharing disabled, Colima without --mount,
 * or remote Docker engine), a container writing into a bind mount silently writes inside
 * the VM while the host folder remains empty.
 */
export declare function checkDockerFileSharing(options?: DockerFileSharingOptions): Promise<CheckResult>;
