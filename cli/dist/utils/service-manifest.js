// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { parseHostMapping, publishVariables, substitutePublish } from "./extra-port-publish.js";
import { FRONTEND_FRAMEWORK_IDS } from "./frontend-framework-ids.js";
import { declaresCommand, validateNativeServiceFields } from "./native-service.js";
import { validateSmoke } from "./smoke.js";
export const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export const SERVICE_MANIFEST_SCHEMA_URL = "https://flisk.sh/schema.service.json";
/**
 * Fields that are still read, or still tolerated, but should not be used. The warning says what replaces each one. `jwtSecret` is
 * ignored outright: a secret must not be committed (see docs/environment.md).
 */
const DEPRECATED_FIELDS = {
    dependencies: "deprecated, use dependsOn (still read for now)",
    envVars: "deprecated, use params (still read when params is absent)",
    jwtSecret: "ignored. A secret must not be committed: remove it and set JWT_SECRET in the project .env",
};
const KNOWN_SERVICE_FIELDS = new Set([
    "$schema",
    "agent",
    "apiBasePath",
    "apiPath",
    "appName",
    "appType",
    "backendName",
    "basePath",
    "build",
    "buildArgs",
    "buildContext",
    "command",
    "container",
    "databaseName",
    "dependencies",
    "dev",
    "dependsOn",
    "dockerfile",
    "enabled",
    "env",
    "envFile",
    "exposeViaProxy",
    "extraPorts",
    "featuresEnabled",
    "framework",
    "healthCheck",
    "healthCheckPath",
    "image",
    "language",
    "logging",
    "models",
    "name",
    "nats",
    "params",
    "profiles",
    "playwright",
    "provides",
    "providers",
    "port",
    "replicas",
    "restart",
    "runtime",
    "sablier",
    "schemaVersion",
    "secrets",
    "sidecarOf",
    "smoke",
    "stack",
    "syncs",
    "toolchain",
    "traefik",
    "type",
    "volumes",
    "webUi",
]);
/**
 * String fields written into the generated Docker Compose, Traefik and NATS config as they are. A newline or YAML syntax in one of
 * them adds keys to the generated service (GHSA-phgf-pww4-7jxc), so each must match its pattern. Empty values are treated as unset.
 * `tilt up` reads service.json without this CLI, so engine/topologies/tilt/manifest/parser.star enforces the same rules.
 */
