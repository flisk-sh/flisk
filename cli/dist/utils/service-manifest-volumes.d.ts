/**
 * `volumes` (#1748): named volumes and bind mounts for a bring-your-own resource. Mirrors engine/.../compose/byo_volumes.star,
 * which refuses the same values. A bind mount's `source` is relative to the service directory and must stay inside the project;
 * `serviceDepth` is how many directories the service sits below the project root (unknown when validating a manifest alone).
 */
export declare function volumesErrors(manifest: Record<string, unknown>, displayPath: string, serviceDepth?: number): string[];
