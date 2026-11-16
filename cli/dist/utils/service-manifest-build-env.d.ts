/**
 * `buildArgs` (bring-your-own): Compose `build.args` for a resource built from its Dockerfile. Values are text, Compose
 * variables included (`${NODE_VERSION:-22}`), written as JSON strings. Mirrors byo_build_args_lines in
 * engine/.../compose/byo_build_logging.star.
 */
export declare function buildArgsErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * `logging` (bring-your-own, #2965): Compose `logging`, such as `{ "driver": "json-file", "options": { "max-size": "5m" } }`.
 * Mirrors byo_logging_section in engine/.../compose/byo_build_logging.star.
 */
export declare function loggingErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * `envFile`: extra env files for a bring-your-own resource, each a path relative to the service directory that must stay inside
 * the project (`serviceDepth` is how many directories the service sits below the project root, unknown when validating a manifest
 * alone). A missing file is not an error. Mirrors engine/.../compose/byo_env_file.star.
 */
export declare function envFileErrors(manifest: Record<string, unknown>, displayPath: string, serviceDepth?: number): string[];
