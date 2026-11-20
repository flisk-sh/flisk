// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandProgram } from "./native-service.js";
/**
 * Resolves what a service `command` actually starts, one level into the service's
 * own package.json (#4680). A command such as `npm run dev` starts npm, but the
 * program that can be missing is the first program of `scripts.dev` (`bun run
 * --watch src/index.ts` -> `bun`). Doctor and `flisk up` must name that program
 * before the first start, instead of reporting `ready: true` and then seeing the
 * service exit 127 five times.
 *
 * Only one level is followed: a script that itself says `npm run build` is not
 * resolved again. That keeps the check read-only, bounded, and independent of
 * generated files -- it reads the author's package.json and nothing else.
 */
/** Programs the shell runs itself, so they cannot be missing from PATH. */
export const SHELL_BUILTIN_PROGRAMS = new Set(["cd", ".", "source", "true", ":"]);
/** The first program of each `&&`-separated part of a shell command line. */
export function commandPrograms(command) {
    return command
        .split(/\s*&&\s*/)
        .map((part) => commandProgram(part))
        .filter((program) => program !== null && !SHELL_BUILTIN_PROGRAMS.has(program));
}
/**
 * The package.json script a command part delegates to, when it is one of the
 * supported forms: `npm run <script>`, `yarn <script>`, `yarn run <script>`,
 * `pnpm <script>`, `pnpm run <script>` or `bun run <script>`. Leading
 * `VAR=value` assignments and `exec`/`env` prefixes are ignored, as in
 * `commandProgram`. Returns null for everything else.
 */
export function scriptOfCommand(command) {
    const words = command
        .trim()
        .split(/\s+/)
        .filter((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && word !== "exec" && word !== "env");
    const [manager, verb, name] = words;
    if (!manager || !verb || /^-/.test(verb))
        return null;
    const script = (manager === "npm" && verb === "run") ||
        (manager === "yarn" && verb === "run") ||
        (manager === "pnpm" && verb === "run") ||
        (manager === "bun" && verb === "run")
        ? name
        : (manager === "yarn" || manager === "pnpm") && !/^-/.test(verb)
            ? verb
            : undefined;
    return script && /^[A-Za-z0-9_.:@-]+$/.test(script) ? script : null;
}
/** Reads `scripts.<name>` from the service's own package.json, or null when absent or unreadable. */
export function readPackageScript(cwd, script, readFile = (path) => readFileSync(path, "utf-8")) {
    try {
        const pkg = JSON.parse(readFile(join(cwd, "package.json")));
        const body = pkg.scripts?.[script];
        return typeof body === "string" && body.trim() !== "" ? body : null;
    }
    catch {
        return null;
    }
}
/**
 * Every program to check for one service command: the first program of each
 * `&&` part, plus the first program of each `&&` part of any package-manager
 * script it delegates to. Deduplicated so a script using `bun` twice reports it
 * once.
 */
export function programsForServiceCommand(cwd, command, readFile = (path) => readFileSync(path, "utf-8")) {
    const found = [];
    const seen = new Set();
    const add = (program, script) => {
        const key = `${script ?? ""}\u0000${program}`;
        if (seen.has(key))
            return;
        seen.add(key);
        found.push(script === undefined ? { program } : { program, script });
    };
    for (const part of command.split(/\s*&&\s*/)) {
        const program = commandProgram(part);
        if (program && !SHELL_BUILTIN_PROGRAMS.has(program))
            add(program);
        const script = scriptOfCommand(part);
        if (!script)
            continue;
        const body = readPackageScript(cwd, script, readFile);
        if (body)
            for (const scriptProgram of commandPrograms(body))
                add(scriptProgram, script);
    }
    return found;
}
/** Where a missing program can be installed, for the failure guidance. */
export function installGuidance(program) {
    const urls = {
        bun: "https://bun.sh/docs/installation",
        npm: "https://nodejs.org/",
        node: "https://nodejs.org/",
        npx: "https://nodejs.org/",
        pnpm: "https://pnpm.io/installation",
        yarn: "https://yarnpkg.com/getting-started/install",
        uv: "https://docs.astral.sh/uv/getting-started/installation/",
        deno: "https://docs.deno.com/runtime/getting_started/installation/",
    };
    const url = urls[program];
    return url
        ? `Install ${program} (${url})`
        : `Install ${program} with your package manager or version manager`;
}