const GENERATED_STRING_FIELDS = [
    { path: ["healthCheckPath"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /health" },
    { path: ["healthCheck", "path"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /health" },
    { path: ["apiPath"], pattern: /^\/[A-Za-z0-9._~/-]*$/, expected: "a path such as /api/v1" },
    { path: ["apiBasePath"], pattern: /^\/[A-Za-z0-9._~/-]*$/, expected: "a path such as /api/v1" },
    {
        path: ["traefik", "host"],
        pattern: /^[A-Za-z0-9.-]+$/,
        expected: "a hostname such as shop.backend.myproject.local",
    },
    {
        path: ["traefik", "pathPrefix"],
        pattern: /^\/[a-z0-9/-]*$/,
        expected: "a path such as /api/v1/shop-management",
    },
    {
        path: ["traefik", "healthCheck"],
        pattern: /^\/[a-z0-9/-]*$/,
        expected: "a path such as /health",
    },
    {
        path: ["nats", "queueGroup"],
        pattern: /^[A-Za-z0-9_.-]+$/,
        expected: "letters, digits, '_', '.' or '-'",
    },
    { path: ["databaseName"], pattern: /^[A-Za-z0-9_-]+$/, expected: "letters, digits, '_' or '-'" },
    { path: ["stack"], pattern: /^[A-Za-z0-9_-]+$/, expected: "letters, digits, '_' or '-'" },
    {
        path: ["image"],
        // Compose variables are allowed (postgres:${POSTGRES_VERSION:-18}-alpine); Compose fills them in from the project .env.
        // Mirrors image_reference_ok in engine/.../tilt/manifest/parser.star.
        // `${NAME:?message}` / `${NAME?message}` stop Compose with the message when NAME is unset (any-sync's garage image).
        // The message is printable ASCII without quotes, backslash, braces, `$` or backtick (IMAGE_MESSAGE_CHARS in parser.star).
        pattern: /^(?:[A-Za-z0-9._/:@-]|\$\{[A-Za-z_][A-Za-z0-9_]*(?::?-[A-Za-z0-9._/:@-]+|:?\?[A-Za-z0-9 !#%&()*+,./:;<=>?@[\]^_|~-]*)?\})+$/,
        expected: "an image reference such as ghcr.io/acme/app:1.0, with variables written as ${NAME}, ${NAME:-default}, ${NAME-default} or ${NAME:?message}",
    },
    { path: ["basePath"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /storefront" },
];
/**
 * Errors for generated-output fields whose values could change the generated YAML. The value itself is not echoed, because it may
 * contain the newline that makes it dangerous.
 */
export function validateGeneratedStringFields(manifest, displayPath) {
    const errors = [];
    const reportedFields = new Set();
    for (const { path, pattern, expected } of GENERATED_STRING_FIELDS) {
        let value = manifest;
        for (const key of path) {
            value =
                value && typeof value === "object" && !Array.isArray(value)
                    ? value[key]
                    : undefined;
        }
        if (value === undefined || value === null || value === "")
            continue;
        const field = `${displayPath}.${path.join(".")}`;
        if (typeof value !== "string" || !pattern.test(value))
            reportedFields.add(field);
        if (typeof value !== "string") {
            errors.push(`${field}: expected a string`);
        }
        else if (!pattern.test(value)) {
            errors.push(`${field}: must be ${expected} (no spaces, line breaks or YAML syntax)`);
        }
    }
    for (const [field, message] of lineBreakErrors(manifest, displayPath)) {
        if (!reportedFields.has(field))
            errors.push(`${field}: ${message}`);
    }
    return errors;
}
/** Line breaks (including the Unicode ones YAML 1.1 honours) and other control characters. */
function hasLineBreakOrControl(text) {
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
            return true;
        }
    }
    return false;
}
/**
 * Many more service.json values than GENERATED_STRING_FIELDS reach the generated YAML (port, appName, dockerfile, buildContext,
 * basePath, envVars, ...). A key can only be added through a line break, so no string key or value may contain one. `smoke` is
 * skipped: the CLI sends it over HTTP and it is never written into generated config.
 */
function lineBreakErrors(manifest, displayPath) {
    const errors = [];
    const pending = Object.entries(manifest)
        .filter(([key]) => key !== "smoke")
        .map(([key, value]) => [value, `${displayPath}.${key}`]);
    for (const key of Object.keys(manifest)) {
        if (hasLineBreakOrControl(key))
            errors.push([displayPath, "a key contains a line break"]);
    }
    while (pending.length > 0) {
        const [value, field] = pending.pop();
        if (typeof value === "string") {
            if (hasLineBreakOrControl(value)) {
                errors.push([field, "must not contain line breaks or control characters"]);
            }
        }
        else if (Array.isArray(value)) {
            for (const [index, item] of value.entries())
                pending.push([item, `${field}[${index}]`]);
        }
        else if (value && typeof value === "object") {
            for (const [key, item] of Object.entries(value)) {
                if (hasLineBreakOrControl(key)) {
                    errors.push([field, "a key contains a line break"]);
                }
                else {
                    pending.push([item, `${field}.${key}`]);
                }
            }
        }
    }
    return errors.sort(([a], [b]) => a.localeCompare(b));
}
/**
 * `appName` and `stack` end up in a Docker image name (`<project>_<stack>_<appName>:dev`), a Compose service and a container
 * name. Docker refuses a repository name with an uppercase letter, a space or a leading, trailing or doubled separator, and
 * Tilt then fails inside `docker_compose` after `flisk up` said all was well. 63 is the DNS label limit the Traefik host uses.
 */
const DOCKER_NAME = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
/** Tilt labels every service `app.<appName>`, and a label is at most 63 bytes; a stack has no such prefix. */
const DOCKER_NAME_MAX = { appName: 59, stack: 63 };
export function isDockerSafeName(value, max = DOCKER_NAME_MAX.stack) {
    return typeof value === "string" && value.length <= max && DOCKER_NAME.test(value);
}
/** Errors for an `appName` or `stack` that Docker cannot name an image after. A `command` service never reaches Docker. */
export function dockerNameErrors(manifest, displayPath) {
    if (declaresCommand(manifest))
        return [];
    const errors = [];
    for (const field of ["appName", "stack"]) {
        const value = manifest[field];
        if (typeof value !== "string" || isDockerSafeName(value, DOCKER_NAME_MAX[field]))
            continue;
        // The value is not echoed: it may hold the line break that makes a service.json dangerous (see lineBreakErrors).
        errors.push(`${displayPath}.${field}: cannot be a Docker image name; use lowercase letters and digits joined by "-", "_" or "." (at most ${DOCKER_NAME_MAX[field]} characters)`);
    }
    return errors;
}
/**
 * The types the engine reads these fields as (runtime/engine/schemas/service-schema.json). A value of another type is not
 * ignored: the Tiltfile calls `.get` on an object field or `+` on a string field and stops with a Starlark error
 * ("string has no .get field or method"), after `flisk up` has already said yes. `null` reads as unset, as it does there.
 * Only fields whose shape is unambiguous are listed: `syncs`, `secrets`, `playwright`, `runtime` and `dev` are written in forms the
 * published schema does not describe, so they stay as they are. Fields checked elsewhere (appName, appType, stack, port,
 * schemaVersion, dependsOn, smoke, healthCheckPath, the command-service fields) are not repeated.
 */
const FIELD_KINDS = {
    apiBasePath: "string",
    backendName: "string",
    buildContext: "string",
    databaseName: "string",
    dockerfile: "string",
    framework: "string",
    image: "string",
    language: "string",
    restart: "string",
    enabled: "boolean",
    exposeViaProxy: "boolean",
    webUi: "boolean",
    agent: "object",
    build: "object",
    nats: "object",
    params: "object",
    sablier: "object",
    traefik: "object",
    featuresEnabled: "string[]",
};
const REPLICAS_MAX = 10;
const DATABASE_NAME_MAX = 63;
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/**
 * An absolute path or a Windows drive. Build paths are relative to the service directory (the loader joins them to it), so an
 * absolute one can never resolve. `..` is allowed on purpose: a service.json inside the project may build from a source tree
 * outside it (docs/layout.md, docs/byo.md), and `flisk import` writes exactly that for a Compose service whose Dockerfile stays
 * where it was.
 */
export function isAbsoluteBuildPath(value) {
    return /^([\\/]|[A-Za-z]:)/.test(value);
}
/** Errors for a field of the wrong type, an enum value that does not exist, an escaping path, or a conflicting source. */
export function fieldTypeErrors(manifest, displayPath) {
    if (declaresCommand(manifest))
        return [];
    const errors = [];
    const bad = (field, expected) => {
        errors.push(`${displayPath}.${field}: expected ${expected}`);
    };
    for (const [field, kind] of Object.entries(FIELD_KINDS)) {
        const value = manifest[field];
        if (value === undefined || value === null)
            continue;
        if (kind === "string" && typeof value !== "string")
            bad(field, "a string");
        else if (kind === "boolean" && typeof value !== "boolean")
            bad(field, "true or false");
        else if (kind === "object" && !isPlainObject(value))
            bad(field, "an object");
        else if (kind === "string[]" &&
            !(Array.isArray(value) && value.every((entry) => typeof entry === "string"))) {
            bad(field, "an array of strings");
        }
    }
    const replicas = manifest.replicas;
    if (replicas !== undefined && replicas !== null) {
        if (typeof replicas !== "number" ||
            !Number.isInteger(replicas) ||
            replicas < 1 ||
            replicas > REPLICAS_MAX) {
            bad("replicas", `an integer from 1 to ${REPLICAS_MAX}`);
        }
    }
    if (typeof manifest.databaseName === "string" &&
        manifest.databaseName.length > DATABASE_NAME_MAX) {
        errors.push(`${displayPath}.databaseName: at most ${DATABASE_NAME_MAX} characters (a Postgres identifier)`);
    }
    if (manifest.appType === "frontend" &&
        typeof manifest.framework === "string" &&
        !FRONTEND_FRAMEWORK_IDS.includes(manifest.framework)) {
        bad("framework", `one of ${FRONTEND_FRAMEWORK_IDS.join(", ")}`);
    }
    if (manifest.appType === "frontend" && typeof replicas === "number" && replicas > 1) {
        // Compose is generated for one frontend container, so Tilt stops looking for "<name>-1" (backends scale; frontends do not).
        errors.push(`${displayPath}.replicas: a frontend runs as one container; replicas applies to backend services`);
    }
    if (typeof manifest.language === "string" && !/^[a-z][a-z0-9-]*$/.test(manifest.language)) {
        bad("language", "a lowercase id such as bun, python or go");
    }
    const build = isPlainObject(manifest.build) ? manifest.build : {};
    const dev = isPlainObject(manifest.dev) ? manifest.dev : {};
    const paths = [
        ["dockerfile", manifest.dockerfile],
        ["buildContext", manifest.buildContext],
        ["build.dockerfile", build.dockerfile],
        ["build.context", build.context],
        ...(Array.isArray(dev.watch)
            ? dev.watch.map((entry, i) => [`dev.watch[${i}]`, entry])
            : []),
    ];
    for (const [field, value] of paths) {
        if (typeof value === "string" && isAbsoluteBuildPath(value)) {
            errors.push(`${displayPath}.${field}: must be a path relative to the service directory (no leading "/" or drive)`);
        }
    }
    for (const field of ["dockerfile", "buildContext"]) {
        const nested = field === "dockerfile" ? build.dockerfile : build.context;
        if (nested !== undefined && nested !== null && typeof nested !== "string") {
            bad(`build.${field === "dockerfile" ? "dockerfile" : "context"}`, "a string");
        }
    }
    if (typeof dev.command !== "undefined" &&
        dev.command !== null &&
        typeof dev.command !== "string") {
        bad("dev.command", "a string");
    }
    if (typeof dev.watch !== "undefined" &&
        dev.watch !== null &&
        !(Array.isArray(dev.watch) && dev.watch.every((e) => typeof e === "string"))) {
        bad("dev.watch", "an array of strings");
    }
    if (typeof dev.liveReload !== "undefined" &&
        dev.liveReload !== null &&
        typeof dev.liveReload !== "boolean") {
        bad("dev.liveReload", "true or false");
    }
    if (typeof dev.testOnSave !== "undefined") {
        if (dev.testOnSave === null) {
            bad("dev.testOnSave", 'true or false, or an object such as { "enabled": true, "path": "tests" }');
        }
        else if (typeof dev.testOnSave === "boolean") {
            // boolean is valid
        }
        else if (isPlainObject(dev.testOnSave)) {
            const testOnSave = dev.testOnSave;
            for (const key of Object.keys(testOnSave)) {
                if (key !== "enabled" && key !== "path") {
                    errors.push(`${displayPath}.dev.testOnSave: unexpected key "${key}" (expected "enabled" or "path")`);
                }
            }
            if (typeof testOnSave.enabled !== "undefined" && typeof testOnSave.enabled !== "boolean") {
                bad("dev.testOnSave.enabled", "true or false");
            }
            if (typeof testOnSave.path !== "undefined" &&
                (typeof testOnSave.path !== "string" || !testOnSave.path.trim())) {
                bad("dev.testOnSave.path", "a non-empty string path such as 'tests'");
            }
            else if (typeof testOnSave.path === "string" && isAbsoluteBuildPath(testOnSave.path)) {
                errors.push(`${displayPath}.dev.testOnSave.path: must be a path relative to the service directory (no leading "/" or drive)`);
            }
        }
        else {
            bad("dev.testOnSave", 'true or false, or an object such as { "enabled": true, "path": "tests" }');
        }
    }
    if (typeof manifest.image === "string" &&
        manifest.image &&
        typeof manifest.dockerfile === "string" &&
        manifest.dockerfile) {
        errors.push(`${displayPath}: set "image" or "dockerfile", not both; a service runs from one source`);
    }
    return errors;
}
const SERVICE_ROUTE_PATH_FIELDS = ["apiPath", "basePath"];
export function getInvalidServiceRoutePathFields(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    const manifest = value;
    return SERVICE_ROUTE_PATH_FIELDS.filter((field) => field in manifest && typeof manifest[field] !== "string");
}
/**
 * A name in `secrets.required` / `secrets.optional` that `params` or `env` also sets to a literal: the literal reaches the
 * container, so the secret in `.env` is silently never used (an admin account created with "changeme").
 */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * Patterns for `container` (#2907), the bring-your-own container runtime options. Each value is written into the generated Compose
 * YAML as it is, so engine/.../compose/byo_container.star checks the same characters.
 */
const CONTAINER_STRING_LISTS = {
    capAdd: { pattern: /^[A-Z_]+$/, expected: "capability names such as NET_ADMIN" },
    capDrop: { pattern: /^[A-Z_]+$/, expected: "capability names such as ALL" },
    securityOpt: {
        pattern: /^[A-Za-z0-9_.:=/-]+$/,
        expected: "options such as no-new-privileges:true",
    },
};
const CONTAINER_KEYS = new Set([
    ...Object.keys(CONTAINER_STRING_LISTS),
    "command",
    "entrypoint",
    "init",
    "readOnly",
    "user",
    "shmSize",
    "tmpfs",
    "gpus",
    "cpus",
    "memory",
    "ipc",
    "stopGracePeriod",
    "extraHosts",
    "ulimits",
    "networkAliases",
]);
const ULIMIT_NAMES = [
    "as",
    "core",
    "cpu",
    "data",
    "fsize",
    "locks",
    "memlock",
    "msgqueue",
    "nice",
    "nofile",
    "nproc",
    "rss",
    "rtprio",
    "rttime",
    "sigpending",
    "stack",
];
const DURATION_PATTERN = /^([0-9]+(\.[0-9]+)?(us|ms|s|m|h))+$/;
const isUlimit = (value) => Number.isInteger(value) && value >= -1;
/** `name:address` for Compose extra_hosts: host-gateway, an IPv4 address, or an IPv6 address. */
function isExtraHost(value) {
    if (typeof value !== "string")
        return false;
    const colon = value.indexOf(":");
    if (colon < 0)
        return false;
    const name = value.slice(0, colon);
    const address = value.slice(colon + 1);
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(name))
        return false;
    // A Compose variable for the address: ${NAME}, ${NAME:-address} or ${NAME-address} (open-mercato's OM_HOST_GATEWAY).
    const variable = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-(.*))?\}$/.exec(address);
    if (variable)
        return variable[2] === undefined || isHostAddress(variable[2]);
    return isHostAddress(address);
}
function isHostAddress(address) {
    if (address === "host-gateway")
        return true;
    const octets = address.split(".");
    if (octets.length === 4 && octets.every((o) => /^[0-9]{1,3}$/.test(o) && Number(o) <= 255)) {
        return true;
    }
    // An IPv6 address has at least two colons; a lone ":" would resolve to "name::" and the daemon rejects it.
    return (address.match(/:/g) ?? []).length >= 2 && /^[0-9A-Fa-f:]+$/.test(address);
}
/** Why `container.ulimits` is refused, or undefined. Mirrors _ulimit_lines in engine/.../compose/byo_container.star. */
function ulimitsError(ulimits) {
    if (!isPlainObject(ulimits)) {
        return ': expected an object such as {"nofile": {"soft": 65536, "hard": 65536}}';
    }
    for (const [name, value] of Object.entries(ulimits)) {
        if (!ULIMIT_NAMES.includes(name))
            return `.${name}: expected one of ${ULIMIT_NAMES.join(", ")}`;
        if (isUlimit(value))
            continue;
        if (!isPlainObject(value) ||
            Object.keys(value).sort().join(",") !== "hard,soft" ||
            !isUlimit(value.soft) ||
            !isUlimit(value.hard)) {
            return `.${name}: expected a number, or {"soft": <number>, "hard": <number>}`;
        }
        if (value.hard !== -1 && (value.soft === -1 || value.soft > value.hard)) {
            return `.${name}: soft must not be above hard`;
        }
    }
    return undefined;
}
const CONTAINER_IPC_MODES = ["host", "private", "shareable", "none"];
const SIZE_PATTERN = /^[0-9]+([bkmg]b?)?$/i;
/** `container` is only read for bring-your-own resources, and only with the keys and characters the generator writes. */
export function containerErrors(manifest, displayPath) {
    const container = manifest.container;
    if (container === undefined || container === null)
        return [];
    const field = `${displayPath}.container`;
    if (!isPlainObject(container))
        return [`${field}: expected an object`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    for (const key of Object.keys(container)) {
        if (!CONTAINER_KEYS.has(key)) {
            errors.push(`${field}.${key}: unknown option (use ${[...CONTAINER_KEYS].join(", ")})`);
        }
    }
    for (const [key, { pattern, expected }] of Object.entries(CONTAINER_STRING_LISTS)) {
        const values = container[key];
        if (values === undefined || values === null)
            continue;
        if (!Array.isArray(values) ||
            !values.every((value) => typeof value === "string" && pattern.test(value))) {
            errors.push(`${field}.${key}: expected a list of ${expected}`);
        }
    }
    for (const key of ["command", "entrypoint"]) {
        const value = container[key];
        if (value === undefined)
            continue;
        const good = Array.isArray(value) &&
            // An empty entrypoint drops the image's ENTRYPOINT (Compose `entrypoint: []`); an empty command is refused.
            (value.length > 0 || key === "entrypoint") &&
            // biome-ignore lint/suspicious/noControlCharactersInRegex: a control character would break the generated Compose YAML
            value.every((part) => typeof part === "string" && /^[^\u0000-\u001f\u007f]+$/.test(part));
        if (!good) {
            errors.push(`${field}.${key}: expected a list of non-empty strings without control characters${key === "entrypoint" ? " (an empty list drops the image's ENTRYPOINT)" : ""}`);
        }
    }
    for (const key of ["init", "readOnly"]) {
        if (container[key] !== undefined && typeof container[key] !== "boolean") {
            errors.push(`${field}.${key}: expected true or false`);
        }
    }
    if (container.user !== undefined &&
        !(typeof container.user === "string" && /^[A-Za-z0-9_.:-]+$/.test(container.user))) {
        errors.push(`${field}.user: expected a user or uid[:gid] such as 10001:10001`);
    }
    if (container.shmSize !== undefined &&
        !(typeof container.shmSize === "string" && SIZE_PATTERN.test(container.shmSize))) {
        errors.push(`${field}.shmSize: expected a size such as 256mb or 1g`);
    }
    // GPU and HPC workloads: NVIDIA device reservations, CPU and memory limits (Flisk's defaults are 0.5 CPU and 512M) and IPC.
    const { gpus, cpus, memory, ipc } = container;
    if (gpus !== undefined && !(gpus === "all" || (Number.isInteger(gpus) && gpus > 0))) {
        errors.push(`${field}.gpus: expected "all" or a GPU count of 1 or more`);
    }
    const cpusOk = (Number.isInteger(cpus) && cpus > 0) ||
        (typeof cpus === "string" && /^[0-9]+(\.[0-9]{1,2})?$/.test(cpus) && Number(cpus) > 0);
    if (cpus !== undefined && !cpusOk) {
        errors.push(`${field}.cpus: expected a CPU count above 0 such as 4 or "2.5"`);
    }
    if (memory !== undefined &&
        !(typeof memory === "string" && SIZE_PATTERN.test(memory) && Number.parseInt(memory, 10) > 0)) {
        errors.push(`${field}.memory: expected a size such as 8g or 512mb`);
    }
    const { tmpfs } = container;
    if (tmpfs !== undefined &&
        !(Array.isArray(tmpfs) &&
            tmpfs.every((entry) => typeof entry === "string" &&
                /^\/[A-Za-z0-9_./-]*(:[a-z0-9=,_-]+)?$/.test(entry) &&
                !`${entry.split(":")[0]}/`.includes("/../")))) {
        errors.push(`${field}.tmpfs: expected a list of absolute paths with optional options, such as /tmp:noexec,nosuid,nodev,size=100m`);
    }
    if (ipc !== undefined && !(typeof ipc === "string" && CONTAINER_IPC_MODES.includes(ipc))) {
        errors.push(`${field}.ipc: expected one of ${CONTAINER_IPC_MODES.join(", ")}`);
    }
    const { stopGracePeriod, extraHosts, ulimits, networkAliases } = container;
    if (stopGracePeriod !== undefined &&
        !(typeof stopGracePeriod === "string" && DURATION_PATTERN.test(stopGracePeriod))) {
        errors.push(`${field}.stopGracePeriod: expected a duration such as 30s or 1m30s`);
    }
    if (extraHosts !== undefined && !(Array.isArray(extraHosts) && extraHosts.every(isExtraHost))) {
        errors.push(`${field}.extraHosts: expected a list of name:address, such as host.docker.internal:host-gateway or db:10.0.0.5`);
    }
    if (ulimits !== undefined) {
        const problem = ulimitsError(ulimits);
        if (problem)
            errors.push(`${field}.ulimits${problem}`);
    }
    if (networkAliases !== undefined) {
        if (!Array.isArray(networkAliases) ||
            !networkAliases.every((alias) => typeof alias === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(alias))) {
            errors.push(`${field}.networkAliases: expected a list of names such as ["mercure"] (letters, digits, '-', '_' and '.')`);
        }
        else if (new Set(networkAliases).size !== networkAliases.length) {
            errors.push(`${field}.networkAliases: lists a name twice`);
        }
        else if (networkAliases.length > 0 && manifest.sidecarOf) {
            errors.push(`${field}.networkAliases: does not apply to a sidecar (sidecarOf), which shares another container's network`);
        }
    }
    return errors;
}
/** `webUi` (#2997) is read for bring-your-own resources only: the app serves pages from `/`, so it gets a host name, not a path prefix. */
export function webUiErrors(manifest, displayPath) {
    if (manifest.webUi === undefined || manifest.webUi === null)
        return [];
    if (manifest.appType !== "bring-your-own")
        return [
            `${displayPath}.webUi: only applies to bring-your-own resources (appType "bring-your-own")`,
        ];
    if (manifest.webUi === true && manifest.sidecarOf)
        return [
            `${displayPath}.webUi: does not apply to a sidecar (sidecarOf), which has no route of its own`,
        ];
    return [];
}
const RESTART_POLICIES = ["no", "on-failure", "unless-stopped", "always"];
/**
 * `restart` on a bring-your-own resource: no, on-failure, on-failure:N (N from 1 to 100), unless-stopped or always. Mirrors
 * byo_restart_policy in engine/.../compose/byo_container.star.
 */
export function restartErrors(manifest, displayPath) {
    const { restart } = manifest;
    if (restart === undefined || restart === null || manifest.appType !== "bring-your-own")
        return [];
    if (typeof restart === "string") {
        if (RESTART_POLICIES.includes(restart))
            return [];
        const count = /^on-failure:([1-9][0-9]{0,2})$/.exec(restart);
        if (count && Number(count[1]) <= 100)
            return [];
    }
    return [
        `${displayPath}.restart: expected one of no, on-failure, on-failure:N (N from 1 to 100), unless-stopped, always`,
    ];
}
const isPortNumber = (value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
/**
 * The host port a `publish` template gives when no variable is set, or why the template is refused (see extra-port-publish.ts).
 * null when a bare `${NAME}` leaves the host port to the environment, so it is not known before Compose runs.
 */
/**
 * The host port of a template with a bare `${NAME}` (no default), read template-aware: the part after the last literal ":" is the
 * port, and it is known only when it is plain digits (`${HOST}:80`). A literal run of digits that can never be a port (65536,
 * `127.0.0.1:65536${A}`) is refused whatever the variable holds. null when the port comes from a variable. Mirrors
 * _publish_default in engine/.../compose/byo_ports.star.
 */
function unresolvedHostPort(publish) {
    const last = publish
        .replace(/\$\{[^}]*\}/g, "\u0000")
        .split(":")
        .pop() ?? "";
    const pieces = last.split("\u0000");
    if (pieces.some((piece) => /^[0-9]+$/.test(piece) && (piece.length > 5 || Number(piece) > 65535))) {
        return "has a host port above 65535";
    }
    if (pieces.length > 1)
        return null;
    if (!/^[0-9]+$/.test(last) || Number(last) < 1) {
        return "must give a port or address:port such as 127.0.0.1:8080 (IPv4 only)";
    }
    return Number(last);
}
function publishError(publish) {
    if (typeof publish !== "string" || publish === "") {
        return 'expected a string such as "${WEB_HTTP_BIND:-127.0.0.1:80}"';
    }
    const variables = publishVariables(publish);
    if (typeof variables === "string")
        return variables;
    if (variables.some((variable) => !variable.hasDefault))
        return unresolvedHostPort(publish);
    const mapping = parseHostMapping(substitutePublish(publish));
    if (!mapping)
        return "must give a port or address:port such as 127.0.0.1:8080 (IPv4 only)";
    return mapping.port;
}
/**
 * `extraPorts` (#2909): plain host ports on 127.0.0.1 for a bring-your-own resource, next to the routed `port`. Mirrors
 * engine/.../compose/byo_ports.star, which refuses the same values.
 */
export function extraPortsErrors(manifest, displayPath) {
    const extra = manifest.extraPorts;
    if (extra === undefined || extra === null)
        return [];
    const field = `${displayPath}.extraPorts`;
    if (!Array.isArray(extra))
        return [`${field}: expected a list such as [{ "port": 443 }]`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    if (extra.length > 0 && manifest.replicas !== undefined && manifest.replicas !== 1) {
        errors.push(`${field}: needs a single container; remove replicas`);
    }
    const seen = new Set();
    extra.forEach((entry, i) => {
        const at = `${field}[${i}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${at}: expected an object such as { "port": 443 }`);
            return;
        }
        for (const key of Object.keys(entry)) {
            if (!["port", "hostPort", "protocol", "bind", "publish"].includes(key)) {
                errors.push(`${at}.${key}: unknown option (use port, hostPort, protocol, bind, publish)`);
            }
        }
        if (!isPortNumber(entry.port))
            errors.push(`${at}.port: expected a port number from 1 to 65535`);
        let hostPort = entry.hostPort ?? entry.port;
        if (entry.publish !== undefined) {
            if (entry.hostPort !== undefined || entry.bind !== undefined) {
                errors.push(`${at}.publish: replaces hostPort and bind; remove them`);
            }
            const mapping = publishError(entry.publish);
            if (typeof mapping === "string")
                errors.push(`${at}.publish: ${mapping}`);
            else
                hostPort = mapping; // null: the host port comes from a variable, nothing to compare
        }
        else {
            if (entry.hostPort !== undefined && !isPortNumber(entry.hostPort)) {
                errors.push(`${at}.hostPort: expected a port number from 1 to 65535`);
            }
            if (entry.bind !== undefined && entry.bind !== "127.0.0.1" && entry.bind !== "0.0.0.0") {
                errors.push(`${at}.bind: expected 127.0.0.1 or 0.0.0.0`);
            }
        }
        const protocol = entry.protocol ?? "tcp";
        if (protocol !== "tcp" && protocol !== "udp")
            errors.push(`${at}.protocol: expected tcp or udp`);
        if (hostPort === null)
            return; // only the published-twice check needs the host port
        const key = `${String(hostPort)}/${String(protocol)}`;
        if (seen.has(key))
            errors.push(`${at}.hostPort: ${key} is published twice`);
        seen.add(key);
    });
    return errors;
}
/**
 * `sidecarOf` (#2908): a bring-your-own resource that shares another resource's network namespace. Mirrors
 * engine/.../compose/byo_sidecar.star. Whether the host exists in the same stack is checked across services (checkSidecars).
 */
export function sidecarErrors(manifest, displayPath) {
    const host = manifest.sidecarOf;
    if (host === undefined || host === null)
        return [];
    const field = `${displayPath}.sidecarOf`;
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    if (typeof host !== "string" || !/^[a-z0-9][a-z0-9_.-]*$/.test(host)) {
        return [`${field}: expected the appName of another resource in the same stack`];
    }
    const errors = [];
    if (host === manifest.appName)
        errors.push(`${field}: cannot name the resource itself`);
    if (Array.isArray(manifest.extraPorts) && manifest.extraPorts.length > 0) {
        errors.push(`${field}: a sidecar has no ports of its own; publish extraPorts on "${host}" instead`);
    }
    if (manifest.replicas !== undefined && manifest.replicas !== 1) {
        errors.push(`${field}: needs a single container; remove replicas`);
    }
    return errors;
}
/**
 * `volumes` (#1748): named volumes and bind mounts for a bring-your-own resource. Mirrors engine/.../compose/byo_volumes.star,
 * which refuses the same values. A bind mount's `source` is relative to the service directory and must stay inside the project;
 * `serviceDepth` is how many directories the service sits below the project root (unknown when validating a manifest alone).
 */
export function volumesErrors(manifest, displayPath, serviceDepth) {
    const volumes = manifest.volumes;
    if (volumes === undefined || volumes === null)
        return [];
    const field = `${displayPath}.volumes`;
    if (!Array.isArray(volumes))
        return [`${field}: expected a list such as [{ "source": "data", "target": "/data" }]`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    const targets = new Set();
    volumes.forEach((entry, i) => {
        const at = `${field}[${i}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${at}: expected an object such as { "source": "data", "target": "/data" }`);
            return;
        }
        for (const key of Object.keys(entry)) {
            if (!["source", "target", "readOnly", "name", "selinux"].includes(key)) {
                errors.push(`${at}.${key}: unknown option (use source, target, readOnly, name, selinux)`);
            }
        }
        const { target, readOnly, name, selinux } = entry;
        // A bind mount's source may come from the environment: ${OM_MCP_SHARED_DIR:-./.mercato/mcp-shared}, ${NAME-./path}, or a bare
        // ${STORAGE_DIR} (an absolute path from the .env), each optionally followed by /sub/path. A default is checked like any
        // other bind path; "./" stands in for a bare variable.
        const variable = typeof entry.source === "string"
            ? /^\$\{[A-Za-z_][A-Za-z0-9_]*(?::?-(\.{1,2}(?:\/[A-Za-z0-9_.-]+)*\/?))?\}((?:\/[A-Za-z0-9_.-]+)*)$/.exec(entry.source)
            : null;
        const badSuffix = variable?.[2]
            ?.split("/")
            .some((segment) => segment === "." || segment === "..");
        if (typeof entry.source === "string" &&
            entry.source.startsWith("${") &&
            (!variable || badSuffix)) {
            errors.push(`${at}.source: variables must be \${NAME}, \${NAME:-./path} or \${NAME-./path}, optionally followed by /sub/path, with a default path starting with ./ or ../`);
            return;
        }
        const source = variable ? (variable[1] ?? "./") : entry.source;
        if (selinux !== undefined) {
            if (selinux !== "z" && selinux !== "Z") {
                errors.push(`${at}.selinux: expected z (shared) or Z (private)`);
            }
            else if (typeof source === "string" && !source.startsWith(".")) {
                errors.push(`${at}.selinux: only applies to a bind mount`);
            }
        }
        if (typeof source !== "string" ||
            !/^([a-z0-9][a-z0-9_-]*|\.{1,2}(\/[A-Za-z0-9_.-]+)*\/?)$/.test(source)) {
            errors.push(`${at}.source: expected a volume name such as data, or a path starting with ./ such as ./config`);
        }
        else if (serviceDepth !== undefined && source.startsWith(".")) {
            let depth = serviceDepth;
            for (const segment of source.split("/")) {
                if (segment === "..")
                    depth -= 1;
                else if (segment !== "." && segment !== "")
                    depth += 1;
                if (depth < 0)
                    break;
            }
            if (depth < 0)
                errors.push(`${at}.source: must stay inside the project`);
        }
        if (typeof target !== "string" ||
            !/^\/[A-Za-z0-9_./-]*$/.test(target) ||
            `${target}/`.includes("/../")) {
            errors.push(`${at}.target: expected an absolute path in the container such as /data`);
        }
        else if (targets.has(target)) {
            errors.push(`${at}.target: ${target} is mounted twice`);
        }
        else {
            targets.add(target);
        }
        if (readOnly !== undefined && typeof readOnly !== "boolean") {
            errors.push(`${at}.readOnly: expected true or false`);
        }
        // `name` is the Docker volume's own name, such as the one an existing Compose install created (tubehaus_tubehaus-data).
        if (name !== undefined) {
            if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
                errors.push(`${at}.name: expected a Docker volume name such as myapp_data (letters, digits, '_', '.' and '-')`);
            }
            else if (typeof source === "string" && source.startsWith(".")) {
                errors.push(`${at}.name: only applies to a named volume, not a bind mount`);
            }
        }
    });
    return errors;
}
const DEPENDS_ON_CONDITIONS = [
    "service_started",
    "service_healthy",
    "service_completed_successfully",
];
/**
 * `dependsOn`: service or stack names, or Compose-style objects `{ "name": "db", "condition": "service_healthy" }`. Flisk orders by
 * name (Tilt resource_deps), so the condition is accepted and kept but does not change the order. Mirrors normalize_depends_on in
 * engine/.../tilt/manifest/parser.star.
 */
export function dependsOnErrors(manifest, displayPath) {
    const deps = manifest.dependsOn;
    if (!Array.isArray(deps))
        return [];
    const errors = [];
    deps.forEach((entry, i) => {
        if (typeof entry === "string")
            return;
        const at = `${displayPath}.dependsOn[${i}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${at}: expected a name, or an object such as { "name": "db", "condition": "service_healthy" }`);
            return;
        }
        for (const key of Object.keys(entry)) {
            if (key !== "name" && key !== "condition")
                errors.push(`${at}.${key}: unknown option (use name, condition)`);
        }
        if (typeof entry.name !== "string" || entry.name === "") {
            errors.push(`${at}.name: expected a service or stack name`);
        }
        if (entry.condition !== undefined &&
            !(typeof entry.condition === "string" && DEPENDS_ON_CONDITIONS.includes(entry.condition))) {
            errors.push(`${at}.condition: expected one of ${DEPENDS_ON_CONDITIONS.join(", ")}`);
        }
    });
    return errors;
}
/** Plain text that is safe inside a JSON (double-quoted YAML) string: no line break or control character. */
const isPlainText = (value) => typeof value === "string" && !hasLineBreakOrControl(value);
/**
 * `buildArgs` (bring-your-own): Compose `build.args` for a resource built from its Dockerfile. Values are text, Compose
 * variables included (`${NODE_VERSION:-22}`), written as JSON strings. Mirrors byo_build_args_lines in
 * engine/.../compose/byo_build_logging.star.
 */
export function buildArgsErrors(manifest, displayPath) {
    const args = manifest.buildArgs;
    if (args === undefined || args === null)
        return [];
    const field = `${displayPath}.buildArgs`;
    if (!isPlainObject(args))
        return [`${field}: expected an object of string values such as { "NODE_VERSION": "22" }`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    if (typeof manifest.image === "string" && manifest.image && !manifest.dockerfile) {
        return [
            `${field}: only applies to a resource built from a Dockerfile, not one that runs "image"`,
        ];
    }
    const errors = [];
    for (const [name, value] of Object.entries(args)) {
        if (!ENV_NAME_PATTERN.test(name)) {
            errors.push(`${field}.${name}: names must be letters, digits or _, not starting with a digit`);
        }
        else if (!isPlainText(value)) {
            errors.push(`${field}.${name}: expected a string without line breaks or control characters`);
        }
    }
    return errors;
}
/**
 * `logging` (bring-your-own, #2965): Compose `logging`, such as `{ "driver": "json-file", "options": { "max-size": "5m" } }`.
 * Mirrors byo_logging_section in engine/.../compose/byo_build_logging.star.
 */
export function loggingErrors(manifest, displayPath) {
    const logging = manifest.logging;
    if (logging === undefined || logging === null)
        return [];
    const field = `${displayPath}.logging`;
    if (!isPlainObject(logging)) {
        return [
            `${field}: expected an object such as { "driver": "json-file", "options": { "max-size": "5m" } }`,
        ];
    }
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    for (const key of Object.keys(logging)) {
        if (key !== "driver" && key !== "options")
            errors.push(`${field}.${key}: unknown option (use driver, options)`);
    }
    const { driver, options } = logging;
    if (driver !== undefined &&
        !(typeof driver === "string" && /^[a-z0-9][a-z0-9_.-]*$/.test(driver))) {
        errors.push(`${field}.driver: expected a driver name such as json-file or local`);
    }
    if (options !== undefined) {
        if (!isPlainObject(options)) {
            errors.push(`${field}.options: expected an object of string values such as { "max-size": "5m" }`);
        }
        else {
            for (const [key, value] of Object.entries(options)) {
                if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key)) {
                    errors.push(`${field}.options: keys must be letters, digits, '-', '_' and '.', such as max-size`);
                }
                else if (!isPlainText(value)) {
                    errors.push(`${field}.options.${key}: expected a string without line breaks or control characters`);
                }
            }
        }
    }
    return errors;
}
/**
 * `envFile`: extra env files for a bring-your-own resource, each a path relative to the service directory that must stay inside
 * the project (`serviceDepth` is how many directories the service sits below the project root, unknown when validating a manifest
 * alone). A missing file is not an error. Mirrors engine/.../compose/byo_env_file.star.
 */
export function envFileErrors(manifest, displayPath, serviceDepth) {
    const envFile = manifest.envFile;
    if (envFile === undefined || envFile === null)
        return [];
    const field = `${displayPath}.envFile`;
    if (!Array.isArray(envFile))
        return [`${field}: expected a list of paths such as ["../../../.env"]`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    envFile.forEach((source, i) => {
        const at = `${field}[${i}]`;
        if (typeof source !== "string" || !/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(source)) {
            errors.push(`${at}: expected a relative file path such as ../../../.env`);
            return;
        }
        if (serviceDepth === undefined)
            return;
        let depth = serviceDepth;
        for (const segment of source.split("/")) {
            if (segment === "..")
                depth -= 1;
            else if (segment !== ".")
                depth += 1;
            if (depth < 0)
                break;
        }
        if (depth < 0)
            errors.push(`${at}: must stay inside the project`);
        else if (depth === 0)
            errors.push(`${at}: expected a file inside the project, not its root`);
    });
    return errors;
}
/** A model reference such as ai/smollm2, ai/qwen3:8B-Q4_K_M or hf.co/org/name. */
const MODEL_REFERENCE = "[A-Za-z0-9][A-Za-z0-9._/:@-]*";
/** `models[].model`: a model reference, or a Compose variable `${NAME}`, `${NAME:-<model reference>}` or `${NAME-<model reference>}`. */
const MODEL_VALUE_PATTERN = new RegExp(`^(${MODEL_REFERENCE}|\\$\\{[A-Za-z_][A-Za-z0-9_]*(:?-${MODEL_REFERENCE})?\\})$`);
/**
 * `models` (Compose / Docker Model Runner): models a bring-your-own resource uses, each `{ "name": "llm", "model": "ai/smollm2" }`.
 * The service gets `models: [llm]` and the stack's Compose file a top-level `models:` entry. `model` is written quoted into the
 * generated YAML, so only a model reference or a Compose variable is accepted. Mirrors engine/.../compose/byo_models.star.
 */
export function modelsErrors(manifest, displayPath) {
    const models = manifest.models;
    if (models === undefined || models === null)
        return [];
    const field = `${displayPath}.models`;
    if (!Array.isArray(models)) {
        return [`${field}: expected a list such as [{"name": "llm", "model": "ai/smollm2"}]`];
    }
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    const names = new Set();
    models.forEach((entry, i) => {
        const at = `${field}[${i}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${at}: expected an object such as {"name": "llm", "model": "ai/smollm2"}`);
            return;
        }
        for (const key of Object.keys(entry)) {
            if (key !== "name" && key !== "model")
                errors.push(`${at}.${key}: unknown option (use name, model)`);
        }
        const { name, model } = entry;
        if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
            errors.push(`${at}.name: expected a model name such as llm (letters, digits, '-', '_' and '.')`);
        }
        else if (names.has(name)) {
            errors.push(`${at}.name: ${name} is listed twice`);
        }
        else {
            names.add(name);
        }
        if (typeof model !== "string" || !MODEL_VALUE_PATTERN.test(model)) {
            errors.push(`${at}.model: expected a model such as ai/smollm2, or a variable such as \${LLM_MODEL} or \${LLM_MODEL:-ai/smollm2}`);
        }
    });
    return errors;
}
/**
 * `env` on a bring-your-own resource (#2923): plain, committed configuration written into the container's Compose `environment`.
 * A command service's `env` is checked with the other command-service fields (validateNativeServiceFields). Mirrors
 * engine/.../compose/byo_env.star.
 */
