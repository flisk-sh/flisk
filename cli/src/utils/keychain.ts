// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * OS keychain access for the `keychain` secret provider (#4702).
 *
 * Values are addressed by the project name in `.flisk/project.json`, not by the checkout path, so
 * every clone or worktree of a project reaches the same entries. The platform binary is behind an
 * injectable runner: tests use a fake and never invoke `security` or `secret-tool`.
 *
 * Nothing here prints a value. `list()` parses names out of tool output and discards the output;
 * errors deliberately omit stderr, which a tool may echo an argument (and therefore a secret) into.
 */
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { FliskError } from "./errors.js";
import { readProjectNameOrUndefined } from "./project-reader.js";

/** Exact message required on Windows; the provider then falls back to the env file. */
export const KEYCHAIN_UNSUPPORTED_MESSAGE = "keychain is not supported on Windows yet";

/** Environment variable names are the only secret names Flisk accepts. */
export const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface KeychainRequest {
  /** The platform binary to run (`security` or `secret-tool`). */
  command: string;
  args: string[];
  /** For `secret-tool store`, the value is read from stdin and never appears in argv. */
  stdin?: string;
  /**
   * `secret-tool search` prints its *attribute names* to stderr. Only that read-only command opts
   * in; no error or tool output is ever returned to the caller as a value or shown to the user.
   */
  includeStderr?: boolean;
}

/** Injectable OS command runner. Returns tool output; failures are thrown by the implementation. */
export type KeychainRunner = (request: KeychainRequest) => string;

