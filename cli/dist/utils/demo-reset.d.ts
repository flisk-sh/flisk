/**
 * Stop the stack of an existing demo folder before the folder is deleted. Deleting the folder alone leaves its
 * containers running, and a standalone Traefik that stays up keeps port 80 for the next run.
 * Returns true when a Flisk project was found and its `flisk down` ran.
 */
export declare function stopDemoStack(projectDir: string, runDown?: (dir: string) => void): boolean;
