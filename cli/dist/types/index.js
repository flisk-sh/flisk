import { RESOURCE_DEFAULTS_FILE, TECH_STACK_FILE } from "../utils/constants.js";
export const RESOURCE_CONFIG_APP_TYPES = [
    "backend",
    "frontend",
    "library",
    "sdk",
    "worker",
    "migrator",
    "mcp",
    "agent",
    "database",
    "bring-your-own",
];
export const CREATABLE_RESOURCE_TYPES = [
    "backend",
    "frontend",
    "worker",
    "mcp",
    "agent",
    "bring-your-own",
];
/**
 * `--type database`: the project's database, declared in a service.json (`framework: postgres`). It has
 * no code, port or image of its own: services list its name in `dependsOn` and get `DATABASE_URL`.
 */
export const DATABASE_RESOURCE_TYPE = "database";
/** The one database a `database` resource can name today. */
export const DATABASE_FRAMEWORK = "postgres";
/**
 * Every value `flisk resource --type` accepts: the creatable types, `database`, and `sdk`, which
 * registers a package that already exists instead of scaffolding one.
 */
export const RESOURCE_TYPE_VALUES = [
    ...CREATABLE_RESOURCE_TYPES,
    DATABASE_RESOURCE_TYPE,
    "sdk",
];
/** `--type inference`: a bring-your-own resource preset for an OpenAI-compatible model server. */
export const INFERENCE_RESOURCE_TYPE = "inference";
/** `--type redis|qdrant|rabbitmq`: bring-your-own presets for infrastructure (utils/infra-presets.ts). */
export const INFRA_RESOURCE_TYPES = ["redis", "qdrant", "rabbitmq"];
/**
 * Every value `flisk resource --type` accepts to scaffold a new resource: the creatable types plus
 * the `inference` and infrastructure presets and `database`. `sdk` is left out because it only registers a package that
 * already has a service.json, and the `byo` alias because `bring-your-own` is listed. The MCP
 * `resource_create` tool builds its type enum from this list.
 */
export const RESOURCE_CREATE_TYPE_VALUES = [
    ...CREATABLE_RESOURCE_TYPES,
    INFERENCE_RESOURCE_TYPE,
    ...INFRA_RESOURCE_TYPES,
    DATABASE_RESOURCE_TYPE,
];
export function isCreatableResourceType(value) {
    return (typeof value === "string" && CREATABLE_RESOURCE_TYPES.includes(value));
}
/**
 * Type guard to validate filename is a known master config file.
 * Eliminates the need for 'as MasterConfigFileName' assertion.
 */
export function isMasterConfigFileName(filename) {
    const validNames = [TECH_STACK_FILE, RESOURCE_DEFAULTS_FILE, "spec.master"];
    return validNames.includes(filename);
}