/** The real runner. stderr is discarded except for `search`, so a tool cannot leak a value through an error message. */
export const defaultKeychainRunner: KeychainRunner = (request) => {
  const result = spawnSync(request.command, request.args, {
    encoding: "utf-8",
    ...(request.stdin === undefined ? {} : { input: request.stdin }),
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Never include stderr here: it may echo an argument. Every caller reports its own fixed message.
    throw new Error(`${request.command} exited with status ${result.status ?? "unknown"}`);
  }
  return request.includeStderr
    ? `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    : (result.stdout ?? "");
};

export interface Keychain {
  /** The project name entries are stored under. */
  readonly project: string;
  readonly platform: NodeJS.Platform;
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  unset(name: string): void;
  /** Names only, never values. */
  list(): string[];
}

export interface CreateKeychainOptions {
  projectRoot?: string;
  /** Overrides the project name from `.flisk/project.json` (for tests). */
  project?: string;
  platform?: NodeJS.Platform;
  runner?: KeychainRunner;
  /** Called once on unsupported platforms. Defaults to printing the required message. */
  onUnsupported?: (message: string) => void;
}

/** The project key shared by all checkouts: `.flisk/project.json`'s name, or the folder name. */
export function keychainProjectName(projectRoot: string): string {
  return readProjectNameOrUndefined(projectRoot) ?? basename(resolve(projectRoot));
}

/** Refuses an invalid name or one that could turn into another project's keychain entry. */
export function assertValidSecretName(name: string): void {
  if (SECRET_NAME_PATTERN.test(name)) return;
  throw new FliskError(`Invalid secret name ${JSON.stringify(name)}`, [
    "Use letters, digits and underscores, starting with a letter or underscore",
  ]);
}

function windowsKeychain(
  project: string,
  platform: NodeJS.Platform,
  onUnsupported: (message: string) => void,
): Keychain {
  onUnsupported(KEYCHAIN_UNSUPPORTED_MESSAGE);
  return {
    project,
    platform,
    get: () => undefined,
    set: () => {
      // The message was printed when the keychain was created; no value is stored here.
    },
    unset: () => {},
    list: () => [],
  };
}

/**
 * Builds the keychain for a project. On Windows the returned object is a no-op fallback: the
 * resolver keeps reading values from the env file and prints the required unsupported message.
 */
export function createKeychain(options: CreateKeychainOptions = {}): Keychain {
  const platform = options.platform ?? process.platform;
  const project =
    options.project ??
    (options.projectRoot ? keychainProjectName(options.projectRoot) : "flisk-project");
  const runner = options.runner ?? defaultKeychainRunner;
  const onUnsupported = options.onUnsupported ?? ((message: string) => console.log(message));
  if (platform === "win32") return windowsKeychain(project, platform, onUnsupported);

  const service = `flisk.${project}`;
  const fail = (action: string, name: string, install: string): never => {
    throw new FliskError(`Could not ${action} secret ${name} for project ${project}`, [install]);
  };
  const isMissingTool = (error: unknown): boolean =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");

  if (platform === "darwin") {
    return {
      project,
      platform,
      get(name) {
        assertValidSecretName(name);
        try {
          const value = runner({
            command: "security",
            args: ["find-generic-password", "-a", name, "-s", service, "-w"],
          });
          return value.replace(/\r?\n$/, "") || undefined;
        } catch {
          return undefined;
        }
      },
      set(name, value) {
        assertValidSecretName(name);
        try {
          // -U replaces an existing entry; -w takes the value as an argument because the macOS
          // tool has no stdin form. Errors never include argv, and nothing logs the invocation.
          runner({
            command: "security",
            args: ["add-generic-password", "-U", "-a", name, "-s", service, "-w", value],
          });
        } catch (error) {
          fail(
            "store",
            name,
            isMissingTool(error)
              ? "The macOS `security` command was not found on PATH"
              : `Check that project ${project} is unlocked in the macOS keychain`,
          );
        }
      },
      unset(name) {
        assertValidSecretName(name);
        try {
          runner({
            command: "security",
            args: ["delete-generic-password", "-a", name, "-s", service],
          });
        } catch (error) {
          if (isMissingTool(error))
            fail("remove", name, "The macOS `security` command was not found on PATH");
          // Deleting a name that is not there is already the requested end state.
        }
      },
      list() {
        const names = new Set<string>();
        let output = "";
        try {
          output = runner({ command: "security", args: ["dump-keychain"] });
        } catch (error) {
          fail(
            "list",
            "secrets",
            isMissingTool(error)
              ? "The macOS `security` command was not found on PATH"
              : "Check that the macOS keychain can be read",
          );
        }
        // `security` prints one `attributes:` block per item; the order of `acct` and `svce` in it
        // is not guaranteed, so read both from the whole block instead of relying on line order.
        for (const block of output.split(/^\s*attributes:/m).slice(1)) {
          const account = /"acct"<blob>="([^"]*)"/.exec(block)?.[1];
          const itemService = /"svce"<blob>="([^"]*)"/.exec(block)?.[1];
          if (itemService === service && account && SECRET_NAME_PATTERN.test(account))
            names.add(account);
        }
        return [...names].sort();
      },
    };
  }

  // Linux and every other POSIX platform with libsecret's `secret-tool`.
  const attributes = ["flisk.project", project, "flisk.secret"];
  return {
    project,
    platform,
    get(name) {
      assertValidSecretName(name);
      try {
        const value = runner({
          command: "secret-tool",
          args: ["lookup", ...attributes, name],
        });
        return value.replace(/\r?\n$/, "") || undefined;
      } catch {
        return undefined;
      }
    },
    set(name, value) {
      assertValidSecretName(name);
      try {
        runner({
          command: "secret-tool",
          args: ["store", `--label=Flisk ${project}/${name}`, ...attributes, name],
          stdin: value,
        });
      } catch (error) {
        fail(
          "store",
          name,
          isMissingTool(error)
            ? "Install secret-tool (libsecret-tools), then run `flisk secret set " +
                name +
                "` again"
            : "Check that the GNOME keyring or another libsecret service is unlocked",
        );
      }
    },
    unset(name) {
      assertValidSecretName(name);
      try {
        runner({ command: "secret-tool", args: ["clear", ...attributes, name] });
      } catch (error) {
        if (isMissingTool(error))
          fail("remove", name, "Install secret-tool (libsecret-tools) and try again");
        // An absent entry is already unset.
      }
    },
    list() {
      const names = new Set<string>();
      let output = "";
      try {
        // `search --all` can include the secret itself in its output. It is captured, parsed for
        // attribute names only, and never printed or returned.
        output = runner({
          command: "secret-tool",
          args: ["search", "--all", "flisk.project", project],
          includeStderr: true,
        });
      } catch (error) {
        fail(
          "list",
          "secrets",
          isMissingTool(error)
            ? "Install secret-tool (libsecret-tools) and try again"
            : "Check that the GNOME keyring or another libsecret service is unlocked",
        );
      }
      for (const line of output.split(/\r?\n/)) {
        const match = /^attribute\.flisk\.secret\s*=\s*(.+?)\s*$/.exec(line);
        if (match && SECRET_NAME_PATTERN.test(match[1] ?? "")) names.add(match[1] as string);
      }
      return [...names].sort();
    },
  };
}
