// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk secret set|unset|list` (#4702). A value is accepted only from a pipe or a hidden
 * terminal prompt: the positional argument is the NAME, never the value. Nothing here prints a
 * value, and the keychain runner is behind `createKeychain` so tests can use a fake.
 */
import { Command } from "commander";
import { FliskError, showErrorAndExit } from "../utils/errors.js";
import { createKeychain } from "../utils/keychain.js";
import { findProjectRoot } from "../utils/paths.js";
import { projectSecretNames } from "../utils/secret-resolution.js";
function projectRootOrExit() {
    const root = findProjectRoot();
    if (!root) {
        showErrorAndExit("No Flisk project found in this directory or a parent.", 1, [
            "Run `flisk project --yes` first, or change to the project directory",
        ]);
    }
    return root;
}
function keychainFor(root, deps) {
    const write = deps.stdout ?? ((text) => console.log(text));
    return (deps.keychain ??
        createKeychain({ projectRoot: root, onUnsupported: (message) => write(message) }));
}
/** Refuses names that no service declares, so a typo cannot create an unreachable keychain entry. */
export function assertDeclaredSecret(name, projectRoot) {
    if (projectSecretNames(projectRoot).includes(name))
        return;
    throw new FliskError(`Secret ${name} is not declared by any service.json`, [
        `Add ${name} to secrets.required or secrets.optional in the service that uses it`,
    ]);
}
/** Reads a piped value. Empty stdin is an error: the value must come from the pipe or a prompt. */
export async function readPipedSecret(stream) {
    let value = "";
    for await (const chunk of stream)
        value += chunk.toString();
    return value.replace(/\r?\n$/, "") || undefined;
}
/**
 * Reads a value from a terminal with echo turned off. The prompt and the final newline are the
 * only output; typed characters never reach stdout. Ctrl+C rejects without storing anything.
 */
export function promptHiddenSecret(message, stdin = process.stdin, write = (text) => process.stdout.write(text)) {
    const stream = stdin;
    if (!stream.isTTY || typeof stream.setRawMode !== "function") {
        return Promise.reject(new FliskError("No terminal for a hidden secret prompt", [
            "Pipe the value instead: printf '%s' 'value' | flisk secret set NAME",
        ]));
    }
    const wasRaw = stream.isRaw ?? false;
    stream.setRawMode(true);
    stream.resume();
    write(`${message} (input hidden): `);
    return new Promise((resolve, reject) => {
        let value = "";
        const finish = (error) => {
            stream.off("data", onData);
            stream.off("error", onError);
            stream.setRawMode?.(wasRaw);
            stream.pause();
            write("\n");
            if (error)
                reject(error);
            else
                resolve(value);
        };
        const onData = (chunk) => {
            for (const char of chunk.toString()) {
                if (char === "\r" || char === "\n") {
                    finish(undefined);
                    return;
                }
                if (char === "\u0003") {
                    finish(new FliskError("Cancelled; no secret was stored"));
                    return;
                }
                if (char === "\u007f" || char === "\b") {
                    value = value.slice(0, -1);
                    continue;
                }
                if (char < " ")
                    continue;
                value += char;
            }
        };
        const onError = (error) => finish(error);
        stream.on("data", onData);
        stream.once("error", onError);
    });
}
/** Stores the value; the caller never passes it as a CLI argument. */
export async function setSecret(name, deps = {}) {
    const root = projectRootOrExit();
    assertDeclaredSecret(name, root);
    const stdin = deps.stdin ?? process.stdin;
    const value = stdin.isTTY
        ? await promptHiddenSecret(`Secret ${name}`, stdin, deps.stdout)
        : await readPipedSecret(stdin);
    if (!value) {
        throw new FliskError(`No value for secret ${name}`, [
            "Pipe it: printf '%s' 'value' | flisk secret set NAME",
            "Or run in a terminal to type it without echo",
        ]);
    }
    const keychain = keychainFor(root, deps);
    keychain.set(name, value);
    const write = deps.stdout ?? ((text) => console.log(text));
    // On Windows the keychain is a no-op fallback: the unsupported message was printed above, and
    // the resolver keeps reading the env file. Never claim a value was stored when it was not.
    if (keychain.platform !== "win32")
        write(`Stored ${name} in the keychain.`);
}
/** Removes the keychain entry; a missing entry is already unset. */
export function unsetSecret(name, deps = {}) {
    const root = projectRootOrExit();
    assertDeclaredSecret(name, root);
    const keychain = keychainFor(root, deps);
    keychain.unset(name);
    if (keychain.platform !== "win32")
        (deps.stdout ?? ((text) => console.log(text)))(`Removed ${name} from the keychain.`);
}
/** Prints names only, never values. */
export function listSecrets(deps = {}) {
    const root = projectRootOrExit();
    const names = keychainFor(root, deps).list();
    for (const name of names)
        (deps.stdout ?? ((text) => console.log(text)))(name);
    return names;
}
export const secretCommand = new Command("secret")
    .description("Store project secrets in the OS keychain (macOS and Linux)")
    .addCommand(new Command("set")
    .description("Read a secret value from stdin or a hidden prompt and store it")
    .argument("<name>", "Secret name declared in a service.json secrets list")
    .action(async (name) => {
    await setSecret(name);
}))
    .addCommand(new Command("unset")
    .description("Remove a secret from the keychain")
    .argument("<name>", "Secret name declared in a service.json secrets list")
    .action((name) => {
    unsetSecret(name);
}))
    .addCommand(new Command("list").description("List stored secret names (never values)").action(() => {
    listSecrets();
}));
