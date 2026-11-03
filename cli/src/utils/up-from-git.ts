// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { FliskError } from "./errors.js";
import {
  defaultGitRunner,
  type GitRunner,
  redactRepoUrl,
  validateRepoUrl,
} from "./project-repos.js";

/**
 * True when the `flisk up` argument is a git repository URL rather than a stack name: a URL with a scheme
 * (https://, ssh://, git://, file://) or SCP-like syntax (git@github.com:org/repo). Stack names never contain ":".
 */
export function isGitRepoArg(arg: string | undefined): arg is string {
  if (!arg) return false;
  return /^(https?|git|ssh|file):\/\//.test(arg) || /^[\w.-]+@[\w.-]+:[^/\\].*$/.test(arg);
}

/** The directory a repository URL clones into, as `git clone` names it: the last path segment without `.git`. */
export function repoDirName(url: string): string {
  const name = url
    .replace(/[?#].*$/, "")
    .replace(/[/\\]+$/, "")
    .split(/[/:\\]/)
    .pop()
    ?.replace(/\.git$/, "");
  if (!name || name === "." || name === "..") {
    throw new FliskError(`Cannot tell a folder name from "${redactRepoUrl(url)}"`, [
      "Clone it yourself with `git clone <url> <dir>`, then run `flisk up` inside it",
    ]);
  }
  return name;
}

/**
 * Clones `url` into `<cwd>/<repo name>` (shallow) and returns that folder, so `flisk up <url>` starts it in one command.
 * A folder that already holds a git checkout is reused as it is (no pull); any other non-empty folder is refused.
 */
export async function cloneForUp(
  url: string,
  options: { cwd?: string; git?: GitRunner; log?: (line: string) => void } = {},
): Promise<string> {
  const validation = validateRepoUrl(url);
  if (!validation.valid) {
    throw new FliskError(`Invalid repository URL: ${validation.reason}`);
  }
  const dest = resolve(options.cwd ?? process.cwd(), repoDirName(url));
  const log = options.log ?? (() => {});
  if (existsSync(dest)) {
    if (existsSync(join(dest, ".git"))) {
      log(`Using the existing checkout in ${dest}`);
      return dest;
    }
    if (readdirSync(dest).length > 0) {
      throw new FliskError(`${dest} already exists and is not a git checkout`, [
        "Run `flisk up <url>` from another folder, or remove that folder",
      ]);
    }
  }
  log(`Cloning ${redactRepoUrl(url)} into ${dest}`);
  try {
    await (options.git ?? defaultGitRunner)(["clone", "--depth", "1", "--", url, dest]);
  } catch (error) {
    const detail = String((error as { stderr?: string }).stderr ?? error)
      .trim()
      .split(/\r?\n/)[0];
    throw new FliskError(`git clone failed: ${redactRepoUrl(detail ?? "")}`, [
      "Check the URL and that you can access the repository (`git ls-remote <url>`)",
    ]);
  }
  return dest;
}