export function byoEnvErrors(manifest, displayPath) {
    const env = manifest.env;
    if (env === undefined || env === null || manifest.appType !== "bring-your-own")
        return [];
    if (declaresCommand(manifest))
        return [];
    const field = `${displayPath}.env`;
    if (!isPlainObject(env))
        return [`${field}: expected an object of string values`];
    const errors = [];
    for (const [name, value] of Object.entries(env)) {
        if (!ENV_NAME_PATTERN.test(name)) {
            errors.push(`${field}.${name}: names must be letters, digits or _, not starting with a digit`);
        }
        else if (typeof value !== "string") {
            errors.push(`${field}.${name}: expected a string`);
        }
        else if (hasLineBreakOrControl(value)) {
            errors.push(`${field}.${name}: must not contain line breaks or control characters`);
        }
    }
    return errors;
}
/**
 * `provides`: the connection settings a resource gives the services that list it in `dependsOn` (REDIS_URL for a Redis).
 * Each one is written into the dependent's generated env file, which `flisk config verify` checks and which must hold no
 * secret, so the values are plain URLs and names. Mirrors _dependency_provides_lines in
 * engine/.../orchestrator/generators/env.star.
 */
export function providesErrors(manifest, displayPath) {
    const provides = manifest.provides;
    if (provides === undefined || provides === null)
        return [];
    const field = `${displayPath}.provides`;
    if (!isPlainObject(provides)) {
        return [`${field}: expected an object such as { "REDIS_URL": "redis://cache:6379" }`];
    }
    const errors = [];
    for (const [key, value] of Object.entries(provides)) {
        if (!ENV_NAME_PATTERN.test(key)) {
            errors.push(`${field}.${key}: expected an environment variable name such as REDIS_URL`);
        }
        if (typeof value !== "string" || !/^[A-Za-z0-9_\-./:@%+=,]+$/.test(value)) {
            errors.push(`${field}.${key}: expected a URL or value without spaces, quotes or $`);
        }
    }
    return errors;
}
const PROVIDER_KEYS = ["url", "tokenSecret", "fallback", "required"];
const PROVIDER_TYPES = new Set(["backend", "worker", "mcp", "agent", "bring-your-own"]);
/** The well-formed entries of `providers` (malformed ones are reported by {@link providersErrors}). */
export function providersOf(manifest) {
    const providers = manifest?.providers;
    if (!isPlainObject(providers))
        return [];
    return Object.entries(providers).flatMap(([id, entry]) => {
        if (!isPlainObject(entry) || typeof entry.url !== "string")
            return [];
        const tokenSecret = typeof entry.tokenSecret === "string" ? entry.tokenSecret : undefined;
        const fallback = typeof entry.fallback === "string" ? entry.fallback : undefined;
        const required = typeof entry.required === "boolean"
            ? entry.required
            : tokenSecret !== undefined && fallback === undefined;
        return [{ id, url: entry.url, tokenSecret, fallback, required }];
    });
}
/**
 * `providers`: external endpoints a service calls (IBM Quantum, Amazon Braket, a hosted model API) with the secret that holds
 * their token, and optionally a local resource to use while the token is missing. Mirrors
 * engine/.../docker/secrets/providers.star, which refuses the same values.
 */
