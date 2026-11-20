/**
 * `flisk secret set|unset|list` (#4702). A value is accepted only from a pipe or a hidden
 * terminal prompt: the positional argument is the NAME, never the value. Nothing here prints a
 * value, and the keychain runner is behind `createKeychain` so tests can use a fake.
 */
import { Command } from "commander";
import { type Keychain } from "../utils/keychain.js";
/** Dependencies that tests replace; the real command uses process stdin/stdout. */
export interface SecretCommandDeps {
    keychain?: Keychain;
    stdin?: NodeJS.ReadStream;
    stdout?: (text: string) => void;
}
/** Refuses names that no service declares, so a typo cannot create an unreachable keychain entry. */
export declare function assertDeclaredSecret(name: string, projectRoot: string): void;
/** Reads a piped value. Empty stdin is an error: the value must come from the pipe or a prompt. */
export declare function readPipedSecret(stream: AsyncIterable<string | Buffer>): Promise<string | undefined>;
/**
 * Reads a value from a terminal with echo turned off. The prompt and the final newline are the
 * only output; typed characters never reach stdout. Ctrl+C rejects without storing anything.
 */
export declare function promptHiddenSecret(message: string, stdin?: NodeJS.ReadStream, write?: (text: string) => void): Promise<string>;
/** Stores the value; the caller never passes it as a CLI argument. */
export declare function setSecret(name: string, deps?: SecretCommandDeps): Promise<void>;
/** Removes the keychain entry; a missing entry is already unset. */
export declare function unsetSecret(name: string, deps?: SecretCommandDeps): void;
/** Prints names only, never values. */
export declare function listSecrets(deps?: SecretCommandDeps): string[];
export declare const secretCommand: Command;