export function providersErrors(manifest, displayPath) {
    const providers = manifest.providers;
    if (providers === undefined || providers === null)
        return [];
    const field = `${displayPath}.providers`;
    if (!isPlainObject(providers)) {
        return [`${field}: expected an object such as { "ibm-quantum": { "url": "https://..." } }`];
    }
    if (typeof manifest.command === "string" || !PROVIDER_TYPES.has(String(manifest.appType))) {
        return [
            `${field}: only applies to container services (backend, worker, mcp, agent, bring-your-own)`,
        ];
    }
    const dependsOn = Array.isArray(manifest.dependsOn) ? manifest.dependsOn : [];
    const errors = [];
    for (const [id, entry] of Object.entries(providers)) {
        const at = `${field}.${id}`;
        if (!/^[a-z][a-z0-9-]*$/.test(id)) {
            errors.push(`${at}: name it in lowercase letters, digits and '-', such as ibm-quantum`);
        }
        if (!isPlainObject(entry)) {
            errors.push(`${at}: expected an object such as { "url": "https://..." }`);
            continue;
        }
        for (const key of Object.keys(entry)) {
            if (!PROVIDER_KEYS.includes(key)) {
                errors.push(`${at}.${key}: unknown option (use ${PROVIDER_KEYS.join(", ")})`);
            }
        }
        if (typeof entry.url !== "string" || !/^https?:\/\/[A-Za-z0-9_\-./:@%+=,~]+$/.test(entry.url)) {
            errors.push(`${at}.url: expected an http(s) URL without spaces, quotes or $`);
        }
        const token = entry.tokenSecret;
        if (token !== undefined && !(typeof token === "string" && ENV_NAME_PATTERN.test(token))) {
            errors.push(`${at}.tokenSecret: expected an environment variable name such as IBM_QUANTUM_TOKEN`);
        }
        const fallback = entry.fallback;
        if (fallback !== undefined) {
            if (!(typeof fallback === "string" && /^[a-z][a-z0-9-]*$/.test(fallback))) {
                errors.push(`${at}.fallback: expected a resource name such as quantum-sim`);
            }
            else if (!dependsOn.includes(fallback)) {
                errors.push(`${at}.fallback: list ${fallback} in dependsOn too, so it starts first`);
            }
        }
        if (entry.required !== undefined && typeof entry.required !== "boolean") {
            errors.push(`${at}.required: expected true or false`);
        }
        else if (entry.required === true && token === undefined) {
            errors.push(`${at}.required: needs a tokenSecret`);
        }
    }
    return errors;
}
/** `secrets` must be { required?: string[], optional?: string[] } of environment variable names: the generator fails on anything else. */
export function secretsErrors(manifest, displayPath) {
    const secrets = manifest.secrets;
    if (secrets === undefined || secrets === null)
        return [];
    if (typeof secrets !== "object" || Array.isArray(secrets))
        return [`${displayPath}.secrets: expected an object like { "required": ["NAME"] }`];
    const errors = [];
    for (const kind of ["required", "optional"]) {
        const names = secrets[kind];
        if (names === undefined)
            continue;
        if (!Array.isArray(names)) {
            errors.push(`${displayPath}.secrets.${kind}: expected a list of environment variable names`);
            continue;
        }
        for (const name of names) {
            if (typeof name !== "string" || !ENV_NAME_PATTERN.test(name))
                errors.push(`${displayPath}.secrets.${kind}: ${JSON.stringify(name)} is not an environment variable name (letters, digits and underscores, not starting with a digit)`);
        }
    }
    return errors;
}
export function secretConflictWarnings(manifest, displayPath) {
    const secrets = manifest.secrets;
    if (!secrets || typeof secrets !== "object")
        return [];
    const declared = new Set();
    for (const kind of ["required", "optional"]) {
        const names = secrets[kind];
        if (Array.isArray(names))
            for (const name of names)
                if (typeof name === "string")
                    declared.add(name);
    }
    const warnings = [];
    for (const field of ["params", "env"]) {
        const values = manifest[field];
        if (!values || typeof values !== "object" || Array.isArray(values))
            continue;
        for (const name of Object.keys(values)) {
            if (declared.has(name))
                warnings.push(`${displayPath}.${field}.${name}: also listed in secrets, so this literal value is used and the secret from .env is ignored; remove one of them`);
        }
    }
    return warnings;
}
const HEALTH_CHECK_CONFIG_KEYS = new Set([
    "enabled",
    "interval",
    "timeout",
    "startPeriod",
    "retries",
    "path",
    "port",
    "command",
]);
/**
 * Validates the optional `healthCheck` field: boolean (e.g. false to disable) or an object
 * configuring enabled, interval, timeout, retries, and path.
 */
export function healthCheckErrors(manifest, displayPath) {
    const value = manifest.healthCheck;
    if (value === undefined || value === null)
        return [];
    if (typeof value === "boolean")
        return [];
    if (!isPlainObject(value)) {
        return [
            `${displayPath}.healthCheck: expected true or false, or an object such as { "enabled": true, "path": "/health" }`,
        ];
    }
    const errors = [];
    const hc = value;
    for (const key of Object.keys(hc)) {
        if (!HEALTH_CHECK_CONFIG_KEYS.has(key)) {
            errors.push(`${displayPath}.healthCheck: unexpected key "${key}" (expected "enabled", "interval", "timeout", "startPeriod", "retries", "path", "port", or "command")`);
        }
    }
    if (hc.enabled !== undefined && typeof hc.enabled !== "boolean") {
        errors.push(`${displayPath}.healthCheck.enabled: expected true or false`);
    }
    if (hc.interval !== undefined) {
        if (typeof hc.interval !== "number" || !Number.isFinite(hc.interval) || hc.interval <= 0) {
            errors.push(`${displayPath}.healthCheck.interval: expected a positive number`);
        }
    }
    if (hc.timeout !== undefined) {
        if (typeof hc.timeout !== "number" || !Number.isFinite(hc.timeout) || hc.timeout <= 0) {
            errors.push(`${displayPath}.healthCheck.timeout: expected a positive number`);
        }
    }
    if (hc.startPeriod !== undefined) {
        if (typeof hc.startPeriod !== "number" ||
            !Number.isFinite(hc.startPeriod) ||
            hc.startPeriod <= 0) {
            errors.push(`${displayPath}.healthCheck.startPeriod: expected a positive number`);
        }
    }
    if (hc.retries !== undefined) {
        if (typeof hc.retries !== "number" || !Number.isInteger(hc.retries) || hc.retries < 0) {
            errors.push(`${displayPath}.healthCheck.retries: expected a non-negative integer`);
        }
    }
    if (hc.path !== undefined) {
        if (typeof hc.path !== "string") {
            errors.push(`${displayPath}.healthCheck.path: expected a string`);
        }
        else if (!/^\/[a-z0-9/-]*$/.test(hc.path)) {
            errors.push(`${displayPath}.healthCheck.path: must be a path such as /health (no spaces, line breaks or YAML syntax)`);
        }
    }
    if (hc.port !== undefined) {
        if (typeof hc.port !== "number" ||
            !Number.isInteger(hc.port) ||
            hc.port < 1 ||
            hc.port > 65535) {
            errors.push(`${displayPath}.healthCheck.port: expected a port from 1 to 65535`);
        }
    }
    if (hc.command !== undefined) {
        if (!Array.isArray(hc.command) ||
            hc.command.length === 0 ||
            !hc.command.every((part) => typeof part === "string" && part.length > 0)) {
            errors.push(`${displayPath}.healthCheck.command: expected the program and its arguments, such as ["grpc_health_probe", "-addr=:9090"]`);
        }
    }
    const probes = ["path", "port", "command"].filter((key) => hc[key] !== undefined);
    if (probes.length > 1) {
        errors.push(`${displayPath}.healthCheck: set only one of "path", "port" or "command" (got ${probes.map((key) => `"${key}"`).join(" and ")})`);
    }
    return errors;
}
/** `healthCheck.port` or `healthCheck.command`, when the service set one instead of an HTTP path. */
export function readinessProbeOf(manifest) {
    if (isHealthCheckDisabled(manifest))
        return undefined;
    const { port, command } = healthCheckObject(manifest);
    if (typeof port === "number" && Number.isInteger(port) && port > 0 && port < 65536) {
        return { kind: "port", port };
    }
    if (Array.isArray(command) &&
        command.length > 0 &&
        command.every((part) => typeof part === "string")) {
        return { kind: "command", command: [...command] };
    }
    return undefined;
}
/** The `healthCheck` object of a manifest, or an empty one when it is a boolean or absent. */
function healthCheckObject(manifest) {
    return isPlainObject(manifest?.healthCheck)
        ? manifest.healthCheck
        : {};
}
/**
 * The one rule for turning health checks off: `healthCheck: false` or `healthCheck: { enabled: false }`.
 * Nothing else disables them: a service without a health path still gets its default readiness
 * signal (its port for a native `command` service, `/health` for a container).
 */
export function isHealthCheckDisabled(manifest) {
    const value = manifest?.healthCheck;
    return value === false || (isPlainObject(value) && value.enabled === false);
}
/** The HTTP path to probe: `healthCheck.path`, then `healthCheckPath`, then `fallback`. */
export function healthCheckPathOf(manifest, fallback) {
    // A port or command probe replaces the HTTP one.
    if (readinessProbeOf(manifest))
        return undefined;
    const path = healthCheckObject(manifest).path;
    if (typeof path === "string")
        return path;
    return typeof manifest?.healthCheckPath === "string" ? manifest.healthCheckPath : fallback;
}
/**
 * Reads a manifest's health check settings. `enabled` follows {@link isHealthCheckDisabled}; `path` follows
 * {@link healthCheckPathOf} and is absent when neither the manifest nor `options.defaultPath` gives one.
 */
export function parseHealthCheckConfig(manifest, options = {}) {
    if (isHealthCheckDisabled(manifest))
        return { enabled: false };
    const { interval, timeout, retries, startPeriod } = healthCheckObject(manifest);
    const path = healthCheckPathOf(manifest, options.defaultPath);
    return {
        enabled: true,
        ...(path !== undefined ? { path } : {}),
        ...(interval !== undefined ? { interval } : {}),
        ...(timeout !== undefined ? { timeout } : {}),
        ...(retries !== undefined ? { retries } : {}),
        ...(startPeriod !== undefined ? { startPeriod } : {}),
    };
}
export function validateServiceManifest(value, displayPath) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { errors: [`${displayPath}: expected a JSON object`], warnings: [] };
    }
    const manifest = value;
    const errors = [];
    // A `command` service runs as a local process, so it has no stack to group generated output by (the minimal contract in
    // utils/native-service.ts). Every other service keeps the full set.
    const requiredFields = declaresCommand(manifest)
        ? ["appName", "appType", "schemaVersion"]
        : ["appName", "appType", "stack", "schemaVersion"];
    for (const field of requiredFields) {
        if (!(field in manifest))
            errors.push(`${displayPath}.${field}: required field is missing`);
    }
    for (const field of ["appName", "appType", "stack"]) {
        if (field in manifest && typeof manifest[field] !== "string") {
            errors.push(`${displayPath}.${field}: expected a string`);
        }
    }
    if ("schemaVersion" in manifest && manifest.schemaVersion !== SERVICE_MANIFEST_SCHEMA_VERSION) {
        errors.push(`${displayPath}.schemaVersion: unsupported version ${String(manifest.schemaVersion)} (supported: ${SERVICE_MANIFEST_SCHEMA_VERSION})`);
    }
    for (const field of getInvalidServiceRoutePathFields(manifest)) {
        errors.push(`${displayPath}.${field}: expected a string`);
    }
    const dev = manifest.dev;
    const liveReload = dev && typeof dev === "object" && !Array.isArray(dev)
        ? dev.liveReload
        : undefined;
    if (liveReload !== undefined && typeof liveReload !== "boolean") {
        errors.push(`${displayPath}.dev.liveReload: expected true or false`);
    }
    errors.push(...validateGeneratedStringFields(manifest, displayPath));
    errors.push(...dockerNameErrors(manifest, displayPath));
    errors.push(...fieldTypeErrors(manifest, displayPath));
    errors.push(...validateNativeServiceFields(manifest).map((error) => `${displayPath}: ${error}`));
    errors.push(...secretsErrors(manifest, displayPath));
    errors.push(...containerErrors(manifest, displayPath));
    errors.push(...extraPortsErrors(manifest, displayPath));
    errors.push(...providesErrors(manifest, displayPath));
    errors.push(...providersErrors(manifest, displayPath));
    errors.push(...sidecarErrors(manifest, displayPath));
    errors.push(...volumesErrors(manifest, displayPath));
    errors.push(...envFileErrors(manifest, displayPath));
    errors.push(...modelsErrors(manifest, displayPath));
    errors.push(...restartErrors(manifest, displayPath));
    errors.push(...webUiErrors(manifest, displayPath));
    errors.push(...dependsOnErrors(manifest, displayPath));
    errors.push(...buildArgsErrors(manifest, displayPath));
    errors.push(...loggingErrors(manifest, displayPath));
    errors.push(...byoEnvErrors(manifest, displayPath));
    errors.push(...healthCheckErrors(manifest, displayPath));
    if ("profiles" in manifest) {
        const profiles = manifest.profiles;
        if (!Array.isArray(profiles) ||
            profiles.length === 0 ||
            !profiles.every((name) => typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name))) {
            errors.push(`${displayPath}.profiles: expected a list of profile names such as ["admin"] (lowercase letters, digits and hyphens)`);
        }
    }
    if ("smoke" in manifest) {
        for (const message of validateSmoke(manifest.smoke))
            errors.push(`${displayPath}.${message}`);
    }
    const warnings = Object.keys(manifest).flatMap((field) => {
        const deprecation = DEPRECATED_FIELDS[field];
        if (deprecation)
            return [`${displayPath}.${field}: ${deprecation}`];
        if (!KNOWN_SERVICE_FIELDS.has(field))
            return [`${displayPath}.${field}: unknown field is preserved`];
        return [];
    });
    warnings.push(...secretConflictWarnings(manifest, displayPath));
    if (liveReload === true && manifest.language !== "go") {
        warnings.push(`${displayPath}.dev.liveReload: only applies to Go services (language "go"); it is ignored here`);
    }
    const testOnSave = dev && typeof dev === "object" && !Array.isArray(dev)
        ? dev.testOnSave
        : undefined;
    const testOnSaveEnabled = testOnSave === true ||
        (testOnSave &&
            typeof testOnSave === "object" &&
            !Array.isArray(testOnSave) &&
            testOnSave.enabled !== false);
    if (testOnSaveEnabled && manifest.language !== "python") {
        warnings.push(`${displayPath}.dev.testOnSave: only applies to Python services (language "python"); it is ignored here`);
    }
    return { errors: [...new Set(errors)], warnings, manifest };
}
/**
 * Generated-output errors for one service.json. A file that cannot be read or parsed returns none here, because
 * validateServiceManifestFile reports that case.
 */
export function generatedFieldErrorsForFile(filePath, displayPath) {
    if (!existsSync(filePath))
        return [];
    try {
        const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return [];
        return validateGeneratedStringFields(parsed, displayPath);
    }
    catch {
        return [];
    }
}
export function validateServiceManifestFile(filePath, displayPath) {
    if (!existsSync(filePath)) {
        return { errors: [`${displayPath}: file is missing`], warnings: [] };
    }
    try {
        const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
        return validateServiceManifest(parsed, displayPath);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { errors: [`${displayPath}: invalid JSON (${message})`], warnings: [] };
    }
}
